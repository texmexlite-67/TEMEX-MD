# ⟁ 𝗧𝗘𝗫𝗠𝗘𝗫-𝗠𝗗 // 𝗖𝗬𝗕𝗘𝗥-𝗠𝗗 𝗡𝗘𝗫𝗨𝗦 ⟁

> **Bot Name:** `TEXMEX-MD` · **Owner:** `TEXMEX-MD` · **Repo:** [`https://github.com/texmexlite-67/TEMEX-MD.git`](https://github.com/texmexlite-67/TEMEX-MD.git)  
> ⚡ **Developed by TEXMEX with ❤️**

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/texmexlite-67/TEMEX-MD)

**TEXMEX-MD** is an all-in-one, environment-adaptive Multi-Device WhatsApp Bot engineered to run out-of-the-box on **every major cloud, container, panel, and local runtime**:

- **PaaS Clouds:** Heroku (`Procfile` + `app.json`), Render (`render.yaml`), Koyeb (`koyeb.yaml`), Railway (`railway.json`), Fly.io
- **Containers & AI Spaces:** Docker (`Dockerfile` + `docker-compose.yml`), Hugging Face Spaces (auto-detects port `7860` & non-root permissions), Coolify
- **Bot & Game Panels:** Pterodactyl, Katabump, Bot-Hosting (auto-detects `SERVER_PORT` and loads both `config.env` and `.env`)
- **VPS & Local:** Ubuntu/Debian VPS with PM2 (`ecosystem.config.cjs`), Windows/macOS/Linux, Android **Termux**

---
[![Deploy on RENDER

https://temex-md.onrender.com/



 [mins] [category]`, `.statusaudience`
   - **Stickers, ViewOnce & Status (`plugins/media.js`):** `.sticker` (`.s`), `.take`, `.toimg`, `.vv` (Unlock View-Once), `.vvdm` (Silent View-Once to DM), `.save` (Status Saver), `.getpp`
   - **Cyber Utilities (`plugins/tools.js`):** `.tr` (Translate), `.weather`, `.define`, `.wiki`, `.calc`, `.qr`, `.short`, `.github`, `.currency`, `.base64`, `.time`, `.quoted`
   - **AI, Anime & Fun (`plugins/ai_fun.js`)   


## 🚀 Quick Start (Local / VPS / Termux)

```bash
# 1. Install dependencies
npm install

# 2. Optional: configure .env (or config.env)
cp .env.example .env

# 3. Check environment health
npm run doctor

# 4. Start TEXMEX-MD
npm start
```

Open **`http://localhost:3000`** in your browser to generate an 8-digit Pairing Code, scan the QR code, or export your `TEXMEX-MD~...` `SESSION_ID`.

---

## ☁️ Deploying Across Platforms

### 1. Heroku
- Uses `Procfile` and `app.json` (includes FFmpeg + Node.js buildpacks).
- First pair locally or on the live Heroku Web URL (`https://<your-app>.herokuapp.com`), click **Export SESSION_ID** (or run `.getsession` in WhatsApp), and paste the `TEXMEX-MD~...` value into Heroku **Config Vars → `SESSION_ID`**.

### 2. Render / Koyeb / Railway
- Connect your repository — `render.yaml`, `koyeb.yaml`, and `railway.json` auto-configure the Docker runtime and `/health` endpoint.
- Set `SESSION_ID`, `OWNER_NUMBER`, and optional `DASHBOARD_KEY` in Environment Variables.
- Set `KEEP_ALIVE_URL=https://your-service-url.onrender.com` (or attach UptimeRobot to `/health`) to keep free tiers awake 24/7.

### 3. Pterodactyl / Katabump / Bot Panels
- Upload the project files to your panel server.
- Rename `config.env.example` to `config.env` in the Panel File Manager and fill in `OWNER_NUMBER` / `PAIRING_NUMBER` or `SESSION_ID`.
- Set Startup File to `index.js` (Node.js 20 image). TEXMEX-MD automatically binds `SERVER_PORT` so you can also open the Web Pairing Dashboard via your panel's allocated port!

### 4. Docker / Docker Compose / Hugging Face Spaces
```bash
docker compose up -d --build
```
Session and database files persist automatically in `./session` and `./data`. On Hugging Face Spaces (Docker SDK), TEXMEX-MD auto-detects `SPACE_ID` and listens on port `7860`.

### 5. Ubuntu / Debian VPS (PM2 24/7)
```bash
bash scripts/install-vps.sh
npm run pm2
npm run pm2:logs
```

### 6. Android Termux
```bash
bash scripts/termux-setup.sh
npm start
```

*Built with precision for **TEXMEX-MD** · Universal Multi-Device WhatsApp Bot.*
