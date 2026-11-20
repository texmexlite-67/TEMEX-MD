#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Installing TEXMEX-MD dependencies for Ubuntu/Debian VPS..."

if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 20 ]; then
  echo "📦 Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "🎬 Installing FFmpeg & Git..."
sudo apt-get update -y
sudo apt-get install -y ffmpeg git

echo "📦 Installing npm packages & PM2..."
npm install --no-audit --no-fund
sudo npm install -g pm2

if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ Created .env from .env.example"
fi

echo "✅ Setup complete! Start TEXMEX-MD 24/7 with: npm run pm2"
