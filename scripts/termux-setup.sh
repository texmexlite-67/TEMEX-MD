#!/usr/bin/env bash
set -euo pipefail

echo "📱 Setting up TEXMEX-MD v2.0.0 on Android Termux..."
pkg update -y && pkg upgrade -y
pkg install -y nodejs-lts ffmpeg git libwebp cloudflared || pkg install -y nodejs-lts ffmpeg git

# Prevent native optional builds from breaking on Android ARM64 while keeping system ffmpeg active
npm install --no-audit --no-fund

if [ ! -f .env ]; then
  cp .env.example .env
fi

if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock || true
fi

echo ""
echo "✅ TEXMEX-MD Termux setup complete!"
echo "▶️ Start the bot & 3D Studio Hub:  npm start"
echo "🌐 Open in your phone browser:    http://127.0.0.1:3000"
