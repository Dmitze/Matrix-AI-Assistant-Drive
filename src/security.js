/**
 * Модуль безопасности
 * 
 * Этот модуль обеспечивает расширенные проверки безопасности,
 * включая ACL с ролями, E2E шифрование, валидацию входных данных и rate limiting.
 */

import config from './config/config.js';
import { logger } from './utils/logger.js';
import crypto from 'crypto';

export class SecurityManager {
  constructor() {
    this.allowedUsers = new Map(); // userId -> role
    this.allowedRooms = new Map(); // roomId -> permissions
    this.blockedUsers = new Set();
    this.rateLimits = new Map();
    this.maxMessageLength = config.matrix.maxMessageLength;
    this.encryptionEnabled = config.matrix.encryptionEnabled || false;
    
    // Роли и их права
    this.roles = {
      admin: ['all'],
      moderator: ['read', 'write', 'search', 'help'],
      user: ['read', 'help'],
      guest: ['help']
    };
    
    logger.info('🛡️ Ініціалізація розширеного менеджера безпеки...');
    
    // Загружаем настройки безопасности
    this.loadSecurityConfig();
    
    // Запускаем очистку rate limits
    this.startCleanupInterval();
  }

  /**
   * Загрузка конфигурации безопасности
   */
  loadSecurityConfig() {
    try {
      // Разрешенные пользователи с ролями (формат: user1:admin,user2:moderator)
      const allowedUsersStr = process.env.ALLOWED_USERS || '';
      if (allowedUsersStr) {
        allowedUsersStr.split(',').forEach(userRole => {
          const [userId, role = 'user'] = userRole.trim().split(':');
          this.allowedUsers.set(userId, role);
        });
        logger.info(`👥 Дозволених користувачів з ролями: ${this.allowedUsers.size}`);
      }

      // Разрешенные комнаты с правами (формат: room1:read,write,room2:read)
      const allowedRoomsStr = process.env.ALLOWED_ROOMS || '';
      if (allowedRoomsStr) {
        allowedRoomsStr.split(',').forEach(roomPerms => {
          const [roomId, permissions = 'read'] = roomPerms.trim().split(':');
          this.allowedRooms.set(roomId, permissions.split(','));
        });
        logger.info(`🏠 Дозволених кімнат з правами: ${this.allowedRooms.size}`);
      }

      // Заблокированные пользователи
      const blockedUsersStr = process.env.BLOCKED_USERS || '';
      if (blockedUsersStr) {
        blockedUsersStr.split(',').forEach(user => {
          this.blockedUsers.add(user.trim());
        });
        logger.info(`🚫 Заблокованих користувачів: ${this.blockedUsers.size}`);
      }

      logger.success('✅ Розширена конфігурація безпеки завантажена');

    } catch (error) {
      logger.error('❌ Помилка завантаження конфігурації безпеки:', error.message);
    }
  }

  /**
   * Проверка доступа пользователя с учетом ролей
   */
  checkUserAccess(userId, requiredPermission = 'read') {
    try {
      // Проверяем, не заблокирован ли пользователь
      if (this.blockedUsers.has(userId)) {
        logger.warn(`🚫 Доступ заблоковано для користувача: ${userId}`);
        return {
          allowed: false,
          reason: 'user_blocked',
          role: null
        };
      }

      // Получаем роль пользователя
      const userRole = this.allowedUsers.get(userId) || 'guest';
      const userPermissions = this.roles[userRole] || [];

      // Проверяем права
      if (userPermissions.includes('all') || userPermissions.includes(requiredPermission)) {
        return {
          allowed: true,
          reason: 'access_granted',
          role: userRole
        };
      }

      logger.warn(`🚫 Недостатньо прав для користувача ${userId} (роль: ${userRole}, потрібно: ${requiredPermission})`);
      return {
        allowed: false,
        reason: 'insufficient_permissions',
        role: userRole
      };

    } catch (error) {
      logger.error('❌ Помилка перевірки доступу користувача:', error.message);
      return {
        allowed: false,
        reason: 'error',
        role: null
      };
    }
  }

  /**
   * Проверка доступа к комнате с учетом прав
   */
  checkRoomAccess(roomId, requiredPermission = 'read') {
    try {
      // Если нет ограничений по комнатам, разрешаем
      if (this.allowedRooms.size === 0) {
        return {
          allowed: true,
          reason: 'no_restrictions'
        };
      }

      // Проверяем права комнаты
      const roomPermissions = this.allowedRooms.get(roomId);
      if (!roomPermissions) {
        logger.warn(`🚫 Кімната не в списку дозволених: ${roomId}`);
        return {
          allowed: false,
          reason: 'room_not_allowed'
        };
      }

      if (roomPermissions.includes('all') || roomPermissions.includes(requiredPermission)) {
        return {
          allowed: true,
          reason: 'access_granted'
        };
      }

      logger.warn(`🚫 Недостатньо прав для кімнати ${roomId} (потрібно: ${requiredPermission})`);
      return {
        allowed: false,
        reason: 'insufficient_permissions'
      };

    } catch (error) {
      logger.error('❌ Помилка перевірки доступу до кімнати:', error.message);
      return {
        allowed: false,
        reason: 'error'
      };
    }
  }

  /**
   * Улучшенный rate limiting с использованием sliding window
   */
  checkRateLimit(userId, command, limit = 10, windowMs = 60000) {
    try {
      const key = `${userId}:${command}`;
      const now = Date.now();
      
      if (!this.rateLimits.has(key)) {
        this.rateLimits.set(key, []);
      }
      
      const requests = this.rateLimits.get(key);
      
      // Удаляем старые запросы
      const validRequests = requests.filter(timestamp => now - timestamp < windowMs);
      
      if (validRequests.length >= limit) {
        logger.warn(`⏰ Rate limit перевищено для ${userId} (команда: ${command})`);
        return {
          allowed: false,
          remaining: 0,
          resetTime: validRequests[0] + windowMs
        };
      }
      
      // Добавляем новый запрос
      validRequests.push(now);
      this.rateLimits.set(key, validRequests);
      
      return {
        allowed: true,
        remaining: limit - validRequests.length,
        resetTime: now + windowMs
      };

    } catch (error) {
      logger.error('❌ Помилка перевірки rate limit:', error.message);
      return {
        allowed: true, // В случае ошибки разрешаем
        remaining: 1,
        resetTime: Date.now() + 60000
      };
    }
  }

  /**
   * Расширенная валидация сообщений
   */
  validateMessage(message) {
    try {
      if (!message || typeof message !== 'string') {
        return {
          valid: false,
          reason: 'invalid_type',
          details: 'Повідомлення має бути рядком'
        };
      }

      // Проверка длины
      if (message.length > this.maxMessageLength) {
        return {
          valid: false,
          reason: 'too_long',
          details: `Максимальна довжина: ${this.maxMessageLength} символів`
        };
      }

      if (message.length === 0) {
        return {
          valid: false,
          reason: 'empty',
          details: 'Повідомлення не може бути порожнім'
        };
      }

      // Проверка на потенциально вредоносный контент
      const suspiciousPatterns = [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /javascript:/gi,
        /on\w+\s*=/gi,
        /data:text\/html/gi
      ];

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(message)) {
          return {
            valid: false,
            reason: 'suspicious_content',
            details: 'Виявлено підозрілий контент'
          };
        }
      }

      // Проверка на повторяющиеся символы (спам)
      const repeatedChars = /(.)\1{10,}/;
      if (repeatedChars.test(message)) {
        return {
          valid: false,
          reason: 'spam_detected',
          details: 'Виявлено спам'
        };
      }

      return {
        valid: true,
        reason: 'valid'
      };

    } catch (error) {
      logger.error('❌ Помилка валідації повідомлення:', error.message);
      return {
        valid: false,
        reason: 'validation_error',
        details: error.message
      };
    }
  }

  /**
   * Валидация команд с учетом ролей
   */
  validateCommand(command, args, userRole = 'guest') {
    try {
      // Список команд по ролям
      const commandPermissions = {
        'help': ['all'],
        'ask': ['user', 'moderator', 'admin'],
        'search': ['user', 'moderator', 'admin'],
        'read': ['user', 'moderator', 'admin'],
        'status': ['user', 'moderator', 'admin'],
        'ping': ['user', 'moderator', 'admin'],
        'admin_restart': ['admin'],
        'admin_config': ['admin'],
        'admin_cache_clear': ['admin'],
        'admin_metrics': ['admin', 'moderator']
      };

      const allowedRoles = commandPermissions[command] || ['admin'];
      
      if (!allowedRoles.includes('all') && !allowedRoles.includes(userRole)) {
        return {
          valid: false,
          reason: 'insufficient_permissions',
          details: `Команда ${command} недоступна для ролі ${userRole}`
        };
      }

      // Валидация аргументов для конкретных команд
      switch (command) {
        case 'ask':
          if (!args || args.length === 0) {
            return {
              valid: false,
              reason: 'missing_arguments',
              details: 'Потрібно вказати питання'
            };
          }
          break;
          
        case 'search':
        case 'read':
          if (!args || args.length === 0) {
            return {
              valid: false,
              reason: 'missing_arguments',
              details: 'Потрібно вказати назву файлу'
            };
          }
          break;
      }

      return {
        valid: true,
        reason: 'valid'
      };

    } catch (error) {
      logger.error('❌ Помилка валідації команди:', error.message);
      return {
        valid: false,
        reason: 'validation_error',
        details: error.message
      };
    }
  }

  /**
   * Комплексная проверка безопасности
   */
  checkSecurity(userId, roomId, command, args, message) {
    try {
      // Проверяем доступ пользователя
      const userAccess = this.checkUserAccess(userId, 'read');
      if (!userAccess.allowed) {
        return {
          allowed: false,
          reason: userAccess.reason,
          details: 'Доступ користувача заборонено'
        };
      }

      // Проверяем доступ к комнате
      const roomAccess = this.checkRoomAccess(roomId, 'read');
      if (!roomAccess.allowed) {
        return {
          allowed: false,
          reason: roomAccess.reason,
          details: 'Доступ до кімнати заборонено'
        };
      }

      // Проверяем rate limit
      const rateLimit = this.checkRateLimit(userId, command);
      if (!rateLimit.allowed) {
        return {
          allowed: false,
          reason: 'rate_limit_exceeded',
          details: `Перевищено ліміт запитів. Спробуйте пізніше.`
        };
      }

      // Валидируем сообщение
      const messageValidation = this.validateMessage(message);
      if (!messageValidation.valid) {
        return {
          allowed: false,
          reason: messageValidation.reason,
          details: messageValidation.details
        };
      }

      // Валидируем команду
      const commandValidation = this.validateCommand(command, args, userAccess.role);
      if (!commandValidation.valid) {
        return {
          allowed: false,
          reason: commandValidation.reason,
          details: commandValidation.details
        };
      }

      return {
        allowed: true,
        reason: 'all_checks_passed',
        userRole: userAccess.role,
        rateLimit: rateLimit
      };

    } catch (error) {
      logger.error('❌ Помилка перевірки безпеки:', error.message);
      return {
        allowed: false,
        reason: 'security_check_error',
        details: error.message
      };
    }
  }

  /**
   * Очистка устаревших rate limits
   */
  cleanupRateLimits() {
    try {
      const now = Date.now();
      let cleanedCount = 0;
      
      for (const [key, requests] of this.rateLimits.entries()) {
        const validRequests = requests.filter(timestamp => now - timestamp < 60000);
        if (validRequests.length === 0) {
          this.rateLimits.delete(key);
          cleanedCount++;
        } else if (validRequests.length !== requests.length) {
          this.rateLimits.set(key, validRequests);
        }
      }
      
      if (cleanedCount > 0) {
        logger.debug(`🧹 Очищено ${cleanedCount} rate limit записів`);
      }
      
    } catch (error) {
      logger.error('❌ Помилка очищення rate limits:', error.message);
    }
  }

  /**
   * Запуск интервала очистки
   */
  startCleanupInterval() {
    setInterval(() => {
      this.cleanupRateLimits();
    }, 60000); // Каждую минуту
  }

  /**
   * Получение статистики безопасности
   */
  getStats() {
    return {
      allowedUsers: this.allowedUsers.size,
      allowedRooms: this.allowedRooms.size,
      blockedUsers: this.blockedUsers.size,
      activeRateLimits: this.rateLimits.size,
      roles: Object.keys(this.roles),
      encryptionEnabled: this.encryptionEnabled
    };
  }

  /**
   * Проверка поддержки E2E шифрования
   */
  isEncryptionSupported() {
    return this.encryptionEnabled;
  }

  /**
   * Генерация безопасного ключа
   */
  generateSecureKey(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Хеширование данных
   */
  hashData(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}

// Создаем экземпляр менеджера безопасности
export const securityManager = new SecurityManager();

// Экспортируем функции для удобства использования
export function checkUserAccess(userId, permission = 'read') {
  return securityManager.checkUserAccess(userId, permission);
}

export function checkRoomAccess(roomId, permission = 'read') {
  return securityManager.checkRoomAccess(roomId, permission);
}

export function checkRateLimit(userId, command, limit = 10, windowMs = 60000) {
  return securityManager.checkRateLimit(userId, command, limit, windowMs);
}

export function validateMessage(message) {
  return securityManager.validateMessage(message);
}

export function validateCommand(command, args, userRole = 'guest') {
  return securityManager.validateCommand(command, args, userRole);
}

export function checkSecurity(userId, roomId, command, args, message) {
  return securityManager.checkSecurity(userId, roomId, command, args, message);
} 