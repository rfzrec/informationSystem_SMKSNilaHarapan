class HttpError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code || 'ERROR';
    this.details = details;
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function parsePaging(q) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(q.page_size, 10) || 10));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function slugify(text) {
  return String(text).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 180) || 'konten';
}

function maskNik(nik) {
  if (!nik) return '';
  return `${'*'.repeat(Math.max(0, nik.length - 4))}${nik.slice(-4)}`;
}

module.exports = { HttpError, asyncHandler, parsePaging, parseJson, slugify, maskNik };
