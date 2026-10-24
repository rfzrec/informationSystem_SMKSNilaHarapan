const { createApp } = require('./app');
const env = require('./config/env');
const { pool } = require('./config/db');
const { startJobs } = require('./jobs/scheduler');

async function waitForDatabase(retries = 30) {
  for (let i = 1; i <= retries; i += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      console.log(`[startup] menunggu database (${i}/${retries}): ${err.code || err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('Database tidak dapat dihubungi');
}

(async () => {
  await waitForDatabase();
  const app = createApp();
  const server = app.listen(env.port, '0.0.0.0', () => console.log(`[startup] Sistem Informasi Sekolah berjalan di port ${env.port}`));
  if (env.enableScheduler || env.serviceDomain === 'all') startJobs();
  const shutdown = () => server.close(() => pool.end().then(() => process.exit(0)));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
})().catch((err) => {
  console.error('[startup] gagal:', err.message);
  process.exit(1);
});
