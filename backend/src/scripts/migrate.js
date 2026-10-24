const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../config/env');

const MIGRATIONS_DIR = path.join(env.rootDir, 'database', 'migrations');

// Menjalankan file SQL di database/migrations secara berurutan, masing-masing hanya sekali.
async function migrate() {
  const conn = await mysql.createConnection({ ...env.db, multipleStatements: true });
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(190) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`);
    const [done] = await conn.query('SELECT name FROM schema_migrations');
    const applied = new Set(done.map((d) => d.name));
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      console.log(`[migrate] menerapkan ${file}`);
      await conn.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
    }
    console.log('[migrate] selesai');
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  migrate().then(() => process.exit(0)).catch((e) => { console.error('[migrate] gagal:', e.message); process.exit(1); });
}

module.exports = { migrate };
