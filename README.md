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

## ✨ Key Capabilities

1. **4-Way Authentication & Portable Sessions**
   - **Web Pairing Dashboard (`/`):** Generate an 8-character WhatsApp Phone Pairing Code (including branded `TEXM-EXMD` code!), scan live auto-refreshing QR codes, toggle bot settings, view live logs, and export/import `TEXMEX-MD~...` sessions directly in your browser.
   - **Portable `SESSION_ID` (`TEXMEX-MD~...`):** Compressed gzip+base64 credential string so stateless hosts (Heroku, Render, Koyeb, Railway) restore your session instantly on every restart.
   - **Headless ENV Pairing (`PAIRING_NUMBER`):** Set `PAIRING_NUMBER=2547XXXXXXXX` in env vars to print your 8-digit pairing code directly in server logs.
   - **Terminal QR:** Compact UTF-8 QR code rendered in console logs.
2. **Adaptive Runtime Engine (`lib/env.js`)**
   - Automatically resolves `PORT` → `SERVER_PORT` → `7860` (HuggingFace) → `3000`.
   - Automatically falls back to writable temp storage on read-only container root filesystems.
   - Hybrid Sticker Engine: uses fast prebuilt **Sharp** binaries first and seamlessly falls back to **FFmpeg**, stamping `Pack: TEXMEX-MD | Author: TEXMEX-MD` EXIF metadata via pure-JS `node-webpmux`.
   - Full Baileys v7 **LID (`@lid`) + Phone Number (`@s.whatsapp.net`)** compatibility in groups and DMs.
3. **157 Built-In Commands (308 Aliases) Across 10 Modular Plugins + 3D BAZE WebGL Hub**
   - **Core, Bio & Public Tunnel (`plugins/core.js`):** `.menu` (Sci-Fi Nexus + Anime AI DP), `.alive`, `.botdp`, `.ping`, `.runtime`, `.owner`, `.repo`, `.sysinfo`, `.web`, `.ports`, `.tunnel` / `.publicurl` / `.shareweb` (Official Cloudflare All-Devices HTTPS URL)
   - **AI Neural Voice & Audio Status Studio (`plugins/voice.js`):** `.tts` / `.say` / `.speak`, `.bibleaudio`, `.prayeraudio`, `.motivateaudio`, `.quoteaudio`, `.psychaudio`, `.voiceai`, `.pushvoice` (Voice Note directly to WhatsApp Status), `.setvoice` (Andrew, Aria, Kenyan Chilemba/Asilia, British Ryan, Swahili Rafiki), `.autovoice <on|off>`
   - **Downloader Hub (`plugins/downloader.js`):** `.ytmp4` / `.youtube` (YouTube Video Downloader), `.ytmp3` / `.play` (YouTube Audio), `.instagram` / `.ig`, `.facebook` / `.fb`, `.tiktok` / `.tt` (No-Watermark HD), `.mediafire` / `.mf`, `.img` (High-Res Image Downloader), `.video` / `.videod` (Universal Video Downloader)
   - **Group Controller (`plugins/group.js`):** `.gclink`, `.tag`, `.tagall`, `.hidetag`, `.adminstag`, `.chatmute` (`.chat mute`), `.chatunmute` (`.chat unmute`), `.pin`, `.unpin`, `.kick` (`.kickmember`), `.add` (`.addmember`), `.invitemember`, `.gstatusmention` (Group Status Mention), `.gprofile`, `.gabout`, `.antilink`, `.antilinkwarn`, `.antispam`, `.antistatusmention`, `.antibadword`, `.addword`, `.delword`, `.welcome`, `.goodbye`, `.setwelcome`, `.setgoodbye`, `.warn`, `.resetwarn`, `.warnings`, `.revoke`, `.ginfo`, `.setgname`, `.gsettings`, `.approveall`, `.poll`
   - **Mind, Spirit, Bible & 10 Specialized Prayers (`plugins/mind_spirit.js`):** `.motivate`, `.quote`, `.psychology`, `.affirm`, `.advice`, `.bible` (live Scripture lookup), `.spiritual`, `.prayer`, `.morningprayer`, `.nightprayer`, `.fastingprayer`, `.warfareprayer`, `.healingprayer`, `.breakthroughprayer`, `.protectionprayer`, `.examprayer`, `.familyprayer`, `.thanksgivingprayer`, `.prayerlist`
   - **Push to Status Hub (`plugins/status.js`):** `.pushstatus` (`.tostatus`, `.poststatus`, `.upstatus`, `.push to status` — push any replied image/video/audio/text or generated category to WhatsApp Status), `.pushbible`, `.pushprayer`, `.pushmotivate`, `.pushpsych`, `.pushquote`, `.autostatuspush <on|off> [mins] [category]`, `.statusaudience`
   - **Stickers, ViewOnce & Status (`plugins/media.js`):** `.sticker` (`.s`), `.take`, `.toimg`, `.vv` (Unlock View-Once), `.vvdm` (Silent View-Once to DM), `.save` (Status Saver), `.getpp`
   - **Cyber Utilities (`plugins/tools.js`):** `.tr` (Translate), `.weather`, `.define`, `.wiki`, `.calc`, `.qr`, `.short`, `.github`, `.currency`, `.base64`, `.time`, `.quoted`
   - **AI, Anime & Fun (`plugins/ai_fun.js`):** `.ai` / `.gpt` / `.texmex` (with rolling conversation memory), `.aiclear`, `.chatbot <off|dm|group|all>`, `.summarize`, `.explain`, `.code`, `.imagine` / `.aiimg`, `.animeai` / `.animedp`, `.waifu`, `.neko`, `.fancy`, `.joke`, `.fact`, `.truth`, `.dare`, `.8ball`, `.flip`, `.roll`
   - **Owner Matrix, Force-Extended Bold Bio & CD (`plugins/owner.js`):** `.setbio`, `.syncbio`, `.resetbio`, `.autobiolink`, `.cd` (Command Cooldown & Deploy Guide), `.anticall <on|off|reject|block>`, `.setbotdp`, `.fullpp`, `.delbotpp`, `.menuimage`, `.mode <public|private>`, `.setprefix`, `.multiprefix`, `.autostatus`, `.autoreactstatus`, `.antidelete <off|chat|dm>`, `.autoread`, `.autotyping`, `.autorecording`, `.addsudo`, `.delsudo`, `.listsudo`, `.block`, `.unblock`, `.join`, `.leave`, `.getsession`, `.reload`, `.restart`
4. **Automated GitHub Actions CI/CD (`.github/workflows/ci-cd.yml`)**
   - Automatically runs `npm run doctor` & `npm test`, builds and pushes multi-platform container images (`ghcr.io/texmexlite-67/temex-md:latest`), and triggers optional cloud deploy webhooks (`DEPLOY_WEBHOOK_URL`) on every push to `main`.

---

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

---

## ⚙️ Environment Variables Reference

| Variable | Default | Description |
|---|---|---|
| `BOT_NAME` | `TEXMEX-MD` | Bot display name across menus, stickers & dashboard |
| `OWNER_NAME` | `TEXMEX-MD` | Owner display name in menus & VCard |
| `OWNER_NUMBER` | *(empty)* | Owner WhatsApp number (digits only, e.g. `254712345678`) |
| `SUDO_NUMBERS` | *(empty)* | Comma-separated extra admin numbers |
| `PREFIX` | `.` | Primary command prefix |
| `MULTI_PREFIX` | `false` | Accept `.` `!` `/` `#` `$` `-` simultaneously |
| `MODE` | `public` | `public` (everyone) or `private` (owner & sudo only) |
| `SESSION_ID` | *(empty)* | Portable `TEXMEX-MD~...` credential string |
| `PAIRING_NUMBER` | *(empty)* | Phone number for automatic console pairing code on startup |
| `USE_CUSTOM_PAIRING_CODE` | `false` | Request branded `TEXM-EXMD` 8-char pairing code |
| `ANTI_DELETE` | `dm` | Recover deleted messages: `dm`, `chat`, or `off` |
| `AUTO_STATUS_VIEW` | `true` | Auto-view contacts' WhatsApp Status broadcasts |
| `AUTO_STATUS_REACT` | `false` | Auto-react to WhatsApp Statuses with `STATUS_REACT_EMOJI` |
| `ANTI_CALL` | `off` | Incoming call handling: `off`, `reject`, or `block` |
| `DASHBOARD_KEY` | *(empty)* | Optional password locking sensitive Web Dashboard actions |
| `OPENAI_API_KEY` / `GROQ_API_KEY` / `GEMINI_API_KEY` | *(empty)* | Optional AI keys (falls back to built-in zero-key AI if unset) |

---

*Built with precision for **TEXMEX-MD** · Universal Multi-Device WhatsApp Bot.*
