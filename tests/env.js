/**
 * Переменные окружения для тестов
 */

import dotenv from 'dotenv';

// Загружаем переменные окружения из .env.test если существует
dotenv.config({ path: '.env.test' });

// Устанавливаем тестовые переменные по умолчанию
process.env.NODE_ENV = 'test';
process.env.MATRIX_HOMESERVER_URL = process.env.MATRIX_HOMESERVER_URL || 'https://test.matrix.org';
process.env.MATRIX_ACCESS_TOKEN = process.env.MATRIX_ACCESS_TOKEN || 'test_token';
process.env.MATRIX_USER_ID = process.env.MATRIX_USER_ID || '@testbot:test.matrix.org';
process.env.OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
process.env.OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.METRICS_PORT = process.env.METRICS_PORT || '9090';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error'; 