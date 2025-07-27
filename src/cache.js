/**
 * Модуль кэширования Redis
 * 
 * Этот модуль обеспечивает кэширование результатов
 * для ускорения повторных запросов и снижения нагрузки на внешние сервисы.
 */

import { createClient } from 'redis';
import crypto from 'crypto';
import config from './config/config.js';
import { logger } from './utils/logger.js';

export class CacheManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.keyPrefix = config.redis.keyPrefix;
    this.defaultTTL = config.redis.defaultTTL;
    
    logger.info('💾 Ініціалізація менеджера кешу Redis...');
    
    // Инициализируем подключение
    this.initialize();
  }

  /**
   * Инициализация подключения к Redis
   */
  async initialize() {
    try {
      if (!config.redis.url) {
        logger.warn('⚠️ Redis URL не вказаний, кешування відключено');
        return;
      }

      logger.debug(`🔗 Підключення до Redis: ${config.redis.url}`);
      
      this.client = createClient({
        url: config.redis.url,
        socket: {
          connectTimeout: 5000,
          lazyConnect: true
        }
      });

      // Обработчики событий
      this.client.on('connect', () => {
        logger.success('✅ Підключення до Redis встановлено');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        logger.success('✅ Redis готовий до роботи');
      });

      this.client.on('error', (error) => {
        logger.error('❌ Помилка Redis:', error.message);
        this.isConnected = false;
      });

      this.client.on('end', () => {
        logger.warn('⚠️ З\'єднання з Redis закрито');
        this.isConnected = false;
      });

      // Подключаемся к Redis
      await this.client.connect();
      
    } catch (error) {
      logger.error('❌ Помилка ініціалізації Redis:', error.message);
      this.isConnected = false;
      
      if (error.code === 'ECONNREFUSED') {
        logger.info('💡 Переконайтеся, що Redis сервер запущений');
      } else if (error.code === 'ENOTFOUND') {
        logger.info('💡 Перевірте URL Redis сервера');
      }
    }
  }

  /**
   * Генерация хеша для ключа кэша
   */
  generateKey(prefix, data) {
    const hash = crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
    return `${this.keyPrefix}${prefix}:${hash}`;
  }

  /**
   * Получение данных из кэша
   */
  async get(key) {
    try {
      if (!this.isConnected || !this.client) {
        return null;
      }

      logger.debug(`🔍 Пошук в кеші: ${key}`);
      const value = await this.client.get(key);
      
      if (value) {
        logger.debug(`✅ Знайдено в кеші: ${key}`);
        return JSON.parse(value);
      } else {
        logger.debug(`❌ Не знайдено в кеші: ${key}`);
        return null;
      }

    } catch (error) {
      logger.error('❌ Помилка отримання з кешу:', error.message);
      return null;
    }
  }

  /**
   * Сохранение данных в кэш
   */
  async set(key, value, ttl = this.defaultTTL) {
    try {
      if (!this.isConnected || !this.client) {
        return false;
      }

      logger.debug(`💾 Збереження в кеш: ${key} (TTL: ${ttl}s)`);
      
      await this.client.set(key, JSON.stringify(value), {
        EX: ttl
      });
      
      logger.debug(`✅ Збережено в кеш: ${key}`);
      return true;

    } catch (error) {
      logger.error('❌ Помилка збереження в кеш:', error.message);
      return false;
    }
  }

  /**
   * Удаление данных из кэша
   */
  async delete(key) {
    try {
      if (!this.isConnected || !this.client) {
        return false;
      }

      logger.debug(`🗑️ Видалення з кешу: ${key}`);
      const result = await this.client.del(key);
      
      if (result > 0) {
        logger.debug(`✅ Видалено з кешу: ${key}`);
        return true;
      } else {
        logger.debug(`❌ Не знайдено для видалення: ${key}`);
        return false;
      }

    } catch (error) {
      logger.error('❌ Помилка видалення з кешу:', error.message);
      return false;
    }
  }

  /**
   * Очистка всего кэша
   */
  async clear() {
    try {
      if (!this.isConnected || !this.client) {
        return false;
      }

      logger.info('🧹 Очищення всього кешу...');
      
      // Удаляем все ключи с префиксом
      const keys = await this.client.keys(`${this.keyPrefix}*`);
      
      if (keys.length > 0) {
        await this.client.del(keys);
        logger.success(`✅ Очищено ${keys.length} ключів з кешу`);
      } else {
        logger.info('ℹ️ Кеш вже порожній');
      }
      
      return true;

    } catch (error) {
      logger.error('❌ Помилка очищення кешу:', error.message);
      return false;
    }
  }

  /**
   * Получение статистики кэша
   */
  async getStats() {
    try {
      if (!this.isConnected || !this.client) {
        return {
          connected: false,
          keys: 0,
          memory: 'N/A'
        };
      }

      const info = await this.client.info('memory');
      const keys = await this.client.keys(`${this.keyPrefix}*`);
      
      return {
        connected: true,
        keys: keys.length,
        memory: info,
        prefix: this.keyPrefix,
        defaultTTL: this.defaultTTL
      };

    } catch (error) {
      logger.error('❌ Помилка отримання статистики кешу:', error.message);
      return {
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Проверка подключения к Redis
   */
  isAvailable() {
    return this.isConnected && this.client !== null;
  }

  /**
   * Закрытие подключения к Redis
   */
  async disconnect() {
    try {
      if (this.client) {
        await this.client.quit();
        logger.success('✅ Підключення до Redis закрито');
      }
    } catch (error) {
      logger.error('❌ Помилка закриття підключення до Redis:', error.message);
    }
  }
}

// Создаем глобальный экземпляр кэша
const cacheManager = new CacheManager();

// Экспортируем функции для удобства использования
export async function getCachedResponse(userId, prompt) {
  const key = cacheManager.generateKey('llm', { userId, prompt });
  return await cacheManager.get(key);
}

export async function setCachedResponse(userId, prompt, response, ttl = 3600) {
  const key = cacheManager.generateKey('llm', { userId, prompt });
  return await cacheManager.set(key, response, ttl);
}

export async function getCachedFile(fileId) {
  const key = cacheManager.generateKey('file', { fileId });
  return await cacheManager.get(key);
}

export async function setCachedFile(fileId, content, ttl = 1800) {
  const key = cacheManager.generateKey('file', { fileId });
  return await cacheManager.set(key, content, ttl);
}

export { cacheManager }; 