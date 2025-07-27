/**
 * Конфигурация приложения
 * 
 * Этот модуль содержит все настройки приложения
 * и валидирует их при запуске.
 */

import { logger } from '../utils/logger.js';

/**
 * Основная конфигурация приложения
 */
const config = {
  // === MATRIX НАСТРОЙКИ ===
  matrix: {
    homeserver: process.env.MATRIX_HOMESERVER || 'https://matrix.org',
    username: process.env.MATRIX_USERNAME,
    password: process.env.MATRIX_PASSWORD,
    accessToken: process.env.MATRIX_ACCESS_TOKEN,
    deviceId: process.env.MATRIX_DEVICE_ID,
    roomId: process.env.MATRIX_ROOM_ID,
    maxMessageLength: parseInt(process.env.MATRIX_MAX_MESSAGE_LENGTH) || 4000,
    encryptionEnabled: process.env.MATRIX_ENCRYPTION_ENABLED === 'true',
    syncTimeout: parseInt(process.env.MATRIX_SYNC_TIMEOUT) || 30000,
    retryAttempts: parseInt(process.env.MATRIX_RETRY_ATTEMPTS) || 3,
    retryDelay: parseInt(process.env.MATRIX_RETRY_DELAY) || 1000
  },

  // === OLLAMA НАСТРОЙКИ ===
  ollama: {
    baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llama2',
    timeout: parseInt(process.env.OLLAMA_TIMEOUT) || 60000,
    maxTokens: parseInt(process.env.OLLAMA_MAX_TOKENS) || 2048,
    temperature: parseFloat(process.env.OLLAMA_TEMPERATURE) || 0.7,
    topP: parseFloat(process.env.OLLAMA_TOP_P) || 0.9,
    retryAttempts: parseInt(process.env.OLLAMA_RETRY_ATTEMPTS) || 2,
    retryDelay: parseInt(process.env.OLLAMA_RETRY_DELAY) || 3000
  },

  // === GOOGLE DRIVE НАСТРОЙКИ ===
  google: {
    credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH,
    maxSearchResults: parseInt(process.env.GOOGLE_MAX_SEARCH_RESULTS) || 10,
    sheetRange: process.env.GOOGLE_SHEET_RANGE || 'A1:Z1000',
    retryAttempts: parseInt(process.env.GOOGLE_RETRY_ATTEMPTS) || 3,
    retryDelay: parseInt(process.env.GOOGLE_RETRY_DELAY) || 1000,
    timeout: parseInt(process.env.GOOGLE_TIMEOUT) || 30000
  },

  // === REDIS НАСТРОЙКИ ===
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'matrix_bot:',
    defaultTTL: parseInt(process.env.REDIS_DEFAULT_TTL) || 3600,
    maxRetries: parseInt(process.env.REDIS_MAX_RETRIES) || 3,
    retryDelay: parseInt(process.env.REDIS_RETRY_DELAY) || 500,
    timeout: parseInt(process.env.REDIS_TIMEOUT) || 5000
  },

  // === МЕТРИКИ НАСТРОЙКИ ===
  metrics: {
    port: parseInt(process.env.METRICS_PORT) || 9090,
    host: process.env.METRICS_HOST || '0.0.0.0',
    enabled: process.env.METRICS_ENABLED !== 'false',
    collectDefaultMetrics: process.env.METRICS_COLLECT_DEFAULT !== 'false',
    updateInterval: parseInt(process.env.METRICS_UPDATE_INTERVAL) || 5000
  },

  // === БЕЗОПАСНОСТЬ НАСТРОЙКИ ===
  security: {
    enabled: process.env.SECURITY_ENABLED !== 'false',
    maxMessageLength: parseInt(process.env.SECURITY_MAX_MESSAGE_LENGTH) || 5000,
    rateLimitDefault: parseInt(process.env.SECURITY_RATE_LIMIT_DEFAULT) || 10,
    rateLimitWindow: parseInt(process.env.SECURITY_RATE_LIMIT_WINDOW) || 60000,
    allowedUsers: process.env.ALLOWED_USERS ? process.env.ALLOWED_USERS.split(',') : [],
    allowedRooms: process.env.ALLOWED_ROOMS ? process.env.ALLOWED_ROOMS.split(',') : [],
    blockedUsers: process.env.BLOCKED_USERS ? process.env.BLOCKED_USERS.split(',') : [],
    adminUsers: process.env.ADMIN_USERS ? process.env.ADMIN_USERS.split(',') : [],
    moderatorUsers: process.env.MODERATOR_USERS ? process.env.MODERATOR_USERS.split(',') : []
  },

  // === ЛОГИРОВАНИЕ НАСТРОЙКИ ===
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'text',
    timestamp: process.env.LOG_TIMESTAMP !== 'false',
    colors: process.env.LOG_COLORS !== 'false',
    file: process.env.LOG_FILE,
    maxSize: process.env.LOG_MAX_SIZE || '10m',
    maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5
  },

  // === ПРИЛОЖЕНИЕ НАСТРОЙКИ ===
  app: {
    name: process.env.APP_NAME || 'Matrix AI Assistant Drive',
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    debug: process.env.DEBUG === 'true',
    gracefulShutdownTimeout: parseInt(process.env.GRACEFUL_SHUTDOWN_TIMEOUT) || 30000
  }
};

/**
 * Валидация обязательных переменных окружения
 */
function validateRequiredEnvVars() {
  const required = [
    'MATRIX_USERNAME',
    'MATRIX_PASSWORD'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    logger.error('❌ Відсутні обов\'язкові змінні середовища:', missing);
    throw new Error(`Відсутні обов'язкові змінні середовища: ${missing.join(', ')}`);
  }
}

/**
 * Валидация конфигурации
 */
function validateConfig() {
  try {
    // Проверяем обязательные переменные
    validateRequiredEnvVars();

    // Валидация Matrix настроек
    if (!config.matrix.homeserver.startsWith('http')) {
      throw new Error('MATRIX_HOMESERVER має бути валідним URL');
    }

    // Валидация Ollama настроек
    if (!config.ollama.baseURL.startsWith('http')) {
      throw new Error('OLLAMA_BASE_URL має бути валідним URL');
    }

    // Валидация Redis настроек
    if (config.redis.url && !config.redis.url.startsWith('redis://')) {
      throw new Error('REDIS_URL має бути валідним Redis URL');
    }

    // Валидация метрик
    if (config.metrics.port < 1 || config.metrics.port > 65535) {
      throw new Error('METRICS_PORT має бути в діапазоні 1-65535');
    }

    // Валидация безопасности
    if (config.security.maxMessageLength < 1) {
      throw new Error('SECURITY_MAX_MESSAGE_LENGTH має бути більше 0');
    }

    logger.success('✅ Конфігурація додатку валідна');

  } catch (error) {
    logger.error('❌ Помилка валідації конфігурації:', error.message);
    throw error;
  }
}

/**
 * Логирование конфигурации (без секретов)
 */
function logConfig() {
  logger.info('📋 Конфігурація додатку:');
  logger.info(`   🏠 Matrix Homeserver: ${config.matrix.homeserver}`);
  logger.info(`   👤 Matrix Username: ${config.matrix.username}`);
  logger.info(`   🧠 Ollama URL: ${config.ollama.baseURL}`);
  logger.info(`   🧠 Ollama Model: ${config.ollama.model}`);
  logger.info(`   💾 Redis: ${config.redis.url ? 'Налаштований' : 'Не налаштований'}`);
  logger.info(`   📊 Метрики: ${config.metrics.enabled ? 'Увімкнені' : 'Вимкнені'}`);
  logger.info(`   🛡️ Безпека: ${config.security.enabled ? 'Увімкнена' : 'Вимкнена'}`);
  logger.info(`   📁 Google Drive: ${config.google.credentialsPath ? 'Налаштований' : 'Не налаштований'}`);
  logger.info(`   🌍 Середовище: ${config.app.environment}`);
  logger.info(`   🐛 Debug: ${config.app.debug ? 'Увімкнений' : 'Вимкнений'}`);
}

/**
 * Получение конфигурации для конкретного модуля
 */
function getModuleConfig(moduleName) {
  return config[moduleName] || {};
}

/**
 * Проверка доступности сервиса
 */
function isServiceConfigured(serviceName) {
  switch (serviceName) {
    case 'redis':
      return !!config.redis.url;
    case 'google':
      return !!config.google.credentialsPath;
    case 'ollama':
      return !!config.ollama.baseURL;
    case 'metrics':
      return config.metrics.enabled;
    case 'security':
      return config.security.enabled;
    default:
      return false;
  }
}

/**
 * Получение полной конфигурации
 */
function getFullConfig() {
  return {
    ...config,
    services: {
      redis: isServiceConfigured('redis'),
      google: isServiceConfigured('google'),
      ollama: isServiceConfigured('ollama'),
      metrics: isServiceConfigured('metrics'),
      security: isServiceConfigured('security')
    }
  };
}

// Валидируем конфигурацию при загрузке модуля
validateConfig();

// Логируем конфигурацию
logConfig();

export default config;
export { validateConfig, logConfig, getModuleConfig, isServiceConfigured, getFullConfig }; 