# 🚀 Швидкий старт - Matrix AI Chatbot

Цей файл містить покрокові інструкції для швидкого запуску Matrix AI бота.

## 📋 Передумови

Переконайтеся, що у вас встановлено:
- Node.js 20+ 
- npm або yarn
- Git

## ⚡ Швидкий запуск (5 хвилин)

### 1. Клонування та встановлення
```bash
git clone https://github.com/your-username/matrix-ai-chatbot.git
cd matrix-ai-chatbot
npm install
```

### 2. Налаштування змінних середовища
```bash
cp env.example .env
```

Відредагуйте `.env` файл, заповнивши обов'язкові поля:
```bash
# Matrix налаштування (ОБОВ'ЯЗКОВО)
MATRIX_HOMESERVER_URL=https://matrix.example.com
MATRIX_USER_ID=@your_bot:example.com
MATRIX_ACCESS_TOKEN=syt_your_token_here
MATRIX_ROOM_ID=!room_id:example.com

# LLM налаштування (опціонально)
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3:8b

# Redis налаштування (опціонально)
REDIS_URL=redis://localhost:6379
```

### 3. Запуск тестів
```bash
# Базовий тест (перевіряє підключення)
npm run test:basic

# Детальний тест (перевіряє всі модулі)
npm run test:detailed
```

### 4. Запуск бота
```bash
# Режим розробки
npm run dev

# Продакшн режим
npm start
```

## 🔧 Налаштування сервісів

### Matrix Homeserver
1. Створіть користувача бота на вашому Matrix сервері
2. Отримайте access token через Element або API
3. Додайте бота в кімнату

### Ollama (для ШІ функціональності)
```bash
# Встановлення
curl -fsSL https://ollama.ai/install.sh | sh

# Запуск сервера
ollama serve

# Завантаження моделі (в новому терміналі)
ollama pull llama3:8b
```

### Redis (для кешування)
```bash
# Ubuntu/Debian
sudo apt update && sudo apt install redis-server
sudo systemctl start redis-server

# Перевірка
redis-cli ping  # Повинно відповісти PONG
```

### Google Drive (опціонально)
1. Створіть проект в Google Cloud Console
2. Увімкніть Google Drive API
3. Створіть сервісний акаунт
4. Завантажте JSON-ключ в `credentials/`
5. Поділіться папками з email сервісного акаунта

## 🐳 Docker запуск

Якщо у вас встановлений Docker:

```bash
# Запуск всіх сервісів
docker-compose up -d

# Перегляд логів
docker-compose logs -f bot

# Зупинка
docker-compose down
```

## 🎯 Доступні команди

Після запуску бота ви можете використовувати:

- `!help` - довідка по командах
- `!ask <питання>` - задати питання ШІ
- `!find <файл>` - знайти файл в Google Drive
- `!read <файл>` - прочитати файл
- `!status` - статус бота
- `!ping` - перевірити доступність

## 🔍 Діагностика проблем

### Бот не підключається до Matrix
- Перевірте правильність URL homeserver
- Переконайтеся, що access token дійсний
- Перевірте, що бот доданий в кімнату

### LLM не працює
- Перевірте, що Ollama запущений: `curl http://localhost:11434/api/tags`
- Переконайтеся, що модель завантажена: `ollama list`

### Redis помилки
- Перевірте, що Redis запущений: `redis-cli ping`
- Перевірте URL підключення в .env

### Google Drive помилки
- Перевірте правильність шляху до JSON-ключа
- Переконайтеся, що API увімкнені в Google Cloud Console
- Перевірте права доступу до папок

## 📊 Моніторинг

### Prometheus метрики
```bash
# Запуск Prometheus
docker run -d --name prometheus -p 9090:9090 prom/prometheus

# Доступ до метрик
curl http://localhost:9090/metrics
```

### Grafana дашборди
```bash
# Запуск Grafana
docker run -d --name grafana -p 3000:3000 grafana/grafana-oss

# Логін: admin, пароль: admin
```

## 🆘 Отримання допомоги

- 📖 Повна документація: [README.md](README.md)
- 🧪 Тестування: [TESTING.md](TESTING.md)
- 🔧 Покращення: [IMPROVEMENTS.md](IMPROVEMENTS.md)
- 💬 Підтримка: [@Dmitry_Shiva](https://t.me/Dmitry_Shiva)

## 🎉 Готово!

Ваш Matrix AI бот готовий до роботи! Він може:
- Відповідати на питання користувачів
- Шукати та читати документи з Google Drive
- Кешувати результати для швидкості
- Збирати метрики для моніторингу

**Приємного використання!** 🚀 