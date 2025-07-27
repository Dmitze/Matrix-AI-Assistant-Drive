/**
 * Unit тесты для LLM модуля
 */

import { jest } from '@jest/globals';
import { LLMProcessor } from '../src/llm.js';

// Мокаем axios
jest.mock('axios');
const axios = (await import('axios')).default;

describe('LLMProcessor', () => {
  let llm;

  beforeEach(() => {
    // Создаем новый экземпляр для каждого теста
    llm = new LLMProcessor();
    
    // Очищаем все моки
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('должен инициализировать с правильными настройками', () => {
      expect(llm.host).toBe('http://localhost:11434');
      expect(llm.model).toBe('llama3');
      expect(llm.isAvailable).toBe(false);
    });
  });

  describe('checkAvailability', () => {
    test('должен вернуть true при доступном сервере', async () => {
      // Мокаем успешный ответ
      axios.get.mockResolvedValue({
        status: 200,
        data: {
          models: [
            { name: 'llama3' },
            { name: 'mistral' }
          ]
        }
      });

      await llm.checkAvailability();

      expect(llm.isAvailable).toBe(true);
      expect(axios.get).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        { timeout: 5000 }
      );
    });

    test('должен вернуть false при недоступном сервере', async () => {
      // Мокаем ошибку подключения
      axios.get.mockRejectedValue({
        code: 'ECONNREFUSED',
        message: 'Connection refused'
      });

      await llm.checkAvailability();

      expect(llm.isAvailable).toBe(false);
    });

    test('должен вернуть false при отсутствии модели', async () => {
      // Мокаем ответ без нужной модели
      axios.get.mockResolvedValue({
        status: 200,
        data: {
          models: [
            { name: 'mistral' }
          ]
        }
      });

      await llm.checkAvailability();

      expect(llm.isAvailable).toBe(false);
    });
  });

  describe('generateResponse', () => {
    test('должен сгенерировать ответ при доступном сервере', async () => {
      // Настраиваем доступность
      llm.isAvailable = true;

      // Мокаем успешный ответ
      axios.post.mockResolvedValue({
        status: 200,
        data: {
          response: 'Это тестовый ответ от AI'
        }
      });

      const result = await llm.generateResponse('Тестовый вопрос');

      expect(result).toBe('Это тестовый ответ от AI');
      expect(axios.post).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.objectContaining({
          model: 'llama3',
          prompt: 'Тестовый вопрос'
        }),
        expect.objectContaining({
          timeout: 30000
        })
      );
    });

    test('должен выбросить ошибку при недоступном сервере', async () => {
      llm.isAvailable = false;

      await expect(llm.generateResponse('Тест')).rejects.toThrow('Ollama сервер недоступен');
    });

    test('должен обработать ошибку сервера', async () => {
      llm.isAvailable = true;

      axios.post.mockRejectedValue({
        code: 'ECONNREFUSED',
        message: 'Connection refused'
      });

      await expect(llm.generateResponse('Тест')).rejects.toThrow('Connection refused');
    });
  });

  describe('testConnection', () => {
    test('должен успешно протестировать соединение', async () => {
      llm.isAvailable = true;
      axios.post.mockResolvedValue({
        status: 200,
        data: {
          response: 'Тест'
        }
      });

      const result = await llm.testConnection();

      expect(result.success).toBe(true);
      expect(result.response).toBe('Тест');
    });

    test('должен обработать ошибку тестирования', async () => {
      llm.isAvailable = true;
      axios.post.mockRejectedValue(new Error('Test error'));

      const result = await llm.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Test error');
    });
  });

  describe('getModelInfo', () => {
    test('должен получить информацию о модели', async () => {
      axios.get.mockResolvedValue({
        status: 200,
        data: {
          models: [
            {
              name: 'llama3',
              size: 1234567890,
              modified_at: '2024-01-01T00:00:00Z'
            }
          ]
        }
      });

      const result = await llm.getModelInfo();

      expect(result.name).toBe('llama3');
      expect(result.size).toBe(1234567890);
    });
  });

  describe('getStats', () => {
    test('должен вернуть статистику', () => {
      llm.isAvailable = true;
      llm.requestCount = 10;
      llm.errorCount = 2;

      const stats = llm.getStats();

      expect(stats.isAvailable).toBe(true);
      expect(stats.requestCount).toBe(10);
      expect(stats.errorCount).toBe(2);
      expect(stats.model).toBe('llama3');
    });
  });
}); 