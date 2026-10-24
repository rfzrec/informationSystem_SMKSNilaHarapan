const express = require('express');
const { z } = require('zod');
const { query, one, withTransaction } = require('../config/db');
const { asyncHandler, HttpError, parsePaging } = require('../utils/http');
const { validate } = require('../middleware/validate');
const { requireAuth, requirePerm, can } = require('../middleware/auth');
const { audit } = require('../utils/audit');

const router = express.Router();
router.use(requireAuth);

const jsonObject = z.record(z.string(), z.unknown()).optional().default({});
const programSchema = z.object({
  name: z.string().trim().min(3).max(160), provider: z.string().trim().max(160).optional().default(''),
  academic_year_id: z.union([z.coerce.number().int().positive(), z.null()]).optional().default(null),
  starts_on: z.string().date().nullable().optional(), ends_on: z.string().date().nullable().optional(),
  requirements: jsonObject, status: z.enum(['draft','open','closed','archived']).optional().default('draft'),
}).refine((v) => !v.starts_on || !v.ends_on || v.ends_on >= v.starts_on, { message: 'Tanggal selesai harus sama dengan atau setelah tanggal mulai.', path: ['ends_on'] });

async function ownStudentRecord(userId) {
  return one("SELECT st.id, st.student_number, st.full_name FROM student_accounts sa JOIN student_records st ON st.id=sa.student_record_id WHERE sa.user_id=? AND sa.status='active'", [userId]);
}

router.get('/aid/programs', requirePerm('aid.view', 'aid.manage'), asyncHandler(async (req, res) => {
  const all = can(req.user, 'aid.manage');
  const data = await query(`SELECT p.id,p.name,p.provider,p.academic_year_id,ay.name AS academic_year,p.starts_on,p.ends_on,p.requirements_json,p.status,p.created_at
    FROM education_aid_programs p LEFT JOIN academic_years ay ON ay.id=p.academic_year_id
    WHERE ${all ? '1=1' : "p.status='open' AND (p.starts_on IS NULL OR p.starts_on<=CURDATE()) AND (p.ends_on IS NULL OR p.ends_on>=CURDATE())"}
    ORDER BY p.created_at DESC`);
  res.json({ data: data.map((r) => ({ ...r, requirements: parseJsonField(r.requirements_json) })) });
}));

router.post('/aid/programs', requirePerm('aid.manage'), validate(programSchema), asyncHandler(async (req, res) => {
  const v = req.valid;
  const r = await query(`INSERT INTO education_aid_programs (name,provider,academic_year_id,starts_on,ends_on,requirements_json,status,created_by)
    VALUES (?,?,?,?,?,?,?,?)`, [v.name,v.provider || null,v.academic_year_id,v.starts_on || null,v.ends_on || null,JSON.stringify(v.requirements || {}),v.status,req.user.id]);
  await audit(req, 'aid.program.create', 'education_aid_program', r.insertId, { name: v.name, status: v.status });
  res.status(201).json({ data: { id: r.insertId }, message: 'Program bantuan pendidikan dibuat.' });
}));

router.put('/aid/programs/:id(\\d+)', requirePerm('aid.manage'), validate(programSchema), asyncHandler(async (req, res) => {
  const id = Number(req.params.id); const v = req.valid;
  const current = await one('SELECT id FROM education_aid_programs WHERE id=?', [id]);
  if (!current) throw new HttpError(404, 'Program bantuan tidak ditemukan.', 'NOT_FOUND');
  await query(`UPDATE education_aid_programs SET name=?,provider=?,academic_year_id=?,starts_on=?,ends_on=?,requirements_json=?,status=? WHERE id=?`,
    [v.name,v.provider || null,v.academic_year_id,v.starts_on || null,v.ends_on || null,JSON.stringify(v.requirements || {}),v.status,id]);
  await audit(req, 'aid.program.update', 'education_aid_program', id, { name: v.name, status: v.status });
  res.json({ message: 'Program bantuan diperbarui.' });
}));

router.get('/aid/applications', requirePerm('aid.view', 'aid.manage'), asyncHandler(async (req, res) => {
  const params = []; let where = '1=1';
  if (!can(req.user, 'aid.manage')) {
    const student = await ownStudentRecord(req.user.id);
    if (!student) return res.json({ data: [] });
    where += ' AND a.student_record_id=?'; params.push(student.id);
  }
  if (req.query.status) { where += ' AND a.status=?'; params.push(String(req.query.status)); }
  const rows = await query(`SELECT a.id,a.program_id,a.student_record_id,a.status,a.evidence_json,a.decision_notes,a.submitted_at,a.reviewed_at,a.created_at,
    p.name AS program_name,p.provider,st.student_number,st.full_name AS student_name
    FROM education_aid_applications a JOIN education_aid_programs p ON p.id=a.program_id JOIN student_records st ON st.id=a.student_record_id
    WHERE ${where} ORDER BY a.updated_at DESC`, params);
  res.json({ data: rows.map((r) => ({ ...r, evidence: parseJsonField(r.evidence_json) })) });
}));

router.post('/aid/applications', requirePerm('aid.view', 'aid.manage'), validate(z.object({
  program_id: z.coerce.number().int().positive(), student_record_id: z.coerce.number().int().positive().optional(), evidence: jsonObject,
})), asyncHandler(async (req, res) => {
  const program = await one("SELECT id,status,starts_on,ends_on,(starts_on IS NULL OR starts_on<=CURDATE()) AS start_ok,(ends_on IS NULL OR ends_on>=CURDATE()) AS end_ok FROM education_aid_programs WHERE id=?", [req.valid.program_id]);
  if (!program || program.status !== 'open' || !Number(program.start_ok) || !Number(program.end_ok)) {
    throw new HttpError(409, 'Program bantuan tidak tersedia untuk pengajuan.', 'AID_PROGRAM_CLOSED');
  }
  let student;
  if (can(req.user, 'aid.manage')) {
    if (!req.valid.student_record_id) throw new HttpError(422, 'ID siswa wajib dipilih oleh petugas.', 'STUDENT_REQUIRED');
    student = await one('SELECT id FROM student_records WHERE id=?', [req.valid.student_record_id]);
  } else {
    student = await ownStudentRecord(req.user.id);
    if (req.valid.student_record_id && Number(req.valid.student_record_id) !== Number(student && student.id)) throw new HttpError(403, 'Siswa hanya boleh mengajukan bantuan untuk identitas sendiri.', 'STUDENT_SCOPE_FORBIDDEN');
  }
  if (!student) throw new HttpError(403, 'Akun tidak terhubung dengan data siswa aktif.', 'STUDENT_PROFILE_REQUIRED');
  let r;
  try {
    r = await query(`INSERT INTO education_aid_applications (program_id,student_record_id,status,evidence_json,submitted_at,updated_by)
      VALUES (?,?, 'submitted', ?, NOW(), ?)`, [req.valid.program_id, student.id, JSON.stringify(req.valid.evidence || {}), req.user.id]);
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Pengajuan untuk program ini sudah tercatat. Periksa status pengajuan yang ada.', 'AID_APPLICATION_EXISTS');
    throw err;
  }
  await audit(req, 'aid.application.submit', 'education_aid_application', r.insertId, { program_id: req.valid.program_id, student_record_id: student.id });
  res.status(201).json({ data: { id: r.insertId, status: 'submitted' }, message: 'Pengajuan bantuan tersimpan.' });
}));

router.post('/aid/applications/:id(\\d+)/review', requirePerm('aid.manage'), validate(z.object({
  status: z.enum(['under_review','needs_correction','proposed','approved','rejected','disbursed','closed']),
  notes: z.string().trim().max(1000).optional().default(''), evidence: jsonObject.optional(),
})), asyncHandler(async (req, res) => {
  const id = Number(req.params.id); const current = await one('SELECT * FROM education_aid_applications WHERE id=?', [id]);
  if (!current) throw new HttpError(404, 'Pengajuan bantuan tidak ditemukan.', 'NOT_FOUND');
  const allowed = {
    submitted: ['under_review','needs_correction','proposed','approved','rejected'],
    needs_correction: ['submitted','under_review','rejected'],
    under_review: ['needs_correction','proposed','approved','rejected'],
    proposed: ['approved','rejected','needs_correction'],
    approved: ['disbursed','closed'], disbursed: ['closed'], rejected: ['closed'], closed: [],
  };
  if (!(allowed[current.status] || []).includes(req.valid.status)) throw new HttpError(409, `Perubahan status ${current.status} ke ${req.valid.status} tidak diizinkan.`, 'INVALID_AID_TRANSITION');
  if (['needs_correction','rejected'].includes(req.valid.status) && !req.valid.notes.trim()) throw new HttpError(422, 'Alasan koreksi/penolakan wajib diisi.', 'REASON_REQUIRED');
  await query(`UPDATE education_aid_applications SET status=?,decision_notes=?,evidence_json=COALESCE(?,evidence_json),reviewed_by=?,reviewed_at=NOW(),updated_by=? WHERE id=?`,
    [req.valid.status,req.valid.notes || null,req.valid.evidence ? JSON.stringify(req.valid.evidence) : null,req.user.id,req.user.id,id]);
  await audit(req, 'aid.application.status', 'education_aid_application', id, { from: current.status, to: req.valid.status, notes: req.valid.notes || null });
  res.json({ message: `Status pengajuan bantuan berubah menjadi ${req.valid.status}.` });
}));

router.get('/graduation', requirePerm('graduation.manage', 'academic.reports.view'), asyncHandler(async (req, res) => {
  const params = []; let where = '1=1';
  if (req.query.academic_year_id) { where += ' AND g.academic_year_id=?'; params.push(Number(req.query.academic_year_id)); }
  if (req.query.class_id) { where += " AND EXISTS (SELECT 1 FROM student_class_enrollments e WHERE e.student_record_id=g.student_record_id AND e.class_id=? AND e.status='active' AND e.ended_on IS NULL)"; params.push(Number(req.query.class_id)); }
  if (req.query.status) { where += ' AND g.status=?'; params.push(String(req.query.status)); }
  const rows = await query(`SELECT g.*,ay.name AS academic_year,st.student_number,st.full_name AS student_name
    FROM graduation_reviews g JOIN academic_years ay ON ay.id=g.academic_year_id JOIN student_records st ON st.id=g.student_record_id WHERE ${where} ORDER BY st.full_name`, params);
  res.json({ data: rows });
}));

router.post('/graduation/reviews', requirePerm('graduation.manage'), validate(z.object({
  academic_year_id: z.coerce.number().int().positive(), student_record_id: z.coerce.number().int().positive(),
  attendance_complete: z.boolean().optional().default(false), grades_complete: z.boolean().optional().default(false),
  pkl_complete: z.boolean().optional().default(false), administration_complete: z.boolean().optional().default(false), evidence: jsonObject,
})), asyncHandler(async (req, res) => {
  const v = req.valid;
  const student = await one('SELECT id FROM student_records WHERE id=?', [v.student_record_id]);
  if (!student) throw new HttpError(404, 'Siswa tidak ditemukan.', 'STUDENT_NOT_FOUND');
  const complete = v.attendance_complete && v.grades_complete && v.pkl_complete && v.administration_complete;
  await query(`INSERT INTO graduation_reviews (academic_year_id,student_record_id,status,attendance_complete,grades_complete,pkl_complete,administration_complete,evidence_json,updated_by)
    VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status),attendance_complete=VALUES(attendance_complete),grades_complete=VALUES(grades_complete),
    pkl_complete=VALUES(pkl_complete),administration_complete=VALUES(administration_complete),evidence_json=VALUES(evidence_json),updated_by=VALUES(updated_by),reviewed_by=NULL,reviewed_at=NULL,decision_reason=NULL`,
    [v.academic_year_id,v.student_record_id,complete?'eligible':'review_required',v.attendance_complete?1:0,v.grades_complete?1:0,v.pkl_complete?1:0,v.administration_complete?1:0,JSON.stringify(v.evidence || {}),req.user.id]);
  const row = await one('SELECT id,status FROM graduation_reviews WHERE academic_year_id=? AND student_record_id=?', [v.academic_year_id,v.student_record_id]);
  await audit(req, 'graduation.review.update', 'graduation_review', row.id, { status: row.status, checklist_complete: !!complete });
  res.status(201).json({ data: row, message: complete ? 'Checklist lengkap. Status hanya menandakan eligible untuk keputusan akhir.' : 'Review tersimpan dengan status review_required karena checklist belum lengkap.' });
}));

router.post('/graduation/:id(\\d+)/decision', requirePerm('graduation.manage'), validate(z.object({ decision: z.enum(['approved','not_approved']), reason: z.string().trim().min(5).max(1000) })), asyncHandler(async (req, res) => {
  const id = Number(req.params.id); const current = await one('SELECT * FROM graduation_reviews WHERE id=?', [id]);
  if (!current) throw new HttpError(404, 'Review kelulusan tidak ditemukan.', 'NOT_FOUND');
  if (req.valid.decision === 'approved' && !(current.attendance_complete && current.grades_complete && current.pkl_complete && current.administration_complete)) {
    throw new HttpError(409, 'Keputusan approved memerlukan checklist lengkap. Sistem tidak menentukan kelulusan hanya dari absensi.', 'GRADUATION_CHECKLIST_INCOMPLETE');
  }
  await query('UPDATE graduation_reviews SET status=?,decision_reason=?,reviewed_by=?,reviewed_at=NOW(),updated_by=? WHERE id=?', [req.valid.decision,req.valid.reason,req.user.id,req.user.id,id]);
  await audit(req, 'graduation.final_decision', 'graduation_review', id, { from: current.status, decision: req.valid.decision, reason: req.valid.reason });
  res.json({ message: 'Keputusan kelulusan dicatat beserta alasan, aktor, dan timestamp. Keputusan tetap harus mengikuti aturan resmi sekolah/otoritas.' });
}));

function parseJsonField(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

module.exports = router;
