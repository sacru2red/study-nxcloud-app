# Monolithic production image: backend (NestJS) + static frontend (nginx)
# Build from repository root: docker build -f infra/docker/Dockerfile .

FROM node:24-bookworm AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npx ts-patch install
RUN npx prisma generate --schema=prisma/schema.prisma
RUN npx nx build backend
RUN npx nx build frontend
RUN cd dist/apps/backend && npm ci --omit=dev

# --- Backend runtime ---
FROM node:24-bookworm-slim AS backend

RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY infra/docker/entrypoint-backend.sh /entrypoint-backend.sh

RUN chmod +x /entrypoint-backend.sh

ENV NODE_ENV=production
WORKDIR /workspace/dist/apps/backend

EXPOSE 3000

ENTRYPOINT ["/entrypoint-backend.sh"]
CMD ["node", "main.js"]

# --- Nginx (frontend + API reverse proxy) ---
FROM nginx:1.27-alpine AS web

COPY --from=builder /app/dist/apps/frontend /usr/share/nginx/html
COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
