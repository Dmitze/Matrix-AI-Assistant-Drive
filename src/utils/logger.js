/**
 * Модуль логирования
 * 
 * Этот модуль предоставляет единый интерфейс для логирования
 * с красивым форматированием и разными уровнями важности.
 */

// Функция для получения текущего времени в красивом формате
function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace('T', ' ').substring(0, 19);
}

// Функция для создания цветного текста в консоли
function colorize(text, colorCode) {
  return `\x1b[${colorCode}m${text}\x1b[0m`;
}

// Объект с цветами для разных уровней логирования
const colors = {
  info: 36,    // Голубой
  warn: 33,    // Желтый
  error: 31,   // Красный
  debug: 35,   // Пурпурный
  success: 32  // Зеленый
};

// Функция для логирования
function log(level, message, ...args) {
  const timestamp = getTimestamp();
  const levelUpper = level.toUpperCase();
  const colorCode = colors[level] || 37; // Белый по умолчанию
  
  const prefix = colorize(`[${timestamp}] [${levelUpper}]`, colorCode);
  
  if (args.length > 0) {
    console.log(`${prefix} ${message}`, ...args);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

// Экспортируем функции для разных уровней логирования
export const logger = {
  // Информационные сообщения
  info: (message, ...args) => log('info', message, ...args),
  
  // Предупреждения
  warn: (message, ...args) => log('warn', message, ...args),
  
  // Ошибки
  error: (message, ...args) => log('error', message, ...args),
  
  // Отладочная информация (только в режиме разработки)
  debug: (message, ...args) => {
    if (process.env.NODE_ENV === 'development') {
      log('debug', message, ...args);
    }
  },
  
  // Успешные операции
  success: (message, ...args) => log('success', message, ...args)
}; 