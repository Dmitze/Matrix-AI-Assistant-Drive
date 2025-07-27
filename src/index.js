#!/usr/bin/env node

/**
 * Matrix AI Assistant Drive - Главный файл приложения
 * 
 * Этот файл является точкой входа в приложение.
 * Он инициализирует все компоненты и запускает бота.
 */

import dotenv from 'dotenv';
import { Bot } from './bot.js';
import { logger } from './utils/logger.js';
import { metricsCollector } from './metrics.js';
import { cacheManager } from './cache.js';

// Загружаем переменные окружения из файла .env
dotenv.config();

// Функция для graceful shutdown (корректного завершения)
async function gracefulShutdown(signal) {
  logger.info(`Отримано сигнал ${signal}, завершуємо роботу...`);
  
  try {
    // Останавливаем сервер метрик
    await metricsCollector.stopServer();
    logger.info('✅ Сервер метрик зупинено');
    
    // Закрываем подключение к Redis
    await cacheManager.disconnect();
    logger.info('✅ Підключення до Redis закрито');
    
  } catch (error) {
    logger.error('❌ Помилка при graceful shutdown:', error.message);
  }
  
  process.exit(0);
}

// Обработчики сигналов для корректного завершения
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Обработчик необработанных ошибок
process.on('uncaughtException', (error) => {
  logger.error('Необроблена помилка:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Необроблене відхилення промісу:', reason);
  process.exit(1);
});

// Главная функция запуска
async function main() {
  try {
    logger.info('🚀 Запуск Matrix AI Assistant Drive...');
    
    // Проверяем обязательные переменные окружения
    const requiredEnvVars = [
      'MATRIX_HOMESERVER_URL',
      'MATRIX_ACCESS_TOKEN', 
      'MATRIX_USER_ID'
    ];
    
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Відсутні обов\'язкові змінні середовища: ${missingVars.join(', ')}`);
    }
    
    logger.info('✅ Змінні середовища перевірені');
    
    // Запускаем сервер метрик
    await metricsCollector.startServer();
    logger.info('✅ Сервер метрик запущено');

    // Создаем и запускаем бота
    const bot = new Bot();
    await bot.start();

    logger.info('✅ Бот успішно запущено і готовий до роботи!');
    
  } catch (error) {
    logger.error('❌ Помилка при запуску додатку:', error);
    process.exit(1);
  }
}

// Запускаем приложение
main(); 