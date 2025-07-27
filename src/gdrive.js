/**
 * Модуль обработки Google Drive
 * 
 * Этот модуль обеспечивает взаимодействие с Google Drive API
 * с поддержкой расширенной обработки файлов и повторных попыток.
 */

import { google } from 'googleapis';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';
import * as XLSX from 'xlsx';
import config from './config/config.js';
import { logger } from './utils/logger.js';
import { withDriveRetry } from './utils/retry.js';
import { 
  recordDriveRequest, 
  recordDriveError, 
  recordFileProcessingTime 
} from './metrics.js';

export class GoogleDriveHandler {
  constructor() {
    this.drive = null;
    this.docs = null;
    this.sheets = null;
    this.isConfigured = false;
    this.serviceAccountEmail = null;
    
    logger.info('📁 Ініціалізація Google Drive обробника з розширеною підтримкою файлів...');
    
    // Инициализируем подключение
    this.initialize();
  }

  /**
   * Инициализация Google Drive API
   */
  async initialize() {
    try {
      const credentialsPath = config.google.credentialsPath;
      
      if (!credentialsPath) {
        logger.warn('⚠️ Шлях до облікових даних Google Drive не вказаний');
        return;
      }

      if (!fs.existsSync(credentialsPath)) {
        logger.error('❌ Файл з обліковими даними не знайдено');
        return;
      }

      logger.debug(`📄 Використовуємо файл облікових даних: ${credentialsPath}`);
      
      const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      this.serviceAccountEmail = credentials.client_email;

      logger.debug('🔐 Налаштування аутентифікації Google Drive');
      
      const auth = new google.auth.GoogleAuth({
        keyFile: credentialsPath,
        scopes: [
          'https://www.googleapis.com/auth/drive.readonly',
          'https://www.googleapis.com/auth/documents.readonly',
          'https://www.googleapis.com/auth/spreadsheets.readonly'
        ]
      });

      logger.success('✅ Аутентифікація Google створена');

      // Создаем клиенты для разных API
      this.drive = google.drive({ version: 'v3', auth });
      this.docs = google.docs({ version: 'v1', auth });
      this.sheets = google.sheets({ version: 'v4', auth });

      logger.success('✅ Google API клієнти створені');

      // Проверяем подключение
      await this.testConnection();
      
      this.isConfigured = true;
      logger.success('✅ Google Drive успішно налаштований');

    } catch (error) {
      logger.error('❌ Помилка ініціалізації Google Drive:', error.message);
      
      if (error.code === 'ENOENT') {
        logger.error('❌ Файл облікових даних не знайдено');
        logger.info('💡 Перевірте шлях GOOGLE_CREDENTIALS_PATH');
      } else if (error.code === 'EACCES') {
        logger.error('❌ Немає доступу до файлу облікових даних');
        logger.info('💡 Перевірте права доступу до файлу');
      } else if (error.message.includes('invalid_grant')) {
        logger.error('❌ Недійсні облікові дані Google');
        logger.info('�� Перевірте правильність JSON-ключа');
      } else if (error.message.includes('invalid_client')) {
        logger.error('❌ Недійсний клієнт Google');
        logger.info('💡 Перевірте налаштування проекту в Google Cloud Console');
      } else {
        logger.debug('🔍 Деталі помилки:', error);
      }
      
      recordDriveError('initialization_error', 'initialize');
    }
  }

  /**
   * Тестирование подключения к Google Drive
   */
  async testConnection() {
    try {
      logger.debug('🔍 Перевірка підключення до Google Drive');
      
      const response = await withDriveRetry(async () => {
        return await this.drive.about.get({
          fields: 'user,storageQuota'
        });
      });

      if (response.data.user) {
        logger.success(`✅ Підключено до Google Drive як: ${response.data.user.emailAddress}`);
        recordDriveRequest('connection_test', 'success');
        
        if (response.data.storageQuota) {
          const quota = response.data.storageQuota;
          const usedGB = Math.round((quota.usage || 0) / 1024 / 1024 / 1024 * 100) / 100;
          const totalGB = Math.round((quota.limit || 0) / 1024 / 1024 / 1024 * 100) / 100;
          logger.info(`💾 Використання: ${usedGB}GB / ${totalGB}GB`);
        }
      }
      
    } catch (error) {
      logger.error('❌ Помилка перевірки підключення до Google Drive:', error.message);
      recordDriveError('connection_test_error', 'test_connection');
      throw error;
    }
  }

  /**
   * Поиск файлов в Google Drive
   */
  async findFiles(query, maxResults = 10) {
    const startTime = Date.now();
    
    try {
      if (!this.isConfigured) {
        throw new Error('Google Drive не налаштований');
      }

      logger.debug(`🔍 Пошук файлів: "${query}"`);
      
      const response = await withDriveRetry(async () => {
        return await this.drive.files.list({
          q: `name contains '${query}' and trashed = false`,
          fields: 'files(id,name,mimeType,size,modifiedTime,parents)',
          pageSize: maxResults,
          orderBy: 'modifiedTime desc'
        });
      });

      const files = response.data.files || [];
      const duration = (Date.now() - startTime) / 1000;
      
      logger.info(`📁 Знайдено файлів: ${files.length} (${duration.toFixed(2)}s)`);
      recordDriveRequest('file_search', 'success');
      recordFileProcessingTime(duration, 'search');
      
      return files;
      
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      logger.error('❌ Помилка пошуку файлів:', error.message);
      recordDriveError('search_error', 'find_files');
      recordFileProcessingTime(duration, 'search_error');
      throw error;
    }
  }

  /**
   * Чтение файла по ID
   */
  async readFile(fileId, fileIndex = 0) {
    const startTime = Date.now();
    
    try {
      if (!this.isConfigured) {
        throw new Error('Google Drive не налаштований');
      }

      logger.debug(`📖 Читання файлу: ${fileId}`);
      
      // Получаем информацию о файле
      const fileInfo = await withDriveRetry(async () => {
        return await this.drive.files.get({
          fileId: fileId,
          fields: 'id,name,mimeType,size,modifiedTime'
        });
      });

      const file = fileInfo.data;
      logger.info(`📄 Обробка файлу: ${file.name} (${file.mimeType})`);
      
      let content = '';
      const fileType = this.getFileType(file.mimeType);
      
      // Обрабатываем файл в зависимости от типа
      switch (fileType) {
        case 'google_doc':
          content = await this.readGoogleDoc(fileId);
          break;
        case 'google_sheet':
          content = await this.readGoogleSheet(fileId);
          break;
        case 'pdf':
          content = await this.readPdfFile(fileId);
          break;
        case 'excel':
        case 'word':
          content = await this.readOfficeFile(fileId, fileType);
          break;
        default:
          throw new Error(`Непідтримуваний тип файлу: ${file.mimeType}`);
      }

      const duration = (Date.now() - startTime) / 1000;
      logger.success(`✅ Файл прочитано: ${file.name} (${duration.toFixed(2)}s, ${content.length} символів)`);
      
      recordDriveRequest('file_read', 'success', fileType);
      recordFileProcessingTime(duration, fileType);
      
      return {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        content: content,
        size: file.size,
        modifiedTime: file.modifiedTime,
        processingTime: duration,
        characterCount: content.length
      };
      
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      logger.error('❌ Помилка читання файлу:', error.message);
      recordDriveError('read_error', 'read_file');
      recordFileProcessingTime(duration, 'read_error');
      throw error;
    }
  }

  /**
   * Чтение Google Doc
   */
  async readGoogleDoc(fileId) {
    try {
      logger.debug('📝 Читання Google Doc');
      
      const response = await withDriveRetry(async () => {
        return await this.docs.documents.get({
          documentId: fileId
        });
      });

      const document = response.data;
      let content = '';
      
      // Извлекаем текст из документа
      if (document.body && document.body.content) {
        content = this.extractTextFromDocContent(document.body.content);
      }
      
      logger.debug(`📄 Google Doc розпарсено: ${content.length} символів`);
      return content;
      
    } catch (error) {
      logger.error('❌ Помилка читання Google Doc:', error.message);
      recordDriveError('google_doc_error', 'read_google_doc');
      throw error;
    }
  }

  /**
   * Чтение Google Sheet
   */
  async readGoogleSheet(fileId, range = 'A1:Z1000') {
    try {
      logger.debug(`📊 Читання Google Sheet з діапазоном: ${range}`);
      
      const response = await withDriveRetry(async () => {
        return await this.sheets.spreadsheets.values.get({
          spreadsheetId: fileId,
          range: range
        });
      });

      const values = response.data.values || [];
      let content = '';
      
      // Преобразуем данные в читаемый формат
      for (let i = 0; i < values.length; i++) {
        const row = values[i];
        content += `Рядок ${i + 1}: ${row.join(' | ')}\n`;
      }
      
      logger.debug(`📊 Google Sheet прочитано: ${values.length} рядків`);
      return content;
      
    } catch (error) {
      logger.error('❌ Помилка читання Google Sheet:', error.message);
      recordDriveError('google_sheet_error', 'read_google_sheet');
      throw error;
    }
  }

  /**
   * Чтение PDF файла
   */
  async readPdfFile(fileId) {
    try {
      logger.debug('📄 Завантаження PDF файлу');
      
      const response = await withDriveRetry(async () => {
        return await this.drive.files.get({
          fileId: fileId,
          alt: 'media',
          responseType: 'arraybuffer'
        });
      });

      const buffer = Buffer.from(response.data);
      logger.debug('✅ PDF файл завантажено');
      
      logger.debug('🔍 Парсинг PDF файлу...');
      const data = await pdf(buffer);
      
      logger.debug(`📄 PDF розпарсено: ${data.text.length} символів, ${data.numpages} сторінок`);
      
      return `PDF документ (${data.numpages} сторінок):\n\n${data.text}`;
      
    } catch (error) {
      logger.error('❌ Помилка читання PDF файлу:', error.message);
      
      if (error.message.includes('Invalid PDF')) {
        recordDriveError('pdf_parse_error', 'read_pdf');
        return '[PDF файл - помилка при читанні вмісту]';
      } else {
        recordDriveError('pdf_download_error', 'read_pdf');
        throw error;
      }
    }
  }

  /**
   * Чтение Office файлов (Excel, Word)
   */
  async readOfficeFile(fileId, fileType) {
    try {
      logger.debug(`📄 Завантаження Office файлу (${fileType})`);
      
      const response = await withDriveRetry(async () => {
        return await this.drive.files.get({
          fileId: fileId,
          alt: 'media',
          responseType: 'arraybuffer'
        });
      });

      const buffer = Buffer.from(response.data);
      logger.debug('✅ Office файл завантажено');
      
      if (fileType === 'excel') {
        return await this.parseExcelFile(buffer);
      } else if (fileType === 'word') {
        return await this.parseWordFile(buffer);
      } else {
        throw new Error(`Непідтримуваний тип Office файлу: ${fileType}`);
      }
      
    } catch (error) {
      logger.error('❌ Помилка читання Office файлу:', error.message);
      recordDriveError('office_read_error', 'read_office');
      throw error;
    }
  }

  /**
   * Парсинг Excel файла
   */
  async parseExcelFile(buffer) {
    try {
      logger.debug('📊 Парсинг Excel файлу...');
      
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetNames = workbook.SheetNames;
      
      let content = `Excel файл містить ${sheetNames.length} аркушів:\n\n`;
      
      for (let i = 0; i < sheetNames.length; i++) {
        const sheetName = sheetNames[i];
        const worksheet = workbook.Sheets[sheetName];
        const csvText = XLSX.utils.sheet_to_csv(worksheet);
        
        content += `Аркуш "${sheetName}":\n${csvText}\n\n`;
      }
      
      logger.debug(`📊 Excel документ розпарсено: ${sheetNames.length} аркушів`);
      return content;
      
    } catch (error) {
      logger.error('❌ Помилка парсингу Excel файлу:', error.message);
      recordDriveError('excel_parse_error', 'parse_excel');
      return '[Excel файл - помилка при читанні вмісту]';
    }
  }

  /**
   * Парсинг Word файла (упрощенная версия)
   */
  async parseWordFile(buffer) {
    try {
      logger.debug('📝 Парсинг Word файлу...');
      
      // Упрощенная обработка Word файлов
      // В реальном проекте можно использовать библиотеку mammoth
      const content = '[Содержимое Word файла не может быть извлечено]';
      
      logger.debug('📝 Word файл оброблено (спрощена версія)');
      return content;
      
    } catch (error) {
      logger.error('❌ Помилка парсингу Word файлу:', error.message);
      recordDriveError('word_parse_error', 'parse_word');
      return '[Word файл - помилка при читанні вмісту]';
    }
  }

  /**
   * Извлечение текста из содержимого Google Doc
   */
  extractTextFromDocContent(content) {
    let text = '';
    
    for (const element of content) {
      if (element.paragraph) {
        for (const paragraphElement of element.paragraph.elements) {
          if (paragraphElement.textRun) {
            text += paragraphElement.textRun.content;
          }
        }
        text += '\n';
      }
    }
    
    return text.trim();
  }

  /**
   * Определение типа файла по MIME типу
   */
  getFileType(mimeType) {
    if (mimeType === 'application/vnd.google-apps.document') {
      return 'google_doc';
    } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      return 'google_sheet';
    } else if (mimeType === 'application/pdf') {
      return 'pdf';
    } else if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
      return 'excel';
    } else if (mimeType.includes('word') || mimeType.includes('document')) {
      return 'word';
    } else {
      return 'unknown';
    }
  }

  /**
   * Проверка настройки
   */
  isConfigured() {
    return this.isConfigured;
  }

  /**
   * Получение информации о подключении
   */
  getConnectionInfo() {
    return {
      configured: this.isConfigured,
      serviceAccount: this.serviceAccountEmail,
      apis: {
        drive: !!this.drive,
        docs: !!this.docs,
        sheets: !!this.sheets
      }
    };
  }

  /**
   * Получение статистики
   */
  getStats() {
    return {
      configured: this.isConfigured,
      serviceAccount: this.serviceAccountEmail,
      supportedFormats: ['google_doc', 'google_sheet', 'pdf', 'excel', 'word']
    };
  }
}

// Создаем экземпляр обработчика Google Drive
export const googleDriveHandler = new GoogleDriveHandler(); 