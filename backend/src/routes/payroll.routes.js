const express = require('express');
const { query, one, withTransaction } = require('../config/db');
const { asyncHandler, HttpError } = require('../utils/http');
const { requireAuth, requirePerm } = require('../middleware/auth');
const { audit } = require('../utils/audit');

const router = express.Router();
router.use(requireAuth);
const bad = (message, code = 'VALIDATION_ERROR') => { throw new HttpError(422, message, code); };
const num = (v) => Number(v || 0);
const dateOk = (v) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) return false; const d = new Date(`${v}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v; };
async function ownTeacher(userId, conn) {
  return one('SELECT id, full_name FROM teacher_records WHERE user_id = ? AND employment_status = "active"', [userId], conn);
}
function durationHours(start, end) {
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(String(start)) || !/^\d{2}:\d{2}(:\d{2})?$/.test(String(end))) return 0;
  const mins = (t) => { const p = t.split(':').map(Number); return p[0] * 60 + p[1]; };
  const delta = mins(end) - mins(start);
  return delta > 0 ? Math.round(delta / 60 * 100) / 100 : 0;
}
async function getPeriod(id) {
  const period = await one('SELECT * FROM teacher_payroll_periods WHERE id = ?', [id]);
  if (!period) throw new HttpError(404, 'Periode penggajian tidak ditemukan.', 'PAYROLL_PERIOD_NOT_FOUND');
  return period;
}
async function periodDetails(id) {
  return query(`SELECT d.*, t.full_name, t.employee_number
    FROM teacher_payroll_details d JOIN teacher_records t ON t.id = d.teacher_record_id
    WHERE d.period_id = ? ORDER BY t.full_name`, [id]);
}

router.get('/attendance-summary', requirePerm('honor.view'), asyncHandler(async (req, res) => {
  const from = String(req.query.from || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit' }).format(new Date()) + '-01');
  const to = String(req.query.to || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()));
  if (!dateOk(from) || !dateOk(to) || from > to || (new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000 > 366) bad('Periode tanggal rekap tidak valid atau melebihi 367 hari.');
  const rows = await query(`WITH RECURSIVE calendar AS (
      SELECT CAST(? AS DATE) AS attendance_date
      UNION ALL SELECT DATE_ADD(attendance_date, INTERVAL 1 DAY) FROM calendar WHERE attendance_date < CAST(? AS DATE)
    )
    SELECT tr.id AS teacher_record_id, tr.full_name, tr.employee_number,
      COUNT(*) AS scheduled_sessions,
      SUM(tsa.status = 'present') AS present_sessions,
      SUM(tsa.status = 'absent') AS absent_sessions,
      SUM(tsa.status = 'permission') AS permission_sessions,
      SUM(tsa.status = 'sick') AS sick_sessions,
      SUM(tsa.status = 'pending') AS pending_sessions,
      SUM(tsa.id IS NULL OR tsa.status = 'pending') AS unrecorded_sessions,
      SUM(ats.closed_at IS NOT NULL) AS sessions_confirmed_by_teacher
    FROM calendar d JOIN class_schedules cs ON cs.day_of_week = WEEKDAY(d.attendance_date) + 1
    JOIN weekly_roster_versions rv ON rv.id=cs.roster_version_id AND rv.status='published'
    JOIN teaching_assignments ta ON ta.id = cs.teaching_assignment_id
    JOIN classes c ON c.id = ta.class_id AND c.is_active = 1
    JOIN teacher_records tr ON tr.id = ta.teacher_record_id
    LEFT JOIN attendance_sessions ats ON ats.teaching_assignment_id = ta.id AND ats.attendance_type = 'student'
      AND DATE(ats.starts_at) = d.attendance_date AND TIME(ats.starts_at) = cs.starts_at
    LEFT JOIN teacher_session_attendance tsa ON tsa.session_id = ats.id AND tsa.teacher_record_id = tr.id
    GROUP BY tr.id, tr.full_name, tr.employee_number ORDER BY tr.full_name`, [from, to]);
  res.json({ data: rows.map((r) => Object.fromEntries(Object.entries(r).map(([k,v]) => [k, ['teacher_record_id','full_name','employee_number'].includes(k) ? v : Number(v || 0)]))),
    period: { from, to }, payroll_status: 'attendance_summary_only', deduction_policy: 'not_configured',
    note: 'Rekap kehadiran ini bukan slip gaji final. Potongan belum dihitung karena kebijakan resmi sekolah harus dikonfigurasi dan disetujui.' });
}));

router.get('/rates', requirePerm('honor.manage'), asyncHandler(async (req, res) => {
  const rows = await query(`SELECT r.*, t.full_name, t.employee_number
    FROM teacher_hourly_rates r JOIN teacher_records t ON t.id = r.teacher_record_id
    ORDER BY t.full_name, r.effective_from DESC`);
  res.json({ data: rows });
}));

router.post('/rates', requirePerm('honor.manage'), asyncHandler(async (req, res) => {
  const teacherId = Number(req.body.teacher_record_id);
  const rate = Number(req.body.hourly_rate);
  const effectiveFrom = req.body.effective_from;
  const effectiveTo = req.body.effective_to || null;
  if (!Number.isInteger(teacherId) || teacherId < 1 || !Number.isFinite(rate) || rate < 0 || !dateOk(effectiveFrom) || (effectiveTo && !dateOk(effectiveTo)) || (effectiveTo && effectiveTo < effectiveFrom)) bad('Guru, tarif nonnegatif, dan tanggal efektif yang valid wajib diisi.');
  if (!await one('SELECT id FROM teacher_records WHERE id = ?', [teacherId])) throw new HttpError(404, 'Data guru tidak ditemukan.');
  // Validasi seluruh rentang lain terlebih dahulu agar permintaan gagal tidak mengubah tarif lama.
  const priorOpen = await one(`SELECT id, effective_from FROM teacher_hourly_rates
    WHERE teacher_record_id = ? AND effective_to IS NULL AND effective_from < ? ORDER BY effective_from DESC LIMIT 1`,
    [teacherId, effectiveFrom]);
  const overlap = await one(`SELECT id FROM teacher_hourly_rates WHERE teacher_record_id = ?
    AND (? IS NULL OR id <> ?)
    AND effective_from <= COALESCE(?, '9999-12-31') AND COALESCE(effective_to, '9999-12-31') >= ? LIMIT 1`,
    [teacherId, priorOpen ? priorOpen.id : null, priorOpen ? priorOpen.id : null, effectiveTo, effectiveFrom]);
  if (overlap) throw new HttpError(409, 'Rentang tarif bertabrakan dengan tarif yang sudah ada.', 'RATE_OVERLAP');
  if (priorOpen) {
    const dayBefore = new Date(`${effectiveFrom}T00:00:00Z`);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    const closeOn = dayBefore.toISOString().slice(0, 10);
    await query('UPDATE teacher_hourly_rates SET effective_to = ? WHERE id = ?', [closeOn, priorOpen.id]);
    await audit(req, 'payroll.rate.closed', 'teacher_hourly_rate', priorOpen.id, { effective_to: closeOn, replaced_by_effective_from: effectiveFrom });
  }
  const result = await query('INSERT INTO teacher_hourly_rates (teacher_record_id, hourly_rate, effective_from, effective_to, created_by) VALUES (?,?,?,?,?)',
    [teacherId, rate, effectiveFrom, effectiveTo, req.user.id]);
  await audit(req, 'payroll.rate.created', 'teacher_hourly_rate', result.insertId, { teacher_record_id: teacherId, hourly_rate: rate, effective_from: effectiveFrom });
  res.status(201).json({ message: 'Tarif honor disimpan.', data: { id: result.insertId } });
}));

router.get('/teachers', requirePerm('honor.manage'), asyncHandler(async (req, res) => {
  res.json({ data: await query(`SELECT id, full_name, employee_number FROM teacher_records WHERE employment_status = 'active' ORDER BY full_name`) });
}));

router.get('/assignments/me', requirePerm('honor.self'), asyncHandler(async (req, res) => {
  const teacher = await ownTeacher(req.user.id);
  if (!teacher) throw new HttpError(403, 'Akun ini belum terhubung ke data guru.');
  const rows = await query(`SELECT a.id, c.name AS class_name, s.name AS subject_name
    FROM teaching_assignments a JOIN classes c ON c.id = a.class_id JOIN subjects s ON s.id = a.subject_id
    WHERE a.teacher_record_id = ? ORDER BY c.name, s.name`, [teacher.id]);
  res.json({ data: rows });
}));

router.get('/realizations', asyncHandler(async (req, res) => {
  if (!req.user.permissions.includes('honor.manage') && !req.user.permissions.includes('honor.realization.verify')) {
    const teacher = await ownTeacher(req.user.id);
    if (!teacher) throw new HttpError(403, 'Akses data realisasi ditolak.');
    const rows = await query(`SELECT r.*, s.name AS subject_name, c.name AS class_name
      FROM teacher_teaching_realizations r JOIN teaching_assignments a ON a.id = r.teaching_assignment_id
      JOIN subjects s ON s.id = a.subject_id JOIN classes c ON c.id = a.class_id
      WHERE r.teacher_record_id = ? ORDER BY r.teaching_date DESC, r.starts_at DESC LIMIT 300`, [teacher.id]);
    return res.json({ data: rows });
  }
  const rows = await query(`SELECT r.*, t.full_name, s.name AS subject_name, c.name AS class_name
    FROM teacher_teaching_realizations r JOIN teacher_records t ON t.id = r.teacher_record_id
    JOIN teaching_assignments a ON a.id = r.teaching_assignment_id JOIN subjects s ON s.id = a.subject_id
    JOIN classes c ON c.id = a.class_id ORDER BY r.teaching_date DESC, r.starts_at DESC LIMIT 500`);
  res.json({ data: rows });
}));

router.post('/realizations', requirePerm('honor.self'), asyncHandler(async (req, res) => {
  const teacher = await ownTeacher(req.user.id);
  if (!teacher) throw new HttpError(403, 'Akun ini belum terhubung ke data guru.');
  const assignmentId = Number(req.body.teaching_assignment_id);
  const date = req.body.teaching_date;
  const start = req.body.starts_at;
  const end = req.body.ends_at;
  const hours = durationHours(start, end);
  if (!Number.isInteger(assignmentId) || assignmentId < 1 || !dateOk(date) || !hours) bad('Penugasan, tanggal, dan rentang jam mengajar yang valid wajib diisi.');
  const assignment = await one('SELECT id FROM teaching_assignments WHERE id = ? AND teacher_record_id = ?', [assignmentId, teacher.id]);
  if (!assignment) throw new HttpError(403, 'Penugasan mengajar bukan milik akun ini.');
  const existing = await one(`SELECT id FROM teacher_teaching_realizations
    WHERE teacher_record_id = ? AND teaching_date = ? AND starts_at < ? AND ends_at > ? LIMIT 1`,
    [teacher.id, date, end, start]);
  if (existing) throw new HttpError(409, 'Jam realisasi bertabrakan dengan catatan mengajar lain pada tanggal tersebut.');
  const result = await query(`INSERT INTO teacher_teaching_realizations
    (teacher_record_id, teaching_assignment_id, teaching_date, starts_at, ends_at, hours, notes, submitted_by)
    VALUES (?,?,?,?,?,?,?,?)`, [teacher.id, assignmentId, date, start, end, hours, String(req.body.notes || '').trim() || null, req.user.id]);
  await audit(req, 'payroll.realization.submitted', 'teacher_teaching_realization', result.insertId, { teacher_record_id: teacher.id, teaching_date: date, hours });
  res.status(201).json({ message: 'Realisasi mengajar dikirim untuk verifikasi.', data: { id: result.insertId, hours } });
}));

router.post('/realizations/:id/verify', requirePerm('honor.realization.verify'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const status = req.body.status;
  const note = String(req.body.note || '').trim();
  if (!Number.isInteger(id) || !['verified', 'rejected'].includes(status)) bad('Status verifikasi tidak valid.');
  if (status === 'rejected' && !note) bad('Alasan penolakan wajib diisi.');
  const realization = await one('SELECT * FROM teacher_teaching_realizations WHERE id = ?', [id]);
  if (!realization) throw new HttpError(404, 'Realisasi tidak ditemukan.');
  const used = await one(`SELECT d.id FROM teacher_payroll_details d JOIN teacher_payroll_periods p ON p.id = d.period_id
    WHERE JSON_CONTAINS(d.realization_ids_json, CAST(? AS JSON)) AND p.status IN ('pending_approval','approved','paid') LIMIT 1`, [JSON.stringify(id)]);
  if (used) throw new HttpError(409, 'Realisasi sudah masuk penggajian dan tidak dapat diubah.');
  await query(`UPDATE teacher_teaching_realizations SET status = ?, verified_by = ?, verified_at = NOW(), verification_note = ? WHERE id = ?`,
    [status, req.user.id, note || null, id]);
  await audit(req, `payroll.realization.${status}`, 'teacher_teaching_realization', id, { previous_status: realization.status, status, note });
  res.json({ message: status === 'verified' ? 'Realisasi diverifikasi.' : 'Realisasi ditolak.' });
}));

router.get('/periods', asyncHandler(async (req, res) => {
  const rows = await query(`SELECT p.*, u.full_name AS creator_name,
    (SELECT COUNT(*) FROM teacher_payroll_details d WHERE d.period_id = p.id) AS teacher_count,
    (SELECT COALESCE(SUM(d.gross_amount),0) FROM teacher_payroll_details d WHERE d.period_id = p.id) AS total_amount
    FROM teacher_payroll_periods p JOIN users u ON u.id = p.created_by ORDER BY p.starts_on DESC`);
  if (req.user.permissions.includes('honor.manage')) return res.json({ data: rows });
  const teacher = await ownTeacher(req.user.id);
  if (!teacher) throw new HttpError(403, 'Akses data honor ditolak.');
  const slips = await query(`SELECT p.id AS period_id, p.name, p.starts_on, p.ends_on, p.status, d.actual_hours, d.gross_amount
    FROM teacher_payroll_periods p JOIN teacher_payroll_details d ON d.period_id = p.id
    WHERE d.teacher_record_id = ? AND p.status IN ('approved','paid') ORDER BY p.starts_on DESC`, [teacher.id]);
  res.json({ data: slips });
}));

router.post('/periods', requirePerm('honor.manage'), asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const starts = req.body.starts_on;
  const ends = req.body.ends_on;
  if (!name || name.length > 100 || !dateOk(starts) || !dateOk(ends) || ends < starts) bad('Nama dan rentang periode yang valid wajib diisi.');
  const conflict = await one(`SELECT id FROM teacher_payroll_periods WHERE starts_on <= ? AND ends_on >= ? LIMIT 1`, [ends, starts]);
  if (conflict) throw new HttpError(409, 'Periode penggajian bertabrakan dengan periode yang sudah ada.');
  const result = await query('INSERT INTO teacher_payroll_periods (name, starts_on, ends_on, created_by) VALUES (?,?,?,?)', [name, starts, ends, req.user.id]);
  await audit(req, 'payroll.period.created', 'teacher_payroll_period', result.insertId, { name, starts_on: starts, ends_on: ends });
  res.status(201).json({ message: 'Periode penggajian dibuat.', data: { id: result.insertId } });
}));

router.post('/periods/:id/calculate', requirePerm('honor.manage'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const period = await getPeriod(id);
  if (period.status !== 'draft') throw new HttpError(409, 'Perhitungan hanya dapat dibuat saat periode berstatus draft.');
  const missingRate = await one(`SELECT COUNT(*) AS n FROM teacher_teaching_realizations r
    WHERE r.status = 'verified' AND r.teaching_date BETWEEN ? AND ?
      AND NOT EXISTS (SELECT 1 FROM teacher_hourly_rates rate WHERE rate.teacher_record_id = r.teacher_record_id
        AND rate.effective_from <= r.teaching_date AND (rate.effective_to IS NULL OR rate.effective_to >= r.teaching_date))`,
    [period.starts_on, period.ends_on]);
  if (Number(missingRate.n) > 0) throw new HttpError(422, `${missingRate.n} realisasi terverifikasi belum memiliki tarif efektif. Lengkapi tarif sebelum menghitung honor.`);
  const realizations = await query(`SELECT r.id, r.teacher_record_id, r.teaching_date, r.hours,
      rate.hourly_rate, t.full_name
    FROM teacher_teaching_realizations r JOIN teacher_records t ON t.id = r.teacher_record_id
    JOIN teacher_hourly_rates rate ON rate.teacher_record_id = r.teacher_record_id
      AND rate.effective_from <= r.teaching_date AND (rate.effective_to IS NULL OR rate.effective_to >= r.teaching_date)
    WHERE r.status = 'verified' AND r.teaching_date BETWEEN ? AND ?
    ORDER BY r.teacher_record_id, r.teaching_date, r.id`, [period.starts_on, period.ends_on]);
  const byTeacher = new Map();
  for (const r of realizations) {
    const item = byTeacher.get(r.teacher_record_id) || { teacher_record_id: r.teacher_record_id, full_name: r.full_name, hours: 0, gross: 0, ids: [], breakdown: [] };
    const h = num(r.hours), rate = num(r.hourly_rate);
    item.hours += h; item.gross += h * rate; item.ids.push(Number(r.id));
    item.breakdown.push({ realization_id: Number(r.id), date: r.teaching_date, hours: h, hourly_rate: rate, amount: Math.round(h * rate * 100) / 100 });
    byTeacher.set(r.teacher_record_id, item);
  }
  if (!realizations.length) throw new HttpError(422, 'Tidak ada realisasi mengajar terverifikasi dengan tarif yang berlaku pada periode ini.');
  await withTransaction(async (conn) => {
    await query('DELETE FROM teacher_payroll_details WHERE period_id = ?', [id], conn);
    for (const item of byTeacher.values()) {
      const avgRate = item.hours ? item.gross / item.hours : 0;
      await query(`INSERT INTO teacher_payroll_details
        (period_id, teacher_record_id, actual_hours, hourly_rate_snapshot, gross_amount, realization_ids_json)
        VALUES (?,?,?,?,?,?)`, [id, item.teacher_record_id, item.hours, avgRate, Math.round(item.gross * 100) / 100, JSON.stringify(item.ids)], conn);
      item.gross = Math.round(item.gross * 100) / 100;
    }
    await query("UPDATE teacher_payroll_periods SET status = 'pending_approval', admin_approved_by = NULL, admin_approved_at = NULL, principal_approved_by = NULL, principal_approved_at = NULL, foundation_approved_by = NULL, foundation_approved_at = NULL WHERE id = ?", [id], conn);
    await audit(req, 'payroll.period.calculated', 'teacher_payroll_period', id, { teacher_count: byTeacher.size, total_amount: [...byTeacher.values()].reduce((a, x) => a + x.gross, 0) }, conn);
  });
  res.json({ message: 'Honor dihitung dari realisasi mengajar terverifikasi dan tarif efektif per tanggal.', data: { teacher_count: byTeacher.size } });
}));

router.get('/periods/:id/details', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const period = await getPeriod(id);
  const allowed = req.user.permissions.includes('honor.manage');
  if (!allowed) {
    const teacher = await ownTeacher(req.user.id);
    if (!teacher || !['approved', 'paid'].includes(period.status)) throw new HttpError(403, 'Rincian honor belum tersedia untuk akun ini.');
    return res.json({ data: (await periodDetails(id)).filter((d) => Number(d.teacher_record_id) === Number(teacher.id)) });
  }
  res.json({ data: await periodDetails(id) });
}));

router.post('/periods/:id/approve', requirePerm('honor.approve'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const decision = req.body.decision;
  const note = String(req.body.note || '').trim();
  const period = await getPeriod(id);
  if (period.status !== 'pending_approval') throw new HttpError(409, 'Periode belum menunggu persetujuan Admin.');
  if (!['approve', 'reject'].includes(decision)) bad('Keputusan tidak valid.');
  if (decision === 'reject' && !note) bad('Alasan pengembalian wajib diisi.');
  if (decision === 'reject') {
    await query(`UPDATE teacher_payroll_periods SET status='draft', admin_approved_by=NULL, admin_approved_at=NULL,
      principal_approved_by=NULL, principal_approved_at=NULL, foundation_approved_by=NULL, foundation_approved_at=NULL,
      payment_notes=? WHERE id=? AND status='pending_approval'`, [note, id]);
    await audit(req, 'payroll.period.returned', 'teacher_payroll_period', id, { note, returned_by_role: req.user.role });
    return res.json({ message: 'Periode dikembalikan untuk koreksi. Setelah data diperbaiki, hitung ulang dan ajukan ke Admin kembali.' });
  }
  const result = await query(`UPDATE teacher_payroll_periods SET status='approved', admin_approved_by=?, admin_approved_at=NOW(),
    principal_approved_by=NULL, principal_approved_at=NULL, foundation_approved_by=NULL, foundation_approved_at=NULL
    WHERE id=? AND status='pending_approval'`, [req.user.id, id]);
  if (!result.affectedRows) throw new HttpError(409, 'Status periode berubah. Muat ulang lalu periksa kembali.');
  await audit(req, 'payroll.period.approved', 'teacher_payroll_period', id, { approval_role: 'admin', status: 'approved' });
  res.json({ message: 'Periode honor disetujui Admin. Pembayaran dapat dicatat setelah pemeriksaan sesuai kebijakan sekolah.' });
}));

router.post('/periods/:id/pay', requirePerm('honor.manage'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const period = await getPeriod(id);
  if (period.status !== 'approved' || !period.admin_approved_by) throw new HttpError(409, 'Pembayaran hanya dapat dicatat setelah persetujuan Admin tercatat.');
  const reference = String(req.body.payment_reference || '').trim();
  const notes = String(req.body.payment_notes || '').trim();
  if (reference.length > 100 || notes.length > 500) bad('Referensi atau catatan pembayaran terlalu panjang.');
  await query("UPDATE teacher_payroll_periods SET status = 'paid', paid_by = ?, paid_at = NOW(), payment_reference = ?, payment_notes = ? WHERE id = ? AND status = 'approved'",
    [req.user.id, reference || null, notes || null, id]);
  await audit(req, 'payroll.period.paid', 'teacher_payroll_period', id, { payment_reference: reference || null });
  res.json({ message: 'Pembayaran honor dicatat. Periode dan rincian yang sudah dibayar tidak dapat dihitung ulang.' });
}));

router.get('/me/payslips', requirePerm('honor.self'), asyncHandler(async (req, res) => {
  const teacher = await ownTeacher(req.user.id);
  if (!teacher) throw new HttpError(403, 'Akun ini belum terhubung ke data guru.');
  const rows = await query(`SELECT p.id AS period_id, p.name, p.starts_on, p.ends_on, p.status, p.paid_at, p.payment_reference,
      d.actual_hours, d.hourly_rate_snapshot, d.gross_amount, d.realization_ids_json
    FROM teacher_payroll_periods p JOIN teacher_payroll_details d ON d.period_id = p.id
    WHERE d.teacher_record_id = ? AND p.status = 'paid' ORDER BY p.starts_on DESC`, [teacher.id]);
  res.json({ data: rows });
}));

module.exports = router;
