/**
 * Простой тест для проверки базовой функциональности
 * 
 * Этот файл позволяет протестировать основные компоненты
 * без необходимости настройки Matrix и других сервисов.
 */

import dotenv from 'dotenv';
import { logger } from './src/utils/logger.js';
import config from './src/config/config.js';
import { LLMProcessor } from './src/llm.js';
import { GoogleDriveHandler } from './src/gdrive.js';

// Загружаем переменные окружения
dotenv.config();

async function testBasicFunctionality() {
  logger.info('🧪 Запуск базових тестів...');
  
  try {
    // Тест 1: Проверка конфигурации
    logger.info('📋 Тест 1: Перевірка конфігурації');
    config.logConfig();
    
    // Тест 2: Проверка LLM (если доступен)
    logger.info('🧠 Тест 2: Перевірка LLM');
    const llm = new LLMProcessor();
    
    // Ждем немного для инициализации
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (llm.isAvailable()) {
      logger.success('✅ LLM доступний');
      
      // Пробуем простой тест
      try {
        const testResult = await llm.testConnection();
        if (testResult.success) {
          logger.success(`✅ Тестовий запит до LLM: ${testResult.response}`);
        } else {
          logger.warn(`⚠️ Тестовий запит до LLM не вдався: ${testResult.error}`);
        }
      } catch (error) {
        logger.warn(`⚠️ Помилка тестового запиту до LLM: ${error.message}`);
      }
    } else {
      logger.warn('⚠️ LLM недоступний (це нормально, якщо Ollama не запущений)');
    }
    
    // Тест 3: Проверка Google Drive
    logger.info('📁 Тест 3: Перевірка Google Drive');
    const gdrive = new GoogleDriveHandler();
    
    // Ждем немного для инициализации
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (gdrive.isConfigured()) {
      logger.success('✅ Google Drive налаштований');
      
      const connectionInfo = gdrive.getConnectionInfo();
      logger.info(`📊 Інформація про підключення:`, connectionInfo);
    } else {
      logger.warn('⚠️ Google Drive не налаштований (це нормально, якщо немає облікових даних)');
    }
    
    // Тест 4: Проверка логирования
    logger.info('📝 Тест 4: Перевірка логування');
    logger.debug('Це відладочне повідомлення');
    logger.info('Це інформаційне повідомлення');
    logger.warn('Це попередження');
    logger.success('Це повідомлення про успіх');
    logger.error('Це повідомлення про помилку (тестове)');
    
    logger.success('🎉 Всі базові тести завершено!');
    
  } catch (error) {
    logger.error('❌ Помилка при виконанні тестів:', error);
  }
}

// Запускаем тесты
testBasicFunctionality(); 