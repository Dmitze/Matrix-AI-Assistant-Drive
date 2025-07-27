/**
 * Детальный тест для проверки всех компонентов
 * 
 * Этот файл позволяет протестировать все модули
 * с подробным логированием и проверкой ошибок.
 */

import dotenv from 'dotenv';
import { logger } from './src/utils/logger.js';
import config from './src/config/config.js';
import { LLMProcessor } from './src/llm.js';
import { GoogleDriveHandler } from './src/gdrive.js';

// Загружаем переменные окружения
dotenv.config();

// Функция для тестирования конфигурации
async function testConfiguration() {
  logger.info('📋 === ТЕСТ 1: КОНФІГУРАЦІЯ ===');
  
  try {
    config.logConfig();
    
    // Проверяем обязательные переменные
    const requiredVars = [
      'MATRIX_HOMESERVER_URL',
      'MATRIX_ACCESS_TOKEN', 
      'MATRIX_USER_ID'
    ];
    
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      logger.warn(`⚠️ Відсутні змінні: ${missingVars.join(', ')}`);
      logger.info('💡 Це нормально для базового тестування');
    } else {
      logger.success('✅ Всі обов\'язкові змінні налаштовані');
    }
    
    // Проверяем опциональные переменные
    const optionalVars = [
      'OLLAMA_HOST',
      'OLLAMA_MODEL',
      'REDIS_URL',
      'GOOGLE_CREDENTIALS_PATH'
    ];
    
    const configuredOptional = optionalVars.filter(varName => process.env[varName]);
    logger.info(`📊 Налаштовано опціональних змінних: ${configuredOptional.length}/${optionalVars.length}`);
    
    return true;
  } catch (error) {
    logger.error('❌ Помилка тестування конфігурації:', error);
    return false;
  }
}

// Функция для тестирования LLM
async function testLLM() {
  logger.info('🧠 === ТЕСТ 2: LLM (OLLAMA) ===');
  
  try {
    const llm = new LLMProcessor();
    
    // Ждем инициализации
    logger.debug('⏳ Очікування ініціалізації LLM...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    if (llm.isAvailable()) {
      logger.success('✅ LLM доступний');
      
      // Получаем информацию о модели
      const modelInfo = await llm.getModelInfo();
      logger.info(`📊 Інформація про модель:`, modelInfo);
      
      // Тестовый запрос
      try {
        logger.debug('🧪 Виконання тестового запиту...');
        const testResult = await llm.testConnection();
        
        if (testResult.success) {
          logger.success(`✅ Тестовий запит успішний: "${testResult.response}"`);
        } else {
          logger.warn(`⚠️ Тестовий запит не вдався: ${testResult.error}`);
        }
      } catch (error) {
        logger.warn(`⚠️ Помилка тестового запиту: ${error.message}`);
      }
      
      // Получаем статистику
      const stats = llm.getStats();
      logger.debug('📈 Статистика LLM:', stats);
      
    } else {
      logger.warn('⚠️ LLM недоступний');
      logger.info('💡 Переконайтеся, що Ollama запущений: ollama serve');
      logger.info('💡 Завантажте модель: ollama pull llama3');
    }
    
    return llm.isAvailable();
  } catch (error) {
    logger.error('❌ Помилка тестування LLM:', error);
    return false;
  }
}

// Функция для тестирования Google Drive
async function testGoogleDrive() {
  logger.info('📁 === ТЕСТ 3: GOOGLE DRIVE ===');
  
  try {
    const gdrive = new GoogleDriveHandler();
    
    // Ждем инициализации
    logger.debug('⏳ Очікування ініціалізації Google Drive...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (gdrive.isConfigured()) {
      logger.success('✅ Google Drive налаштований');
      
      // Получаем информацию о подключении
      const connectionInfo = gdrive.getConnectionInfo();
      logger.info(`📊 Інформація про підключення:`, connectionInfo);
      
      // Получаем статистику
      const stats = gdrive.getStats();
      logger.debug('📈 Статистика Google Drive:', stats);
      
      // Тестируем поиск файлов (если есть доступ)
      try {
        logger.debug('🔍 Тестування пошуку файлів...');
        const files = await gdrive.findFiles('test');
        logger.info(`📁 Знайдено тестових файлів: ${files.length}`);
      } catch (error) {
        logger.warn(`⚠️ Помилка пошуку файлів: ${error.message}`);
      }
      
    } else {
      logger.warn('⚠️ Google Drive не налаштований');
      logger.info('💡 Для налаштування створіть сервісний акаунт Google');
      logger.info('💡 Додайте GOOGLE_CREDENTIALS_PATH в .env файл');
    }
    
    return gdrive.isConfigured();
  } catch (error) {
    logger.error('❌ Помилка тестування Google Drive:', error);
    return false;
  }
}

// Функция для тестирования логирования
async function testLogging() {
  logger.info('📝 === ТЕСТ 4: ЛОГУВАННЯ ===');
  
  try {
    // Тестируем разные уровни логирования
    logger.debug('🔍 Це відладочне повідомлення (debug)');
    logger.info('ℹ️ Це інформаційне повідомлення (info)');
    logger.warn('⚠️ Це попередження (warn)');
    logger.success('✅ Це повідомлення про успіх (success)');
    logger.error('❌ Це повідомлення про помилку (error)');
    
    // Тестируем логирование объектов
    const testObject = {
      name: 'Тестовий об\'єкт',
      value: 42,
      nested: { key: 'value' }
    };
    
    logger.info('📊 Логування об\'єкта:', testObject);
    
    logger.success('✅ Тестування логування завершено');
    return true;
  } catch (error) {
    logger.error('❌ Помилка тестування логування:', error);
    return false;
  }
}

// Функция для тестирования производительности
async function testPerformance() {
  logger.info('⚡ === ТЕСТ 5: ПРОДУКТИВНІСТЬ ===');
  
  try {
    const startTime = Date.now();
    
    // Тестируем создание компонентов
    const llm = new LLMProcessor();
    const gdrive = new GoogleDriveHandler();
    
    const initTime = Date.now() - startTime;
    logger.info(`⏱️ Час ініціалізації компонентів: ${initTime}ms`);
    
    // Тестируем память
    const memoryUsage = process.memoryUsage();
    logger.info(`💾 Використання пам\'яті:`, {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`
    });
    
    logger.success('✅ Тестування продуктивності завершено');
    return true;
  } catch (error) {
    logger.error('❌ Помилка тестування продуктивності:', error);
    return false;
  }
}

// Функция для тестирования обработки ошибок
async function testErrorHandling() {
  logger.info('🛡️ === ТЕСТ 6: ОБРОБКА ПОМИЛОК ===');
  
  try {
    // Тестируем обработку несуществующих модулей
    try {
      const nonExistentModule = await import('./non-existent.js');
    } catch (error) {
      logger.info('✅ Помилка імпорту оброблена коректно');
    }
    
    // Тестируем обработку невалидных данных
    try {
      const llm = new LLMProcessor();
      await llm.generateResponse(''); // Пустой промпт
    } catch (error) {
      logger.info('✅ Помилка генерації оброблена коректно');
    }
    
    logger.success('✅ Тестування обробки помилок завершено');
    return true;
  } catch (error) {
    logger.error('❌ Помилка тестування обробки помилок:', error);
    return false;
  }
}

// Главная функция тестирования
async function runDetailedTests() {
  logger.info('🧪 === ЗАПУСК ДЕТАЛЬНИХ ТЕСТІВ ===');
  logger.info(`🕐 Час запуску: ${new Date().toISOString()}`);
  logger.info(`🌍 Середовище: ${process.env.NODE_ENV || 'development'}`);
  
  const results = {
    configuration: false,
    llm: false,
    googleDrive: false,
    logging: false,
    performance: false,
    errorHandling: false
  };
  
  try {
    // Выполняем тесты
    results.configuration = await testConfiguration();
    results.llm = await testLLM();
    results.googleDrive = await testGoogleDrive();
    results.logging = await testLogging();
    results.performance = await testPerformance();
    results.errorHandling = await testErrorHandling();
    
    // Выводим итоговый отчет
    logger.info('📊 === ПІДСУМКОВИЙ ЗВІТ ===');
    
    const passed = Object.values(results).filter(Boolean).length;
    const total = Object.keys(results).length;
    
    Object.entries(results).forEach(([test, passed]) => {
      const status = passed ? '✅' : '❌';
      logger.info(`${status} ${test}: ${passed ? 'ПРОЙДЕНО' : 'НЕ ПРОЙДЕНО'}`);
    });
    
    logger.info(`📈 Результат: ${passed}/${total} тестів пройдено`);
    
    if (passed >= total * 0.8) {
      logger.success('🎉 Більшість тестів пройдено успішно!');
    } else {
      logger.warn(`⚠️ ${total - passed} тестів не пройдено`);
    }
    
  } catch (error) {
    logger.error('❌ Критична помилка при виконанні тестів:', error);
  }
  
  logger.info('🏁 === ДЕТАЛЬНЕ ТЕСТУВАННЯ ЗАВЕРШЕНО ===');
}

// Запускаем тесты
runDetailedTests(); 