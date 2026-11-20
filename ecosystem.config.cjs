module.exports = {
  apps: [
    {
      name: 'texmex-md',
      script: 'index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '450M',
      env: {
        NODE_ENV: 'production',
        BOT_NAME: 'TEXMEX-MD',
        OWNER_NAME: 'TEXMEX-MD',
        PORT: 3000
      }
    }
  ]
};
