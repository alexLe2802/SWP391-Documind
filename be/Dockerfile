FROM node:24.18.0-alpine AS build
WORKDIR /app
COPY package*.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund \
    --fetch-retries=5 \
    --fetch-retry-factor=2 \
    --fetch-retry-mintimeout=10000 \
    --fetch-retry-maxtimeout=60000
COPY nest-cli.json tsconfig*.json ./
COPY scripts ./scripts
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:24.18.0-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache \
    font-noto \
    font-noto-cjk \
    font-noto-extra \
    fontconfig \
    libreoffice \
    ttf-dejavu \
    ttf-liberation \
  && fc-cache -f
RUN /usr/bin/soffice --headless --version
COPY package*.json prisma.config.ts ./
COPY prisma ./prisma
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
