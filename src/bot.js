/**
 * Основной класс бота
 * 
 * Этот класс управляет подключением к Matrix,
 * обработкой событий и координацией всех компонентов.
 */

import { createClient } from 'matrix-js-sdk';
import config from './config/config.js';
import { logger } from './utils/logger.js';
import { CommandRouter } from './router.js';

export class Bot {
  constructor() {
    this.client = null;
    this.router = null;
    this.isRunning = false;
    this.processedEvents = new Set(); // Для дедупликации сообщений
    
    logger.info('🤖 Ініціалізація бота...');
  }

  /**
   * Запуск бота
   */
  async start() {
    try {
      // Инициализируем клиент Matrix
      await this.initializeMatrixClient();
      
      // Инициализируем роутер команд
      this.router = new CommandRouter(this.client);
      
      // Подписываемся на события
      this.setupEventHandlers();
      
      // Запускаем клиент
      await this.client.startClient({
        initialSyncLimit: config.matrix.initialSyncLimit
      });
      
      this.isRunning = true;
      logger.success('✅ Бот успішно підключений до Matrix!');
      
      // Логируем информацию о подключении
      const userId = this.client.getUserId();
      const deviceId = this.client.getDeviceId();
      logger.info(`👤 Підключений як: ${userId}`);
      logger.info(`📱 Device ID: ${deviceId}`);
      
    } catch (error) {
      logger.error('❌ Помилка при запуску бота:', error);
      throw error;
    }
  }

  /**
   * Инициализация клиента Matrix
   */
  async initializeMatrixClient() {
    try {
      logger.info('🔗 Підключення до Matrix homeserver...');
      
      // Создаем клиент Matrix
      this.client = createClient({
        baseUrl: config.matrix.homeserverUrl,
        accessToken: config.matrix.accessToken,
        userId: config.matrix.userId
      });

      // Настраиваем обработчики событий клиента
      this.client.on('sync', (state, prevState, res) => {
        if (state === 'PREPARED') {
          logger.success('🔄 Синхронізація з Matrix завершена');
        }
      });

      this.client.on('error', (error) => {
        logger.error('❌ Помилка Matrix клієнта:', error);
      });

      logger.success('✅ Matrix клієнт ініціалізований');
      
    } catch (error) {
      logger.error('❌ Помилка ініціалізації Matrix клієнта:', error);
      throw error;
    }
  }

  /**
   * Настройка обработчиков событий
   */
  setupEventHandlers() {
    // Обработчик сообщений в комнатах
    this.client.on('Room.timeline', (event, room, toStartOfTimeline) => {
      // Игнорируем события, которые не являются сообщениями
      if (event.getType() !== 'm.room.message') {
        return;
      }

      // Игнорируем события из истории (только новые сообщения)
      if (toStartOfTimeline) {
        return;
      }

      // Игнорируем удаленные сообщения
      if (event.isRedacted()) {
        return;
      }

      // Игнорируем собственные сообщения бота
      if (event.getSender() === this.client.getUserId()) {
        return;
      }

      // Обрабатываем сообщение
      this.handleMessage(event, room);
    });

    // Обработчик приглашений в комнаты
    this.client.on('RoomMember.membership', (event, member) => {
      if (event.getType() === 'm.room.member' && 
          event.getContent().membership === 'invite' &&
          event.getStateKey() === this.client.getUserId()) {
        
        logger.info(`📨 Отримано запрошення до кімнати: ${event.getRoomId()}`);
        
        // Автоматически принимаем приглашения
        this.client.joinRoom(event.getRoomId()).then(() => {
          logger.success(`✅ Приєдналися до кімнати: ${event.getRoomId()}`);
        }).catch((error) => {
          logger.error(`❌ Помилка приєднання до кімнати: ${error}`);
        });
      }
    });

    logger.info('📡 Обробники подій налаштовані');
  }

  /**
   * Обработка входящих сообщений
   */
  async handleMessage(event, room) {
    try {
      const content = event.getContent();
      const sender = event.getSender();
      const roomId = event.getRoomId();
      const messageText = content.body;
      const eventId = event.getId();

      // Проверяем дедупликацию сообщений
      if (this.processedEvents.has(eventId)) {
        logger.debug(`🔄 Повідомлення ${eventId} вже оброблене, пропускаємо`);
        return;
      }

      // Добавляем событие в обработанные
      this.processedEvents.add(eventId);

      // Ограничиваем размер множества обработанных событий
      if (this.processedEvents.size > 1000) {
        const firstEvent = this.processedEvents.values().next().value;
        this.processedEvents.delete(firstEvent);
      }

      // Логируем входящее сообщение
      logger.debug(`💬 Повідомлення від ${sender} в ${roomId}: ${messageText}`);

      // Проверяем, является ли сообщение командой
      if (!messageText.startsWith(config.matrix.commandPrefix)) {
        return; // Не команда, игнорируем
      }

      // Извлекаем команду и аргументы
      const commandText = messageText.slice(config.matrix.commandPrefix.length);
      const [command, ...args] = commandText.trim().split(' ');

      logger.info(`🔧 Команда від ${sender}: ${command} ${args.join(' ')}`);

      // Отправляем команду в роутер
      if (this.router) {
        await this.router.handleCommand(command, args, event, room);
      } else {
        logger.warn('⚠️ Роутер команд не ініціалізований');
      }

    } catch (error) {
      logger.error('❌ Помилка обробки повідомлення:', error);
      
      // Отправляем сообщение об ошибке пользователю
      try {
        await this.sendMessage(event.getRoomId(), 
          '❌ Сталася помилка при обробці вашої команди. Спробуйте пізніше.');
      } catch (sendError) {
        logger.error('❌ Не вдалося відправити повідомлення про помилку:', sendError);
      }
    }
  }

  /**
   * Отправка сообщения в комнату
   */
  async sendMessage(roomId, text) {
    try {
      if (!this.client) {
        throw new Error('Клієнт Matrix не ініціалізований');
      }

      // Проверяем длину сообщения
      if (text.length > config.matrix.maxMessageLength) {
        text = text.substring(0, config.matrix.maxMessageLength - 3) + '...';
        logger.warn(`⚠️ Повідомлення обрізано до ${config.matrix.maxMessageLength} символів`);
      }

      await this.client.sendTextMessage(roomId, text);
      logger.debug(`📤 Повідомлення відправлено в ${roomId}: ${text.substring(0, 50)}...`);
      
    } catch (error) {
      logger.error(`❌ Помилка відправки повідомлення в ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Остановка бота
   */
  async stop() {
    try {
      logger.info('🛑 Зупинка бота...');
      
      if (this.client) {
        await this.client.stopClient();
        logger.success('✅ Matrix клієнт зупинено');
      }
      
      this.isRunning = false;
      logger.success('✅ Бот зупинено');
      
    } catch (error) {
      logger.error('❌ Помилка при зупинці бота:', error);
      throw error;
    }
  }

  /**
   * Получение статуса бота
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      userId: this.client?.getUserId(),
      deviceId: this.client?.getDeviceId(),
      homeserver: config.matrix.homeserverUrl
    };
  }
} 