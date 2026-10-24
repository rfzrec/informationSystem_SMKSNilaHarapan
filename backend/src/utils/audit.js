const { query } = require('../config/db');

const SENSITIVE = /pass|token|secret|session|csrf/i;

function mask(value) {
  if (Array.isArray(value)) return value.map(mask);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SENSITIVE.test(k) ? '[DISAMARKAN]' : mask(v)]));
  }
  return value;
}

async function audit(req, action, entityType, entityId, details, conn) {
  const userId = req && req.user ? req.user.id : null;
  const ip = req ? req.ip : null;
  await query(
    'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details_json, ip_address) VALUES (?,?,?,?,?,?)',
    [userId, action, entityType || null, entityId != null ? String(entityId) : null, details ? JSON.stringify(mask(details)) : null, ip],
    conn,
  );
}

module.exports = { audit, mask };
