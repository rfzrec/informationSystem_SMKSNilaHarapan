const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
  ...env.db,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
  charset: 'utf8mb4',
  multipleStatements: false,
});

const clean = (params) => (params || []).map((p) => (p === undefined ? null : p));

async function query(sql, params, conn) {
  const [rows] = await (conn || pool).execute(sql, clean(params));
  return rows;
}

async function one(sql, params, conn) {
  const rows = await query(sql, params, conn);
  return rows[0] || null;
}

async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, one, withTransaction };
