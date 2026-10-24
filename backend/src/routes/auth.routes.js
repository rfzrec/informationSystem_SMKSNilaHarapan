const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { one, query } = require('../config/db');
const { asyncHandler, HttpError } = require('../utils/http');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { ensureCsrfToken, loginLimiter, registerLimiter, forgotLimiter } = require('../middleware/security');
const { audit } = require('../utils/audit');
const env = require('../config/env');
const { processIntegration } = require('../services/integrationService');
const auth = require('../services/authService');

const router = express.Router();

const password = z.string().min(8, 'Kata sandi minimal 8 karakter').max(72)
  .regex(/[A-Za-z]/, 'Kata sandi harus mengandung huruf').regex(/[0-9]/, 'Kata sandi harus mengandung angka');
const email = z.string().trim().toLowerCase().email('Format email tidak valid').max(190);

const maskEmail = (e) => String(e).replace(/^(.{2}).*(@.*)$/, '$1***$2');

function publicUser(u) {
  return {
    id: u.id, email: u.email, full_name: u.full_name, phone: u.phone, role: u.role, role_name: u.role_name,
    account_stage: u.account_stage || 'staff', permissions: u.permissions, must_change_password: !!u.must_change_password,
  };
}

const regenerate = (req) => new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));

async function startSession(req, userId) {
  await regenerate(req);
  req.session.userId = userId;
  ensureCsrfToken(req);
}

router.get('/csrf', (req, res) => res.json({ csrfToken: ensureCsrfToken(req) }));

// CAPTCHA aritmetika disimpan di sesi server, berumur singkat, dan hanya dapat dipakai sekali.
router.get('/captcha', (req, res) => {
  const a = crypto.randomInt(2, 10);
  const b = crypto.randomInt(1, 10);
  const id = crypto.randomBytes(16).toString('hex');
  req.session.loginCaptcha = { id, answer: String(a + b), expiresAt: Date.now() + 5 * 60 * 1000 };
  res.set('Cache-Control', 'no-store');
  res.json({ challengeId: id, question: `${a} + ${b} = ?`, expiresInSeconds: 300 });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

router.post('/register', registerLimiter, validate(z.object({
  full_name: z.string().trim().min(3, 'Nama minimal 3 karakter').max(150),
  email,
  password,
})), asyncHandler(async (req, res) => {
  const userId = await auth.registerApplicant(req.valid);
  await startSession(req, userId);
  req.user = { id: userId };
  await audit(req, 'auth.register', 'user', userId, { email: maskEmail(req.valid.email) });
  res.status(201).json({ message: 'Registrasi berhasil.', csrfToken: req.session.csrfToken });
}));

router.post('/login', loginLimiter, validate(z.object({
  email, password: z.string().min(1).max(72),
  captcha_id: z.string().length(32), captcha_answer: z.string().trim().min(1).max(8),
})), asyncHandler(async (req, res) => {
  const challenge = req.session.loginCaptcha;
  // Konsumsi tantangan sebelum memeriksa jawaban: tidak dapat diputar ulang meskipun gagal.
  req.session.loginCaptcha = null;
  if (!challenge || challenge.id !== req.valid.captcha_id || challenge.expiresAt < Date.now()
    || challenge.answer !== req.valid.captcha_answer.trim()) {
    await audit(req, 'auth.captcha_failed', 'user', null, { reason: !challenge ? 'missing_or_used' : challenge.expiresAt < Date.now() ? 'expired' : 'invalid' });
    throw new HttpError(422, 'CAPTCHA salah atau kedaluwarsa. Silakan jawab soal yang baru.', 'CAPTCHA_INVALID');
  }
  const user = await one('SELECT id, password_hash, is_active, deleted_at FROM users WHERE email = ?', [req.valid.email]);
  const ok = user && (await auth.verifyPassword(req.valid.password, user.password_hash));
  if (!ok || !user.is_active || user.deleted_at) {
    await audit(req, 'auth.login_failed', 'user', user ? user.id : null, { email: maskEmail(req.valid.email), reason: ok ? 'inactive' : 'credentials' });
    throw new HttpError(401, 'Email atau kata sandi salah, atau akun tidak aktif.', 'INVALID_CREDENTIALS');
  }
  await startSession(req, user.id);
  await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
  req.user = { id: user.id };
  // Pemulihan otomatis: jika akun role applicant masih pada tahap applicant tetapi integrasi PPDB
  // sebelumnya terlewat/gagal sementara, coba integrasikan setelah login. Error integrasi
  // tidak membatalkan login; akun tetap bisa melihat status PPDB sampai admin memperbaikinya.
  try {
    const eligible = await query(
      `SELECT a.id FROM applications a JOIN applicants ap ON ap.id = a.applicant_id
       JOIN selection_results sr ON sr.application_id = a.id AND sr.is_official = 1
       WHERE ap.user_id = ? AND a.selection_status = 'accepted' AND a.re_registration_status = 'completed'
       AND (a.integration_status <> 'success' OR a.student_record_id IS NULL)
       ORDER BY a.id DESC`, [user.id],
    );
    for (const row of eligible) {
      try { await processIntegration(req, Number(row.id)); }
      catch (integrationError) { console.error(`[auth] integrasi otomatis gagal untuk application ${row.id}:`, integrationError.message); }
    }
    // Backfill juga akun yang data induknya sudah terintegrasi namun account_stage belum diperbarui.
    const completed = await query(
      `SELECT a.id FROM applications a JOIN applicants ap ON ap.id = a.applicant_id
       JOIN selection_results sr ON sr.application_id = a.id AND sr.is_official = 1
       WHERE ap.user_id = ? AND a.selection_status = 'accepted' AND a.re_registration_status = 'completed'
       AND a.integration_status = 'success' AND a.student_record_id IS NOT NULL ORDER BY a.id DESC`, [user.id],
    );
    for (const row of completed) {
      try { await processIntegration(req, Number(row.id)); }
      catch (integrationError) { console.error(`[auth] sinkronisasi tahap akun gagal untuk application ${row.id}:`, integrationError.message); }
    }
  } catch (integrationError) {
    console.error('[auth] pemeriksaan integrasi otomatis gagal:', integrationError.message);
  }
  await audit(req, 'auth.login', 'user', user.id);
  res.json({ message: 'Login berhasil.', csrfToken: req.session.csrfToken });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  if (req.user) await audit(req, 'auth.logout', 'user', req.user.id);
  await new Promise((resolve) => req.session.destroy(() => resolve()));
  res.clearCookie('nh.sid');
  res.json({ message: 'Anda telah keluar.' });
}));

router.post('/forgot-password', forgotLimiter, validate(z.object({ email })), asyncHandler(async (req, res) => {
  const user = await one('SELECT id FROM users WHERE email = ? AND is_active = 1', [req.valid.email]);
  if (user) {
    const token = await auth.createResetToken(user.id);
    await audit(req, 'auth.password_reset_requested', 'user', user.id);
    // Email belum dikonfigurasi: di lingkungan development tautan dicatat pada log server.
    if (!env.isProduction && !env.isTest) {
      console.log(`[password-reset] ${maskEmail(req.valid.email)} -> ${env.appBaseUrl}/portal/reset-sandi?token=${token}`);
    }
  }
  res.json({ message: 'Jika email terdaftar, instruksi pemulihan kata sandi akan dikirimkan.' });
}));

router.post('/reset-password', validate(z.object({ token: z.string().length(64), password })), asyncHandler(async (req, res) => {
  const userId = await auth.resetPassword(req.valid.token, req.valid.password);
  await audit({ user: { id: userId }, ip: req.ip }, 'auth.password_reset', 'user', userId);
  res.json({ message: 'Kata sandi berhasil diperbarui. Silakan login.' });
}));

router.put('/password', requireAuth, validate(z.object({ current_password: z.string().min(1), new_password: password })), asyncHandler(async (req, res) => {
  const row = await one('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await auth.verifyPassword(req.valid.current_password, row.password_hash))) {
    throw new HttpError(422, 'Kata sandi saat ini salah.', 'WRONG_PASSWORD');
  }
  await query('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [await auth.hashPassword(req.valid.new_password), req.user.id]);
  await audit(req, 'auth.password_changed', 'user', req.user.id);
  res.json({ message: 'Kata sandi berhasil diubah.' });
}));

router.put('/profile', requireAuth, validate(z.object({
  full_name: z.string().trim().min(3).max(150),
  phone: z.string().trim().max(30).regex(/^[0-9+\-\s]*$/, 'Nomor telepon tidak valid').optional().or(z.literal('')),
})), asyncHandler(async (req, res) => {
  await query('UPDATE users SET full_name = ?, phone = ? WHERE id = ?', [req.valid.full_name, req.valid.phone || null, req.user.id]);
  res.json({ message: 'Profil akun diperbarui.' });
}));

module.exports = { router, password, email };
