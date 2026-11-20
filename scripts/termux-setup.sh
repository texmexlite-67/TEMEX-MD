#!/usr/bin/env bash
set -euo pipefail

echo "📱 Setting up TEXMEX-MD on Android Termux..."
pkg update -y && pkg upgrade -y
pkg install -y nodejs-lts ffmpeg git

npm install --no-audit --no-fund

if [ ! -f .env ]; then
  cp .env.example .env
fi

echo "✅ Termux setup complete! Run 'npm start' and open http://127.0.0.1:3000 to pair."
