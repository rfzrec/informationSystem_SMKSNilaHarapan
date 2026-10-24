const express = require('express');
const { z } = require('zod');
const { query, one, withTransaction } = require('../config/db');
const { asyncHandler, HttpError, parsePaging } = require('../utils/http');
const { validate } = require('../middleware/validate');
const { requireAuth, requirePerm, can } = require('../middleware/auth');
const { audit } = require('../utils/audit');

const router = express.Router();
router.use(requireAuth);

const periodSchema = z.object({
  academic_year_id: z.coerce.number().int().positive(), semester: z.coerce.number().int().min(1).max(2),
  period_type: z.enum(['monthly', 'uts', 'uas']), period_number: z.union([z.coerce.number().int().min(1).max(12), z.null()]).optional().default(null),
  label: z.string().trim().min(2).max(100), starts_on: z.string().date().nullable().optional(), ends_on: z.string().date().nullable().optional(),
  task_weight: z.coerce.number().min(0).max(100).optional().default(40), exam_weight: z.coerce.number().min(0).max(100).optional().default(60),
  status: z.enum(['draft', 'open', 'closed', 'locked']).optional().default('draft'),
}).refine((v) => Math.round((v.task_weight + v.exam_weight) * 100) / 100 === 100, { message: 'Bobot tugas dan ujian harus berjumlah 100%.', path: ['exam_weight'] })
  .refine((v) => (v.period_type === 'monthly' ? Number.isInteger(v.period_number) : v.period_number === null), { message: 'Periode bulanan wajib memiliki nomor bulan; UTS/UAS tidak menggunakan nomor bulan.', path: ['period_number'] });

const scoresSchema = z.array(z.object({
  student_record_id: z.coerce.number().int().positive(),
  component: z.enum(['task', 'monthly_exam', 'uts', 'uas']),
  item_label: z.string().trim().max(160).optional().default(''),
  score: z.number().min(0).max(100).nullable(),
  notes: z.string().trim().max(500).optional().default(''),
})).min(1).max(5000);

async function currentTeacherId(userId) {
  const row = await one('SELECT id FROM teacher_records WHERE user_id = ? AND employment_status = \'active\'', [userId]);
  return row ? Number(row.id) : null;
}
async function assignedTeacher(assignmentId, user, conn) {
  const row = await one(`SELECT ta.id, ta.class_id, ta.subject_id, ta.teacher_record_id, c.academic_year_id, s.name AS subject_name, c.name AS class_name
    FROM teaching_assignments ta JOIN classes c ON c.id = ta.class_id JOIN subjects s ON s.id = ta.subject_id WHERE ta.id = ?`, [assignmentId], conn);
  if (!row) throw new HttpError(404, 'Penugasan mengajar tidak ditemukan.', 'ASSIGNMENT_NOT_FOUND');
  const teacherId = await currentTeacherId(user.id);
  if (!teacherId || Number(row.teacher_record_id) !== teacherId) throw new HttpError(403, 'Hanya guru yang tercatat pada penugasan ini yang boleh memasukkan atau mengirim nilai. Admin harus menggunakan proses review, bukan menyamar sebagai guru.', 'ASSIGNMENT_FORBIDDEN');
  return row;
}
async function assertClassAccess(classId, user, conn) {
  if (can(user, 'academic.setup')) return;
  const teacherId = await currentTeacherId(user.id);
  if (!teacherId) throw new HttpError(403, 'Akun tidak terhubung dengan data guru.', 'TEACHER_PROFILE_REQUIRED');
  const linked = await one(`SELECT c.id FROM classes c LEFT JOIN class_homeroom_assignments h ON h.class_id = c.id
    WHERE c.id = ? AND (c.homeroom_teacher_id = ? OR (h.teacher_record_id = ? AND h.starts_on <= CURDATE() AND (h.ends_on IS NULL OR h.ends_on >= CURDATE()))) LIMIT 1`, [classId, teacherId, teacherId], conn);
  if (!linked) throw new HttpError(403, 'Kelas ini bukan tanggung jawab wali kelas akun Anda.', 'HOMEROOM_FORBIDDEN');
}
async function assertAssignedHomeroom(classId, user, conn) {
  const teacherId = await currentTeacherId(user.id);
  if (!teacherId) throw new HttpError(403, 'Hanya guru yang memiliki penugasan wali kelas aktif yang boleh menyetujui nilai dan menyiapkan paket rapor.', 'HOMEROOM_FORBIDDEN');
  const linked = await one(`SELECT c.id FROM classes c LEFT JOIN class_homeroom_assignments h ON h.class_id=c.id
    WHERE c.id=? AND (c.homeroom_teacher_id=? OR (h.teacher_record_id=? AND h.starts_on<=CURDATE() AND (h.ends_on IS NULL OR h.ends_on>=CURDATE()))) LIMIT 1`, [classId, teacherId, teacherId], conn);
  if (!linked) throw new HttpError(403, 'Guru tidak ditugaskan sebagai wali kelas pada kelas ini.', 'HOMEROOM_FORBIDDEN');
}

async function checkPeriodType(period, records) {
  const allowed = period.period_type === 'monthly' ? ['task', 'monthly_exam'] : [period.period_type];
  if (records.some((x) => !allowed.includes(x.component))) throw new HttpError(422, `Komponen nilai tidak sesuai dengan periode ${period.period_type}.`, 'COMPONENT_PERIOD_MISMATCH');
  if (records.some((x) => x.component === 'task' && !x.item_label)) throw new HttpError(422, 'Setiap nilai tugas harus memiliki nama tugas.', 'TASK_LABEL_REQUIRED');
}
async function verifyRoster(classId, studentIds, conn) {
  const roster = await query(`SELECT DISTINCT student_record_id FROM student_class_enrollments WHERE class_id = ? AND status = 'active' AND ended_on IS NULL`, [classId], conn);
  const set = new Set(roster.map((x) => Number(x.student_record_id)));
  const invalid = [...new Set(studentIds)].filter((id) => !set.has(Number(id)));
  if (invalid.length) throw new HttpError(422, 'Sebagian siswa tidak termasuk dalam roster aktif kelas ini.', 'STUDENT_NOT_IN_CLASS', { invalid_student_ids: invalid });
  if (!set.size) throw new HttpError(409, 'Kelas belum memiliki roster siswa aktif.', 'EMPTY_ROSTER');
  return [...set];
}
async function checkSubmissionComplete(submissionId, classId, periodType, conn) {
  const roster = await query(`SELECT DISTINCT student_record_id FROM student_class_enrollments WHERE class_id = ? AND status = 'active' AND ended_on IS NULL`, [classId], conn);
  const scores = await query('SELECT student_record_id, component, item_label, score FROM assessment_scores WHERE submission_id = ?', [submissionId], conn);
  const missing = [];
  for (const st of roster) {
    const own = scores.filter((s) => Number(s.student_record_id) === Number(st.student_record_id));
    if (periodType === 'monthly') {
      if (!own.some((s) => s.component === 'task' && s.score !== null && s.score !== '')) missing.push({ student_record_id: st.student_record_id, component: 'task' });
      if (!own.some((s) => s.component === 'monthly_exam' && s.score !== null && s.score !== '')) missing.push({ student_record_id: st.student_record_id, component: 'monthly_exam' });
    } else if (!own.some((s) => s.component === periodType && s.score !== null && s.score !== '')) {
      missing.push({ student_record_id: st.student_record_id, component: periodType });
    }
  }
  return missing;
}

router.get('/periods', asyncHandler(async (req, res) => {
  const params = [];
  let where = '1=1';
  if (!can(req.user, 'academic.setup')) where += " AND status IN ('open','closed','locked')";
  if (req.query.academic_year_id) { where += ' AND academic_year_id = ?'; params.push(Number(req.query.academic_year_id)); }
  const data = await query(`SELECT p.*, y.name AS academic_year FROM assessment_periods p JOIN academic_years y ON y.id = p.academic_year_id WHERE ${where} ORDER BY y.starts_on DESC, p.semester DESC, p.period_type, p.period_number DESC`, params);
  res.json({ data });
}));

router.post('/periods', requirePerm('academic.setup'), validate(periodSchema), asyncHandler(async (req, res) => {
  const v = req.valid;
  if (v.period_type !== 'monthly' && (v.task_weight !== 40 || v.exam_weight !== 60)) {
    // Keep non-monthly periods neutral; weights only apply to monthly report calculations.
    if (v.task_weight + v.exam_weight !== 100) throw new HttpError(422, 'Bobot periode harus berjumlah 100%.', 'INVALID_WEIGHTS');
  }
  const result = await query(`INSERT INTO assessment_periods (academic_year_id, semester, period_type, period_number, label, starts_on, ends_on, task_weight, exam_weight, status, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [v.academic_year_id, v.semester, v.period_type, v.period_number, v.label, v.starts_on || null, v.ends_on || null, v.task_weight, v.exam_weight, v.status, req.user.id]);
  await audit(req, 'assessment.period.create', 'assessment_period', result.insertId, { period_type: v.period_type, semester: v.semester });
  res.status(201).json({ data: { id: result.insertId }, message: 'Periode penilaian dibuat.' });
}));

router.put('/periods/:id(\\d+)/status', requirePerm('academic.setup'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const next = String(req.body.status || '');
  if (!['open', 'closed', 'locked'].includes(next)) {
    throw new HttpError(422, 'Status periode harus open, closed, atau locked.', 'INVALID_PERIOD_STATUS');
  }
  const current = await one('SELECT id,status FROM assessment_periods WHERE id=?', [id]);
  if (!current) throw new HttpError(404, 'Periode penilaian tidak ditemukan.', 'ASSESSMENT_PERIOD_NOT_FOUND');
  const allowed = { draft: ['open'], open: ['closed'], closed: ['locked'], locked: [] };
  if (!(allowed[current.status] || []).includes(next)) {
    throw new HttpError(409, `Transisi status periode ${current.status} ke ${next} tidak diizinkan.`, 'INVALID_PERIOD_TRANSITION');
  }
  await query('UPDATE assessment_periods SET status=? WHERE id=?', [next, id]);
  await audit(req, 'assessment.period.status', 'assessment_period', id, { previous_status: current.status, status: next });
  res.json({ message: 'Status periode diperbarui.', data: { id, status: next } });
}));

router.get('/assignments/mine', requirePerm('grades.manage'), asyncHandler(async (req, res) => {
  const teacherId = await currentTeacherId(req.user.id);
  if (!teacherId && !can(req.user, 'academic.setup')) throw new HttpError(403, 'Akun guru belum terhubung ke data guru.', 'TEACHER_PROFILE_REQUIRED');
  const params = [];
  let where = '1=1';
  if (!can(req.user, 'academic.setup')) { where += ' AND ta.teacher_record_id = ?'; params.push(teacherId); }
  const data = await query(`SELECT ta.id AS teaching_assignment_id, ta.class_id, c.name AS class_name, c.academic_year_id, y.name AS academic_year,
    ta.subject_id, s.code AS subject_code, s.name AS subject_name, ta.teacher_record_id, tr.full_name AS teacher_name
    FROM teaching_assignments ta JOIN classes c ON c.id=ta.class_id JOIN academic_years y ON y.id=c.academic_year_id
    JOIN subjects s ON s.id=ta.subject_id JOIN teacher_records tr ON tr.id=ta.teacher_record_id
    WHERE ${where} ORDER BY y.starts_on DESC, c.grade_level, c.name, s.name`, params);
  res.json({ data });
}));

router.get('/assignments/:assignmentId(\\d+)/roster', requirePerm('grades.manage'), asyncHandler(async (req, res) => {
  const assignmentId = Number(req.params.assignmentId);
  const assignment = await assignedTeacher(assignmentId, req.user);
  const periodId = Number(req.query.period_id || 0);
  const roster = await query(`SELECT st.id AS student_record_id, st.student_number, st.full_name FROM student_class_enrollments e
    JOIN student_records st ON st.id=e.student_record_id WHERE e.class_id=? AND e.status='active' AND e.ended_on IS NULL ORDER BY st.full_name`, [assignment.class_id]);
  let submission = null; let scores = [];
  if (periodId) {
    submission = await one('SELECT id,status FROM assessment_submissions WHERE period_id=? AND teaching_assignment_id=?', [periodId, assignmentId]);
    if (submission) scores = await query('SELECT student_record_id,component,item_label,score,notes FROM assessment_scores WHERE submission_id=?', [submission.id]);
  }
  res.json({ data: { assignment, roster, submission, scores } });
}));

router.get('/submissions', requirePerm('grades.manage', 'assessments.review'), asyncHandler(async (req, res) => {
  const params = [];
  let where = '1=1';
  if (req.query.period_id) { where += ' AND sub.period_id = ?'; params.push(Number(req.query.period_id)); }
  if (!can(req.user, 'academic.setup')) {
    const teacherId = await currentTeacherId(req.user.id);
    if (can(req.user, 'attendance.homeroom.manage')) {
      where += ` AND EXISTS (SELECT 1 FROM classes hxclass LEFT JOIN class_homeroom_assignments hx ON hx.class_id=hxclass.id WHERE hxclass.id=ta.class_id AND (hxclass.homeroom_teacher_id=? OR (hx.teacher_record_id=? AND hx.starts_on<=CURDATE() AND (hx.ends_on IS NULL OR hx.ends_on>=CURDATE()))))`;
      params.push(teacherId || 0, teacherId || 0);
    } else { where += ' AND ta.teacher_record_id = ?'; params.push(teacherId || 0); }
  }
  const data = await query(`SELECT sub.*, p.label AS period_label, p.period_type, p.semester, c.id AS class_id, c.name AS class_name,
    s.name AS subject_name, tr.full_name AS teacher_name
    FROM assessment_submissions sub JOIN assessment_periods p ON p.id=sub.period_id
    JOIN teaching_assignments ta ON ta.id=sub.teaching_assignment_id JOIN classes c ON c.id=ta.class_id
    JOIN subjects s ON s.id=ta.subject_id JOIN teacher_records tr ON tr.id=ta.teacher_record_id
    WHERE ${where} ORDER BY sub.updated_at DESC`, params);
  res.json({ data });
}));

router.post('/submissions', requirePerm('grades.manage'), validate(z.object({
  period_id: z.coerce.number().int().positive(), teaching_assignment_id: z.coerce.number().int().positive(),
  scores: scoresSchema,
})), asyncHandler(async (req, res) => {
  const { period_id, teaching_assignment_id, scores } = req.valid;
  const assignment = await assignedTeacher(teaching_assignment_id, req.user);
  const period = await one('SELECT * FROM assessment_periods WHERE id = ?', [period_id]);
  if (!period) throw new HttpError(404, 'Periode penilaian tidak ditemukan.', 'PERIOD_NOT_FOUND');
  if (period.status !== 'open') throw new HttpError(409, 'Periode nilai tidak sedang dibuka.', 'PERIOD_CLOSED');
  if (Number(period.academic_year_id) !== Number(assignment.academic_year_id)) throw new HttpError(409, 'Periode dan tahun ajaran penugasan tidak cocok.', 'ACADEMIC_YEAR_MISMATCH');
  await checkPeriodType(period, scores);
  await withTransaction(async (conn) => {
    await verifyRoster(assignment.class_id, scores.map((s) => s.student_record_id), conn);
    let submission = await one('SELECT * FROM assessment_submissions WHERE period_id=? AND teaching_assignment_id=? FOR UPDATE', [period_id, teaching_assignment_id], conn);
    if (submission && !['draft', 'returned_to_teacher'].includes(submission.status)) {
      throw new HttpError(409, 'Nilai sudah dikirim ke tahap review; gunakan proses pengembalian untuk melakukan koreksi.', 'SUBMISSION_LOCKED');
    }
    if (!submission) {
      const ins = await query('INSERT INTO assessment_submissions (period_id, teaching_assignment_id, status) VALUES (?,?,\'draft\')', [period_id, teaching_assignment_id], conn);
      submission = { id: ins.insertId };
    }
    for (const s of scores) {
      const item = s.component === 'task' ? s.item_label : (s.item_label || (s.component === 'monthly_exam' ? 'Ujian Bulanan' : s.component.toUpperCase()));
      await query(`INSERT INTO assessment_scores (submission_id, student_record_id, component, item_label, score, notes, entered_by, updated_by)
        VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE score=VALUES(score), notes=VALUES(notes), updated_by=VALUES(updated_by)`,
      [submission.id, s.student_record_id, s.component, item, s.score, s.notes || null, req.user.id, req.user.id], conn);
    }
    await query("UPDATE assessment_submissions SET status='draft', review_reason=NULL, reviewed_by=NULL, reviewed_at=NULL WHERE id=?", [submission.id], conn);
    await audit(req, 'assessment.scores.save', 'assessment_submission', submission.id, { score_rows: scores.length, class_id: assignment.class_id, subject_id: assignment.subject_id }, conn);
    req.submissionId = submission.id;
  });
  res.status(201).json({ data: { id: req.submissionId, status: 'draft' }, message: 'Nilai tersimpan sebagai draft.' });
}));

router.post('/submissions/:id(\\d+)/submit', requirePerm('grades.manage'), asyncHandler(async (req, res) => {
  const sub = await one(`SELECT sub.*, p.period_type, p.status AS period_status, ta.class_id FROM assessment_submissions sub
    JOIN assessment_periods p ON p.id=sub.period_id JOIN teaching_assignments ta ON ta.id=sub.teaching_assignment_id WHERE sub.id=?`, [Number(req.params.id)]);
  if (!sub) throw new HttpError(404, 'Pengajuan nilai tidak ditemukan.', 'NOT_FOUND');
  await assignedTeacher(sub.teaching_assignment_id, req.user);
  if (sub.period_status !== 'open') throw new HttpError(409, 'Periode nilai sudah ditutup.', 'PERIOD_CLOSED');
  if (!['draft', 'returned_to_teacher'].includes(sub.status)) throw new HttpError(409, 'Status pengajuan tidak dapat dikirim ulang.', 'INVALID_SUBMISSION_STATUS');
  const missing = await checkSubmissionComplete(sub.id, sub.class_id, sub.period_type);
  if (missing.length) throw new HttpError(422, 'Nilai belum lengkap untuk seluruh siswa pada kelas ini.', 'GRADES_INCOMPLETE', { missing });
  await query("UPDATE assessment_submissions SET status='submitted_to_homeroom', submitted_by=?, submitted_at=NOW(), reviewed_by=NULL, reviewed_at=NULL, review_reason=NULL WHERE id=?", [req.user.id, sub.id]);
  await audit(req, 'assessment.submission.submit', 'assessment_submission', sub.id, { class_id: sub.class_id });
  res.json({ message: 'Nilai dikirim kepada wali kelas untuk ditinjau.' });
}));

router.post('/submissions/:id(\\d+)/review', requirePerm('assessments.review', 'attendance.homeroom.manage'), validate(z.object({ action: z.enum(['approve', 'return']), reason: z.string().trim().max(1000).optional().default('') })), asyncHandler(async (req, res) => {
  const sub = await one(`SELECT sub.*, ta.class_id FROM assessment_submissions sub JOIN teaching_assignments ta ON ta.id=sub.teaching_assignment_id WHERE sub.id=?`, [Number(req.params.id)]);
  if (!sub) throw new HttpError(404, 'Pengajuan nilai tidak ditemukan.', 'NOT_FOUND');
  await assertAssignedHomeroom(sub.class_id, req.user);
  if (sub.status !== 'submitted_to_homeroom') throw new HttpError(409, 'Pengajuan belum menunggu review wali kelas.', 'INVALID_SUBMISSION_STATUS');
  if (req.valid.action === 'return' && !req.valid.reason.trim()) throw new HttpError(422, 'Alasan pengembalian wajib diisi.', 'REASON_REQUIRED');
  const status = req.valid.action === 'approve' ? 'approved_by_homeroom' : 'returned_to_teacher';
  await query('UPDATE assessment_submissions SET status=?, reviewed_by=?, reviewed_at=NOW(), review_reason=? WHERE id=?', [status, req.user.id, req.valid.action === 'return' ? req.valid.reason : null, sub.id]);
  await audit(req, `assessment.submission.${req.valid.action}`, 'assessment_submission', sub.id, { reason: req.valid.reason || null, class_id: sub.class_id });
  res.json({ message: req.valid.action === 'approve' ? 'Nilai mata pelajaran disetujui untuk rekap rapor.' : 'Nilai dikembalikan kepada guru dengan alasan koreksi.' });
}));

router.get('/homeroom/classes', requirePerm('attendance.homeroom.manage', 'assessments.review'), asyncHandler(async (req, res) => {
  if (can(req.user, 'academic.setup')) {
    return res.json({ data: await query('SELECT c.id, c.name, c.grade_level, c.study_program, y.name AS academic_year FROM classes c JOIN academic_years y ON y.id=c.academic_year_id WHERE c.is_active=1 ORDER BY y.starts_on DESC,c.grade_level,c.name') });
  }
  const tid = await currentTeacherId(req.user.id);
  if (!tid) throw new HttpError(403, 'Akun belum terhubung dengan data guru.', 'TEACHER_PROFILE_REQUIRED');
  const data = await query(`SELECT DISTINCT c.id, c.name, c.grade_level, c.study_program, y.name AS academic_year FROM classes c
    JOIN academic_years y ON y.id=c.academic_year_id LEFT JOIN class_homeroom_assignments h ON h.class_id=c.id
    WHERE c.is_active=1 AND (c.homeroom_teacher_id=? OR (h.teacher_record_id=? AND h.starts_on<=CURDATE() AND (h.ends_on IS NULL OR h.ends_on>=CURDATE())))
    ORDER BY y.starts_on DESC,c.grade_level,c.name`, [tid, tid]);
  res.json({ data });
}));

router.get('/homeroom/:classId(\\d+)/:periodId(\\d+)', requirePerm('attendance.homeroom.manage', 'assessments.review'), asyncHandler(async (req, res) => {
  const classId = Number(req.params.classId); const periodId = Number(req.params.periodId);
  await assertClassAccess(classId, req.user);
  const period = await one('SELECT * FROM assessment_periods WHERE id=?', [periodId]);
  if (!period) throw new HttpError(404, 'Periode tidak ditemukan.', 'PERIOD_NOT_FOUND');
  const submissions = await query(`SELECT sub.id, sub.status, sub.submitted_at, sub.review_reason, ta.id AS assignment_id, s.id AS subject_id, s.code AS subject_code, s.name AS subject_name, tr.full_name AS teacher_name
    FROM teaching_assignments ta JOIN subjects s ON s.id=ta.subject_id JOIN teacher_records tr ON tr.id=ta.teacher_record_id
    LEFT JOIN assessment_submissions sub ON sub.teaching_assignment_id=ta.id AND sub.period_id=? WHERE ta.class_id=? ORDER BY s.name`, [periodId, classId]);
  const roster = await query(`SELECT st.id AS student_record_id, st.student_number, st.full_name FROM student_class_enrollments e JOIN student_records st ON st.id=e.student_record_id
    WHERE e.class_id=? AND e.status='active' AND e.ended_on IS NULL ORDER BY st.full_name`, [classId]);
  res.json({ data: { period, class_id: classId, roster, submissions, missing_subjects: submissions.filter((s) => !s.id || s.status !== 'approved_by_homeroom').map((s) => ({ subject_name: s.subject_name, teacher_name: s.teacher_name, status: s.status || 'not_submitted' })) } });
}));

router.post('/packages/build', requirePerm('attendance.homeroom.manage', 'assessments.review'), validate(z.object({ class_id: z.coerce.number().int().positive(), period_id: z.coerce.number().int().positive() })), asyncHandler(async (req, res) => {
  const { class_id, period_id } = req.valid;
  await assertAssignedHomeroom(class_id, req.user);
  const period = await one('SELECT * FROM assessment_periods WHERE id=?', [period_id]);
  if (!period) throw new HttpError(404, 'Periode penilaian tidak ditemukan.', 'PERIOD_NOT_FOUND');
  const assignments = await query(`SELECT ta.id AS assignment_id, ta.subject_id, s.name AS subject_name, s.code AS subject_code
    FROM teaching_assignments ta JOIN subjects s ON s.id=ta.subject_id WHERE ta.class_id=?`, [class_id]);
  if (!assignments.length) throw new HttpError(409, 'Kelas belum memiliki penugasan mata pelajaran.', 'NO_ASSIGNMENTS');
  const submitted = await query("SELECT teaching_assignment_id FROM assessment_submissions WHERE period_id=? AND status='approved_by_homeroom'", [period_id]);
  const ready = new Set(submitted.map((x) => Number(x.teaching_assignment_id)));
  const missing = assignments.filter((a) => !ready.has(Number(a.assignment_id)));
  if (missing.length) throw new HttpError(409, 'Semua guru mata pelajaran harus mengirim nilai dan wali kelas harus menyetujuinya sebelum paket rapor dibangun.', 'SUBJECTS_NOT_READY', { missing: missing.map((x) => x.subject_name) });
  const roster = await query(`SELECT st.id AS student_record_id FROM student_class_enrollments e JOIN student_records st ON st.id=e.student_record_id
    WHERE e.class_id=? AND e.status='active' AND e.ended_on IS NULL`, [class_id]);
  if (!roster.length) throw new HttpError(409, 'Kelas tidak mempunyai siswa aktif.', 'EMPTY_ROSTER');
  const existing = await one("SELECT id,version_no,status FROM report_card_packages WHERE class_id=? AND period_id=? AND status IN ('draft','returned') ORDER BY version_no DESC LIMIT 1", [class_id, period_id]);
  if (existing && existing.status === 'draft') {
    await query('DELETE FROM report_card_entries WHERE package_id=?', [existing.id]);
    await buildEntries(existing.id, assignments, roster, period);
    await audit(req, 'report.package.rebuild', 'report_card_package', existing.id, { class_id, period_id });
    return res.json({ data: { id: existing.id, version_no: existing.version_no }, message: 'Paket rapor draft diperbarui.' });
  }
  const latest = await one('SELECT MAX(version_no) AS n FROM report_card_packages WHERE class_id=? AND period_id=?', [class_id, period_id]);
  const versionNo = Number(latest && latest.n || 0) + 1;
  const inserted = await query('INSERT INTO report_card_packages (class_id,period_id,version_no,status,created_by) VALUES (?,?,?,\'draft\',?)', [class_id, period_id, versionNo, req.user.id]);
  await buildEntries(inserted.insertId, assignments, roster, period);
  await audit(req, 'report.package.build', 'report_card_package', inserted.insertId, { class_id, period_id, version_no: versionNo });
  res.status(201).json({ data: { id: inserted.insertId, version_no: versionNo }, message: 'Paket rapor kelas dibuat sebagai draft.' });
}));

async function buildEntries(packageId, assignments, roster, period) {
  for (const assignment of assignments) {
    const sub = await one('SELECT id FROM assessment_submissions WHERE period_id=? AND teaching_assignment_id=? AND status=\'approved_by_homeroom\'', [period.id, assignment.assignment_id]);
    const grades = await query('SELECT student_record_id,component,item_label,score,notes FROM assessment_scores WHERE submission_id=?', [sub.id]);
    for (const student of roster) {
      const rows = grades.filter((g) => Number(g.student_record_id) === Number(student.student_record_id));
      const tasks = rows.filter((x) => x.component === 'task' && x.score !== null && x.score !== '');
      const exams = rows.filter((x) => x.component === 'monthly_exam' && x.score !== null && x.score !== '');
      const uts = rows.filter((x) => x.component === 'uts' && x.score !== null && x.score !== '');
      const uas = rows.filter((x) => x.component === 'uas' && x.score !== null && x.score !== '');
      const avg = (list) => list.length ? list.reduce((sum, x) => sum + Number(x.score), 0) / list.length : null;
      const taskAverage = avg(tasks); const monthlyExam = avg(exams); const utsScore = avg(uts); const uasScore = avg(uas);
      let finalScore = null;
      if (period.period_type === 'monthly' && taskAverage !== null && monthlyExam !== null) finalScore = taskAverage * Number(period.task_weight) / 100 + monthlyExam * Number(period.exam_weight) / 100;
      if (period.period_type === 'uts') finalScore = utsScore;
      if (period.period_type === 'uas') finalScore = uasScore;
      const payload = { period_type: period.period_type, items: rows.map((x) => ({ component: x.component, label: x.item_label, score: x.score === null ? null : Number(x.score), notes: x.notes })), task_average: taskAverage, monthly_exam: monthlyExam, uts_score: utsScore, uas_score: uasScore, final_score: finalScore, weights: { task: Number(period.task_weight), exam: Number(period.exam_weight) } };
      await query('INSERT INTO report_card_entries (package_id,student_record_id,subject_id,score_payload,final_score) VALUES (?,?,?,?,?)', [packageId, student.student_record_id, assignment.subject_id, JSON.stringify(payload), finalScore]);
    }
  }
}

router.post('/packages/:id(\\d+)/submit', requirePerm('attendance.homeroom.manage', 'assessments.review'), asyncHandler(async (req, res) => {
  const pkg = await one('SELECT * FROM report_card_packages WHERE id=?', [Number(req.params.id)]);
  if (!pkg) throw new HttpError(404, 'Paket rapor tidak ditemukan.', 'NOT_FOUND');
  await assertAssignedHomeroom(pkg.class_id, req.user);
  if (!['draft', 'returned'].includes(pkg.status)) throw new HttpError(409, 'Paket rapor sudah dikirim atau diterbitkan.', 'INVALID_PACKAGE_STATUS');
  const period = await one('SELECT status FROM assessment_periods WHERE id=?', [pkg.period_id]);
  if (!period || period.status === 'draft') throw new HttpError(409, 'Periode penilaian belum dibuka.', 'PERIOD_NOT_OPEN');
  await query("UPDATE report_card_packages SET status='pending_admin', submitted_at=NOW(), reviewed_by=NULL, reviewed_at=NULL, review_reason=NULL WHERE id=?", [pkg.id]);
  await audit(req, 'report.package.submit', 'report_card_package', pkg.id, { class_id: pkg.class_id, period_id: pkg.period_id, version_no: pkg.version_no });
  res.json({ message: 'Paket rapor dikirim kepada Admin Sekolah.' });
}));

router.post('/packages/:id(\\d+)/review', requirePerm('reports.publish'), validate(z.object({ action: z.enum(['publish', 'return']), reason: z.string().trim().max(1000).optional().default('') })), asyncHandler(async (req, res) => {
  const pkg = await one('SELECT * FROM report_card_packages WHERE id=?', [Number(req.params.id)]);
  if (!pkg) throw new HttpError(404, 'Paket rapor tidak ditemukan.', 'NOT_FOUND');
  if (pkg.status !== 'pending_admin') throw new HttpError(409, 'Paket rapor belum menunggu keputusan Admin Sekolah.', 'INVALID_PACKAGE_STATUS');
  if (req.valid.action === 'return' && !req.valid.reason.trim()) throw new HttpError(422, 'Alasan pengembalian wajib diisi.', 'REASON_REQUIRED');
  if (req.valid.action === 'publish') {
    const counts = await one('SELECT COUNT(*) AS entries, SUM(final_score IS NULL) AS missing_scores FROM report_card_entries WHERE package_id=?', [pkg.id]);
    if (Number(counts.entries) === 0) throw new HttpError(409, 'Paket rapor tidak memiliki baris nilai.', 'EMPTY_REPORT_PACKAGE');
  }
  const status = req.valid.action === 'publish' ? 'published' : 'returned';
  await query('UPDATE report_card_packages SET status=?, reviewed_by=?, reviewed_at=NOW(), review_reason=?, published_by=?, published_at=? WHERE id=?',
    [status, req.user.id, req.valid.action === 'return' ? req.valid.reason : null, req.valid.action === 'publish' ? req.user.id : null, req.valid.action === 'publish' ? new Date() : null, pkg.id]);
  await audit(req, `report.package.${req.valid.action}`, 'report_card_package', pkg.id, { class_id: pkg.class_id, period_id: pkg.period_id, version_no: pkg.version_no, reason: req.valid.reason || null });
  res.json({ message: req.valid.action === 'publish' ? 'Rapor kelas diterbitkan. Data versi ini dikunci dan dapat dilihat oleh siswa sesuai identitas masing-masing.' : 'Paket rapor dikembalikan untuk diperbaiki.' });
}));

router.get('/packages', requirePerm('reports.publish', 'attendance.homeroom.manage', 'assessments.review'), asyncHandler(async (req, res) => {
  const params = []; let where = '1=1';
  if (req.query.class_id) { where += ' AND p.class_id=?'; params.push(Number(req.query.class_id)); }
  if (req.query.period_id) { where += ' AND p.period_id=?'; params.push(Number(req.query.period_id)); }
  if (!can(req.user, 'reports.publish') && !can(req.user, 'academic.setup')) {
    const teacherId = await currentTeacherId(req.user.id);
    where += ` AND EXISTS (SELECT 1 FROM classes cx LEFT JOIN class_homeroom_assignments hx ON hx.class_id=cx.id WHERE cx.id=p.class_id AND (cx.homeroom_teacher_id=? OR (hx.teacher_record_id=? AND hx.starts_on<=CURDATE() AND (hx.ends_on IS NULL OR hx.ends_on>=CURDATE()))))`;
    params.push(teacherId || 0, teacherId || 0);
  }
  const data = await query(`SELECT p.*, c.name AS class_name, ap.label AS period_label, ap.period_type, ap.semester, ay.name AS academic_year,
    creator.full_name AS creator_name, reviewer.full_name AS reviewer_name
    FROM report_card_packages p JOIN classes c ON c.id=p.class_id JOIN assessment_periods ap ON ap.id=p.period_id JOIN academic_years ay ON ay.id=ap.academic_year_id
    JOIN users creator ON creator.id=p.created_by LEFT JOIN users reviewer ON reviewer.id=p.reviewed_by WHERE ${where} ORDER BY p.updated_at DESC`, params);
  res.json({ data });
}));

router.get('/mine', requirePerm('grades.self', 'academic.self'), asyncHandler(async (req, res) => {
  const student = await one("SELECT st.id, st.student_number, st.full_name FROM student_accounts sa JOIN student_records st ON st.id=sa.student_record_id WHERE sa.user_id=? AND sa.status='active'", [req.user.id]);
  if (!student) throw new HttpError(403, 'Akun belum terhubung ke data siswa aktif.', 'STUDENT_PROFILE_REQUIRED');
  const data = await query(`SELECT p.id AS package_id,p.version_no,p.published_at,period.label AS period_label,period.period_type,period.semester,ay.name AS academic_year,
    c.name AS class_name,s.code AS subject_code,s.name AS subject_name,e.score_payload,e.final_score
    FROM report_card_entries e JOIN report_card_packages p ON p.id=e.package_id JOIN assessment_periods period ON period.id=p.period_id
    JOIN academic_years ay ON ay.id=period.academic_year_id JOIN classes c ON c.id=p.class_id JOIN subjects s ON s.id=e.subject_id
    WHERE e.student_record_id=? AND p.status='published' ORDER BY period.ends_on DESC, p.published_at DESC, s.name`, [student.id]);
  res.json({ data: { student, reports: data } });
}));

module.exports = router;
