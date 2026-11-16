FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
FROM deps AS builder
COPY . .
RUN npm run build
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates openssl && rm -rf /var/lib/apt/lists/*
COPY --from=builder --chown=node:node /app ./
RUN mkdir -p /app/data/storage /app/data/render && chown -R node:node /app/data
USER node
EXPOSE 3000 3001
CMD ["npm", "start"]
