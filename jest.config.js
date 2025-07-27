export default {
  // Тестова середовище
  testEnvironment: 'node',
  
  // Розширення файлів для тестів
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],
  
  // Виключення
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/'
  ],
  
  // Збір покриття коду
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/*.spec.js'
  ],
  
  // Покриття коду
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  
  // Пороги покриття
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  
  // Таймаути
  testTimeout: 10000,
  
  // Налаштування для ES модулів
  extensionsToTreatAsEsm: ['.js'],
  globals: {
    'ts-jest': {
      useESM: true
    }
  },
  
  // Трансформації
  transform: {},
  
  // Моки
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  
  // Змінні середовища для тестів
  setupFiles: ['<rootDir>/tests/env.js']
}; 