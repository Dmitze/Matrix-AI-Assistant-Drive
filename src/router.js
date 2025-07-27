/**
 * Роутер команд
 * 
 * Этот модуль обрабатывает команды пользователей
 * и направляет их соответствующим обработчикам.
 */

import { logger } from './utils/logger.js';
import { LLMProcessor } from './llm.js';
import { GoogleDriveHandler } from './gdrive.js';
import { getCachedResponse, setCachedResponse, getCachedFile, setCachedFile } from './cache.js';
import { recordBotRequest, recordLLMLatency, recordLLMError, recordDriveRequest, recordDriveError, recordCacheHit, recordCacheMiss } from './metrics.js';
import { checkSecurity } from './security.js';

export class CommandRouter {
  constructor(client) {
    this.client = client;
    this.llm = new LLMProcessor();
    this.gdrive = new GoogleDriveHandler();
    
    // Регистрируем команды
    this.commands = {
      'help': this.handleHelp.bind(this),
      'ask': this.handleAsk.bind(this),
      'find': this.handleFind.bind(this),
      'read': this.handleRead.bind(this),
      'status': this.handleStatus.bind(this),
      'ping': this.handlePing.bind(this)
    };
    
    logger.info('🛣️ Роутер команд ініціалізований');
  }

  /**
   * Обработка команды
   */
  async handleCommand(command, args, event, room) {
    const startTime = Date.now();
    
    try {
      const commandName = command.toLowerCase();
      const sender = event.getSender();
      const roomId = event.getRoomId();
      const message = event.getContent().body || '';

      logger.info(`🔧 Обробка команди: ${commandName} від ${sender} в ${roomId}`);
      logger.debug(`📋 Аргументи команди: [${args.join(', ')}]`);

      // Проверка безопасности
      const securityCheck = checkSecurity(sender, roomId, commandName, args, message);
      if (!securityCheck.allowed) {
        logger.warn(`🚫 Команда заблокована для ${sender}: ${securityCheck.checks}`);
        
        let reason = 'Доступ заборонено';
        if (securityCheck.checks.rateLimit?.reason === 'rate_limit_exceeded') {
          reason = `Занадто багато запитів. Спробуйте через ${securityCheck.checks.rateLimit.retryAfter} секунд`;
        } else if (securityCheck.checks.userAccess?.reason === 'user_blocked') {
          reason = 'Ваш акаунт заблоковано';
        } else if (securityCheck.checks.messageValidation?.issues?.includes('message_too_long')) {
          reason = 'Повідомлення занадто довге';
        }
        
        await this.sendResponse(roomId, `❌ ${reason}`);
        recordBotRequest(commandName, 'blocked');
        return;
      }

      // Проверяем, существует ли команда
      if (!this.commands[commandName]) {
        logger.warn(`⚠️ Невідома команда: ${commandName} від ${sender}`);
        await this.sendResponse(roomId, 
          `❌ Невідома команда: ${commandName}\n` +
          `Використовуйте !help для списку доступних команд.`);
        recordBotRequest(commandName, 'unknown');
        return;
      }

      logger.debug(`✅ Команда ${commandName} знайдена, виконуємо...`);

      // Выполняем команду
      await this.commands[commandName](args, event, room);

      const responseTime = Date.now() - startTime;
      logger.debug(`✅ Команда ${commandName} виконана за ${responseTime}ms`);
      recordBotRequest(commandName, 'success');

    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error(`❌ Помилка обробки команди (${responseTime}ms):`, error.message);
      logger.debug('🔍 Деталі помилки:', error);
      
      await this.sendResponse(event.getRoomId(), 
        '❌ Сталася помилка при виконанні команди. Спробуйте пізніше.');
      recordBotRequest(command, 'error');
    }
  }

  /**
   * Отправка ответа в комнату
   */
  async sendResponse(roomId, text) {
    try {
      const response = await this.client.sendTextMessage(roomId, text);
      logger.debug(`📤 Відправлено повідомлення в ${roomId}`);
      return response;
    } catch (error) {
      logger.error('❌ Помилка відправки відповіді:', error);
      throw error;
    }
  }

  /**
   * Обновление сообщения в комнате
   */
  async updateMessage(roomId, eventId, newText) {
    try {
      const response = await this.client.sendEvent(roomId, 'm.room.message', {
        msgtype: 'm.text',
        body: newText,
        'm.new_content': {
          msgtype: 'm.text',
          body: newText
        },
        'm.relates_to': {
          rel_type: 'm.replace',
          event_id: eventId
        }
      });
      logger.debug(`📝 Оновлено повідомлення ${eventId} в ${roomId}`);
      return response;
    } catch (error) {
      logger.error(`❌ Помилка оновлення повідомлення ${eventId} в ${roomId}:`, error.message);
      throw error;
    }
  }

  /**
   * Команда: help - показать справку
   */
  async handleHelp(args, event, room) {
    const helpText = `
🤖 **Matrix AI Assistant Drive - Довідка**

**Доступні команди:**

🔍 **!ask <питання>** - Задати питання AI-асистенту
   Приклад: !ask Як працює квантова фізика?
   Стримінг: !ask --stream Розкажи про космос

📁 **!find <назва файлу>** - Знайти файл в Google Drive
   Приклад: !find звіт за березень

📄 **!read <назва файлу>** - Прочитати вміст файлу
   Приклад: !read план розвитку

📊 **!status** - Показати статус бота

🏓 **!ping** - Перевірити доступність бота

❓ **!help** - Показати цю довідку

**Підтримувані формати файлів:**
• Google Docs
• Google Sheets  
• PDF файли
• Excel файли
• Word документи

**Примітка:** Для роботи з Google Drive необхідно налаштувати сервісний акаунт.
    `.trim();

    await this.sendResponse(event.getRoomId(), helpText);
  }

  /**
   * Команда: ask - задать вопрос AI
   */
  async handleAsk(args, event, room) {
    const startTime = Date.now();
    
    try {
      if (args.length === 0) {
        await this.sendResponse(event.getRoomId(), 
          '❌ Вкажіть питання для AI.\nПриклад: !ask Що таке штучний інтелект?\nДля стримінгу: !ask --stream Що таке штучний інтелект?');
        return;
      }

      const question = args.join(' ');
      const sender = event.getSender();
      const useStreaming = args.includes('--stream') || args.includes('-s');
      
      // Убираем флаги из вопроса
      const cleanQuestion = question.replace(/--stream|-s/g, '').trim();

      logger.info(`🤖 Запит до AI від ${sender}: ${cleanQuestion.substring(0, 100)}... (стримінг: ${useStreaming})`);

      // Проверяем кэш (только для не-стриминговых запросов)
      if (!useStreaming) {
        const cachedResponse = await getCachedResponse(sender, cleanQuestion);
        if (cachedResponse) {
          logger.debug(`💾 Знайдено кешовану відповідь для ${sender}`);
          await this.sendResponse(event.getRoomId(), 
            `🤖 **Відповідь AI (з кешу):**\n\n${cachedResponse}`);
          recordCacheHit('llm');
          return;
        }
        recordCacheMiss('llm');
      }

      // Отправляем сообщение о том, что обрабатываем запрос
      const processingMsg = useStreaming ? 
        '🌊 Починаю стримінгову відповідь...' : 
        '🤔 Думаю над вашим питанням...';
      await this.sendResponse(event.getRoomId(), processingMsg);

      let response;
      const llmStartTime = Date.now();

      if (useStreaming) {
        // Стриминговый ответ
        response = await this.handleStreamingResponse(cleanQuestion, event.getRoomId());
      } else {
        // Обычный ответ
        response = await this.llm.generateResponse(cleanQuestion);
      }

      const llmDuration = (Date.now() - llmStartTime) / 1000;
      
      // Записываем метрики
      recordLLMLatency(llmDuration);

      // Сохраняем в кэш (только для не-стриминговых запросов)
      if (!useStreaming) {
        await setCachedResponse(sender, cleanQuestion, response.response);
      }

      // Отправляем финальный ответ (для стриминга это может быть пустым)
      if (!useStreaming) {
        await this.sendResponse(event.getRoomId(), 
          `🤖 **Відповідь AI:**\n\n${response.response}`);
      }

    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      logger.error(`❌ Помилка обробки команди ask (${duration.toFixed(2)}s):`, error.message);
      recordLLMError('request_failed');
      await this.sendResponse(event.getRoomId(), 
        '❌ Вибачте, сталася помилка при обробці вашого запиту. Спробуйте ще раз.');
    }
  }

  /**
   * Обработка стримингового ответа
   */
  async handleStreamingResponse(question, roomId) {
    let currentMessage = '';
    let messageId = null;
    
    return new Promise((resolve, reject) => {
      this.llm.generateStreamingResponse(question, async (chunk, info) => {
        try {
          if (info.done) {
            // Стриминг завершен
            logger.success(`✅ Стримінгове відповідь завершено (${info.chunkCount} чанків)`);
            resolve({
              response: info.fullResponse,
              duration: 0, // Будет рассчитано в основном методе
              chunks: info.chunkCount,
              tokens: info.totalTokens
            });
            return;
          }

          // Добавляем новый чанк к текущему сообщению
          currentMessage += chunk;
          
          // Если это первый чанк, создаем новое сообщение
          if (!messageId) {
            const response = await this.sendResponse(roomId, `🤖 **Відповідь AI (стримінг):**\n\n${currentMessage}`);
            messageId = response?.event_id;
          } else {
            // Обновляем существующее сообщение
            await this.updateMessage(roomId, messageId, `🤖 **Відповідь AI (стримінг):**\n\n${currentMessage}`);
          }

        } catch (error) {
          logger.error('❌ Помилка обробки стримінгового чанку:', error.message);
          reject(error);
        }
      });
    });
  }

  /**
   * Команда: find - найти файл в Google Drive
   */
  async handleFind(args, event, room) {
    const startTime = Date.now();
    
    try {
      if (args.length === 0) {
        await this.sendResponse(event.getRoomId(), 
          '❌ Вкажіть назву файлу для пошуку.\nПриклад: !find звіт');
        return;
      }

      const query = args.join(' ');
      const sender = event.getSender();

      logger.info(`🔍 Пошук файлу від ${sender}: ${query}`);

      // Проверяем, настроен ли Google Drive
      if (!this.gdrive.isConfigured()) {
        await this.sendResponse(event.getRoomId(), 
          '❌ Google Drive не налаштований. Зверніться до адміністратора.');
        return;
      }

      await this.sendResponse(event.getRoomId(), 
        '🔍 Шукаю файли в Google Drive...');

      // Ищем файлы
      const files = await this.gdrive.findFiles(query);
      recordDriveRequest('search', 'success');

      if (files.length === 0) {
        await this.sendResponse(event.getRoomId(), 
          `🔍 Файли за запитом "${query}" не знайдено.`);
        return;
      }

      // Формируем список найденных файлов
      let response = `📁 **Знайдені файли:**\n\n`;
      
      files.forEach((file, index) => {
        response += `${index + 1}. **${file.name}**\n`;
        response += `   Тип: ${this.getFileTypeName(file.mimeType)}\n`;
        response += `   ID: \`${file.id}\`\n\n`;
      });

      response += `💡 Використовуйте !read <номер> для читання файлу`;

      await this.sendResponse(event.getRoomId(), response);

    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      logger.error(`❌ Помилка пошуку файлів (${duration}s):`, error.message);
      recordDriveError('search_failed');
      await this.sendResponse(event.getRoomId(), 
        '❌ Сталася помилка при пошуку файлів. Перевірте налаштування Google Drive.');
    }
  }

  /**
   * Команда: read - прочитать файл
   */
  async handleRead(args, event, room) {
    const startTime = Date.now();
    
    try {
      if (args.length === 0) {
        await this.sendResponse(event.getRoomId(), 
          '❌ Вкажіть назву файлу для читання.\nПриклад: !read звіт');
        return;
      }

      const sender = event.getSender();
      let fileName = args.join(' ');
      let fileIndex = 0;

      // Проверяем, есть ли индекс файла в команде
      const lastArg = args[args.length - 1];
      if (/^\d+$/.test(lastArg)) {
        fileIndex = parseInt(lastArg);
        fileName = args.slice(0, -1).join(' ');
      }

      logger.info(`📄 Читання файлу від ${sender}: ${fileName} (індекс: ${fileIndex})`);

      // Проверяем, настроен ли Google Drive
      if (!this.gdrive.isConfigured()) {
        await this.sendResponse(event.getRoomId(), 
          '❌ Google Drive не налаштований. Зверніться до адміністратора.');
        return;
      }

      await this.sendResponse(event.getRoomId(), 
        '📄 Читаю файл...');

      // Читаем файл
      const result = await this.gdrive.readFile(fileName, fileIndex);
      recordDriveRequest('read', 'success');

      if (!result) {
        await this.sendResponse(event.getRoomId(), 
          `❌ Файл "${fileName}" не знайдено.`);
        return;
      }

      // Формируем ответ
      let response = `📄 **Вміст файлу:**\n`;
      response += `📁 Файл: ${result.file.name}\n`;
      response += `📊 Тип: ${this.getFileTypeName(result.file.mimeType)}\n`;
      
      if (result.totalFiles > 1) {
        response += `📋 Показано файл ${result.fileIndex + 1} з ${result.totalFiles}\n`;
        response += `💡 Використовуйте !read ${fileName} <номер> для вибору іншого файлу\n\n`;
      } else {
        response += '\n';
      }
      
      response += result.content;

      // Отправляем содержимое
      await this.sendResponse(event.getRoomId(), response);

    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      logger.error(`❌ Помилка читання файлу (${duration}s):`, error.message);
      recordDriveError('read_failed');
      
      let errorMessage = '❌ Помилка при читанні файлу.';
      
      if (error.message.includes('Індекс файлу')) {
        errorMessage = `❌ ${error.message}\n💡 Використовуйте !find ${fileName} для перегляду списку файлів`;
      } else if (error.message.includes('не знайдено')) {
        errorMessage = `❌ Файл "${fileName}" не знайдено.\n💡 Використовуйте !find ${fileName} для пошуку`;
      }
      
      await this.sendResponse(event.getRoomId(), errorMessage);
    }
  }

  /**
   * Команда: status - показать статус бота
   */
  async handleStatus(args, event, room) {
    const status = {
      bot: '🟢 Працює',
      llm: this.llm.isAvailable() ? '🟢 Доступний' : '🔴 Недоступний',
      gdrive: this.gdrive.isConfigured() ? '🟢 Налаштований' : '🔴 Не налаштований'
    };

    const statusText = `
📊 **Статус бота:**

🤖 Бот: ${status.bot}
🧠 AI (Ollama): ${status.llm}
📁 Google Drive: ${status.gdrive}

💡 Використовуйте !help для списку команд
    `.trim();

    await this.sendResponse(event.getRoomId(), statusText);
  }

  /**
   * Команда: ping - проверить доступность
   */
  async handlePing(args, event, room) {
    const startTime = Date.now();
    
    try {
      await this.sendResponse(event.getRoomId(), '🏓 Pong!');
      
      const responseTime = Date.now() - startTime;
      logger.debug(`🏓 Ping від ${event.getSender()}, час відповіді: ${responseTime}ms`);
      
    } catch (error) {
      logger.error('❌ Помилка ping:', error);
    }
  }

  /**
   * Получение названия типа файла
   */
  getFileTypeName(mimeType) {
    const types = {
      'application/vnd.google-apps.document': 'Google Doc',
      'application/vnd.google-apps.spreadsheet': 'Google Sheet',
      'application/pdf': 'PDF',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word'
    };
    
    return types[mimeType] || 'Невідомий тип';
  }
} 