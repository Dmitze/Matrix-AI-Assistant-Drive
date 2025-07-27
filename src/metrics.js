/**
 * Модуль метрик Prometheus
 * 
 * Этот модуль собирает расширенные метрики производительности
 * и экспонирует их для сбора Prometheus.
 */

import client from 'prom-client';
import express from 'express';
import config from './config/config.js';
import { logger } from './utils/logger.js';

export class MetricsCollector {
  constructor() {
    this.register = new client.Registry();
    this.server = null;
    this.metrics = {};
    
    logger.info('📊 Ініціалізація розширеного збирача метрик...');
    
    // Собираем стандартные метрики Node.js
    client.collectDefaultMetrics({ register: this.register });
    
    // Создаем кастомные метрики
    this.createMetrics();
  }

  /**
   * Создание расширенных метрик
   */
  createMetrics() {
    // === ОСНОВНЫЕ МЕТРИКИ БОТА ===
    
    // Счетчик запросов к боту
    this.metrics.botRequestsTotal = new client.Counter({
      name: 'bot_requests_total',
      help: 'Загальна кількість запитів до бота',
      labelNames: ['command', 'status', 'user_role'],
      registers: [this.register]
    });

    // Гистограмма времени ответа бота
    this.metrics.botResponseTimeSeconds = new client.Histogram({
      name: 'bot_response_time_seconds',
      help: 'Час відповіді бота',
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      labelNames: ['command'],
      registers: [this.register]
    });

    // === МЕТРИКИ LLM ===
    
    // Гистограмма времени ответа LLM
    this.metrics.llmLatencySeconds = new client.Histogram({
      name: 'llm_latency_seconds',
      help: 'Час обробки запиту LLM',
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
      labelNames: ['model', 'operation'],
      registers: [this.register]
    });

    // Счетчик ошибок LLM
    this.metrics.llmErrorsTotal = new client.Counter({
      name: 'llm_errors_total',
      help: 'Загальна кількість помилок LLM',
      labelNames: ['error_type', 'model'],
      registers: [this.register]
    });

    // Счетчик токенов LLM
    this.metrics.llmTokensTotal = new client.Counter({
      name: 'llm_tokens_total',
      help: 'Загальна кількість токенів LLM',
      labelNames: ['model', 'direction'],
      registers: [this.register]
    });

    // === МЕТРИКИ GOOGLE DRIVE ===
    
    // Счетчик запросов к Google Drive
    this.metrics.driveRequestsTotal = new client.Counter({
      name: 'drive_requests_total',
      help: 'Загальна кількість запитів до Google Drive',
      labelNames: ['operation', 'status', 'file_type'],
      registers: [this.register]
    });

    // Счетчик ошибок Google Drive
    this.metrics.driveErrorsTotal = new client.Counter({
      name: 'drive_errors_total',
      help: 'Загальна кількість помилок Google Drive',
      labelNames: ['error_type', 'operation'],
      registers: [this.register]
    });

    // Гистограмма времени обработки файлов
    this.metrics.fileProcessingTimeSeconds = new client.Histogram({
      name: 'file_processing_time_seconds',
      help: 'Час обробки файлів',
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
      labelNames: ['file_type'],
      registers: [this.register]
    });

    // === МЕТРИКИ КЭША ===
    
    // Счетчик попаданий в кэш
    this.metrics.cacheHitsTotal = new client.Counter({
      name: 'cache_hits_total',
      help: 'Загальна кількість попадань в кеш',
      labelNames: ['cache_type', 'operation'],
      registers: [this.register]
    });

    // Счетчик промахов кэша
    this.metrics.cacheMissesTotal = new client.Counter({
      name: 'cache_misses_total',
      help: 'Загальна кількість промахів кешу',
      labelNames: ['cache_type', 'operation'],
      registers: [this.register]
    });

    // Гистограмма времени операций кэша
    this.metrics.cacheOperationTimeSeconds = new client.Histogram({
      name: 'cache_operation_time_seconds',
      help: 'Час операцій кешу',
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      labelNames: ['operation'],
      registers: [this.register]
    });

    // === МЕТРИКИ БЕЗОПАСНОСТИ ===
    
    // Счетчик заблокированных запросов
    this.metrics.securityBlockedTotal = new client.Counter({
      name: 'security_blocked_total',
      help: 'Загальна кількість заблокованих запитів',
      labelNames: ['reason', 'user_role'],
      registers: [this.register]
    });

    // Счетчик превышений rate limit
    this.metrics.rateLimitExceededTotal = new client.Counter({
      name: 'rate_limit_exceeded_total',
      help: 'Загальна кількість перевищень rate limit',
      labelNames: ['command', 'user_role'],
      registers: [this.register]
    });

    // Счетчик валидационных ошибок
    this.metrics.validationErrorsTotal = new client.Counter({
      name: 'validation_errors_total',
      help: 'Загальна кількість помилок валідації',
      labelNames: ['type', 'field'],
      registers: [this.register]
    });

    // === МЕТРИКИ MATRIX ===
    
    // Счетчик подключений к Matrix
    this.metrics.matrixConnectionsTotal = new client.Counter({
      name: 'matrix_connections_total',
      help: 'Загальна кількість підключень до Matrix',
      labelNames: ['status', 'homeserver'],
      registers: [this.register]
    });

    // Счетчик сообщений Matrix
    this.metrics.matrixMessagesTotal = new client.Counter({
      name: 'matrix_messages_total',
      help: 'Загальна кількість повідомлень Matrix',
      labelNames: ['direction', 'type', 'room_type'],
      registers: [this.register]
    });

    // Гистограмма времени обработки событий Matrix
    this.metrics.matrixEventProcessingTimeSeconds = new client.Histogram({
      name: 'matrix_event_processing_time_seconds',
      help: 'Час обробки подій Matrix',
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      labelNames: ['event_type'],
      registers: [this.register]
    });

    // === МЕТРИКИ СТРИМІНГУ ===
    
    // Гистограмма времени стриминговых ответов
    this.metrics.streamingLatencySeconds = new client.Histogram({
      name: 'streaming_latency_seconds',
      help: 'Час стримінгової відповіді LLM в секундах',
      labelNames: ['model'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
      registers: [this.register]
    });

    // Счетчик чанков стриминга
    this.metrics.streamingChunksTotal = new client.Counter({
      name: 'streaming_chunks_total',
      help: 'Загальна кількість чанків стримінгу',
      labelNames: ['model'],
      registers: [this.register]
    });

    // === МЕТРИКИ СИСТЕМЫ ===
    
    // Gauge для активных подключений
    this.metrics.activeConnections = new client.Gauge({
      name: 'active_connections',
      help: 'Кількість активних підключень',
      labelNames: ['service'],
      registers: [this.register]
    });

    // Gauge для использования памяти
    this.metrics.memoryUsageBytes = new client.Gauge({
      name: 'memory_usage_bytes',
      help: 'Використання пам\'яті в байтах',
      labelNames: ['type'],
      registers: [this.register]
    });

    // Gauge для времени работы
    this.metrics.uptimeSeconds = new client.Gauge({
      name: 'uptime_seconds',
      help: 'Час роботи в секундах',
      registers: [this.register]
    });

    // === МЕТРИКИ ПРОИЗВОДИТЕЛЬНОСТИ ===
    
    // Счетчик повторных попыток
    this.metrics.retryAttemptsTotal = new client.Counter({
      name: 'retry_attempts_total',
      help: 'Загальна кількість повторних спроб',
      labelNames: ['service', 'operation', 'status'],
      registers: [this.register]
    });

    // Гистограмма времени повторных попыток
    this.metrics.retryDelaySeconds = new client.Histogram({
      name: 'retry_delay_seconds',
      help: 'Затримка між повторними спробами',
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      labelNames: ['service'],
      registers: [this.register]
    });

    logger.success('✅ Розширені метрики створені');
  }

  /**
   * Запуск HTTP сервера для метрик
   */
  async startServer() {
    try {
      if (this.server) {
        logger.warn('⚠️ HTTP сервер метрик вже запущений');
        return;
      }

      const app = express();
      const port = config.metrics.port || 9090;

      // Middleware для логирования запросов
      app.use((req, res, next) => {
        logger.debug(`📊 Метрики запит: ${req.method} ${req.path}`);
        next();
      });

      // Эндпоинт для метрик
      app.get('/metrics', async (req, res) => {
        try {
          res.set('Content-Type', this.register.contentType);
          res.end(await this.register.metrics());
        } catch (error) {
          logger.error('❌ Помилка експорту метрик:', error.message);
          res.status(500).send('Internal Server Error');
        }
      });

      // Эндпоинт для проверки здоровья
      app.get('/health', (req, res) => {
        const health = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          version: process.env.npm_package_version || 'unknown'
        };
        
        res.json(health);
      });

      // Эндпоинт для готовности
      app.get('/ready', (req, res) => {
        res.json({ status: 'ready' });
      });

      // Обработка ошибок
      app.use((error, req, res, next) => {
        logger.error('❌ Помилка HTTP сервера метрик:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
      });

      this.server = app.listen(port, () => {
        logger.success(`✅ HTTP сервер метрик запущено на порту ${port}`);
        logger.info(`📊 Метрики доступні за адресою http://localhost:${port}/metrics`);
        logger.info(`🏥 Health check доступний за адресою http://localhost:${port}/health`);
      });

      // Обновляем метрики времени работы
      this.updateUptimeMetric();

    } catch (error) {
      logger.error('❌ Помилка запуску сервера метрик:', error.message);
      throw error;
    }
  }

  /**
   * Остановка HTTP сервера
   */
  async stopServer() {
    try {
      if (this.server) {
        await new Promise((resolve, reject) => {
          this.server.close((error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
        
        this.server = null;
        logger.success('✅ HTTP сервер метрик зупинено');
      }
    } catch (error) {
      logger.error('❌ Помилка зупинки сервера метрик:', error.message);
      throw error;
    }
  }

  /**
   * Обновление метрики времени работы
   */
  updateUptimeMetric() {
    setInterval(() => {
      this.metrics.uptimeSeconds.set(process.uptime());
      
      // Обновляем метрики памяти
      const memUsage = process.memoryUsage();
      this.metrics.memoryUsageBytes.set({ type: 'rss' }, memUsage.rss);
      this.metrics.memoryUsageBytes.set({ type: 'heap_used' }, memUsage.heapUsed);
      this.metrics.memoryUsageBytes.set({ type: 'heap_total' }, memUsage.heapTotal);
      this.metrics.memoryUsageBytes.set({ type: 'external' }, memUsage.external);
    }, 5000); // Каждые 5 секунд
  }

  // === МЕТОДЫ ДЛЯ ЗАПИСИ МЕТРИК ===

  incrementBotRequests(command, status = 'success', userRole = 'unknown') {
    this.metrics.botRequestsTotal.inc({ command, status, user_role: userRole });
  }

  observeBotResponseTime(duration, command) {
    this.metrics.botResponseTimeSeconds.observe({ command }, duration);
  }

  observeLLMLatency(duration, model = 'default', operation = 'generate') {
    this.metrics.llmLatencySeconds.observe({ model, operation }, duration);
  }

  incrementLLMErrors(errorType = 'unknown', model = 'default') {
    this.metrics.llmErrorsTotal.inc({ error_type: errorType, model });
  }

  incrementLLMTokens(count, model = 'default', direction = 'input') {
    this.metrics.llmTokensTotal.inc({ model, direction }, count);
  }

  incrementDriveRequests(operation, status = 'success', fileType = 'unknown') {
    this.metrics.driveRequestsTotal.inc({ operation, status, file_type: fileType });
  }

  incrementDriveErrors(errorType = 'unknown', operation = 'unknown') {
    this.metrics.driveErrorsTotal.inc({ error_type: errorType, operation });
  }

  observeFileProcessingTime(duration, fileType) {
    this.metrics.fileProcessingTimeSeconds.observe({ file_type: fileType }, duration);
  }

  incrementCacheHits(cacheType = 'general', operation = 'get') {
    this.metrics.cacheHitsTotal.inc({ cache_type: cacheType, operation });
  }

  incrementCacheMisses(cacheType = 'general', operation = 'get') {
    this.metrics.cacheMissesTotal.inc({ cache_type: cacheType, operation });
  }

  observeCacheOperationTime(duration, operation) {
    this.metrics.cacheOperationTimeSeconds.observe({ operation }, duration);
  }

  incrementSecurityBlocked(reason, userRole = 'unknown') {
    this.metrics.securityBlockedTotal.inc({ reason, user_role: userRole });
  }

  incrementRateLimitExceeded(command, userRole = 'unknown') {
    this.metrics.rateLimitExceededTotal.inc({ command, user_role: userRole });
  }

  incrementValidationErrors(type, field = 'unknown') {
    this.metrics.validationErrorsTotal.inc({ type, field });
  }

  incrementMatrixConnections(status = 'success', homeserver = 'default') {
    this.metrics.matrixConnectionsTotal.inc({ status, homeserver });
  }

  incrementMatrixMessages(direction, type = 'text', roomType = 'unknown') {
    this.metrics.matrixMessagesTotal.inc({ direction, type, room_type: roomType });
  }

  observeMatrixEventProcessingTime(duration, eventType) {
    this.metrics.matrixEventProcessingTimeSeconds.observe({ event_type: eventType }, duration);
  }

  setActiveConnections(service, count) {
    this.metrics.activeConnections.set({ service }, count);
  }

  incrementRetryAttempts(service, operation, status = 'success') {
    this.metrics.retryAttemptsTotal.inc({ service, operation, status });
  }

  observeRetryDelay(duration, service) {
    this.metrics.retryDelaySeconds.observe({ service }, duration);
  }

  /**
   * Метрики стриминга
   */
  observeStreamingLatency(duration, model = 'default') {
    this.metrics.streamingLatencySeconds.observe({ model }, duration);
  }

  incrementStreamingChunks(count, model = 'default') {
    this.metrics.streamingChunksTotal.inc({ model }, count);
  }

  /**
   * Получение статистики метрик
   */
  getStats() {
    return {
      metricsCount: Object.keys(this.metrics).length,
      serverRunning: !!this.server,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
      platform: process.platform
    };
  }

  /**
   * Сброс всех метрик
   */
  async reset() {
    try {
      await this.register.clear();
      logger.success('✅ Метрики скинуті');
    } catch (error) {
      logger.error('❌ Помилка скидання метрик:', error.message);
      throw error;
    }
  }
}

// Создаем экземпляр сборщика метрик
export const metricsCollector = new MetricsCollector();

// Экспортируем функции для удобства использования
export function recordBotRequest(command, status = 'success', userRole = 'unknown') {
  metricsCollector.incrementBotRequests(command, status, userRole);
}

export function recordBotResponseTime(duration, command) {
  metricsCollector.observeBotResponseTime(duration, command);
}

export function recordLLMLatency(duration, model = 'default', operation = 'generate') {
  metricsCollector.observeLLMLatency(duration, model, operation);
}

export function recordLLMError(errorType = 'unknown', model = 'default') {
  metricsCollector.incrementLLMErrors(errorType, model);
}

export function recordLLMTokens(count, model = 'default', direction = 'input') {
  metricsCollector.incrementLLMTokens(count, model, direction);
}

export function recordDriveRequest(operation, status = 'success', fileType = 'unknown') {
  metricsCollector.incrementDriveRequests(operation, status, fileType);
}

export function recordDriveError(errorType = 'unknown', operation = 'unknown') {
  metricsCollector.incrementDriveErrors(errorType, operation);
}

export function recordFileProcessingTime(duration, fileType) {
  metricsCollector.observeFileProcessingTime(duration, fileType);
}

export function recordCacheHit(cacheType = 'general', operation = 'get') {
  metricsCollector.incrementCacheHits(cacheType, operation);
}

export function recordCacheMiss(cacheType = 'general', operation = 'get') {
  metricsCollector.incrementCacheMisses(cacheType, operation);
}

export function recordCacheOperationTime(duration, operation) {
  metricsCollector.observeCacheOperationTime(duration, operation);
}

export function recordSecurityBlocked(reason, userRole = 'unknown') {
  metricsCollector.incrementSecurityBlocked(reason, userRole);
}

export function recordRateLimitExceeded(command, userRole = 'unknown') {
  metricsCollector.incrementRateLimitExceeded(command, userRole);
}

export function recordValidationError(type, field = 'unknown') {
  metricsCollector.incrementValidationErrors(type, field);
}

export function recordMatrixConnection(status = 'success', homeserver = 'default') {
  metricsCollector.incrementMatrixConnections(status, homeserver);
}

export function recordMatrixMessage(direction, type = 'text', roomType = 'unknown') {
  metricsCollector.incrementMatrixMessages(direction, type, roomType);
}

export function recordMatrixEventProcessingTime(duration, eventType) {
  metricsCollector.observeMatrixEventProcessingTime(duration, eventType);
}

export function setActiveConnections(service, count) {
  metricsCollector.setActiveConnections(service, count);
}

export function recordRetryAttempt(service, operation, status = 'success') {
  metricsCollector.incrementRetryAttempts(service, operation, status);
}

export function recordRetryDelay(duration, service) {
  metricsCollector.observeRetryDelay(duration, service);
}

export function recordStreamingLatency(duration, model = 'default') {
  metricsCollector.observeStreamingLatency(duration, model);
}

export function recordStreamingChunks(count, model = 'default') {
  metricsCollector.incrementStreamingChunks(count, model);
}