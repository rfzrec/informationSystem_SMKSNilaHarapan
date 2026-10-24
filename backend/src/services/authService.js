const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query, one, withTransaction } = require('../config/db');
const { HttpError } = require('../utils/http');

const BCRYPT_ROUNDS = 12;
const RESET_TTL_MINUTES = 60;

const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);
const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

async function createUserWithRole(conn, { email, password, fullName, phone, roleCode, mustChange, accountStage = 'staff', createApplicant = false }) {
  const role = await one('SELECT id FROM roles WHERE code = ?', [roleCode], conn);
  if (!role) throw new HttpError(422, 'Role tidak dikenal.', 'ROLE_UNKNOWN');
  const exists = await one('SELECT id FROM users WHERE email = ?', [email], conn);
  if (exists) throw new HttpError(409, 'Email sudah terdaftar.', 'EMAIL_TAKEN');
  const hash = await hashPassword(password);
  const result = await query(
    'INSERT INTO users (email, password_hash, full_name, phone, must_change_password, account_stage) VALUES (?,?,?,?,?,?)',
    [email, hash, fullName, phone || null, mustChange ? 1 : 0, accountStage], conn,
  );
  await query('INSERT INTO user_roles (user_id, role_id) VALUES (?,?)', [result.insertId, role.id], conn);
  if (createApplicant) {
    await query('INSERT INTO applicants (user_id, full_name) VALUES (?,?)', [result.insertId, fullName], conn);
  }
  if (roleCode === 'guru') {
    const teacherCode = `GURU-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    await query('INSERT INTO teacher_records (user_id, teacher_code, full_name, employment_status) VALUES (?,?,?,\'active\')', [result.insertId, teacherCode, fullName], conn);
  }
  return result.insertId;
}

async function registerApplicant({ email, password, full_name }) {
  return withTransaction((conn) => createUserWithRole(conn, { email, password, fullName: full_name, roleCode: 'applicant', accountStage: 'applicant', createApplicant: true, mustChange: false }));
}

async function createResetToken(userId) {
  const raw = crypto.randomBytes(32).toString('hex');
  await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [userId]);
  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?,?, DATE_ADD(NOW(), INTERVAL ${RESET_TTL_MINUTES} MINUTE))`,
    [userId, sha256(raw)],
  );
  return raw;
}

async function resetPassword(rawToken, newPassword) {
  return withTransaction(async (conn) => {
    const row = await one(
      'SELECT id, user_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() FOR UPDATE',
      [sha256(rawToken)], conn,
    );
    if (!row) throw new HttpError(400, 'Tautan pemulihan tidak valid atau sudah kedaluwarsa.', 'TOKEN_INVALID');
    await query('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [await hashPassword(newPassword), row.user_id], conn);
    await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [row.id], conn);
    // Cabut seluruh session aktif pengguna setelah sandi diganti.
    await query('DELETE FROM sessions WHERE data LIKE ? OR data LIKE ?', [`%"userId":${row.user_id},%`, `%"userId":${row.user_id}}%`], conn);
    return row.user_id;
  });
}

module.exports = { hashPassword, verifyPassword, createUserWithRole, registerApplicant, createResetToken, resetPassword };
