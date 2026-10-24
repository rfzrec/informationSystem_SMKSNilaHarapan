const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { HttpError } = require('../utils/http');
const env = require('../config/env');

function ensureCsrfToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  return req.session.csrfToken;
}

// Synchronizer token: setiap request yang mengubah data wajib membawa header X-CSRF-Token.
function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = req.get('x-csrf-token');
  const expected = req.session && req.session.csrfToken;
  if (!sent || !expected || sent.length !== expected.length
    || !crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected))) {
    return next(new HttpError(403, 'Token keamanan (CSRF) tidak valid. Muat ulang halaman lalu coba lagi.', 'CSRF_INVALID'));
  }
  next();
}

const limiter = (limit, windowMs, message) => rateLimit({
  windowMs,
  limit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res, next) => next(new HttpError(429, message, 'RATE_LIMITED')),
});

const loginLimiter = limiter(env.rateLimit.login, 15 * 60 * 1000, 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.');
const registerLimiter = limiter(env.rateLimit.register, 60 * 60 * 1000, 'Terlalu banyak registrasi dari alamat ini. Coba lagi nanti.');
const forgotLimiter = limiter(env.rateLimit.forgot, 15 * 60 * 1000, 'Terlalu banyak permintaan pemulihan. Coba lagi nanti.');

module.exports = { ensureCsrfToken, csrfProtection, loginLimiter, registerLimiter, forgotLimiter };
