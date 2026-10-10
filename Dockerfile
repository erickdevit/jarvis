FROM node:20-slim AS base
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build Vite frontend assets
RUN npm run build

EXPOSE 5173 8787

# Default command runs both bridge backend and preview/dev server via start script
CMD ["npm", "start"]
