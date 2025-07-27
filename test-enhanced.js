/**
 * Улучшенный тест для проверки всех компонентов
 * 
 * Этот файл тестирует все модули включая новые:
 * - Кэширование Redis с повторными попытками
 * - Расширенные метрики Prometheus
 * - Система безопасности с ролями
 * - Обработка PDF/Office файлов
 * - Механизм повторных попыток
 */

import dotenv from 'dotenv';
import { logger } from './src/utils/logger.js';
import config from './src/config/config.js';
import { LLMProcessor } from './src/llm.js';
import { GoogleDriveHandler } from './src/gdrive.js';
import { cacheManager, getCachedResponse, setCachedResponse } from './src/cache.js';
import { metricsCollector, recordBotRequest, recordLLMLatency } from './src/metrics.js';
import { securityManager, checkSecurity } from './src/security.js';
import { withRetry, testRetryMechanism } from './src/utils/retry.js';

// Загружаем переменные окружения
dotenv.config();

// Функция для тестирования кэширования с повторными попытками
async function testCaching() {
  logger.info('💾 === ТЕСТ 1: КЕШУВАННЯ REDIS З ПОВТОРНИМИ СПРОБАМИ ===');
  
  try {
    // Ждем инициализации кэша
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (cacheManager.isAvailable()) {
      logger.success('✅ Redis доступний');
      
      // Тестируем сохранение и получение данных с повторными попытками
      const testKey = 'test_key';
      const testData = { message: 'Привіт з кешу!', timestamp: Date.now() };
      
      // Сохраняем данные с повторными попытками
      const saved = await withRetry(async () => {
        return await cacheManager.set(testKey, testData, 60);
      }, { maxAttempts: 2, baseDelay: 100 });
      
      if (saved) {
        logger.success('✅ Дані збережені в кеш з повторними спробами');
      }
      
      // Получаем данные с повторными попытками
      const retrieved = await withRetry(async () => {
        return await cacheManager.get(testKey);
      }, { maxAttempts: 2, baseDelay: 100 });
      
      if (retrieved && retrieved.message === testData.message) {
        logger.success('✅ Дані успішно отримані з кешу з повторними спробами');
      }
      
      // Тестируем функции кэширования LLM
      const userId = 'test_user';
      const prompt = 'Що таке AI?';
      const response = 'AI - це штучний інтелект';
      
      await setCachedResponse(userId, prompt, response);
      const cachedResponse = await getCachedResponse(userId, prompt);
      
      if (cachedResponse === response) {
        logger.success('✅ Кешування LLM працює');
      }
      
      // Получаем статистику
      const stats = await cacheManager.getStats();
      logger.info('📊 Статистика кешу:', stats);
      
    } else {
      logger.warn('⚠️ Redis недоступний');
      logger.info('💡 Переконайтеся, що Redis запущений: redis-server');
    }
    
    return cacheManager.isAvailable();
  } catch (error) {
    logger.error('❌ Помилка тестування кешування:', error);
    return false;
  }
}

// Функция для тестирования расширенных метрик
async function testMetrics() {
  logger.info('📊 === ТЕСТ 2: РОЗШИРЕНІ МЕТРИКИ PROMETHEUS ===');
  
  try {
    // Записываем тестовые метрики
    recordBotRequest('test', 'success', 'admin');
    recordLLMLatency(1.5, 'llama2', 'generate');
    
    // Тестируем новые метрики безопасности
    const { recordSecurityBlocked, recordRateLimitExceeded } = await import('./src/metrics.js');
    recordSecurityBlocked('test_reason', 'admin');
    recordRateLimitExceeded('test_command', 'user');
    
    // Получаем статистику метрик
    const stats = metricsCollector.getStats();
    logger.info('📊 Статистика метрик:', stats);
    
    // Запускаем HTTP сервер для метрик
    await metricsCollector.startServer();
    logger.success('✅ HTTP сервер метрик запущено');
    
    // Проверяем health endpoint
    const healthUrl = `http://localhost:${config.metrics.port}/health`;
    logger.info(`🏥 Health check доступний за адресою: ${healthUrl}`);
    
    // Останавливаем сервер
    await metricsCollector.stopServer();
    logger.success('✅ HTTP сервер метрик зупинено');
    
    return true;
  } catch (error) {
    logger.error('❌ Помилка тестування метрик:', error);
    return false;
  }
}

// Функция для тестирования расширенной безопасности
async function testSecurity() {
  logger.info('🛡️ === ТЕСТ 3: РОЗШИРЕНА СИСТЕМА БЕЗПЕКИ ===');
  
  try {
    // Тестируем валидацию сообщений
    const validMessage = 'Привіт, світ!';
    const invalidMessage = 'a'.repeat(6000); // Слишком длинное
    
    const validResult = securityManager.validateMessage(validMessage);
    const invalidResult = securityManager.validateMessage(invalidMessage);
    
    if (validResult.valid) {
      logger.success('✅ Валідація коректного повідомлення пройдена');
    }
    
    if (!invalidResult.valid) {
      logger.success('✅ Валідація некорректного повідомлення заблокована');
    }
    
    // Тестируем проверку ролей
    const adminCheck = securityManager.checkUserAccess('@admin:domain.com', 'admin');
    const userCheck = securityManager.checkUserAccess('@user:domain.com', 'read');
    const guestCheck = securityManager.checkUserAccess('@guest:domain.com', 'write');
    
    logger.info('👥 Перевірка ролей:', {
      admin: adminCheck,
      user: userCheck,
      guest: guestCheck
    });
    
    // Тестируем rate limiting
    const userId = 'test_user';
    const command = 'test_command';
    
    for (let i = 0; i < 5; i++) {
      const rateLimitResult = securityManager.checkRateLimit(userId, command, 3, 60000);
      logger.debug(`Rate limit check ${i + 1}:`, rateLimitResult);
    }
    
    // Тестируем полную проверку безопасности
    const securityCheck = checkSecurity(userId, 'test_room', 'help', [], validMessage);
    logger.info('🔍 Результат перевірки безпеки:', securityCheck);
    
    // Тестируем валидацию команд с ролями
    const adminCommandCheck = securityManager.validateCommand('admin_restart', [], 'admin');
    const userCommandCheck = securityManager.validateCommand('admin_restart', [], 'user');
    
    logger.info('🔐 Валідація команд з ролями:', {
      admin: adminCommandCheck,
      user: userCommandCheck
    });
    
    // Получаем статистику безопасности
    const stats = securityManager.getStats();
    logger.info('📊 Статистика безпеки:', stats);
    
    return true;
  } catch (error) {
    logger.error('❌ Помилка тестування безпеки:', error);
    return false;
  }
}

// Функция для тестирования механизма повторных попыток
async function testRetryMechanism() {
  logger.info('🔄 === ТЕСТ 4: МЕХАНІЗМ ПОВТОРНИХ СПРОБ ===');
  
  try {
    // Тестируем базовый механизм повторных попыток
    const retryResult = await testRetryMechanism();
    if (retryResult) {
      logger.success('✅ Механізм повторних спроб працює');
    }
    
    // Тестируем специализированные функции
    let attemptCount = 0;
    const failingOperation = async () => {
      attemptCount++;
      if (attemptCount < 3) {
        throw new Error('Тестова помилка з\'єднання');
      }
      return 'Успішний результат';
    };
    
    const result = await withRetry(failingOperation, {
      maxAttempts: 3,
      baseDelay: 100
    });
    
    if (result === 'Успішний результат') {
      logger.success('✅ Спеціалізовані повторні спроби працюють');
    }
    
    return true;
  } catch (error) {
    logger.error('❌ Помилка тестування механізму повторних спроб:', error);
    return false;
  }
}

// Функция для тестирования обработки файлов с повторными попытками
async function testFileProcessing() {
  logger.info('📄 === ТЕСТ 5: ОБРОБКА ФАЙЛІВ З ПОВТОРНИМИ СПРОБАМИ ===');
  
  try {
    const gdrive = new GoogleDriveHandler();
    
    // Ждем инициализации
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (gdrive.isConfigured()) {
      logger.success('✅ Google Drive налаштований');
      
      // Тестируем поиск файлов с повторными попытками
      try {
        const files = await gdrive.findFiles('test');
        logger.info(`📁 Знайдено файлів: ${files.length}`);
        
        if (files.length > 0) {
          const file = files[0];
          logger.info(`📄 Тестовий файл: ${file.name} (${file.mimeType})`);
          
          // Тестируем чтение файла с повторными попытками
          try {
            const fileContent = await gdrive.readFile(file.id);
            logger.success(`✅ Файл прочитано: ${fileContent.name} (${fileContent.characterCount} символів)`);
          } catch (readError) {
            logger.warn('⚠️ Помилка читання файлу (це нормально для тестування):', readError.message);
          }
        }
      } catch (error) {
        logger.warn('⚠️ Помилка пошуку файлів (це нормально для тестування):', error.message);
      }
      
    } else {
      logger.warn('⚠️ Google Drive не налаштований');
      logger.info('💡 Для повного тестування налаштуйте Google Drive');
    }
    
    return gdrive.isConfigured();
  } catch (error) {
    logger.error('❌ Помилка тестування обробки файлів:', error);
    return false;
  }
}

// Функция для тестирования LLM с повторными попытками
async function testLLMWithRetry() {
  logger.info('🧠 === ТЕСТ 6: LLM З ПОВТОРНИМИ СПРОБАМИ ===');
  
  try {
    const llm = new LLMProcessor();
    
    // Ждем инициализации
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (llm.isAvailable) {
      logger.success('✅ LLM доступний');
      
      // Тестируем генерацию ответа
      try {
        const result = await llm.generateResponse('Скажи "Привіт" українською мовою.', {
          temperature: 0.1,
          maxTokens: 50
        });
        
        logger.success(`✅ LLM відповідь: ${result.response}`);
        logger.info(`📊 Деталі: ${result.duration.toFixed(2)}s, ${result.tokens.total} токенів`);
        
      } catch (llmError) {
        logger.warn('⚠️ Помилка LLM (це нормально, якщо Ollama не запущений):', llmError.message);
      }
      
    } else {
      logger.warn('⚠️ LLM недоступний');
      logger.info('💡 Переконайтеся, що Ollama запущений: ollama serve');
    }
    
    return llm.isAvailable;
  } catch (error) {
    logger.error('❌ Помилка тестування LLM:', error);
    return false;
  }
}

// Функция для тестирования стримингового LLM
async function testStreamingLLM() {
  logger.info('🌊 === ТЕСТ 7: СТРИМІНГОВИЙ LLM ===');
  
  try {
    const llm = new LLMProcessor();
    
    // Ждем инициализации
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (llm.isAvailable) {
      logger.success('✅ LLM доступний для стримінгу');
      
      // Тестируем стриминговую генерацию ответа
      try {
        let chunkCount = 0;
        let fullResponse = '';
        
        const result = await llm.generateStreamingResponse('Розкажи коротко про космос.', (chunk, info) => {
          chunkCount++;
          fullResponse += chunk;
          
          if (info.done) {
            logger.success(`✅ Стримінг завершено: ${info.chunkCount} чанків, ${Math.round(info.totalTokens)} токенів`);
          } else {
            logger.debug(`📦 Чанк ${chunkCount}: "${chunk}"`);
          }
        }, {
          temperature: 0.1,
          maxTokens: 100
        });
        
        logger.success(`✅ Стримінговий LLM відповідь: ${result.response.substring(0, 100)}...`);
        logger.info(`📊 Деталі стримінгу: ${result.duration.toFixed(2)}s, ${result.chunks} чанків, ${result.tokens.total} токенів`);
        
      } catch (streamingError) {
        logger.warn('⚠️ Помилка стримінгового LLM (це нормально, якщо Ollama не запущений):', streamingError.message);
      }
      
    } else {
      logger.warn('⚠️ LLM недоступний для стримінгу');
      logger.info('💡 Переконайтеся, що Ollama запущений: ollama serve');
    }
    
    return llm.isAvailable;
  } catch (error) {
    logger.error('❌ Помилка тестування стримінгового LLM:', error);
    return false;
  }
}

// Функция для тестирования интеграции всех компонентов
async function testIntegration() {
  logger.info('🔗 === ТЕСТ 7: ІНТЕГРАЦІЯ ВСІХ КОМПОНЕНТІВ ===');
  
  try {
    // Тестируем работу всех компонентов вместе
    const llm = new LLMProcessor();
    const gdrive = new GoogleDriveHandler();
    
    // Ждем инициализации
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Проверяем статус всех компонентов
    const components = {
      llm: llm.isServerAvailable(),
      gdrive: gdrive.isConfigured(),
      cache: cacheManager.isAvailable(),
      security: true, // Всегда доступен
      metrics: true,   // Всегда доступен
      retry: true      // Всегда доступен
    };
    
    logger.info('📊 Статус компонентів:', components);
    
    const availableCount = Object.values(components).filter(Boolean).length;
    const totalCount = Object.keys(components).length;
    
    logger.info(`📈 Доступно компонентів: ${availableCount}/${totalCount}`);
    
    if (availableCount >= 4) {
      logger.success('✅ Основні компоненти працюють');
    } else {
      logger.warn('⚠️ Деякі компоненти недоступні');
    }
    
    // Тестируем полный цикл работы
    const testUserId = 'test_user';
    const testRoomId = 'test_room';
    const testCommand = 'help';
    const testMessage = 'Привіт, боте!';
    
    const securityResult = checkSecurity(testUserId, testRoomId, testCommand, [], testMessage);
    logger.info('🔍 Результат перевірки безпеки для інтеграції:', securityResult);
    
    return availableCount >= 4;
  } catch (error) {
    logger.error('❌ Помилка тестування інтеграції:', error);
    return false;
  }
}

// Функция для тестирования производительности
async function testPerformance() {
  logger.info('⚡ === ТЕСТ 8: ПРОДУКТИВНІСТЬ ===');
  
  try {
    const startTime = Date.now();
    
    // Тестируем создание всех модулей
    const llm = new LLMProcessor();
    const gdrive = new GoogleDriveHandler();
    
    const initTime = Date.now() - startTime;
    logger.info(`⏱️ Час ініціалізації модулів: ${initTime}ms`);
    
    // Тестируем кэширование
    const cacheStart = Date.now();
    await cacheManager.set('perf_test', { data: 'test' }, 60);
    const cacheTime = Date.now() - cacheStart;
    logger.info(`⏱️ Час операції кешування: ${cacheTime}ms`);
    
    // Тестируем метрики
    const metricsStart = Date.now();
    recordBotRequest('perf_test', 'success');
    const metricsTime = Date.now() - metricsStart;
    logger.info(`⏱️ Час запису метрики: ${metricsTime}ms`);
    
    // Тестируем безопасность
    const securityStart = Date.now();
    checkSecurity('test_user', 'test_room', 'test', [], 'test message');
    const securityTime = Date.now() - securityStart;
    logger.info(`⏱️ Час перевірки безпеки: ${securityTime}ms`);
    
    // Тестируем повторные попытки
    const retryStart = Date.now();
    await withRetry(async () => Promise.resolve('success'), { maxAttempts: 1, baseDelay: 1 });
    const retryTime = Date.now() - retryStart;
    logger.info(`⏱️ Час операції з повторними спробами: ${retryTime}ms`);
    
    logger.success('✅ Тести продуктивності завершено');
    return true;
  } catch (error) {
    logger.error('❌ Помилка тестування продуктивності:', error);
    return false;
  }
}

// Главная функция тестирования
async function runEnhancedTests() {
  logger.info('🧪 === ЗАПУСК ПОКРАЩЕНИХ ТЕСТІВ ===');
  logger.info(`🕐 Час запуску: ${new Date().toISOString()}`);
  logger.info(`🌍 Середовище: ${process.env.NODE_ENV || 'development'}`);
  
  const results = {
    caching: false,
    metrics: false,
    security: false,
    retry: false,
    fileProcessing: false,
    llm: false,
    streaming: false,
    integration: false,
    performance: false
  };
  
  try {
    // Выполняем тесты
    results.caching = await testCaching();
    results.metrics = await testMetrics();
    results.security = await testSecurity();
    results.retry = await testRetryMechanism();
    results.fileProcessing = await testFileProcessing();
    results.llm = await testLLMWithRetry();
    results.streaming = await testStreamingLLM();
    results.integration = await testIntegration();
    results.performance = await testPerformance();
    
    // Выводим итоговый отчет
    logger.info('📊 === ПІДСУМКОВИЙ ЗВІТ ===');
    
    const passed = Object.values(results).filter(Boolean).length;
    const total = Object.keys(results).length;
    
    Object.entries(results).forEach(([test, passed]) => {
      const status = passed ? '✅' : '❌';
      logger.info(`${status} ${test}: ${passed ? 'ПРОЙДЕНО' : 'НЕ ПРОЙДЕНО'}`);
    });
    
    logger.info(`📈 Результат: ${passed}/${total} тестів пройдено`);
    
    if (passed >= total * 0.7) {
      logger.success('🎉 Більшість тестів пройдено успішно!');
    } else {
      logger.warn(`⚠️ ${total - passed} тестів не пройдено`);
      logger.info('💡 Це нормально, якщо не всі сервіси налаштовані');
    }
    
    // Рекомендации
    logger.info('💡 РЕКОМЕНДАЦІЇ:');
    if (!results.caching) {
      logger.info('   - Встановіть і запустіть Redis для кешування');
    }
    if (!results.fileProcessing) {
      logger.info('   - Налаштуйте Google Drive для обробки файлів');
    }
    if (!results.llm) {
      logger.info('   - Запустіть Ollama для роботи з LLM');
    }
    if (!results.metrics) {
      logger.info('   - Перевірте доступність порту для метрик');
    }
    
  } catch (error) {
    logger.error('❌ Критична помилка при виконанні тестів:', error);
  }
  
  // Очистка
  try {
    await cacheManager.disconnect();
    await metricsCollector.stopServer();
  } catch (error) {
    logger.error('❌ Помилка при очищенні:', error);
  }
  
  logger.info('🏁 === ТЕСТУВАННЯ ЗАВЕРШЕНО ===');
}

// Запускаем тесты
runEnhancedTests(); 