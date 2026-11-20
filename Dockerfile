# Universal Multi-Platform Dockerfile for TEXMEX-MD
# Compatible with Docker, Koyeb, Render, Railway, Heroku Container, Coolify, Fly.io & Hugging Face Spaces
FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    BOT_NAME=TEXMEX-MD \
    OWNER_NAME=TEXMEX-MD

# Install FFmpeg (for animated video stickers) and CA certificates
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package manifest first for Docker layer caching
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy bot source code
COPY . .

# Create writable session & data dirs with permissions compatible with non-root runtimes (e.g. Hugging Face UID 1000)
RUN mkdir -p /app/session /app/data && chmod -R 777 /app/session /app/data

EXPOSE 3000 7860

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "const p = process.env.PORT || process.env.SERVER_PORT || (process.env.SPACE_ID ? 7860 : 3000); fetch('http://127.0.0.1:' + p + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "index.js"]
