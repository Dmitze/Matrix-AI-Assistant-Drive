/**
 * Модуль механизма повторных попыток
 * 
 * Этот модуль обеспечивает надежное выполнение операций
 * с автоматическими повторными попытками и экспоненциальной задержкой.
 */

import { logger } from './logger.js';

/**
 * Конфигурация по умолчанию для повторных попыток
 */
const DEFAULT_CONFIG = {
  maxAttempts: 3,
  baseDelay: 1000, // 1 секунда
  maxDelay: 30000, // 30 секунд
  backoffMultiplier: 2,
  jitter: 0.1, // 10% случайности
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED']
};

/**
 * Генерация случайной задержки с jitter
 */
function calculateDelay(attempt, config) {
  const exponentialDelay = Math.min(
    config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
    config.maxDelay
  );
  
  const jitter = exponentialDelay * config.jitter * (Math.random() - 0.5);
  return Math.max(0, exponentialDelay + jitter);
}

/**
 * Проверка, является ли ошибка повторяемой
 */
function isRetryableError(error, config) {
  // Проверяем код ошибки
  if (error.code && config.retryableErrors.includes(error.code)) {
    return true;
  }
  
  // Проверяем HTTP статус код
  if (error.response && error.response.status) {
    const status = error.response.status;
    return status >= 500 || status === 429; // 5xx ошибки и 429 (Too Many Requests)
  }
  
  // Проверяем сообщение об ошибке
  if (error.message) {
    const message = error.message.toLowerCase();
    return message.includes('timeout') || 
           message.includes('connection') || 
           message.includes('network') ||
           message.includes('econnreset') ||
           message.includes('etimedout');
  }
  
  return false;
}

/**
 * Основная функция повторных попыток
 */
export async function withRetry(operation, config = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  let lastError;
  
  for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
    try {
      logger.debug(`🔄 Спроба ${attempt}/${finalConfig.maxAttempts}`);
      
      const result = await operation();
      
      if (attempt > 1) {
        logger.success(`✅ Операція успішна після ${attempt} спроб`);
      }
      
      return result;
      
    } catch (error) {
      lastError = error;
      
      logger.warn(`❌ Спроба ${attempt} невдала: ${error.message}`);
      
      // Проверяем, стоит ли повторять
      if (attempt === finalConfig.maxAttempts || !isRetryableError(error, finalConfig)) {
        logger.error(`💥 Всі спроби вичерпано або помилка не повторюється`);
        throw error;
      }
      
      // Вычисляем задержку
      const delay = calculateDelay(attempt, finalConfig);
      logger.info(`⏳ Очікування ${Math.round(delay)}ms перед наступною спробою...`);
      
      // Ждем перед следующей попыткой
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Специализированная функция для HTTP запросов
 */
export async function withHttpRetry(axiosInstance, config, retryConfig = {}) {
  const httpRetryConfig = {
    ...DEFAULT_CONFIG,
    maxAttempts: 3,
    baseDelay: 2000,
    retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNABORTED'],
    ...retryConfig
  };
  
  return withRetry(async () => {
    return await axiosInstance(config);
  }, httpRetryConfig);
}

/**
 * Специализированная функция для LLM запросов
 */
export async function withLLMRetry(operation, retryConfig = {}) {
  const llmRetryConfig = {
    ...DEFAULT_CONFIG,
    maxAttempts: 2,
    baseDelay: 3000,
    retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'],
    ...retryConfig
  };
  
  return withRetry(operation, llmRetryConfig);
}

/**
 * Специализированная функция для Google Drive запросов
 */
export async function withDriveRetry(operation, retryConfig = {}) {
  const driveRetryConfig = {
    ...DEFAULT_CONFIG,
    maxAttempts: 3,
    baseDelay: 1000,
    retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'],
    ...retryConfig
  };
  
  return withRetry(operation, driveRetryConfig);
}

/**
 * Специализированная функция для Redis операций
 */
export async function withRedisRetry(operation, retryConfig = {}) {
  const redisRetryConfig = {
    ...DEFAULT_CONFIG,
    maxAttempts: 2,
    baseDelay: 500,
    retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'],
    ...retryConfig
  };
  
  return withRetry(operation, redisRetryConfig);
}

/**
 * Функция для тестирования механизма повторных попыток
 */
export async function testRetryMechanism() {
  logger.info('🧪 Тестування механізму повторних спроб...');
  
  let attemptCount = 0;
  const failingOperation = async () => {
    attemptCount++;
    if (attemptCount < 3) {
      throw new Error('Тестова помилка з\'єднання');
    }
    return 'Успішний результат';
  };
  
  try {
    const result = await withRetry(failingOperation, {
      maxAttempts: 3,
      baseDelay: 100
    });
    
    logger.success(`✅ Тест пройдено: ${result}`);
    return true;
  } catch (error) {
    logger.error(`❌ Тест не пройдено: ${error.message}`);
    return false;
  }
}

/**
 * Создание кастомной конфигурации для повторных попыток
 */
export function createRetryConfig(options = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...options
  };
}

/**
 * Логирование статистики повторных попыток
 */
export function logRetryStats(operation, attempt, maxAttempts, error) {
  logger.debug(`📊 Статистика повторних спроб для ${operation}: ${attempt}/${maxAttempts}`);
  if (error) {
    logger.debug(`🔍 Деталі помилки: ${error.code || 'N/A'} - ${error.message}`);
  }
} 