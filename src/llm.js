/**
 * Модуль обработки LLM (Ollama)
 * 
 * Этот модуль обеспечивает взаимодействие с Ollama LLM
 * с поддержкой повторных попыток, стриминга и расширенного мониторинга.
 */

import axios from 'axios';
import config from './config/config.js';
import { logger } from './utils/logger.js';
import { withLLMRetry, logRetryStats } from './utils/retry.js';
import { 
  recordLLMLatency, 
  recordLLMError, 
  recordLLMTokens,
  recordRetryAttempt,
  recordRetryDelay,
  recordStreamingLatency,
  recordStreamingChunks
} from './metrics.js';

export class LLMProcessor {
  constructor() {
    this.baseURL = config.ollama.baseURL;
    this.model = config.ollama.model;
    this.timeout = config.ollama.timeout;
    this.maxTokens = config.ollama.maxTokens;
    this.temperature = config.ollama.temperature;
    this.topP = config.ollama.topP;
    this.modelInfo = null;
    
    logger.info('🧠 Ініціалізація LLM процесора з підтримкою повторних спроб та стримінгу...');
    
    // Проверяем доступность при инициализации
    this.checkAvailability();
  }

  /**
   * Проверка доступности Ollama сервера
   */
  async checkAvailability() {
    try {
      logger.debug('🔍 Перевірка доступності Ollama');
      
      const response = await withLLMRetry(async () => {
        return await axios.get(`${this.baseURL}/api/tags`, {
          timeout: this.timeout
        });
      });

      if (response.status === 200) {
        this.isAvailable = true;
        logger.success('✅ Ollama сервер доступний');
        
        // Получаем информацию о моделях
        const models = response.data.models || [];
        logger.info(`📋 Доступні моделі: ${models.length}`);
        
        // Ищем нашу модель
        const targetModel = models.find(m => m.name === this.model);
        if (targetModel) {
          this.modelInfo = targetModel;
          logger.success(`✅ Модель ${this.model} знайдена`);
          logger.debug(`📊 Інформація про модель:`, targetModel);
        } else {
          logger.warn(`⚠️ Модель ${this.model} не знайдена`);
          logger.info(`💡 Для завантаження моделі виконайте: ollama pull ${this.model}`);
        }
        
        // Записываем метрики
        recordLLMLatency(0, this.model, 'availability_check');
        
      } else {
        logger.warn(`⚠️ Ollama повернув неочікуваний статус: ${response.status}`);
        this.isAvailable = false;
      }
      
    } catch (error) {
      this.isAvailable = false;
      
      if (error.code === 'ECONNREFUSED') {
        logger.error('❌ Ollama сервер недоступний: з\'єднання відхилено');
        logger.info('💡 Переконайтеся, що Ollama запущений: ollama serve');
      } else if (error.code === 'ENOTFOUND') {
        logger.error('❌ Ollama сервер не знайдено: перевірте URL сервера');
        logger.info('💡 Перевірте налаштування OLLAMA_BASE_URL');
      } else if (error.code === 'ETIMEDOUT') {
        logger.error('❌ Ollama сервер не відповідає: таймаут');
        logger.info('💡 Сервер може бути перевантажений або недоступний');
      } else {
        logger.error('❌ Помилка підключення до Ollama:', error.message);
      }
      
      // Записываем метрики ошибок
      recordLLMError(error.code || 'connection_error', this.model);
    }
  }

  /**
   * Генерация ответа с поддержкой повторных попыток и стриминга
   */
  async generateResponse(prompt, options = {}) {
    const startTime = Date.now();
    
    try {
      if (!this.isAvailable) {
        logger.warn('⚠️ Спроба генерації при недоступному Ollama сервері');
        recordLLMError('server_unavailable', this.model);
        throw new Error('Ollama сервер недоступний');
      }

      const finalOptions = {
        model: this.model,
        prompt: prompt,
        stream: options.stream || false,
        options: {
          temperature: options.temperature || this.temperature,
          top_p: options.top_p || this.topP,
          max_tokens: options.maxTokens || this.maxTokens
        }
      };

      logger.debug(`🧠 Генерація відповіді для промпту (${prompt.length} символів, стримінг: ${finalOptions.stream})`);
      
      const response = await withLLMRetry(async () => {
        const startAttempt = Date.now();
        
        try {
          const result = await axios.post(`${this.baseURL}/api/generate`, finalOptions, {
            timeout: this.timeout,
            headers: {
              'Content-Type': 'application/json'
            }
          });
          
          // Записываем метрики повторных попыток
          const attemptTime = (Date.now() - startAttempt) / 1000;
          recordRetryDelay(attemptTime, 'llm');
          
          return result;
        } catch (error) {
          // Записываем метрики ошибок
          recordRetryAttempt('llm', 'generate', 'failed');
          throw error;
        }
      }, {
        maxAttempts: 2,
        baseDelay: 3000,
        retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNABORTED']
      });

      // Записываем метрики успешных попыток
      recordRetryAttempt('llm', 'generate', 'success');

      if (!response.data || !response.data.response) {
        logger.error('❌ Ollama не повернув відповідь в полі response');
        logger.debug('🔍 Повна відповідь від Ollama:', response.data);
        recordLLMError('invalid_response', this.model);
        throw new Error('Невірна відповідь від Ollama');
      }

      const responseText = response.data.response;
      const duration = (Date.now() - startTime) / 1000;
      
      // Записываем метрики
      recordLLMLatency(duration, this.model, 'generate');
      
      // Подсчитываем токены (приблизительно)
      const inputTokens = Math.ceil(prompt.length / 4);
      const outputTokens = Math.ceil(responseText.length / 4);
      recordLLMTokens(inputTokens, this.model, 'input');
      recordLLMTokens(outputTokens, this.model, 'output');
      
      logger.success(`✅ Отримано відповідь від Ollama (${duration.toFixed(2)}s, ${outputTokens} токенів)`);
      
      return {
        response: responseText,
        duration: duration,
        tokens: {
          input: inputTokens,
          output: outputTokens,
          total: inputTokens + outputTokens
        },
        model: this.model
      };

    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      
      if (error.code === 'ECONNRESET') {
        logger.error('❌ З\'єднання з Ollama відхилено');
        recordLLMError('connection_reset', this.model);
      } else if (error.code === 'ENOTFOUND') {
        logger.error('❌ Ollama сервер не знайдено');
        recordLLMError('server_not_found', this.model);
      } else if (error.code === 'ETIMEDOUT') {
        logger.error('❌ Таймаут при зверненні до Ollama');
        recordLLMError('timeout', this.model);
      } else {
        logger.error('❌ Помилка при генерації відповіді:', error.message);
        recordLLMError('generation_error', this.model);
      }
      
      throw error;
    }
  }

  /**
   * Генерация стримингового ответа с поддержкой callback
   */
  async generateStreamingResponse(prompt, onChunk, options = {}) {
    const startTime = Date.now();
    let totalTokens = 0;
    let chunkCount = 0;
    
    try {
      if (!this.isAvailable) {
        logger.warn('⚠️ Спроба стримінгової генерації при недоступному Ollama сервері');
        recordLLMError('server_unavailable', this.model);
        throw new Error('Ollama сервер недоступний');
      }

      const finalOptions = {
        model: this.model,
        prompt: prompt,
        stream: true,
        options: {
          temperature: options.temperature || this.temperature,
          top_p: options.top_p || this.topP,
          max_tokens: options.maxTokens || this.maxTokens
        }
      };

      logger.debug(`🌊 Початок стримінгової генерації для промпту (${prompt.length} символів)`);
      
      const response = await withLLMRetry(async () => {
        return await axios.post(`${this.baseURL}/api/generate`, finalOptions, {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json'
          },
          responseType: 'stream'
        });
      }, {
        maxAttempts: 2,
        baseDelay: 3000,
        retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNABORTED']
      });

      let fullResponse = '';
      let isDone = false;

      return new Promise((resolve, reject) => {
        response.data.on('data', (chunk) => {
          try {
            const lines = chunk.toString().split('\n').filter(line => line.trim());
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                
                if (data === '[DONE]') {
                  isDone = true;
                  break;
                }
                
                try {
                  const parsed = JSON.parse(data);
                  
                  if (parsed.response) {
                    fullResponse += parsed.response;
                    chunkCount++;
                    totalTokens += parsed.response.length / 4;
                    
                    // Вызываем callback с новым чанком
                    if (onChunk && typeof onChunk === 'function') {
                      onChunk(parsed.response, {
                        done: false,
                        chunkCount: chunkCount,
                        totalTokens: totalTokens,
                        fullResponse: fullResponse
                      });
                    }
                  }
                  
                  if (parsed.done) {
                    isDone = true;
                    break;
                  }
                } catch (parseError) {
                  logger.warn('⚠️ Помилка парсингу JSON чанку:', parseError.message);
                }
              }
            }
          } catch (error) {
            logger.error('❌ Помилка обробки стримінгового чанку:', error.message);
            reject(error);
          }
        });

        response.data.on('end', () => {
          const duration = (Date.now() - startTime) / 1000;
          
          // Записываем метрики стриминга
          recordStreamingLatency(duration, this.model);
          recordStreamingChunks(chunkCount, this.model);
          recordLLMLatency(duration, this.model, 'streaming');
          
          logger.success(`✅ Стримінгове відповідь завершено (${duration.toFixed(2)}s, ${chunkCount} чанків, ${Math.round(totalTokens)} токенів)`);
          
          // Вызываем финальный callback
          if (onChunk && typeof onChunk === 'function') {
            onChunk('', {
              done: true,
              chunkCount: chunkCount,
              totalTokens: totalTokens,
              fullResponse: fullResponse
            });
          }
          
          resolve({
            response: fullResponse,
            duration: duration,
            tokens: {
              input: Math.ceil(prompt.length / 4),
              output: Math.round(totalTokens),
              total: Math.ceil(prompt.length / 4) + Math.round(totalTokens)
            },
            chunks: chunkCount,
            model: this.model
          });
        });

        response.data.on('error', (error) => {
          logger.error('❌ Помилка стримінгового з\'єднання:', error.message);
          recordLLMError('streaming_error', this.model);
          reject(error);
        });
      });

    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      
      logger.error('❌ Помилка при стримінговій генерації:', error.message);
      recordLLMError('streaming_generation_error', this.model);
      throw error;
    }
  }

  /**
   * Генерация ответа с контекстом из Google Drive
   */
  async generateResponseWithContext(prompt, context, options = {}) {
    try {
      const enhancedPrompt = `Контекст: ${context}\n\nПитання: ${prompt}\n\nВідповідь:`;
      return await this.generateResponse(enhancedPrompt, options);
    } catch (error) {
      logger.error('❌ Помилка при генерації відповіді з контекстом:', error.message);
      recordLLMError('context_generation_error', this.model);
      throw error;
    }
  }

  /**
   * Получение информации о модели
   */
  async getModelInfo() {
    try {
      if (!this.isAvailable) {
        throw new Error('Ollama сервер недоступний');
      }

      const response = await withLLMRetry(async () => {
        return await axios.post(`${this.baseURL}/api/show`, {
          name: this.model
        }, {
          timeout: this.timeout
        });
      });

      if (response.data) {
        this.modelInfo = response.data;
        return response.data;
      } else {
        throw new Error('Не вдалося отримати інформацію про модель');
      }
      
    } catch (error) {
      logger.error('❌ Помилка отримання інформації про модель:', error.message);
      throw error;
    }
  }

  /**
   * Тестовое подключение к LLM
   */
  async testConnection() {
    try {
      const result = await this.generateResponse('Скажи "Привіт" українською мовою.', { 
        temperature: 0.1, 
        maxTokens: 50 
      });
      
      return {
        success: true,
        response: result.response,
        duration: result.duration,
        tokens: result.tokens
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Получение статистики использования
   */
  getStats() {
    return {
      model: this.model,
      isAvailable: this.isAvailable,
      baseURL: this.baseURL,
      timeout: this.timeout,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      topP: this.topP
    };
  }
}

// Создаем экземпляр процессора LLM
export const llmProcessor = new LLMProcessor(); 