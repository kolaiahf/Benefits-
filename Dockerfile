FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:web

ENV NODE_ENV=production
ENV PORT=8787
ENV HOST=0.0.0.0
EXPOSE 8787

# APP_SECRET and SEED_BROKER_PASSWORD are required when NODE_ENV=production.
CMD ["npx", "tsx", "src/server.ts"]
