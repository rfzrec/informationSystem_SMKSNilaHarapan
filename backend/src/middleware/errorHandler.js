const { query } = require('../config/db');
const { HttpError } = require('../utils/http');

function notFoundApi(req, res, next) {
  next(new HttpError(404, 'Endpoint tidak ditemukan.', 'NOT_FOUND'));
}

// Penanganan error terpusat: stack trace & SQL tidak pernah dikirim ke klien.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err && err.code === 'LIMIT_FILE_SIZE') err = new HttpError(413, 'Ukuran berkas melebihi batas.', 'FILE_TOO_LARGE');
  if (err && err.code === 'ER_DUP_ENTRY') err = new HttpError(409, 'Data yang sama sudah ada.', 'DUPLICATE');
  if (err && err.code === 'ER_ROW_IS_REFERENCED_2') err = new HttpError(409, 'Data masih digunakan oleh data lain. Gunakan status arsip/nonaktif.', 'IN_USE');
  if (err && err.type === 'entity.parse.failed') err = new HttpError(400, 'Format JSON tidak valid.', 'BAD_JSON');
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  console.error('[error]', req.method, req.originalUrl, err && err.message);
  query('INSERT INTO system_error_logs (method, path, message) VALUES (?,?,?)',
    [req.method, req.originalUrl.split('?')[0].slice(0, 255), String((err && err.message) || 'unknown').slice(0, 500)])
    .catch(() => {});
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Terjadi kesalahan pada server. Silakan coba lagi.' } });
}

module.exports = { notFoundApi, errorHandler };
