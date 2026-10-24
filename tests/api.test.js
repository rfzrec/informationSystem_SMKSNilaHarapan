// Pengujian otomatis alur kritis terhadap database uji terpisah (DB_NAME diakhiri _test).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mysql = require('mysql2/promise');
const env = require('../backend/src/config/env');

if (!env.db.database.endsWith('_test')) throw new Error('Pengujian hanya boleh memakai database berakhiran _test');

let app; let db;
const PWD = 'UjiCoba!2026x';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

async function client() {
  const a = request.agent(app);
  a.csrf = (await a.get('/api/auth/csrf')).body.csrfToken;
  return a;
}
const send = (a, method, url, body) => a[method](url).set('X-CSRF-Token', a.csrf).send(body);
async function login(email, password = PWD) {
  const a = await client();
  const captcha = (await a.get('/api/auth/captcha')).body;
  const [left, right] = captcha.question.match(/(\d+) \+ (\d+)/).slice(1).map(Number);
  const r = await send(a, 'post', '/api/auth/login', { email, password, captcha_id: captcha.challengeId, captcha_answer: String(left + right) });
  assert.equal(r.status, 200, `login ${email}: ${JSON.stringify(r.body)}`);
  a.csrf = r.body.csrfToken;
  return a;
}
const upload = (a, reqId, buf, name) => a.post(`/api/admissions/me/documents/${reqId}`).set('X-CSRF-Token', a.csrf).attach('file', buf, name);

const ctx = {};

before(async () => {
  const root = await mysql.createConnection({ host: env.db.host, port: env.db.port, user: env.db.user, password: env.db.password, multipleStatements: true });
  await root.query(`DROP DATABASE IF EXISTS \`${env.db.database}\`; CREATE DATABASE \`${env.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await root.end();
  await require('../backend/src/scripts/migrate').migrate();
  await require('../backend/src/scripts/seed').seedReference();
  db = require('../backend/src/config/db');
  const { createUserWithRole } = require('../backend/src/services/authService');
  for (const [email, role] of [['panitia@uji.test', 'admin'], ['operator@uji.test', 'admin'], ['adminppdb@uji.test', 'admin'], ['sysadmin@uji.test', 'superadmin']]) {
    await db.withTransaction((c) => createUserWithRole(c, { email, password: PWD, fullName: `Uji ${role}`, roleCode: role }));
  }
  const p = await db.query(`INSERT INTO admission_periods (name, academic_year, level, start_date, end_date, status) VALUES ('Uji', '2030/2031', 'SMK', CURDATE() - INTERVAL 1 DAY, CURDATE() + INTERVAL 60 DAY, 'active')`);
  ctx.periodId = p.insertId;
  ctx.pathId = (await db.query('INSERT INTO admission_paths (period_id, name) VALUES (?, ?)', [ctx.periodId, 'Jalur Uji'])).insertId;
  ctx.reqId = (await db.query(`INSERT INTO document_requirements (period_id, stage, name, allowed_types, max_size_kb) VALUES (?, 'application', 'KK Uji', 'pdf', 512)`, [ctx.periodId])).insertId;
  ctx.rrReqId = (await db.query(`INSERT INTO document_requirements (period_id, stage, name, allowed_types, max_size_kb) VALUES (?, 're_registration', 'Pernyataan Uji', 'pdf', 512)`, [ctx.periodId])).insertId;
  ctx.programId = Number((await db.one('SELECT id FROM school_programs WHERE is_active=1 ORDER BY id LIMIT 1')).id);
  await db.query(`INSERT INTO selection_rules (period_id, criteria_json) VALUES (?, ?)`, [ctx.periodId, JSON.stringify([{ key: 'tes', label: 'Tes', max_score: 100 }])]);
  app = require('../backend/src/app').createApp();
});

after(async () => { await db.pool.end(); });

test('auth: registrasi valid, duplikat, login gagal/valid, logout', async () => {
  const a = await client();
  let r = await send(a, 'post', '/api/auth/register', { full_name: 'Siswa Satu', email: 'siswa1@uji.test', password: PWD });
  assert.equal(r.status, 201);
  const me = await a.get('/api/auth/me');
  assert.equal(me.body.user.role, 'applicant');
  assert.equal(me.body.user.account_stage, 'applicant');
  r = await send(await client(), 'post', '/api/auth/register', { full_name: 'Siswa Dup', email: 'siswa1@uji.test', password: PWD });
  assert.equal(r.status, 409);
  r = await send(await client(), 'post', '/api/auth/register', { full_name: 'X', email: 'bukan-email', password: '123' });
  assert.equal(r.status, 422);
  const badLogin = await client();
  const badCaptcha = (await badLogin.get('/api/auth/captcha')).body;
  const [badLeft, badRight] = badCaptcha.question.match(/(\d+) \+ (\d+)/).slice(1).map(Number);
  r = await send(badLogin, 'post', '/api/auth/login', { email: 'siswa1@uji.test', password: 'salah12345', captcha_id: badCaptcha.challengeId, captcha_answer: String(badLeft + badRight) });
  assert.equal(r.status, 401);
  const b = await login('siswa1@uji.test');
  r = await send(b, 'post', '/api/auth/logout');
  assert.equal(r.status, 200);
  assert.equal((await b.get('/api/auth/me')).status, 401);
});


test('role mencakup enam role; calon murid memiliki role tersendiri', async () => {
  const rows = await db.query('SELECT code FROM roles ORDER BY code');
  assert.deepEqual(rows.map((r) => r.code), ['admin', 'applicant', 'guru', 'school_leader', 'siswa', 'superadmin']);
  const user = await db.one(`SELECT r.code AS role, u.account_stage FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.email='siswa1@uji.test'`);
  assert.equal(user.role, 'applicant');
  assert.equal(user.account_stage, 'applicant');
});

test('Pimpinan Sekolah dapat dibuat Superadmin dan mendapat dashboard ringkasan tanpa permission operasional', async () => {
  const sys = await login('sysadmin@uji.test');
  const created = await send(sys, 'post', '/api/users', { full_name: 'Pimpinan Baru', email: 'pimpinan-baru@uji.test', phone: '081234567890', role: 'school_leader' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const listed = await sys.get('/api/users?role=school_leader');
  assert.equal(listed.status, 200);
  assert.ok(listed.body.data.some((u) => u.email === 'pimpinan-baru@uji.test'));
  const { createUserWithRole } = require('../backend/src/services/authService');
  await db.withTransaction((c) => createUserWithRole(c, { email: 'pimpinan@uji.test', password: PWD, fullName: 'Pimpinan Uji', roleCode: 'school_leader' }));
  const leader = await login('pimpinan@uji.test');
  const me = (await leader.get('/api/auth/me')).body.user;
  assert.equal(me.role, 'school_leader');
  assert.ok(me.permissions.includes('admissions.summary.view'));
  assert.ok(!me.permissions.includes('reports.view'));
  assert.ok(!me.permissions.includes('academic.reports.view'));
  assert.ok(!me.permissions.includes('applications.verify'));
  const dashboard = await leader.get('/api/dashboard');
  assert.equal(dashboard.status, 200);
  assert.ok(Object.hasOwn(dashboard.body.data.overview, 'students'));
  assert.equal((await leader.get('/api/admissions/reports/summary')).status, 200, 'pimpinan dapat melihat ringkasan agregat PPDB');
  assert.equal((await leader.get('/api/admissions/reports/export/accepted')).status, 403, 'pimpinan tidak dapat mengekspor data pendaftar');
  assert.equal((await leader.get('/api/academics/student/1')).status, 403, 'pimpinan tidak otomatis memperoleh akses detail individual siswa');
  assert.equal((await send(leader, 'post', '/api/admissions/integrations/1/process')).status, 403);
});

test('auth: CAPTCHA terikat sesi, satu kali pakai, dan diperbarui setelah percobaan', async () => {
  const a = await client();
  const captcha = (await a.get('/api/auth/captcha')).body;
  const [left, right] = captcha.question.match(/(\d+) \+ (\d+)/).slice(1).map(Number);
  let r = await send(a, 'post', '/api/auth/login', { email: 'siswa1@uji.test', password: PWD, captcha_id: captcha.challengeId, captcha_answer: '999' });
  assert.equal(r.status, 422); assert.equal(r.body.error.code, 'CAPTCHA_INVALID');
  r = await send(a, 'post', '/api/auth/login', { email: 'siswa1@uji.test', password: PWD, captcha_id: captcha.challengeId, captcha_answer: String(left + right) });
  assert.equal(r.status, 422, 'tantangan yang sudah digunakan tidak dapat dipakai ulang');
  const next = (await a.get('/api/auth/captcha')).body;
  const [a1, b1] = next.question.match(/(\d+) \+ (\d+)/).slice(1).map(Number);
  r = await send(a, 'post', '/api/auth/login', { email: 'siswa1@uji.test', password: PWD, captcha_id: next.challengeId, captcha_answer: String(a1 + b1) });
  assert.equal(r.status, 200);
});

test('auth: permintaan tanpa CSRF ditolak dan session kedaluwarsa ditolak', async () => {
  const a = await login('siswa1@uji.test');
  assert.equal((await a.post('/api/auth/logout').send()).status, 403);
  await db.query('UPDATE sessions SET expires = UNIX_TIMESTAMP() - 10');
  assert.equal((await a.get('/api/auth/me')).status, 401);
});

test('auth: pemulihan kata sandi tidak membocorkan email dan token sekali pakai', async () => {
  const r1 = await send(await client(), 'post', '/api/auth/forgot-password', { email: 'tidakada@uji.test' });
  const r2 = await send(await client(), 'post', '/api/auth/forgot-password', { email: 'siswa1@uji.test' });
  assert.equal(r1.status, 200); assert.equal(r1.body.message, r2.body.message);
  const user = await db.one('SELECT id FROM users WHERE email = ?', ['siswa1@uji.test']);
  const token = await require('../backend/src/services/authService').createResetToken(user.id);
  const raw = await db.one('SELECT token_hash FROM password_reset_tokens WHERE used_at IS NULL AND user_id = ?', [user.id]);
  assert.notEqual(raw.token_hash, token);
  let r = await send(await client(), 'post', '/api/auth/reset-password', { token, password: 'SandiBaru!2026' });
  assert.equal(r.status, 200);
  r = await send(await client(), 'post', '/api/auth/reset-password', { token, password: 'SandiBaru!2027' });
  assert.equal(r.status, 400);
  await login('siswa1@uji.test', 'SandiBaru!2026');
  await db.query('UPDATE users SET password_hash = (SELECT h FROM (SELECT password_hash AS h FROM users WHERE email = ?) t) WHERE email = ?', ['panitia@uji.test', 'siswa1@uji.test']);
});

test('alur PPDB lengkap dengan hak akses tiap role', async () => {
  const s = await login('siswa1@uji.test');
  let r = await send(s, 'put', '/api/admissions/me/profile', { full_name: 'Siswa Satu', nik: '1207010101010001', gender: 'L', birth_date: '2011-05-01', address: 'Jl. Uji No. 1, Sunggal' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await send(s, 'put', '/api/admissions/me/guardians', { guardians: [{ relation: 'ibu', full_name: 'Ibu Uji' }] });
  assert.equal(r.status, 200);
  r = await send(s, 'put', '/api/admissions/me/education', { school_name: 'SMP Uji' });
  assert.equal(r.status, 200);
  r = await send(s, 'put', '/api/admissions/me/choice', { path_id: ctx.pathId, program_ids: [ctx.programId] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await send(s, 'post', '/api/admissions/me/submit');
  assert.equal(r.status, 422, 'tidak bisa kirim sebelum dokumen lengkap');
  r = await upload(s, ctx.reqId, Buffer.from('bukan pdf sama sekali, hanya teks'), 'palsu.pdf');
  assert.equal(r.status, 422, 'signature berkas diperiksa');
  r = await upload(s, ctx.reqId, PDF, 'kk.pdf');
  assert.equal(r.status, 201, JSON.stringify(r.body));
  r = await send(s, 'post', '/api/admissions/me/submit');
  assert.equal(r.status, 200);
  assert.match(r.body.registration_number, /^NH-2030-\d{6}$/);
  assert.equal((await send(s, 'post', '/api/admissions/me/submit')).status, 409, 'pengajuan ganda dicegah');
  assert.equal((await send(s, 'put', '/api/admissions/me/education', { school_name: 'Ubah' })).status, 409, 'data terkunci setelah diajukan');

  const me = (await s.get('/api/admissions/me')).body.data;
  const appId = me.application.id; const doc = me.documents[0];

  // Akses dokumen privat
  assert.equal((await request(app).get(`/api/admissions/applications/documents/${doc.version_id}/download`)).status, 401);
  const other = await client();
  await send(other, 'post', '/api/auth/register', { full_name: 'Siswa Dua', email: 'siswa2@uji.test', password: PWD });
  assert.equal((await other.get(`/api/admissions/applications/documents/${doc.version_id}/download`)).status, 403);
  assert.equal((await other.get(`/api/admissions/applications/${appId}`)).status, 403);
  assert.equal((await s.get(`/api/admissions/applications/documents/${doc.version_id}/download`)).status, 200);

  // Admin: minta perbaikan → pendaftar kirim ulang → verifikasi → lengkap
  const p = await login('panitia@uji.test');
  assert.equal((await send(p, 'put', `/api/admissions/paths/${ctx.pathId}`, { period_id: ctx.periodId, name: 'Jalur Uji', quota: 5 })).status, 200, 'Admin mengelola konfigurasi PPDB terpusat');
  r = await send(p, 'post', `/api/admissions/applications/documents/${doc.id}/verify`, { status: 'needs_revision' });
  assert.equal(r.status, 422, 'alasan wajib');
  r = await send(p, 'post', `/api/admissions/applications/documents/${doc.id}/verify`, { status: 'needs_revision', notes: 'Buram' });
  assert.equal(r.status, 200);
  r = await send(p, 'post', `/api/admissions/applications/${appId}/decision`, { decision: 'needs_revision', notes: 'Perbaiki KK' });
  assert.equal(r.status, 200);
  assert.equal((await upload(s, ctx.reqId, PDF, 'kk2.pdf')).status, 201);
  assert.equal((await send(s, 'post', '/api/admissions/me/submit')).status, 200, 'pengiriman ulang');
  assert.equal((await send(p, 'post', `/api/admissions/applications/${appId}/decision`, { decision: 'complete' })).status, 422, 'dokumen belum terverifikasi');
  assert.equal((await send(p, 'post', `/api/admissions/applications/documents/${doc.id}/verify`, { status: 'verified' })).status, 200);
  assert.equal((await send(p, 'post', `/api/admissions/applications/${appId}/decision`, { decision: 'complete' })).status, 200);
  const vr = await db.one('SELECT COUNT(*) AS n FROM verification_records WHERE application_id = ?', [appId]);
  assert.ok(Number(vr.n) >= 5);

  // Seleksi: Admin tunggal mengelola dan menyetujui PPDB; Superadmin teknis tidak dapat memutuskan seleksi
  const o = await login('operator@uji.test');
  const ad = await login('adminppdb@uji.test');
  assert.equal((await ad.get('/api/users')).status, 403, 'Admin operasional tidak mengelola akun dan kode guru pada menu Superadmin');
  assert.equal((await send(ad, 'put', `/api/admissions/selections/results/${appId}`, { scores: { tes: 101 }, proposed_status: 'accepted' })).status, 422);
  assert.equal((await send(ad, 'put', `/api/admissions/selections/results/${appId}`, { scores: { tes: 88 }, proposed_status: 'accepted' })).status, 200);
  assert.equal((await s.get('/api/admissions/me')).body.data.result, null, 'hasil sementara tidak terlihat');
  r = await send(ad, 'post', '/api/admissions/selections/approvals', { period_id: ctx.periodId });
  assert.equal(r.status, 201);
  const approvalId = r.body.id;
  assert.equal((await send(ad, 'post', `/api/admissions/selections/approvals/${approvalId}/publish`)).status, 409, 'publikasi harus menunggu persetujuan');
  assert.equal((await send(o, 'post', `/api/admissions/selections/approvals/${approvalId}/decide`, { decision: 'approved' })).status, 200, 'Admin berwenang menyetujui hasil seleksi');
  const sys = await login('sysadmin@uji.test');
  assert.equal((await send(sys, 'post', '/api/users', { full_name: 'Siswa Manual', email: 'siswa-manual@uji.test', phone: '081234567890', role: 'siswa' })).status, 422, 'akun siswa tidak boleh dibuat manual melalui pengelolaan akun umum');
  assert.equal((await send(sys, 'post', `/api/admissions/selections/approvals/${approvalId}/decide`, { decision: 'approved' })).status, 403, 'admin sistem tidak bisa menyetujui');
  assert.equal((await send(ad, 'post', `/api/admissions/selections/approvals/${approvalId}/publish`)).status, 200);
  const mine = (await s.get('/api/admissions/me')).body.data;
  assert.equal(mine.result.status, 'accepted');
  assert.equal(mine.application.re_registration_status, 'awaiting_confirmation');

  // Tidak ada role/login orang tua; data orang tua hanya bagian formulir PPDB.

  // Daftar ulang
  assert.equal((await send(s, 'post', '/api/admissions/me/re-registration/confirm', { willing: true })).status, 200);
  assert.equal((await send(s, 'post', '/api/admissions/me/re-registration/submit')).status, 422);
  assert.equal((await upload(s, ctx.rrReqId, PDF, 'pernyataan.pdf')).status, 201);
  assert.equal((await send(s, 'post', '/api/admissions/me/re-registration/submit')).status, 200);
  const rrDoc = (await s.get('/api/admissions/me')).body.data.documents.find((d) => d.requirement_id === ctx.rrReqId);
  assert.equal((await send(p, 'post', `/api/admissions/applications/documents/${rrDoc.id}/verify`, { status: 'verified' })).status, 200);
  assert.equal((await send(p, 'post', `/api/admissions/applications/${appId}/re-registration-decision`, { decision: 'completed' })).status, 200);

  // Integrasi: idempoten, tanpa data induk ganda
  assert.equal((await send(sys, 'post', `/api/admissions/integrations/${appId}/process`)).status, 403, 'Superadmin teknis tidak menjalankan aktivasi operasional siswa');
  r = await send(o, 'post', `/api/admissions/integrations/${appId}/process`);
  assert.equal(r.body.data.status, 'success');
  r = await send(o, 'post', `/api/admissions/integrations/${appId}/process`);
  assert.equal(r.body.data.idempotent, true);
  const sr = await db.one('SELECT COUNT(*) AS n FROM student_records WHERE source_application_id = ?', [appId]);
  assert.equal(Number(sr.n), 1);
  const studentAccount = await db.one(`SELECT sa.status, r.code AS role FROM student_accounts sa JOIN users u ON u.id = sa.user_id
    JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id JOIN student_records sr ON sr.id = sa.student_record_id
    WHERE sr.source_application_id = ?`, [appId]);
  assert.equal(studentAccount.status, 'active');
  assert.equal(studentAccount.role, 'applicant');
  assert.equal((await s.get('/api/auth/me')).body.user.role, 'applicant', 'role Calon Murid tetap stabil ketika tahap akun berubah');
  assert.equal((await s.get('/api/auth/me')).body.user.account_stage, 'student', 'tahap akun menjadi student setelah integrasi tanpa mengubah role');
  assert.equal((await s.get('/api/academics/me')).status, 200, 'dashboard akademik hanya dapat diakses setelah akun aktif');
  // Ekspor CSV dari database dengan NIK disamarkan
  r = await o.get('/api/admissions/reports/export/accepted');
  assert.equal(r.status, 200);
  assert.match(r.text, /NH-2030-/); assert.doesNotMatch(r.text, /1207010101010001/);
  assert.equal((await sys.get('/api/admissions/reports/export/accepted')).status, 403, 'Superadmin tidak memiliki akses data operasional PPDB tanpa izin khusus');
  const logs = await db.one(`SELECT COUNT(*) AS n FROM audit_logs WHERE action IN ('selection.publish','integration.attempt','report.export','verification.document')`);
  assert.ok(Number(logs.n) >= 4);
});

test('database: foreign key, unique nomor pendaftaran, satu pengajuan per periode', async () => {
  await assert.rejects(db.query('INSERT INTO applications (applicant_id, period_id) VALUES (999999, ?)', [ctx.periodId]), /foreign key/i);
  const a = await db.one(`SELECT a.applicant_id, a.registration_number FROM applications a WHERE a.registration_number IS NOT NULL LIMIT 1`);
  await assert.rejects(db.query('INSERT INTO applications (applicant_id, period_id) VALUES (?, ?)', [a.applicant_id, ctx.periodId]), /Duplicate/);
  const s2 = await db.one(`SELECT ap.id FROM applicants ap JOIN users u ON u.id = ap.user_id WHERE u.email = 'siswa2@uji.test'`);
  await assert.rejects(db.query('INSERT INTO applications (applicant_id, period_id, registration_number) VALUES (?, ?, ?)', [s2.id, ctx.periodId, a.registration_number]), /Duplicate/);
});

test('transaksi: kegagalan di tengah transaksi di-rollback', async () => {
  const before = await db.one('SELECT COUNT(*) AS n FROM ppdb_faqs');
  await assert.rejects(db.withTransaction(async (c) => {
    await db.query(`INSERT INTO ppdb_faqs (question, answer) VALUES ('Q transaksi', 'A')`, [], c);
    throw new Error('gagal');
  }));
  assert.equal((await db.one('SELECT COUNT(*) AS n FROM ppdb_faqs')).n, before.n);
});
