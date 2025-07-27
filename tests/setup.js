/**
 * Настройки для тестов
 */

// Мокаем переменные окружения для тестов
process.env.NODE_ENV = 'test';
process.env.MATRIX_HOMESERVER_URL = 'https://test.matrix.org';
process.env.MATRIX_ACCESS_TOKEN = 'test_token';
process.env.MATRIX_USER_ID = '@testbot:test.matrix.org';
process.env.OLLAMA_HOST = 'http://localhost:11434';
process.env.OLLAMA_MODEL = 'llama3';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.METRICS_PORT = '9090';

// Глобальные моки
global.console = {
  ...console,
  // Отключаем логи в тестах
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Мокаем таймеры
jest.useFakeTimers();

// Очистка после каждого теста
afterEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
}); 