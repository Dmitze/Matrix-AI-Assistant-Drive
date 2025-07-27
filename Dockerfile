# Dockerfile для Matrix AI Assistant Drive
FROM node:18-alpine

# Встановлюємо робочу директорію
WORKDIR /app

# Копіюємо файли залежностей
COPY package*.json ./

# Встановлюємо залежності
RUN npm ci --only=production

# Копіюємо вихідний код
COPY src/ ./src/
COPY test-*.js ./
COPY .env.example ./

# Створюємо користувача для безпеки
RUN addgroup -g 1001 -S nodejs
RUN adduser -S bot -u 1001

# Створюємо необхідні директорії
RUN mkdir -p /app/credentials /app/logs
RUN chown -R bot:nodejs /app

# Переключаємося на користувача bot
USER bot

# Відкриваємо порти
EXPOSE 9090

# Змінні середовища
ENV NODE_ENV=production
ENV METRICS_PORT=9090

# Команда запуску
CMD ["npm", "start"] 