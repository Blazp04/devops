// ecosystem.config.js – Node.js s PM2: proces po jezgri, a ne radnik po zahtjevu
module.exports = {
  apps: [
    {
      name: 'klopa-api-node',
      script: './server.js',
      exec_mode: 'cluster',
      instances: 'max', // jedan proces po procesorskoj jezgri (ovdje 2)
    },
  ],
}
