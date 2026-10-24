const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { query, one, pool, withTransaction } = require('../config/db');
const { asyncHandler, HttpError, parsePaging } = require('../utils/http');
const { validate } = require('../middleware/validate');
const { requirePerm, requireAuth } = require('../middleware/auth');
const { audit } = require('../utils/audit');
const { createUserWithRole, hashPassword } = require('../services/authService');
const env = require('../config/env');

const maskEmail = (e) => String(e).replace(/^(.{2}).*(@.*)$/, '$1***$2');

const tempPassword = () => `Nh-${crypto.randomBytes(6).toString('base64url')}-${crypto.randomInt(10, 99)}`;

// ===== Pengguna & role (Administrator Sistem) =====
const users = express.Router();
users.use(requirePerm('users.manage'));

users.get('/', asyncHandler(async (req, res) => {
  const { page, pageSize, offset } = parsePaging(req.query);
  const q = req.query.q || ''; const role = req.query.role || '';
  const where = `(? = '' OR u.full_name LIKE ? OR u.email LIKE ?) AND (? = '' OR r.code = ?)`;
  const params = [q, `%${q}%`, `%${q}%`, role, role];
  const from = 'FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id';
  const activeWhere = `${where} AND u.deleted_at IS NULL AND r.code IN ('superadmin','admin')`;
  const total = await one(`SELECT COUNT(*) AS n ${from} WHERE ${activeWhere}`, params);
  const rows = await query(`SELECT u.id, u.email, u.full_name, u.phone, u.position_code, u.position_name, u.employee_code, u.is_active, u.last_login_at, u.created_at, r.code AS role, r.name AS role_name
    ${from} WHERE ${activeWhere} ORDER BY u.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`, params);
  res.json({ data: rows, meta: { page, page_size: pageSize, total: Number(total.n) } });
}));

const teacherProfileSchema = z.object({
  employee_number: z.string().trim().min(2).max(40),
  nip: z.string().trim().max(40).optional().default(''),
  nuptk: z.string().trim().max(40).optional().default(''),
  gender: z.enum(['male', 'female', 'unspecified']).optional().default('unspecified'),
  birth_date: z.string().trim().optional().default(''),
  address: z.string().trim().max(500).min(5),
  education_level: z.string().trim().max(80).min(2),
  subject_specialization: z.string().trim().max(120).min(2),
  employment_type: z.enum(['permanent', 'contract', 'honorary', 'other']),
  hired_on: z.string().trim().min(10).max(10),
  bank_name: z.string().trim().max(100).optional().default(''),
  bank_account_name: z.string().trim().max(150).optional().default(''),
  bank_account_number: z.string().trim().max(60).optional().default(''),
}).optional();

users.post('/', validate(z.object({
  email: z.string().trim().toLowerCase().email(), full_name: z.string().trim().min(3).max(150),
  phone: z.string().trim().max(30).min(8),
  position_code: z.enum(['superadmin', 'admin_sekolah']),
  position_name: z.string().trim().max(120).optional().default(''),
  role: z.enum(['superadmin', 'admin']),
  teacher_profile: teacherProfileSchema,
})), asyncHandler(async (req, res) => {
  if (req.valid.teacher_profile) throw new HttpError(422, 'Akun Guru dibuat melalui Master Guru agar kode unik dan akun selalu terhubung.', 'TEACHER_MASTER_REQUIRED');
  const pwd = tempPassword();
  const role = req.valid.position_code === 'superadmin' ? 'superadmin' : 'admin';
  const id = await withTransaction(async (conn) => {
    const userId = await createUserWithRole(conn, { ...req.valid, fullName: req.valid.full_name, password: pwd, roleCode: role, mustChange: true });
    await query('UPDATE users SET position_code=?, position_name=?, employee_code=? WHERE id=?', [req.valid.position_code, req.valid.position_name || null, role === 'superadmin' ? `SADM-${String(userId).padStart(6,'0')}` : `ADMS-${String(userId).padStart(6,'0')}`, userId], conn);
    return userId;
  });
  await audit(req, 'user.create', 'user', id, { role: req.valid.role, teacher_profile_created: false });
  res.status(201).json({ message: 'Akun dibuat. Sampaikan kata sandi sementara secara aman; pengguna wajib menggantinya.', data: { id, temporary_password: pwd, is_active: true, teacher_profile_created: false } });
}));

users.put('/:id(\\d+)', validate(z.object({
  full_name: z.string().trim().min(3).max(150), phone: z.string().trim().max(30).optional().default(''),
  role: z.enum(['superadmin', 'admin']),
  position_code: z.enum(['superadmin', 'admin_sekolah']),
  position_name: z.string().trim().max(120).optional().default(''),
})), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const before = await one('SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?', [id]);
  if (!before) throw new HttpError(404, 'Pengguna tidak ditemukan.', 'NOT_FOUND');
  if (!['superadmin', 'admin', 'school_leader'].includes(before.code)) throw new HttpError(409, 'Akun Guru, Siswa, dan Calon Murid dikelola melalui master/PPDB, bukan pengelolaan akun umum.', 'ROLE_MANAGED_ELSEWHERE');
  if (id === req.user.id && req.valid.role !== before.code) throw new HttpError(409, 'Anda tidak dapat mengubah role akun sendiri.', 'SELF_ROLE');
  await withTransaction(async (conn) => {
    await query('UPDATE users SET full_name = ?, phone = ?, position_code=?, position_name=? WHERE id = ?', [req.valid.full_name, req.valid.phone || null, req.valid.position_code, req.valid.position_name || null, id], conn);
    await query('UPDATE user_roles SET role_id = (SELECT id FROM roles WHERE code = ?) WHERE user_id = ?', [req.valid.role, id], conn);
    if (before.code !== req.valid.role) await audit(req, 'user.role_change', 'user', id, { from: before.code, to: req.valid.role, position_code: req.valid.position_code }, conn);
  });
  res.json({ message: 'Akun diperbarui.' });
}));

users.delete('/:id(\\d+)', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, 'ID akun tidak valid.', 'INVALID_USER_ID');
  if (id === req.user.id) throw new HttpError(409, 'Akun yang sedang digunakan tidak dapat dihapus.', 'SELF_DELETE');

  await withTransaction(async (conn) => {
    const target = await one(`SELECT u.id, u.email, u.full_name, r.code AS role, u.deleted_at
      FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
      WHERE u.id = ? FOR UPDATE`, [id], conn);
    if (!target || target.deleted_at) throw new HttpError(404, 'Pengguna tidak ditemukan atau sudah dihapus.', 'NOT_FOUND');
    if (!['superadmin','admin'].includes(target.role)) throw new HttpError(409, 'Akun Guru, Pimpinan Sekolah, Siswa, dan Calon Murid dikelola melalui master khusus.', 'ROLE_MANAGED_ELSEWHERE');

    if (target.role === 'superadmin') {
      const admins = await one(`SELECT COUNT(DISTINCT u.id) AS n FROM users u
        JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
        WHERE r.code = 'superadmin' AND u.is_active = 1 AND u.deleted_at IS NULL`, [], conn);
      if (Number(admins.n) <= 1) throw new HttpError(409, 'Superadmin aktif terakhir tidak boleh dihapus. Aktifkan Superadmin lain terlebih dahulu.', 'LAST_SUPER_ADMIN');
    }

    // Hapus paksa akses login, bukan rekam akademik/PPDB. Relasi historis dipertahankan
    // untuk integritas foreign key, audit, dan pelaporan; akun dihapus dari daftar pengguna.
    const randomHash = await hashPassword(crypto.randomBytes(48).toString('base64url'));
    await query('UPDATE users SET email = ?, full_name = ?, phone = NULL, password_hash = ?, is_active = 0, deleted_at = NOW(), must_change_password = 0 WHERE id = ?',
      [`deleted+${id}+${Date.now()}@deleted.invalid`, `[Akun dihapus #${id}]`, randomHash, id], conn);
    await query('DELETE FROM password_reset_tokens WHERE user_id = ?', [id], conn);
    await query('DELETE FROM sessions WHERE data LIKE ? OR data LIKE ?', [`%"userId":${id},%`, `%"userId":${id}}%`], conn);
    await audit(req, 'user.force_delete', 'user', id, { former_email: target.email, former_name: target.full_name, role: target.role, ppdb_records_preserved: true }, conn);
  });
  res.json({ message: 'Akses akun berhasil dihapus paksa. Akun tidak dapat login dan disembunyikan dari daftar; riwayat PPDB dipertahankan agar data sekolah tetap utuh.' });
}));

users.post('/:id(\\d+)/status', validate(z.object({ is_active: z.boolean() })), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) throw new HttpError(409, 'Anda tidak dapat menonaktifkan akun sendiri.', 'SELF_DEACTIVATE');
  const target = await one('SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?',[id]);
  if (!target || !['superadmin','admin'].includes(target.code)) throw new HttpError(409, 'Status akun Guru dan Pimpinan Sekolah dikelola melalui Master Akun Pegawai.', 'ROLE_MANAGED_ELSEWHERE');
  const r = await query('UPDATE users SET is_active = ? WHERE id = ? AND deleted_at IS NULL', [req.valid.is_active ? 1 : 0, id]);
  if (!r.affectedRows) throw new HttpError(404, 'Pengguna tidak ditemukan.', 'NOT_FOUND');
  if (!req.valid.is_active) await query('DELETE FROM sessions WHERE data LIKE ? OR data LIKE ?', [`%"userId":${id},%`, `%"userId":${id}}%`]);
  await audit(req, req.valid.is_active ? 'user.activate' : 'user.deactivate', 'user', id);
  res.json({ message: req.valid.is_active ? 'Akun diaktifkan.' : 'Akun dinonaktifkan.' });
}));

users.post('/:id(\\d+)/reset-password', asyncHandler(async (req, res) => {
  const target=await one('SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?',[Number(req.params.id)]);
  if (!target || !['superadmin','admin'].includes(target.code)) throw new HttpError(409, 'Reset akun Guru dan Pimpinan Sekolah dilakukan melalui Master Akun Pegawai.', 'ROLE_MANAGED_ELSEWHERE');
  const pwd = tempPassword();
  const r = await query('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ? AND deleted_at IS NULL', [await hashPassword(pwd), req.params.id]);
  if (!r.affectedRows) throw new HttpError(404, 'Pengguna tidak ditemukan.', 'NOT_FOUND');
  await audit(req, 'user.password_reset_by_admin', 'user', req.params.id);
  res.json({ message: 'Kata sandi sementara dibuat.', data: { temporary_password: pwd } });
}));

// ===== Sistem =====
const system = express.Router();
const SETTING_KEYS = ['maintenance_notice', 'external_siakad_endpoint', 'support_contact_note'];
const settingValueSchema = z.object({
  maintenance_notice: z.string().trim().max(500).default(''),
  external_siakad_endpoint: z.string().trim().url('Endpoint SIAKAD harus berupa URL valid.').max(500).or(z.literal('')).default(''),
  support_contact_note: z.string().trim().max(500).default(''),
});
let runtimeSettings = { maintenance_notice: '', external_siakad_endpoint: '', support_contact_note: '' };
async function loadRuntimeSettings() {
  const rows = await query('SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN (?,?,?)', SETTING_KEYS);
  runtimeSettings = { ...runtimeSettings, ...Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value || ''])) };
  return runtimeSettings;
}
const getRuntimeSettings = async () => loadRuntimeSettings();


system.get('/overview', requirePerm('system.monitor'), asyncHandler(async (req, res) => {
  const started = Date.now();
  let dbOk = true;
  try { await pool.query('SELECT 1'); } catch { dbOk = false; }
  const [byRole, authActivity, errors, backup, auditSummary, sessions, integration, emailCounts, emailRecent, bugSummary] = await Promise.all([
    query('SELECT r.name AS k, COUNT(ur.user_id) AS n FROM roles r LEFT JOIN user_roles ur ON ur.role_id = r.id GROUP BY r.id ORDER BY r.id'),
    query(`SELECT action AS k, COUNT(*) AS n FROM audit_logs WHERE action LIKE 'auth.%' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY action`),
    query('SELECT * FROM system_error_logs ORDER BY id DESC LIMIT 10'),
    one('SELECT * FROM backup_records ORDER BY id DESC LIMIT 1'),
    query(`SELECT action AS k, COUNT(*) AS n FROM audit_logs WHERE action IN ('auth.login_failed','user.role_change','user.deactivate','role.permissions_change','report.export')
      AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY action`),
    one('SELECT COUNT(*) AS n FROM sessions WHERE expires > UNIX_TIMESTAMP()'),
    query('SELECT integration_status AS k, COUNT(*) AS n FROM applications GROUP BY integration_status'),
    query(`SELECT email_status AS k, COUNT(*) AS n FROM notifications WHERE email_status <> 'skipped' GROUP BY email_status`),
    query(`SELECT n.id, n.type, n.email_status, n.email_attempts, n.email_error, n.email_sent_at, n.created_at, u.email FROM notifications n JOIN users u ON u.id = n.user_id
      WHERE n.email_status <> 'skipped' ORDER BY n.id DESC LIMIT 15`),
    query(`SELECT implementation_status AS k, COUNT(*) AS n FROM system_bug_findings GROUP BY implementation_status`),
  ]);
  const settings = await getRuntimeSettings();
  let siakad = { status: 'not_configured', note: 'Endpoint SIAKAD eksternal belum dikonfigurasi.' };
  if (settings.external_siakad_endpoint) {
    try {
      const response = await fetch(settings.external_siakad_endpoint, { signal: AbortSignal.timeout(3000), headers: { Accept: 'application/json' } });
      siakad = { status: response.ok ? 'ok' : 'error', note: `HTTP ${response.status}`, endpoint: settings.external_siakad_endpoint };
    } catch (error) { siakad = { status: 'error', note: error.name === 'TimeoutError' ? 'Timeout 3 detik.' : 'Endpoint tidak dapat dihubungi.', endpoint: settings.external_siakad_endpoint }; }
  }
  res.json({ data: {
    app: { status: 'ok', uptime_seconds: Math.round(process.uptime()), node: process.version, env: env.nodeEnv },
    database: { status: dbOk ? 'ok' : 'error', latency_ms: Date.now() - started },
    email: { status: env.emailProvider ? 'configured' : 'not_configured', provider: env.emailProvider || null, from: env.email.from, test_sender: env.email.from.includes('@resend.dev'), redirect: Boolean(env.email.redirectTo), counts: emailCounts, recent: emailRecent.map((e) => ({ ...e, email: maskEmail(e.email) })) },
    external_siakad: siakad,
    maintenance_notice: settings.maintenance_notice,
    support_contact_note: settings.support_contact_note,
    integration, byRole, authActivity, errors, backup, auditSummary, bugSummary, active_sessions: Number(sessions.n),
  } });
}));

system.get('/public-config', asyncHandler(async (_req, res) => {
  const settings = await getRuntimeSettings();
  res.set('Cache-Control', 'no-store').json({ data: { maintenance_notice: settings.maintenance_notice, support_contact_note: settings.support_contact_note } });
}));

system.get('/settings', requirePerm('system.settings'), asyncHandler(async (req, res) => {
  const rows = await query('SELECT setting_key, setting_value, updated_at FROM system_settings');
  res.json({ data: SETTING_KEYS.map((k) => rows.find((r) => r.setting_key === k) || { setting_key: k, setting_value: '' }) });
}));

system.put('/settings', requirePerm('system.settings'), validate(z.object({ settings: z.record(z.string().max(2000)) })), asyncHandler(async (req, res) => {
  const parsed = settingValueSchema.safeParse(req.valid.settings);
  if (!parsed.success) throw new HttpError(422, parsed.error.issues[0]?.message || 'Nilai pengaturan tidak valid.', 'INVALID_SETTING');
  const entries = Object.entries(parsed.data);
  if (entries.some(([k]) => !SETTING_KEYS.includes(k))) throw new HttpError(422, 'Kunci pengaturan tidak dikenal.', 'UNKNOWN_SETTING');
  for (const [k, v] of entries) {
    await query('INSERT INTO system_settings (setting_key, setting_value, updated_by) VALUES (?,?,?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)', [k, v, req.user.id]);
  }
  await loadRuntimeSettings();
  await audit(req, 'system.settings_update', 'system_settings', null, parsed.data);
  res.json({ message: 'Pengaturan sistem tersimpan.' });
}));


// Monitoring akun lintas-role: baca data aktual; tindakan operasional tetap mengikuti RBAC masing-masing.
system.get('/role-monitoring', requirePerm('system.monitor'), asyncHandler(async (req, res) => {
  const roles = await query(`
    SELECT r.id, r.code, r.name,
      COUNT(DISTINCT CASE WHEN u.deleted_at IS NULL THEN u.id END) AS total_accounts,
      COUNT(DISTINCT CASE WHEN u.deleted_at IS NULL AND u.is_active = 1 THEN u.id END) AS active_accounts,
      COUNT(DISTINCT CASE WHEN u.deleted_at IS NULL AND u.is_active = 0 THEN u.id END) AS inactive_accounts
    FROM roles r
    LEFT JOIN user_roles ur ON ur.role_id = r.id
    LEFT JOIN users u ON u.id = ur.user_id
    GROUP BY r.id, r.code, r.name ORDER BY r.id`);
  const q = String(req.query.q || '').trim().slice(0, 100);
  const role = String(req.query.role || '').trim().slice(0, 80);
  const status = String(req.query.status || '').trim();
  const conditions = ['u.deleted_at IS NULL', "(? = '' OR (u.full_name LIKE ? OR u.email LIKE ?))", "(? = '' OR r.code = ?)",
    "(? = '' OR (? = 'active' AND u.is_active = 1) OR (? = 'inactive' AND u.is_active = 0))"];
  const params = [q, `%${q}%`, `%${q}%`, role, role, status, status, status];
  const usersList = await query(`
    SELECT u.id, u.full_name, u.email, u.is_active, u.last_login_at, u.created_at,
      r.code AS role, r.name AS role_name
    FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY r.id, u.full_name LIMIT 500`, params);
  res.json({ data: { roles: roles.map(r => ({...r, total_accounts:Number(r.total_accounts), active_accounts:Number(r.active_accounts), inactive_accounts:Number(r.inactive_accounts)})), users: usersList } });
}));

const bugFindingSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(3).max(5000),
  module_name: z.string().trim().min(1).max(120),
  affected_role: z.string().trim().max(80).default(''),
  severity: z.enum(['low','medium','high','critical']),
  reproduction_steps: z.string().max(5000).optional().default(''),
  implementation_status: z.enum(['new','analyzing','fixing','ready_for_test','closed','reopened']).optional(),
  test_status: z.enum(['not_tested','passed','failed']).optional(),
  fix_summary: z.string().max(5000).optional().default(''),
  test_notes: z.string().max(5000).optional().default('')
});
system.get('/bug-findings', requirePerm('system.monitor'), asyncHandler(async (req, res) => {
  const status = String(req.query.status || '').trim();
  const severity = String(req.query.severity || '').trim();
  const moduleName = String(req.query.module || '').trim().slice(0,120);
  const q = String(req.query.q || '').trim().slice(0,100);
  const rows = await query(`SELECT b.*, c.full_name AS creator_name, u.full_name AS updater_name
    FROM system_bug_findings b LEFT JOIN users c ON c.id=b.created_by LEFT JOIN users u ON u.id=b.updated_by
    WHERE (? = '' OR b.implementation_status = ?) AND (? = '' OR b.severity = ?)
      AND (? = '' OR b.module_name = ?) AND (? = '' OR b.title LIKE ? OR b.description LIKE ?)
    ORDER BY CASE b.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, b.updated_at DESC LIMIT 500`,
    [status,status,severity,severity,moduleName,moduleName,q,`%${q}%`,`%${q}%`]);
  const counts = await query(`SELECT implementation_status AS status, test_status, COUNT(*) AS total FROM system_bug_findings GROUP BY implementation_status,test_status`);
  res.json({ data: rows, counts });
}));
system.post('/bug-findings', requirePerm('system.monitor'), validate(bugFindingSchema), asyncHandler(async (req, res) => {
  const v = req.valid;
  const result = await query(`INSERT INTO system_bug_findings
    (title,description,module_name,affected_role,severity,reproduction_steps,implementation_status,test_status,fix_summary,test_notes,created_by,updated_by)
    VALUES (?,?,?,?,?,?,?, ?,?,?,?,?)`,
    [v.title,v.description,v.module_name,v.affected_role,v.severity,v.reproduction_steps || null,
      v.implementation_status || 'new',v.test_status || 'not_tested',v.fix_summary || null,v.test_notes || null,req.user.id,req.user.id]);
  await audit(req, 'system.bug_finding_create', 'system_bug_finding', result.insertId, {severity:v.severity,module:v.module_name});
  res.status(201).json({message:'Temuan monitoring disimpan. Status pengujian awal: BELUM DIUJI.',data:{id:result.insertId}});
}));
system.put('/bug-findings/:id(\\d+)', requirePerm('system.monitor'), validate(bugFindingSchema), asyncHandler(async (req, res) => {
  const id = Number(req.params.id); const v = req.valid;
  const old = await one('SELECT id,implementation_status,test_status FROM system_bug_findings WHERE id=?',[id]);
  if (!old) throw new HttpError(404,'Temuan tidak ditemukan.','NOT_FOUND');
  // A finding cannot be marked closed unless its test has passed.
  const impl = v.implementation_status || old.implementation_status;
  const test = v.test_status || old.test_status;
  if (impl === 'closed' && test !== 'passed') throw new HttpError(422,'Temuan hanya dapat ditutup setelah pengujian berstatus LULUS.','TEST_REQUIRED');
  await query(`UPDATE system_bug_findings SET title=?,description=?,module_name=?,affected_role=?,severity=?,reproduction_steps=?,
    implementation_status=?,test_status=?,fix_summary=?,test_notes=?,updated_by=? WHERE id=?`,
    [v.title,v.description,v.module_name,v.affected_role,v.severity,v.reproduction_steps || null,impl,test,v.fix_summary || null,v.test_notes || null,req.user.id,id]);
  await audit(req,'system.bug_finding_update','system_bug_finding',id,{from:{implementation_status:old.implementation_status,test_status:old.test_status},to:{implementation_status:impl,test_status:test}});
  res.json({message:'Temuan dan status pengujian diperbarui.'});
}));

system.get('/error-logs', requirePerm('system.monitor'), asyncHandler(async (req, res) => {
  res.json({ data: await query('SELECT * FROM system_error_logs ORDER BY id DESC LIMIT 200') });
}));

// Audit log hanya-baca: tidak ada endpoint ubah/hapus.
const auditLogs = express.Router();
auditLogs.get('/', requirePerm('audit.view'), asyncHandler(async (req, res) => {
  const { page, pageSize, offset } = parsePaging(req.query);
  const technical = req.user.permissions.includes('system.monitor');
  const where = [`(? = '' OR l.action LIKE ?)`, `(? = '' OR l.entity_type = ?)`];
  const a = req.query.action || ''; const e = req.query.entity_type || '';
  const params = [a, `${a}%`, e, e];
  if (!technical) where.push(`l.action NOT LIKE 'auth.%' AND l.action NOT LIKE 'user.%' AND l.action NOT LIKE 'role.%' AND l.action NOT LIKE 'system.%'`);
  const total = await one(`SELECT COUNT(*) AS n FROM audit_logs l WHERE ${where.join(' AND ')}`, params);
  const rows = await query(`SELECT l.*, u.full_name AS actor, u.email AS actor_email FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id
    WHERE ${where.join(' AND ')} ORDER BY l.id DESC LIMIT ${pageSize} OFFSET ${offset}`, params);
  res.json({ data: rows, meta: { page, page_size: pageSize, total: Number(total.n) } });
}));

// ===== Notifikasi =====
const notifications = express.Router();
notifications.use(requireAuth);
notifications.get('/', asyncHandler(async (req, res) => {
  const rows = await query('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50', [req.user.id]);
  const unread = await one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);
  res.json({ data: rows, meta: { unread: Number(unread.n) } });
}));
notifications.post('/read-all', asyncHandler(async (req, res) => {
  await query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
  res.json({ message: 'Semua notifikasi ditandai dibaca.' });
}));
notifications.post('/:id(\\d+)/read', asyncHandler(async (req, res) => {
  await query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  res.json({ message: 'Notifikasi ditandai dibaca.' });
}));

module.exports = { users, system, auditLogs, notifications };
