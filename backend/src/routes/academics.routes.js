const express = require('express');
const crypto = require('crypto');
const env = require('../config/env');
const { query, one, withTransaction } = require('../config/db');
const { asyncHandler, HttpError } = require('../utils/http');
const { requireAuth, requirePerm, can } = require('../middleware/auth');
const { audit } = require('../utils/audit');

const router = express.Router();
router.use(requireAuth);
const validDate = (value) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false; const d = new Date(`${value}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value; };

async function studentSummary(studentRecordId) {
  const student = await one(
    `SELECT sr.id, sr.student_number, sr.full_name, sr.gender, sr.entry_year, sa.status AS account_status
     FROM student_records sr JOIN student_accounts sa ON sa.student_record_id = sr.id
     WHERE sr.id = ? AND sa.status = 'active'`, [studentRecordId],
  );
  if (!student) return null;
  const enrollment = await one(
    `SELECT c.name AS class_name, c.grade_level, c.study_program, ay.name AS academic_year, COALESCE((SELECT hteacher.full_name FROM class_homeroom_assignments hh JOIN teacher_records hteacher ON hteacher.id = hh.teacher_record_id WHERE hh.class_id = c.id AND CURDATE() >= hh.starts_on AND (hh.ends_on IS NULL OR CURDATE() <= hh.ends_on) ORDER BY hh.starts_on DESC LIMIT 1), ht.full_name) AS homeroom_teacher
     FROM student_class_enrollments e JOIN classes c ON c.id = e.class_id JOIN academic_years ay ON ay.id = c.academic_year_id LEFT JOIN teacher_records ht ON ht.id = c.homeroom_teacher_id
     WHERE e.student_record_id = ? AND e.status = 'active' AND c.is_active = 1 ORDER BY ay.starts_on DESC LIMIT 1`, [studentRecordId],
  );
  const todaySchedule = enrollment ? await query(
    `SELECT cs.id AS schedule_id, ta.id AS assignment_id, sub.name AS subject_name,
       tr.full_name AS teacher_name, cs.starts_at, cs.ends_at, cs.room, c.name AS class_name,
       ats.id AS session_id, ats.closed_at, ats.review_status, CASE WHEN ats.review_status='approved' THEN ar.status ELSE NULL END AS attendance_status, ar.recorded_at,
       recorder.full_name AS recorded_by
     FROM student_class_enrollments e JOIN classes c ON c.id = e.class_id
     JOIN teaching_assignments ta ON ta.class_id = c.id JOIN subjects sub ON sub.id = ta.subject_id
     JOIN teacher_records tr ON tr.id = ta.teacher_record_id
     JOIN class_schedules cs ON cs.teaching_assignment_id = ta.id AND cs.day_of_week = WEEKDAY(CURDATE()) + 1
     JOIN weekly_roster_versions rv ON rv.id=cs.roster_version_id AND rv.status='published'
     LEFT JOIN attendance_sessions ats ON ats.teaching_assignment_id = ta.id AND ats.attendance_type = 'student' AND DATE(ats.starts_at) = CURDATE() AND TIME(ats.starts_at) = cs.starts_at
     LEFT JOIN attendance_records ar ON ar.session_id = ats.id AND ar.person_type = 'student' AND ar.student_record_id = e.student_record_id
     LEFT JOIN users recorder ON recorder.id = ar.recorded_by
     WHERE e.student_record_id = ? AND e.status = 'active' AND c.is_active = 1
     ORDER BY cs.starts_at, sub.name`, [studentRecordId],
  ) : [];
  const pklAttendance = await query(
    `SELECT pa.title, pa.location, pa.starts_on, pa.ends_on, a.attendance_date, a.status, a.recorded_at
     FROM pkl_student_attendance a JOIN pkl_activities pa ON pa.id = a.activity_id
     WHERE a.student_record_id = ? ORDER BY a.attendance_date DESC, a.id DESC LIMIT 30`, [studentRecordId],
  );
  // Students can only see finalized entries from a published report package.
  // Legacy grade_items/student_grades remain available to authorized staff during migration,
  // but must not bypass the teacher -> homeroom -> school-admin publication workflow.
  const grades = await query(
    `SELECT s.name AS subject_name, ap.semester, ap.label AS title, ap.period_type AS category,
       e.final_score AS score, 100 AS max_score, p.published_at AS updated_at,
       ay.name AS academic_year, p.version_no AS report_version
     FROM report_card_entries e
     JOIN report_card_packages p ON p.id = e.package_id AND p.status = 'published'
     JOIN assessment_periods ap ON ap.id = p.period_id
     JOIN academic_years ay ON ay.id = ap.academic_year_id
     JOIN subjects s ON s.id = e.subject_id
     WHERE e.student_record_id = ?
     ORDER BY ay.starts_on DESC, ap.semester DESC, ap.id DESC, s.name LIMIT 100`, [studentRecordId],
  );
  const attendance = await query(
    `SELECT CASE WHEN ats.closed_at IS NULL OR ats.review_status<>'approved' THEN 'pending_confirmation' ELSE ar.status END AS status, ar.recorded_at, ats.attendance_type, ats.starts_at, ats.closed_at, ats.review_status, c.name AS class_name, s.name AS subject_name, recorder.full_name AS recorded_by
     FROM attendance_records ar JOIN attendance_sessions ats ON ats.id = ar.session_id
     LEFT JOIN classes c ON c.id = ats.class_id LEFT JOIN teaching_assignments ta ON ta.id = ats.teaching_assignment_id
     LEFT JOIN subjects s ON s.id = ta.subject_id LEFT JOIN users recorder ON recorder.id = ar.recorded_by
     WHERE ar.student_record_id = ? AND ar.person_type = 'student' ORDER BY ar.recorded_at DESC LIMIT 30`, [studentRecordId],
  );
  const invoices = await query(
    `SELECT i.id, i.description, i.amount, i.due_date, i.status, ft.name AS fee_type,
       COALESCE((SELECT SUM(pr.amount) FROM payment_records pr WHERE pr.invoice_id = i.id AND pr.status = 'verified'),0) AS paid_amount
     FROM student_invoices i JOIN fee_types ft ON ft.id = i.fee_type_id
     WHERE i.student_record_id = ? AND i.status <> 'cancelled' ORDER BY i.due_date IS NULL, i.due_date LIMIT 30`, [studentRecordId],
  );
  const normalizedSchedule = todaySchedule.map((r) => ({ ...r, attendance_status: r.closed_at && r.review_status === 'approved' ? (r.attendance_status || 'unmarked') : null, confirmed: !!r.closed_at && r.review_status === 'approved' }));
  const attendanceSummary = normalizedSchedule.reduce((acc, r) => {
    const key = !r.confirmed || !r.attendance_status ? 'pending' : ({ present: 'present', late: 'late', sick: 'sick', permission: 'permission', absent: 'absent', unmarked: 'pending' }[r.attendance_status] || 'pending');
    acc[key] = (acc[key] || 0) + 1; return acc;
  }, { present: 0, late: 0, sick: 0, permission: 0, absent: 0, pending: 0 });
  return { student, enrollment: enrollment || null, todaySchedule: normalizedSchedule, attendanceSummary, pklAttendance, grades, attendance, invoices };
}

router.get('/me', requirePerm('academic.self'), asyncHandler(async (req, res) => {
  const account = await one('SELECT student_record_id FROM student_accounts WHERE user_id = ? AND status = \'active\'', [req.user.id]);
  if (!account) throw new HttpError(404, 'Akun belum terhubung dengan data siswa aktif.', 'STUDENT_PROFILE_NOT_FOUND');
  const data = await studentSummary(account.student_record_id);
  if (!data) throw new HttpError(404, 'Data siswa aktif tidak ditemukan.', 'STUDENT_PROFILE_NOT_FOUND');
  res.json({ data });
}));

// Administrative management of an active student's personal data. The PPDB source is retained;
// mirrored identity fields are updated transactionally to avoid divergent student/applicant names.
router.get('/students/:studentId(\\d+)/management', requirePerm('students.manage'), asyncHandler(async (req, res) => {
  const id = Number(req.params.studentId);
  const student = await one(`SELECT sr.id,sr.student_number,sr.source_application_id,sr.nik,sr.full_name,sr.gender,sr.birth_date,sr.entry_year,sr.program_id,
      p.code AS program_code,p.title AS program_title,sa.status AS account_status,sa.user_id,u.email,u.phone AS account_phone,
      ap.id AS applicant_id,ap.nisn,ap.birth_place,ap.religion,ap.address,ap.phone AS applicant_phone,
      edu.school_name,edu.npsn AS previous_school_npsn,edu.graduation_year,edu.school_address
    FROM student_records sr JOIN student_accounts sa ON sa.student_record_id=sr.id
    JOIN users u ON u.id=sa.user_id JOIN applications a ON a.id=sr.source_application_id
    JOIN applicants ap ON ap.id=a.applicant_id LEFT JOIN school_programs p ON p.id=sr.program_id
    LEFT JOIN applicant_education edu ON edu.applicant_id=ap.id WHERE sr.id=? LIMIT 1`, [id]);
  if (!student) throw new HttpError(404, 'Data siswa tidak ditemukan.', 'STUDENT_NOT_FOUND');
  const enrollment = await one(`SELECT e.id AS enrollment_id,e.class_id,e.enrolled_on,c.name AS class_name,c.grade_level,c.academic_year_id,ay.name AS academic_year
    FROM student_class_enrollments e JOIN classes c ON c.id=e.class_id JOIN academic_years ay ON ay.id=c.academic_year_id
    WHERE e.student_record_id=? AND e.status='active' AND e.ended_on IS NULL ORDER BY e.enrolled_on DESC,e.id DESC LIMIT 1`, [id]);
  const guardians = await query('SELECT relation,full_name,occupation,phone,address FROM applicant_guardians WHERE applicant_id=? ORDER BY FIELD(relation,\'ayah\',\'ibu\',\'wali\')', [student.applicant_id]);
  res.json({ data: { ...student, enrollment: enrollment || null, guardians } });
}));

router.put('/students/:studentId(\\d+)/profile', requirePerm('students.manage'), asyncHandler(async (req, res) => {
  const id = Number(req.params.studentId);
  const v = req.body || {};
  const fullName = String(v.full_name || '').trim();
  const nik = String(v.nik || '').trim();
  const nisn = String(v.nisn || '').trim();
  const gender = String(v.gender || '');
  const birthDate = String(v.birth_date || '');
  const birthPlace = String(v.birth_place || '').trim();
  const religion = String(v.religion || '').trim();
  const address = String(v.address || '').trim();
  const phone = String(v.phone || '').trim();
  if (fullName.length < 3 || fullName.length > 150 || !/^\d{16}$/.test(nik) || (nisn && !/^\d{10}$/.test(nisn)) || !['L','P'].includes(gender) || !validDate(birthDate) || birthPlace.length > 100 || religion.length > 30 || address.length < 5 || address.length > 1000 || (phone && !/^[0-9+\-\s]{6,30}$/.test(phone))) {
    throw new HttpError(422, 'Periksa nama, NIK, NISN, jenis kelamin, tanggal lahir, alamat, dan kontak siswa.', 'STUDENT_PROFILE_INVALID');
  }
  await withTransaction(async (conn) => {
    const before = await one(`SELECT sr.id,sr.nik,sr.full_name,sr.gender,sr.birth_date,sa.user_id,a.applicant_id,ap.id AS applicant_record_id
      FROM student_records sr JOIN student_accounts sa ON sa.student_record_id=sr.id AND sa.status='active'
      JOIN applications a ON a.id=sr.source_application_id JOIN applicants ap ON ap.id=a.applicant_id
      WHERE sr.id=? FOR UPDATE`, [id], conn);
    if (!before) throw new HttpError(404, 'Siswa aktif tidak ditemukan.', 'STUDENT_NOT_FOUND');
    if (await one('SELECT id FROM student_records WHERE nik=? AND id<>? LIMIT 1', [nik, id], conn)) throw new HttpError(409, 'NIK sudah terhubung ke data siswa lain.', 'STUDENT_NIK_DUPLICATE');
    if (await one('SELECT id FROM applicants WHERE nik=? AND id<>? LIMIT 1', [nik, before.applicant_record_id], conn)) throw new HttpError(409, 'NIK sudah digunakan pada data pendaftar lain.', 'APPLICANT_NIK_DUPLICATE');
    if (nisn && await one('SELECT id FROM applicants WHERE nisn=? AND id<>? LIMIT 1', [nisn, before.applicant_record_id], conn)) throw new HttpError(409, 'NISN sudah digunakan pada data pendaftar lain.', 'STUDENT_NISN_DUPLICATE');
    await query('UPDATE student_records SET nik=?,full_name=?,gender=?,birth_date=? WHERE id=?', [nik,fullName,gender,birthDate,id], conn);
    await query('UPDATE applicants SET full_name=?,nik=?,nisn=?,gender=?,birth_place=?,birth_date=?,religion=?,address=?,phone=? WHERE id=?', [fullName,nik,nisn||null,gender,birthPlace||null,birthDate,religion||null,address,phone||null,before.applicant_record_id], conn);
    await query('UPDATE users SET full_name=?,phone=? WHERE id=?', [fullName,phone||null,before.user_id], conn);
    await audit(req, 'student.profile_updated', 'student_record', id, {
      before: { full_name: before.full_name, nik: before.nik, gender: before.gender, birth_date: String(before.birth_date).slice(0,10) },
      after: { full_name: fullName, nik, gender, birth_date: birthDate },
    }, conn);
  });
  res.json({ message: 'Data pribadi siswa diperbarui pada data induk dan profil sumber PPDB; histori perubahan tercatat.' });
}));

// Explicit, reasoned program/class transfer. Current placement changes; the original PPDB preference is preserved.
router.put('/students/:studentId(\\d+)/program-class', requirePerm('students.manage'), asyncHandler(async (req, res) => {
  const id = Number(req.params.studentId);
  const programId = Number(req.body.program_id);
  const classId = Number(req.body.class_id);
  const effectiveOn = String(req.body.effective_on || '');
  const reason = String(req.body.reason || '').trim().slice(0,1000);
  if (![programId,classId].every((x) => Number.isSafeInteger(x) && x > 0) || !validDate(effectiveOn) || reason.length < 5) {
    throw new HttpError(422, 'Jurusan, kelas, tanggal berlaku, dan alasan perubahan wajib valid.', 'STUDENT_PLACEMENT_INVALID');
  }
  const result = await withTransaction(async (conn) => {
    const student = await one(`SELECT sr.id,sr.program_id,sa.status AS account_status FROM student_records sr
      JOIN student_accounts sa ON sa.student_record_id=sr.id WHERE sr.id=? FOR UPDATE`, [id], conn);
    if (!student || student.account_status !== 'active') throw new HttpError(404, 'Siswa aktif tidak ditemukan.', 'STUDENT_NOT_FOUND');
    const program = await one('SELECT id,code,title FROM school_programs WHERE id=? AND is_active=1', [programId], conn);
    const targetClass = await one(`SELECT c.id,c.name,c.grade_level,c.program_id,c.academic_year_id,ay.name AS academic_year
      FROM classes c JOIN academic_years ay ON ay.id=c.academic_year_id WHERE c.id=? AND c.is_active=1 FOR UPDATE`, [classId], conn);
    if (!program || !targetClass) throw new HttpError(422, 'Jurusan atau kelas tujuan tidak aktif/tidak ditemukan.', 'PLACEMENT_REFERENCE_INVALID');
    if (Number(targetClass.program_id) !== programId) throw new HttpError(409, 'Kelas tujuan tidak berada pada jurusan yang dipilih.', 'PLACEMENT_PROGRAM_MISMATCH');
    const prior = await one(`SELECT e.id,e.class_id,e.enrolled_on,c.grade_level,c.program_id FROM student_class_enrollments e
      JOIN classes c ON c.id=e.class_id WHERE e.student_record_id=? AND e.status='active' AND e.ended_on IS NULL
      ORDER BY e.enrolled_on DESC,e.id DESC LIMIT 1 FOR UPDATE`, [id], conn);
    if (prior && Number(prior.class_id) === classId && Number(student.program_id) === programId) throw new HttpError(409, 'Siswa sudah berada di jurusan dan kelas tersebut.', 'PLACEMENT_UNCHANGED');
    if (prior && effectiveOn <= String(prior.enrolled_on).slice(0,10)) throw new HttpError(422, 'Tanggal efektif harus setelah tanggal penempatan kelas saat ini.', 'PLACEMENT_DATE_CONFLICT');
    if (await one('SELECT id FROM student_class_enrollments WHERE student_record_id=? AND class_id=? LIMIT 1', [id,classId], conn)) throw new HttpError(409, 'Riwayat siswa sudah pernah memakai kelas ini. Pilih kelas lain untuk menjaga histori penempatan.', 'PLACEMENT_HISTORY_EXISTS');
    if (prior) {
      const nextStatus = Number(targetClass.grade_level) > Number(prior.grade_level) ? 'promoted' : 'transferred';
      await query('UPDATE student_class_enrollments SET status=?,ended_on=DATE_SUB(?,INTERVAL 1 DAY) WHERE id=?', [nextStatus,effectiveOn,prior.id], conn);
    }
    await query('UPDATE student_records SET program_id=? WHERE id=?', [programId,id], conn);
    await query("INSERT INTO student_class_enrollments (student_record_id,class_id,enrolled_on,status,created_by) VALUES (?,?,?,'active',?)", [id,classId,effectiveOn,req.user.id], conn);
    await query(`INSERT INTO student_program_history (student_record_id,from_program_id,to_program_id,from_class_id,to_class_id,effective_on,reason,changed_by)
      VALUES (?,?,?,?,?,?,?,?)`, [id,student.program_id,programId,prior?prior.class_id:null,classId,effectiveOn,reason,req.user.id], conn);
    await audit(req, 'student.program_class_changed', 'student_record', id, {
      from_program_id: student.program_id, to_program_id: programId,
      from_class_id: prior ? prior.class_id : null, to_class_id: classId,
      effective_on: effectiveOn, reason,
    }, conn);
    return { student_record_id:id, program_id:programId, class_id:classId, effective_on:effectiveOn };
  });
  res.json({ message: 'Penempatan jurusan dan kelas diperbarui. Jurusan pilihan PPDB tetap menjadi riwayat penerimaan; perubahan operasional tersimpan dalam histori.', data: result });
}));

// Jadwal guru hari ini dan status sesi; tidak menandai guru hadir hanya karena membuka dashboard.
router.get('/teacher/today', requirePerm('attendance.student.manage', 'attendance.view'), asyncHandler(async (req, res) => {
  const teacher = await one("SELECT id FROM teacher_records WHERE user_id = ? AND employment_status = 'active'", [req.user.id]);
  if (!teacher && !can(req.user, 'attendance.view')) throw new HttpError(404, 'Akun belum terhubung dengan data guru aktif.', 'TEACHER_PROFILE_NOT_FOUND');
  const rows = await query(
    `SELECT ta.id AS assignment_id, c.id AS class_id, c.name AS class_name, sub.name AS subject_name,
       cs.id AS schedule_id, cs.starts_at, cs.ends_at, cs.room, tr.full_name AS teacher_name,
       ats.id AS session_id, ats.closed_at, ats.review_status,
       (SELECT COUNT(*) FROM student_class_enrollments e WHERE e.class_id = c.id AND e.status = 'active') AS student_count,
       (SELECT COUNT(*) FROM attendance_records ar WHERE ar.session_id = ats.id AND ar.person_type = 'student') AS marked_count
     FROM teaching_assignments ta JOIN classes c ON c.id = ta.class_id JOIN subjects sub ON sub.id = ta.subject_id
     JOIN teacher_records tr ON tr.id = ta.teacher_record_id
     JOIN class_schedules cs ON cs.teaching_assignment_id = ta.id AND cs.day_of_week = WEEKDAY(CURDATE()) + 1
     JOIN weekly_roster_versions rv ON rv.id=cs.roster_version_id AND rv.status='published'
     LEFT JOIN attendance_sessions ats ON ats.teaching_assignment_id = ta.id AND ats.attendance_type = 'student' AND DATE(ats.starts_at) = CURDATE() AND TIME(ats.starts_at) = cs.starts_at
     WHERE c.is_active = 1 AND (? = 1 OR ta.teacher_record_id = ?)
     ORDER BY cs.starts_at, c.name, sub.name`, [can(req.user, 'attendance.view') ? 1 : 0, teacher ? teacher.id : 0],
  );
  res.json({ data: rows.map((r) => ({ ...r, confirmed: !!r.closed_at && r.review_status === 'approved', returned: r.review_status === 'returned', marked_count: Number(r.marked_count), student_count: Number(r.student_count) })) });
}));

router.post('/sessions/start', requirePerm('attendance.student.manage', 'attendance.view'), asyncHandler(async (req, res) => {
  const scheduleId = Number(req.body.schedule_id || 0);
  const assignmentId = Number(req.body.assignment_id || 0);
  if ((!Number.isInteger(scheduleId) || scheduleId < 1) && (!Number.isInteger(assignmentId) || assignmentId < 1)) throw new HttpError(422, 'Jadwal mengajar tidak valid.', 'VALIDATION_ERROR');
  const assignment = await one(
    `SELECT ta.id, ta.class_id, ta.teacher_record_id, cs.starts_at, cs.ends_at
     FROM teaching_assignments ta JOIN class_schedules cs ON cs.teaching_assignment_id = ta.id
     JOIN weekly_roster_versions rv ON rv.id=cs.roster_version_id AND rv.status='published'
     JOIN classes c ON c.id = ta.class_id
     WHERE (? = 0 OR cs.id = ?) AND (? = 0 OR ta.id = ?) AND c.is_active = 1 AND cs.day_of_week = WEEKDAY(CURDATE()) + 1
       AND (? = 1 OR ta.teacher_record_id = (SELECT id FROM teacher_records WHERE user_id = ? AND employment_status = 'active'))
     ORDER BY cs.starts_at LIMIT 1`, [scheduleId, scheduleId, scheduleId ? 0 : assignmentId, assignmentId, can(req.user, 'attendance.view') ? 1 : 0, req.user.id],
  );
  if (!assignment) throw new HttpError(403, 'Jadwal ini tidak ditemukan hari ini atau bukan tanggung jawab Anda.', 'ASSIGNMENT_FORBIDDEN');
  let session = await one("SELECT id, closed_at, review_status FROM attendance_sessions WHERE attendance_type = 'student' AND teaching_assignment_id = ? AND DATE(starts_at) = CURDATE() AND TIME(starts_at) = ? ORDER BY id DESC LIMIT 1", [assignment.id, assignment.starts_at]);
  if (!session) {
    const result = await query(
      `INSERT INTO attendance_sessions (attendance_type, teaching_assignment_id, teacher_record_id, class_id, starts_at, ends_at, created_by)
       VALUES ('student', ?, ?, ?, TIMESTAMP(CURDATE(), ?), TIMESTAMP(CURDATE(), ?), ?)`,
      [assignment.id, assignment.teacher_record_id, assignment.class_id, assignment.starts_at, assignment.ends_at, req.user.id],
    );
    session = { id: result.insertId, closed_at: null };
  }
  await audit(req, 'attendance.session_opened', 'attendance_session', session.id, { assignment_id: assignment.id, schedule_id: scheduleId || null });
  res.status(200).json({ data: session, message: session.closed_at ? 'Sesi ini sudah dikonfirmasi.' : 'Sesi absensi siap digunakan.' });
}));

router.get('/sessions/:sessionId(\\d+)/roster', requirePerm('attendance.student.manage', 'attendance.view'), asyncHandler(async (req, res) => {
  const id = Number(req.params.sessionId);
  const session = await one(
    `SELECT ats.*, ta.teacher_record_id AS assigned_teacher_id FROM attendance_sessions ats
     JOIN teaching_assignments ta ON ta.id = ats.teaching_assignment_id WHERE ats.id = ? AND ats.attendance_type = 'student'`, [id],
  );
  if (!session) throw new HttpError(404, 'Sesi absensi tidak ditemukan.', 'ATTENDANCE_SESSION_NOT_FOUND');
  const teacher = await one("SELECT id FROM teacher_records WHERE user_id = ? AND employment_status = 'active'", [req.user.id]);
  if (!can(req.user, 'attendance.view') && (!teacher || Number(teacher.id) !== Number(session.assigned_teacher_id))) throw new HttpError(403, 'Sesi ini bukan tanggung jawab Anda.', 'ASSIGNMENT_FORBIDDEN');
  const rows = await query(
    `SELECT sr.id AS student_record_id, sr.student_number, sr.full_name, ar.status, ar.recorded_at
     FROM student_class_enrollments e JOIN student_records sr ON sr.id = e.student_record_id
     LEFT JOIN attendance_records ar ON ar.session_id = ? AND ar.person_type = 'student' AND ar.student_record_id = sr.id
     WHERE e.class_id = ? AND e.status = 'active' ORDER BY sr.full_name`, [id, session.class_id],
  );
  res.json({ data: { session: { id: session.id, closed_at: session.closed_at }, students: rows } });
}));

router.post('/sessions/:sessionId(\\d+)/confirm', requirePerm('attendance.student.manage', 'attendance.view'), asyncHandler(async (req, res) => {
  const id = Number(req.params.sessionId);
  const records = req.body.records;
  if (!Array.isArray(records) || records.length < 1) throw new HttpError(422, 'Daftar absensi wajib diisi.', 'ATTENDANCE_LIST_REQUIRED');
  const allowed = new Set(['present', 'late', 'sick', 'permission', 'absent']);
  const ids = records.map((r) => Number(r.student_record_id));
  if (ids.some((n) => !Number.isInteger(n) || n < 1) || new Set(ids).size !== ids.length || records.some((r) => !allowed.has(r.status))) throw new HttpError(422, 'Status atau daftar siswa tidak valid.', 'ATTENDANCE_INVALID');
  const result = await withTransaction(async (conn) => {
    const session = await one("SELECT ats.*, ta.teacher_record_id AS assigned_teacher_id FROM attendance_sessions ats JOIN teaching_assignments ta ON ta.id = ats.teaching_assignment_id WHERE ats.id = ? AND ats.attendance_type = 'student' FOR UPDATE", [id], conn);
    if (!session) throw new HttpError(404, 'Sesi absensi tidak ditemukan.', 'ATTENDANCE_SESSION_NOT_FOUND');
    const teacher = await one("SELECT id FROM teacher_records WHERE user_id = ? AND employment_status = 'active'", [req.user.id], conn);
    if (!can(req.user, 'attendance.view') && (!teacher || Number(teacher.id) !== Number(session.assigned_teacher_id))) throw new HttpError(403, 'Sesi ini bukan tanggung jawab Anda.', 'ASSIGNMENT_FORBIDDEN');
    if (session.closed_at) throw new HttpError(409, 'Absensi sudah dikonfirmasi. Koreksi harus melalui petugas berwenang.', 'ATTENDANCE_ALREADY_CLOSED');
    const roster = await query("SELECT student_record_id FROM student_class_enrollments WHERE class_id = ? AND status = 'active'", [session.class_id], conn);
    const expected = new Set(roster.map((r) => Number(r.student_record_id)));
    if (expected.size !== ids.length || ids.some((n) => !expected.has(n))) throw new HttpError(422, 'Semua siswa aktif di kelas harus ditangani tepat satu kali.', 'ATTENDANCE_ROSTER_MISMATCH');
    for (const row of records) {
      await query(`INSERT INTO attendance_records (session_id, person_type, student_record_id, status, recorded_by)
        VALUES (?, 'student', ?, ?, ?)
        ON DUPLICATE KEY UPDATE status = VALUES(status), recorded_by = VALUES(recorded_by), recorded_at = CURRENT_TIMESTAMP`,
      [id, Number(row.student_record_id), row.status, req.user.id], conn);
    }
    await query("UPDATE attendance_sessions SET closed_at = NOW(), review_status='pending', reviewed_by=NULL, reviewed_at=NULL, review_notes=NULL WHERE id = ?", [id], conn);
    await audit(req, 'attendance.session_confirmed', 'attendance_session', id, { total_students: records.length }, conn);
    return { total: records.length };
  });
  res.json({ message: 'Absensi berhasil dikonfirmasi dan tersimpan.', data: result });
}));


router.post('/sessions/:sessionId(\\d+)/reopen-returned', requirePerm('attendance.student.manage','attendance.view'), asyncHandler(async(req,res)=>{
  const id=Number(req.params.sessionId);
  const outcome=await withTransaction(async(conn)=>{
    const row=await one("SELECT ats.id,ats.closed_at,ats.review_status,ta.teacher_record_id AS assigned_teacher_id FROM attendance_sessions ats JOIN teaching_assignments ta ON ta.id=ats.teaching_assignment_id WHERE ats.id=? AND ats.attendance_type='student' FOR UPDATE",[id],conn);
    if(!row||row.review_status!=='returned'||!row.closed_at)throw new HttpError(409,'Hanya absensi yang dikembalikan Admin yang dapat dibuka ulang.','SESSION_NOT_RETURNED');
    const teacher=await one("SELECT id FROM teacher_records WHERE user_id=? AND employment_status='active'",[req.user.id],conn);
    if(!can(req.user,'attendance.view')&&(!teacher||Number(teacher.id)!==Number(row.assigned_teacher_id)))throw new HttpError(403,'Sesi ini bukan tanggung jawab Anda.','ASSIGNMENT_FORBIDDEN');
    await query("UPDATE attendance_sessions SET closed_at=NULL,review_status='pending',reviewed_by=NULL,reviewed_at=NULL WHERE id=?",[id],conn);
    await audit(req,'attendance.session_reopened_after_return','attendance_session',id,{previous_review_status:'returned'},conn);
    return {id};
  });
  res.json({message:'Absensi dibuka ulang untuk koreksi. Setelah diperbaiki, kirim ulang untuk persetujuan Admin.',data:outcome});
}));

router.put('/sessions/:sessionId(\\d+)/correction', requirePerm('attendance.view'), asyncHandler(async (req, res) => {
  const sessionId = Number(req.params.sessionId); const studentId = Number(req.body.student_record_id);
  const status = String(req.body.status || ''); const reason = String(req.body.reason || '').trim().slice(0, 500);
  if (!Number.isInteger(studentId) || studentId < 1 || !['present','late','sick','permission','absent'].includes(status) || reason.length < 5) throw new HttpError(422, 'Siswa, status, dan alasan koreksi wajib valid.', 'CORRECTION_REASON_REQUIRED');
  const session = await one("SELECT ats.id, ats.class_id, ats.closed_at FROM attendance_sessions ats WHERE ats.id = ? AND ats.attendance_type = 'student'", [sessionId]);
  if (!session || !session.closed_at) throw new HttpError(409, 'Sesi tidak ditemukan atau belum dikonfirmasi.', 'ATTENDANCE_SESSION_NOT_CLOSED');
  await withTransaction(async (conn) => {
    const enrollment = await one("SELECT id FROM student_class_enrollments WHERE class_id = ? AND student_record_id = ? AND status IN ('active','transferred','promoted') FOR UPDATE", [session.class_id, studentId], conn);
    const record = await one("SELECT id FROM attendance_records WHERE session_id = ? AND person_type = 'student' AND student_record_id = ? FOR UPDATE", [sessionId, studentId], conn);
    if (!enrollment || !record) throw new HttpError(404, 'Catatan absensi siswa tidak ditemukan pada sesi ini.', 'ATTENDANCE_RECORD_NOT_FOUND');
    await query('UPDATE attendance_records SET status = ?, corrected_by = ?, corrected_at = NOW(), correction_reason = ? WHERE id = ?', [status, req.user.id, reason, record.id], conn);
    await audit(req, 'attendance.student_corrected', 'attendance_record', record.id, { session_id: sessionId, student_record_id: studentId, status, reason }, conn);
  });
  res.json({ message: 'Koreksi absensi siswa tersimpan dan tercatat dalam audit log.' });
}));

router.get('/teacher-attendance', requirePerm('attendance.view'), asyncHandler(async (req, res) => {
  const date = String(req.query.date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()));
  if (!validDate(date)) throw new HttpError(422, 'Tanggal tidak valid.', 'VALIDATION_ERROR');
  const rows = await query(`SELECT cs.id AS schedule_id, ta.id AS assignment_id, ats.id AS session_id,
      TIMESTAMP(?, cs.starts_at) AS starts_at, TIMESTAMP(?, cs.ends_at) AS ends_at, ats.closed_at AS student_attendance_confirmed,
      c.name AS class_name, sub.name AS subject_name, tr.id AS teacher_record_id, tr.full_name AS teacher_name,
      tsa.status AS teacher_status, tsa.source AS attendance_source, tsa.notes, recorder.full_name AS recorded_by
    FROM class_schedules cs JOIN weekly_roster_versions rv ON rv.id=cs.roster_version_id AND rv.status='published'
    JOIN teaching_assignments ta ON ta.id = cs.teaching_assignment_id
    JOIN classes c ON c.id = ta.class_id JOIN subjects sub ON sub.id = ta.subject_id
    JOIN teacher_records tr ON tr.id = ta.teacher_record_id
    LEFT JOIN attendance_sessions ats ON ats.teaching_assignment_id = ta.id AND ats.attendance_type = 'student'
      AND DATE(ats.starts_at) = ? AND TIME(ats.starts_at) = cs.starts_at
    LEFT JOIN teacher_session_attendance tsa ON tsa.session_id = ats.id AND tsa.teacher_record_id = tr.id
    LEFT JOIN users recorder ON recorder.id = tsa.recorded_by
    WHERE c.is_active = 1 AND cs.day_of_week = WEEKDAY(?) + 1 ORDER BY cs.starts_at, c.name`, [date, date, date, date]);
  res.json({ data: rows, date, note: 'Konfirmasi absensi siswa bukan bukti kehadiran fisik guru. Status guru harus dicatat secara terpisah.' });
}));

router.post('/teacher-attendance/ensure-session', requirePerm('attendance.view'), asyncHandler(async (req, res) => {
  const scheduleId = Number(req.body.schedule_id); const date = String(req.body.date || '');
  if (!Number.isInteger(scheduleId) || scheduleId < 1 || !validDate(date)) throw new HttpError(422, 'Jadwal dan tanggal tidak valid.', 'VALIDATION_ERROR');
  const schedule = await one(`SELECT cs.id, cs.starts_at, cs.ends_at, ta.id AS assignment_id, ta.class_id, ta.teacher_record_id
    FROM class_schedules cs JOIN weekly_roster_versions rv ON rv.id=cs.roster_version_id AND rv.status='published'
    JOIN teaching_assignments ta ON ta.id = cs.teaching_assignment_id JOIN classes c ON c.id = ta.class_id
    WHERE cs.id = ? AND cs.day_of_week = WEEKDAY(?) + 1 AND c.is_active = 1`, [scheduleId, date]);
  if (!schedule) throw new HttpError(404, 'Jadwal tidak ditemukan pada tanggal tersebut.', 'SCHEDULE_NOT_FOUND');
  let session = await one("SELECT id, closed_at, review_status FROM attendance_sessions WHERE attendance_type = 'student' AND teaching_assignment_id = ? AND DATE(starts_at) = ? AND TIME(starts_at) = ? LIMIT 1", [schedule.assignment_id, date, schedule.starts_at]);
  if (!session) {
    const inserted = await query(`INSERT INTO attendance_sessions (attendance_type, teaching_assignment_id, teacher_record_id, class_id, starts_at, ends_at, created_by)
      VALUES ('student', ?, ?, ?, TIMESTAMP(?, ?), TIMESTAMP(?, ?), ?)`, [schedule.assignment_id, schedule.teacher_record_id, schedule.class_id, date, schedule.starts_at, date, schedule.ends_at, req.user.id]);
    session = { id: inserted.insertId, closed_at: null };
    await audit(req, 'attendance.session_created_by_admin', 'attendance_session', session.id, { schedule_id: scheduleId, date });
  }
  res.json({ data: session });
}));

router.post('/teacher-attendance/:sessionId(\\d+)', requirePerm('attendance.view'), asyncHandler(async (req, res) => {
  const sessionId = Number(req.params.sessionId); const status = String(req.body.status || ''); const source = String(req.body.source || '');
  const notes = String(req.body.notes || '').trim().slice(0, 500) || null;
  if (!['present','absent','permission','sick','pending'].includes(status) || !['physical_verification','manual_admin','assignment'].includes(source)) throw new HttpError(422, 'Status dan sumber kehadiran guru tidak valid.', 'TEACHER_ATTENDANCE_INVALID');
  if (source === 'physical_verification' && !notes) throw new HttpError(422, 'Catatan verifikasi wajib diisi jika memilih verifikasi fisik.', 'TEACHER_ATTENDANCE_NOTE_REQUIRED');
  const outcome = await withTransaction(async (conn) => {
    const session = await one("SELECT ats.id, ta.teacher_record_id FROM attendance_sessions ats JOIN teaching_assignments ta ON ta.id = ats.teaching_assignment_id WHERE ats.id = ? AND ats.attendance_type = 'student' FOR UPDATE", [sessionId], conn);
    if (!session) throw new HttpError(404, 'Sesi pembelajaran tidak ditemukan.', 'ATTENDANCE_SESSION_NOT_FOUND');
    const existing = await one('SELECT id, status, source FROM teacher_session_attendance WHERE session_id = ? AND teacher_record_id = ? FOR UPDATE', [sessionId, session.teacher_record_id], conn);
    if (existing) {
      const correctionReason = String(req.body.correction_reason || '').trim().slice(0, 500);
      if (!correctionReason) throw new HttpError(422, 'Alasan koreksi wajib diisi untuk mengubah catatan yang sudah ada.', 'CORRECTION_REASON_REQUIRED');
      await query(`UPDATE teacher_session_attendance SET status = ?, source = ?, notes = ?, corrected_by = ?, corrected_at = NOW(), correction_reason = ? WHERE id = ?`,
        [status, source, notes, req.user.id, correctionReason, existing.id], conn);
    } else {
      await query(`INSERT INTO teacher_session_attendance (session_id, teacher_record_id, status, source, notes, recorded_by) VALUES (?,?,?,?,?,?)`,
        [sessionId, session.teacher_record_id, status, source, notes, req.user.id], conn);
    }
    await audit(req, existing ? 'attendance.teacher_corrected' : 'attendance.teacher_recorded', 'teacher_session_attendance', sessionId,
      { teacher_record_id: session.teacher_record_id, status, source, correction_reason: req.body.correction_reason || null }, conn);
    return { existing: !!existing, teacher_record_id: session.teacher_record_id };
  });
  res.json({ message: outcome.existing ? 'Kehadiran guru dikoreksi dan dicatat dalam audit log.' : 'Kehadiran guru dicatat terpisah dari konfirmasi absensi siswa.', data: { session_id: sessionId, teacher_record_id: outcome.teacher_record_id, status, source } });
}));

router.post('/enrollments', requirePerm('students.manage'), asyncHandler(async (req, res) => {
  const studentId = Number(req.body.student_record_id); const classId = Number(req.body.class_id); const enrolledOn = String(req.body.enrolled_on || '');
  if (!Number.isInteger(studentId) || studentId < 1 || !Number.isInteger(classId) || classId < 1 || !validDate(enrolledOn)) throw new HttpError(422, 'Siswa, kelas, dan tanggal penempatan wajib valid.', 'VALIDATION_ERROR');
  await withTransaction(async (conn) => {
    const student = await one(`SELECT sr.id,sr.program_id FROM student_records sr JOIN student_accounts sa ON sa.student_record_id = sr.id AND sa.status = 'active' WHERE sr.id = ? FOR UPDATE`, [studentId], conn);
    const cls = await one('SELECT id,program_id FROM classes WHERE id = ? AND is_active = 1 FOR UPDATE', [classId], conn);
    if (!student || !cls) throw new HttpError(422, 'Siswa aktif atau kelas aktif tidak ditemukan.', 'ENROLLMENT_REFERENCE_INVALID');
    if (student.program_id && cls.program_id && Number(student.program_id)!==Number(cls.program_id)) throw new HttpError(409,'Jurusan siswa tidak sesuai dengan jurusan kelas tujuan. Periksa pilihan PPDB atau lakukan perubahan jurusan yang tercatat terlebih dahulu.','PROGRAM_MISMATCH');
    const prior = await one('SELECT id, class_id, enrolled_on FROM student_class_enrollments WHERE student_record_id = ? AND status = \'active\' FOR UPDATE', [studentId], conn);
    if (prior && Number(prior.class_id) === classId) throw new HttpError(409, 'Siswa sudah terdaftar aktif pada kelas ini.', 'ENROLLMENT_ALREADY_ACTIVE');
    if (prior && String(prior.enrolled_on) >= enrolledOn) throw new HttpError(409, 'Tanggal penempatan baru harus setelah tanggal penempatan sebelumnya.', 'ENROLLMENT_DATE_CONFLICT');
    if (await one('SELECT id FROM student_class_enrollments WHERE student_record_id = ? AND class_id = ?', [studentId, classId], conn)) throw new HttpError(409, 'Riwayat siswa untuk kelas ini sudah ada; penempatan ulang otomatis diblokir agar riwayat tidak tertimpa.', 'ENROLLMENT_HISTORY_EXISTS');
    if (prior) await query("UPDATE student_class_enrollments SET status = 'transferred', ended_on = DATE_SUB(?, INTERVAL 1 DAY) WHERE id = ?", [enrolledOn, prior.id], conn);
    await query("INSERT INTO student_class_enrollments (student_record_id, class_id, enrolled_on, status, created_by) VALUES (?,?,?,'active',?)", [studentId, classId, enrolledOn, req.user.id], conn);
    await audit(req, 'academic.student_class_assigned', 'student_record', studentId, { class_id: classId, enrolled_on: enrolledOn, previous_class_id: prior ? prior.class_id : null }, conn);
  });
  res.status(201).json({ message: 'Penempatan kelas siswa berhasil disimpan.', data: { student_record_id: studentId, class_id: classId, enrolled_on: enrolledOn } });
}));

router.get('/setup-options', requirePerm('academic.setup'), asyncHandler(async (req, res) => {
  const [classes, teachers, academicYears, subjects, assignments, schedules, students, programs, draftSchedules, rosterVersions] = await Promise.all([
    query(`SELECT c.id, c.name, c.grade_level, c.study_program, c.program_id, c.academic_year_id, ay.name AS academic_year, c.is_active,
      t.full_name AS homeroom_teacher, p.code AS program_code, p.title AS program_title,
      (SELECT COUNT(*) FROM student_class_enrollments e WHERE e.class_id=c.id AND e.status='active') AS active_student_count
      FROM classes c LEFT JOIN teacher_records t ON t.id = c.homeroom_teacher_id
      LEFT JOIN school_programs p ON p.id=c.program_id LEFT JOIN academic_years ay ON ay.id=c.academic_year_id
      ORDER BY p.title, c.grade_level, c.name`),
    query("SELECT id, teacher_code, full_name, employee_number FROM teacher_records WHERE employment_status = 'active' ORDER BY full_name"),
    query('SELECT id, name, starts_on, ends_on, is_active FROM academic_years ORDER BY starts_on DESC'),
    query('SELECT id, code, name, grade_level, study_program, program_id, is_active FROM subjects ORDER BY name'),
    query(`SELECT ta.id, c.name AS class_name, sub.name AS subject_name, t.full_name AS teacher_name, ta.weekly_periods
      FROM teaching_assignments ta JOIN classes c ON c.id = ta.class_id JOIN subjects sub ON sub.id = ta.subject_id JOIN teacher_records t ON t.id = ta.teacher_record_id
      ORDER BY c.grade_level, c.name, sub.name`),
    query(`SELECT cs.id, c.name AS class_name, sub.name AS subject_name, t.full_name AS teacher_name, cs.day_of_week, cs.starts_at, cs.ends_at, cs.room, rv.id AS roster_version_id, rv.version_no
      FROM class_schedules cs JOIN weekly_roster_versions rv ON rv.id=cs.roster_version_id AND rv.status='published'
      JOIN teaching_assignments ta ON ta.id = cs.teaching_assignment_id JOIN classes c ON c.id = ta.class_id
      JOIN subjects sub ON sub.id = ta.subject_id JOIN teacher_records t ON t.id = ta.teacher_record_id
      ORDER BY cs.day_of_week, cs.starts_at`),
    query(`SELECT sr.id, sr.student_number, sr.full_name, sr.program_id, p.code AS program_code, p.title AS program_title, e.class_id, c.name AS class_name, c.grade_level FROM student_records sr
      JOIN student_accounts sa ON sa.student_record_id = sr.id AND sa.status = 'active'
      LEFT JOIN school_programs p ON p.id=sr.program_id
      LEFT JOIN student_class_enrollments e ON e.student_record_id = sr.id AND e.status = 'active'
      LEFT JOIN classes c ON c.id = e.class_id ORDER BY p.title,sr.full_name`),
    query(`SELECT p.id,p.code,p.title,p.summary,p.is_active,p.status,
      (SELECT COUNT(DISTINCT a.id) FROM application_preferences ap JOIN applications a ON a.id=ap.application_id WHERE ap.program_id=p.id AND a.submission_status<>'draft') AS applicant_count,
      (SELECT COUNT(*) FROM student_records sr WHERE sr.program_id=p.id) AS student_count,
      (SELECT COUNT(*) FROM classes c WHERE c.program_id=p.id AND c.is_active=1) AS class_count
      FROM school_programs p WHERE p.is_active=1 ORDER BY p.title`),
    query(`SELECT cs.id, c.name AS class_name, sub.name AS subject_name, t.full_name AS teacher_name, cs.day_of_week, cs.starts_at, cs.ends_at, cs.room, rv.id AS roster_version_id, rv.version_no
      FROM class_schedules cs JOIN weekly_roster_versions rv ON rv.id=cs.roster_version_id AND rv.status='draft'
      JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id JOIN classes c ON c.id=ta.class_id
      JOIN subjects sub ON sub.id=ta.subject_id JOIN teacher_records t ON t.id=ta.teacher_record_id
      ORDER BY rv.version_no DESC, cs.day_of_week, cs.starts_at`),
    query(`SELECT rv.id, rv.academic_year_id, ay.name AS academic_year, rv.version_no, rv.status, rv.created_at, rv.published_at,
        (SELECT COUNT(*) FROM class_schedules cs WHERE cs.roster_version_id=rv.id) AS schedule_count
      FROM weekly_roster_versions rv JOIN academic_years ay ON ay.id=rv.academic_year_id ORDER BY ay.starts_on DESC,rv.version_no DESC`),
  ]);
  res.json({ data: { classes, teachers, academicYears, subjects, assignments, schedules, students, programs, draftSchedules, rosterVersions } });
}));

router.post('/academic-years', requirePerm('academic.setup'), asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim(); const startsOn = String(req.body.starts_on || ''); const endsOn = String(req.body.ends_on || '');
  const active = req.body.is_active === true || req.body.is_active === 'true';
  if (!/^\d{4}\/\d{4}$/.test(name) || !validDate(startsOn) || !validDate(endsOn) || endsOn <= startsOn) throw new HttpError(422, 'Tahun ajaran dan rentang tanggal tidak valid.', 'VALIDATION_ERROR');
  if (await one('SELECT id FROM academic_years WHERE name = ?', [name])) throw new HttpError(409, 'Tahun ajaran tersebut sudah ada.', 'ACADEMIC_YEAR_EXISTS');
  const id = await withTransaction(async (conn) => {
    if (active) await query('UPDATE academic_years SET is_active = 0', [], conn);
    const result = await query('INSERT INTO academic_years (name, starts_on, ends_on, is_active) VALUES (?,?,?,?)', [name, startsOn, endsOn, active ? 1 : 0], conn);
    await audit(req, 'academic.year_created', 'academic_year', result.insertId, { name, starts_on: startsOn, ends_on: endsOn, active }, conn);
    return result.insertId;
  });
  res.status(201).json({ message: 'Tahun ajaran berhasil ditambahkan.', data: { id, name } });
}));

router.post('/classes', requirePerm('academic.setup'), asyncHandler(async (req, res) => {
  const yearId = Number(req.body.academic_year_id); const name = String(req.body.name || '').trim();
  const grade = Number(req.body.grade_level); const programId = Number(req.body.program_id);
  if (!Number.isInteger(yearId) || yearId < 1 || name.length < 2 || name.length > 80 || ![10,11,12].includes(grade) || !Number.isInteger(programId) || programId < 1) throw new HttpError(422, 'Tahun ajaran, nama kelas, tingkat X–XII, dan jurusan wajib valid.', 'VALIDATION_ERROR');
  if (!await one('SELECT id FROM academic_years WHERE id = ?', [yearId])) throw new HttpError(422, 'Tahun ajaran tidak ditemukan.', 'ACADEMIC_YEAR_NOT_FOUND');
  const program = await one('SELECT id,title FROM school_programs WHERE id=? AND is_active=1',[programId]);
  if (!program) throw new HttpError(422, 'Master jurusan tidak ditemukan atau sudah dinonaktifkan.', 'PROGRAM_NOT_FOUND');
  if (await one('SELECT id FROM classes WHERE academic_year_id = ? AND name = ?', [yearId, name])) throw new HttpError(409, 'Nama kelas sudah terdaftar pada tahun ajaran tersebut.', 'CLASS_EXISTS');
  const result = await query('INSERT INTO classes (academic_year_id, name, grade_level, study_program, program_id) VALUES (?,?,?,?,?)', [yearId, name, grade, program.title, program.id]);
  await audit(req, 'academic.class_created', 'class', result.insertId, { name, grade_level: grade, program_id: program.id, study_program: program.title, academic_year_id: yearId });
  res.status(201).json({ message: 'Kelas berhasil ditambahkan.', data: { id: result.insertId } });
}));

router.post('/subjects', requirePerm('academic.setup'), asyncHandler(async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase(); const name = String(req.body.name || '').trim();
  const grade = req.body.grade_level === '' || req.body.grade_level == null ? null : Number(req.body.grade_level);
  const programId = req.body.program_id === '' || req.body.program_id == null ? null : Number(req.body.program_id);
  if (!/^[A-Z0-9_-]{2,30}$/.test(code) || name.length < 2 || name.length > 120 || (grade !== null && ![10,11,12].includes(grade)) || (programId !== null && (!Number.isInteger(programId) || programId < 1))) throw new HttpError(422, 'Kode, nama mata pelajaran, tingkat, atau program tidak valid.', 'VALIDATION_ERROR');
  if (await one('SELECT id FROM subjects WHERE code = ?', [code])) throw new HttpError(409, 'Kode mata pelajaran sudah digunakan.', 'SUBJECT_CODE_EXISTS');
  const program = programId === null ? null : await one('SELECT id,title FROM school_programs WHERE id=? AND is_active=1',[programId]);
  if(programId !== null && !program) throw new HttpError(422,'Program tidak ditemukan atau tidak aktif.','PROGRAM_NOT_FOUND');
  const label = program ? program.title : null;
  const result = await query('INSERT INTO subjects (code, name, grade_level, study_program, program_id) VALUES (?,?,?,?,?)', [code, name, grade, label, program ? program.id : null]);
  await audit(req, 'academic.subject_created', 'subject', result.insertId, { code, name, grade_level: grade, program_id: program ? program.id : null, study_program: label });
  res.status(201).json({ message: 'Mata pelajaran berhasil ditambahkan.', data: { id: result.insertId } });
}));

router.post('/assignments', requirePerm('academic.setup'), asyncHandler(async (req, res) => {
  const classId = Number(req.body.class_id); const subjectId = Number(req.body.subject_id); const teacherId = Number(req.body.teacher_record_id); const periods = Number(req.body.weekly_periods || 1);
  if (![classId, subjectId, teacherId].every((n) => Number.isInteger(n) && n > 0) || !Number.isInteger(periods) || periods < 1 || periods > 48) throw new HttpError(422, 'Kelas, mata pelajaran, guru, dan jumlah jam wajib valid.', 'VALIDATION_ERROR');
  const refs = await one(`SELECT c.id AS class_id,c.program_id AS class_program_id,s.id AS subject_id,s.program_id AS subject_program_id,t.id AS teacher_id FROM classes c JOIN subjects s ON s.id = ? JOIN teacher_records t ON t.id = ? AND t.employment_status = 'active' WHERE c.id = ? AND c.is_active = 1 AND s.is_active = 1`, [subjectId, teacherId, classId]);
  if (!refs) throw new HttpError(422, 'Kelas, mata pelajaran, atau guru aktif tidak ditemukan.', 'ASSIGNMENT_REFERENCE_INVALID');
  if (refs.class_program_id && refs.subject_program_id && Number(refs.class_program_id)!==Number(refs.subject_program_id)) throw new HttpError(409,'Mata pelajaran yang dipilih terikat pada jurusan berbeda dari kelas.','SUBJECT_PROGRAM_MISMATCH');
  if (await one('SELECT id FROM teaching_assignments WHERE class_id = ? AND subject_id = ? AND teacher_record_id = ?', [classId, subjectId, teacherId])) throw new HttpError(409, 'Penugasan ini sudah ada.', 'ASSIGNMENT_EXISTS');
  const result = await query('INSERT INTO teaching_assignments (class_id, subject_id, teacher_record_id, weekly_periods) VALUES (?,?,?,?)', [classId, subjectId, teacherId, periods]);
  await audit(req, 'academic.assignment_created', 'teaching_assignment', result.insertId, { class_id: classId, subject_id: subjectId, teacher_record_id: teacherId, weekly_periods: periods });
  res.status(201).json({ message: 'Penugasan mengajar berhasil dibuat.', data: { id: result.insertId } });
}));

async function getOrCreateRosterDraft(conn, academicYearId, actorId) {
  const existing = await one("SELECT id,version_no FROM weekly_roster_versions WHERE academic_year_id=? AND status='draft' ORDER BY version_no DESC LIMIT 1 FOR UPDATE", [academicYearId], conn);
  if (existing) return existing;
  const published = await one("SELECT id,version_no FROM weekly_roster_versions WHERE academic_year_id=? AND status='published' ORDER BY version_no DESC LIMIT 1 FOR UPDATE", [academicYearId], conn);
  const maxRow = await one('SELECT COALESCE(MAX(version_no),0) AS n FROM weekly_roster_versions WHERE academic_year_id=?', [academicYearId], conn);
  const versionNo = Number(maxRow.n) + 1;
  const inserted = await query("INSERT INTO weekly_roster_versions (academic_year_id,version_no,status,created_by) VALUES (?,?,'draft',?)", [academicYearId, versionNo, actorId], conn);
  const draft = { id: inserted.insertId, version_no: versionNo };
  if (published) {
    await query(`INSERT INTO class_schedules (roster_version_id,teaching_assignment_id,day_of_week,starts_at,ends_at,room)
      SELECT ?,teaching_assignment_id,day_of_week,starts_at,ends_at,room FROM class_schedules WHERE roster_version_id=?`, [draft.id, published.id], conn);
  }
  return draft;
}

router.post('/schedules', requirePerm('academic.setup'), asyncHandler(async (req, res) => {
  const assignmentId = Number(req.body.teaching_assignment_id); const day = Number(req.body.day_of_week);
  const starts = String(req.body.starts_at || ''); const ends = String(req.body.ends_at || ''); const room = String(req.body.room || '').trim().slice(0,60) || null;
  if (!Number.isInteger(assignmentId) || assignmentId < 1 || !Number.isInteger(day) || day < 1 || day > 6 || !/^\d{2}:\d{2}$/.test(starts) || !/^\d{2}:\d{2}$/.test(ends) || starts >= ends) throw new HttpError(422, 'Penugasan, hari, dan jam jadwal tidak valid.', 'VALIDATION_ERROR');
  const result = await withTransaction(async (conn) => {
    const assignment = await one(`SELECT ta.id,ta.class_id,ta.teacher_record_id,c.academic_year_id FROM teaching_assignments ta JOIN classes c ON c.id=ta.class_id WHERE ta.id=? AND c.is_active=1 FOR UPDATE`, [assignmentId], conn);
    if (!assignment) throw new HttpError(404, 'Penugasan mengajar tidak ditemukan atau kelas tidak aktif.', 'ASSIGNMENT_NOT_FOUND');
    await query('SELECT id FROM academic_years WHERE id=? FOR UPDATE', [assignment.academic_year_id], conn);
    const draft = await getOrCreateRosterDraft(conn, assignment.academic_year_id, req.user.id);
    const overlap = await one(`SELECT cs.id,ta.class_id,ta.teacher_record_id,cs.room FROM class_schedules cs JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
      WHERE cs.roster_version_id=? AND cs.day_of_week=? AND ? < cs.ends_at AND ? > cs.starts_at
        AND (ta.class_id=? OR ta.teacher_record_id=? OR (? IS NOT NULL AND cs.room=?)) LIMIT 1`, [draft.id,day,starts,ends,assignment.class_id,assignment.teacher_record_id,room,room], conn);
    if (overlap) throw new HttpError(409, 'Jadwal bertabrakan dengan kelas, guru, atau ruang lain pada draf roster ini.', 'SCHEDULE_OVERLAP');
    const inserted = await query('INSERT INTO class_schedules (roster_version_id,teaching_assignment_id,day_of_week,starts_at,ends_at,room) VALUES (?,?,?,?,?,?)', [draft.id,assignmentId,day,starts,ends,room], conn);
    await audit(req, 'academic.schedule_drafted', 'class_schedule', inserted.insertId, { roster_version_id:draft.id, version_no:draft.version_no, teaching_assignment_id:assignmentId, day_of_week:day, starts_at:starts, ends_at:ends, room }, conn);
    return { id:inserted.insertId, roster_version_id:draft.id, version_no:draft.version_no, academic_year_id:assignment.academic_year_id };
  });
  res.status(201).json({ message: `Jadwal ditambahkan ke draf roster v${result.version_no}. Roster aktif belum berubah; periksa lalu publikasikan versi ini.`, data: result });
}));

router.delete('/schedules/:scheduleId(\\d+)', requirePerm('academic.setup'), asyncHandler(async (req,res)=>{
  const id=Number(req.params.scheduleId);
  await withTransaction(async conn=>{
    const row=await one(`SELECT cs.id,cs.roster_version_id,rv.status,cs.day_of_week,cs.starts_at,cs.ends_at,ta.class_id,ta.teacher_record_id
      FROM class_schedules cs JOIN weekly_roster_versions rv ON rv.id=cs.roster_version_id JOIN teaching_assignments ta ON ta.id=cs.teaching_assignment_id
      WHERE cs.id=? FOR UPDATE`,[id],conn);
    if(!row) throw new HttpError(404,'Jadwal tidak ditemukan.','SCHEDULE_NOT_FOUND');
    if(row.status!=='draft') throw new HttpError(409,'Jadwal versi terbit tidak boleh dihapus. Buat versi draf baru untuk perubahan.','ROSTER_ALREADY_PUBLISHED');
    await query('DELETE FROM class_schedules WHERE id=?',[id],conn);
    await audit(req,'academic.schedule_removed_from_draft','class_schedule',id,{roster_version_id:row.roster_version_id,day_of_week:row.day_of_week,starts_at:row.starts_at,ends_at:row.ends_at},conn);
  });
  res.json({message:'Jadwal dihapus dari draf. Versi terbit sebelumnya tetap aman.'});
}));

router.post('/rosters/:versionId(\\d+)/publish', requirePerm('academic.setup'), asyncHandler(async(req,res)=>{
  const versionId=Number(req.params.versionId);
  const result=await withTransaction(async conn=>{
    const target=await one(`SELECT id,academic_year_id,version_no,status FROM weekly_roster_versions WHERE id=? FOR UPDATE`,[versionId],conn);
    if(!target) throw new HttpError(404,'Draf roster tidak ditemukan.','ROSTER_NOT_FOUND');
    if(target.status!=='draft') throw new HttpError(409,'Hanya roster berstatus draf yang dapat diterbitkan.','ROSTER_NOT_DRAFT');
    await query('SELECT id FROM academic_years WHERE id=? FOR UPDATE',[target.academic_year_id],conn);
    const count=await one('SELECT COUNT(*) AS n FROM class_schedules WHERE roster_version_id=?',[versionId],conn);
    if(Number(count.n)<1) throw new HttpError(409,'Roster kosong tidak dapat diterbitkan.','ROSTER_EMPTY');
    const conflict=await one(`SELECT a.id AS schedule_a,b.id AS schedule_b,ca.name AS class_a,cb.name AS class_b
      FROM class_schedules a JOIN teaching_assignments ta ON ta.id=a.teaching_assignment_id JOIN classes ca ON ca.id=ta.class_id
      JOIN class_schedules b ON b.roster_version_id=a.roster_version_id AND b.id>a.id AND b.day_of_week=a.day_of_week AND a.starts_at<b.ends_at AND a.ends_at>b.starts_at
      JOIN teaching_assignments tb ON tb.id=b.teaching_assignment_id JOIN classes cb ON cb.id=tb.class_id
      WHERE a.roster_version_id=? AND (ta.class_id=tb.class_id OR ta.teacher_record_id=tb.teacher_record_id OR (a.room IS NOT NULL AND a.room<>'' AND a.room=b.room)) LIMIT 1`,[versionId],conn);
    if(conflict) throw new HttpError(409,`Konflik roster terdeteksi antara ${conflict.class_a} dan ${conflict.class_b}. Perbaiki draf sebelum publikasi.`,'ROSTER_CONFLICT',{conflict});
    await query("UPDATE weekly_roster_versions SET status='superseded' WHERE academic_year_id=? AND status='published'",[target.academic_year_id],conn);
    await query("UPDATE weekly_roster_versions SET status='published',published_by=?,published_at=NOW() WHERE id=? AND status='draft'",[req.user.id,versionId],conn);
    await audit(req,'academic.roster_published','weekly_roster',versionId,{academic_year_id:target.academic_year_id,version_no:target.version_no,schedule_count:Number(count.n)},conn);
    return {version_no:target.version_no,schedule_count:Number(count.n)};
  });
  res.json({message:`Roster mingguan versi ${result.version_no} diterbitkan (${result.schedule_count} slot jadwal). Jadwal lama tetap tersimpan sebagai histori.`,data:result});
}));

router.get('/homeroom/mine', requirePerm('attendance.homeroom.manage'), asyncHandler(async (req,res)=>{
  const teacher=await one("SELECT id FROM teacher_records WHERE user_id=? AND employment_status='active'",[req.user.id]);
  if(!teacher) return res.json({data:[]});
  const rows=await query(`SELECT c.id,c.name,c.grade_level,c.study_program,ay.name AS academic_year,h.starts_on,h.ends_on
    FROM class_homeroom_assignments h JOIN classes c ON c.id=h.class_id JOIN academic_years ay ON ay.id=c.academic_year_id
    WHERE h.teacher_record_id=? AND h.starts_on<=CURDATE() AND (h.ends_on IS NULL OR h.ends_on>=CURDATE()) AND c.is_active=1
    ORDER BY c.grade_level,c.name`,[teacher.id]);
  res.json({data:rows});
}));

router.get('/homeroom', requirePerm('academic.setup'), asyncHandler(async (req, res) => {
  const rows = await query(`SELECT h.id, h.class_id, c.name AS class_name, t.id AS teacher_record_id, t.full_name AS teacher_name,
    h.starts_on, h.ends_on, u.full_name AS assigned_by_name
    FROM class_homeroom_assignments h JOIN classes c ON c.id = h.class_id
    JOIN teacher_records t ON t.id = h.teacher_record_id JOIN users u ON u.id = h.assigned_by
    ORDER BY c.grade_level, c.name, h.starts_on DESC`);
  res.json({ data: rows });
}));

router.post('/homeroom', requirePerm('academic.setup'), asyncHandler(async (req, res) => {
  const classId = Number(req.body.class_id); const teacherId = Number(req.body.teacher_record_id); const startsOn = String(req.body.starts_on || '');
  if (!Number.isInteger(classId) || classId < 1 || !Number.isInteger(teacherId) || teacherId < 1 || !validDate(startsOn)) throw new HttpError(422, 'Kelas, guru, dan tanggal mulai wajib valid.', 'VALIDATION_ERROR');
  const result = await withTransaction(async (conn) => {
    const cls = await one('SELECT id, name FROM classes WHERE id = ? AND is_active = 1 FOR UPDATE', [classId], conn);
    const teacher = await one("SELECT id FROM teacher_records WHERE id = ? AND employment_status = 'active'", [teacherId], conn);
    if (!cls || !teacher) throw new HttpError(422, 'Kelas atau guru aktif tidak ditemukan.', 'HOMEROOM_REFERENCE_INVALID');
    const active = await one('SELECT id, starts_on FROM class_homeroom_assignments WHERE class_id = ? AND ends_on IS NULL FOR UPDATE', [classId], conn);
    if (active && String(active.starts_on) >= startsOn) throw new HttpError(409, 'Tanggal mulai baru harus setelah tanggal mulai wali kelas aktif.', 'HOMEROOM_DATE_CONFLICT');
    if (active) await query('UPDATE class_homeroom_assignments SET ends_on = DATE_SUB(?, INTERVAL 1 DAY) WHERE id = ?', [startsOn, active.id], conn);
    await query('INSERT INTO class_homeroom_assignments (class_id, teacher_record_id, starts_on, assigned_by) VALUES (?,?,?,?)', [classId, teacherId, startsOn, req.user.id], conn);
    if (startsOn <= new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())) {
      await query('UPDATE classes SET homeroom_teacher_id = ? WHERE id = ?', [teacherId, classId], conn);
    }
    await audit(req, 'academic.homeroom_assigned', 'class', classId, { teacher_record_id: teacherId, starts_on: startsOn }, conn);
    return { class_id: classId, teacher_record_id: teacherId, starts_on: startsOn };
  });
  res.status(201).json({ message: 'Wali kelas berhasil ditetapkan. Riwayat sebelumnya tetap disimpan.', data: result });
}));

router.get('/pkl/options', requirePerm('pkl.manage', 'academic.setup'), asyncHandler(async (req, res) => {
  const own = await one("SELECT id FROM teacher_records WHERE user_id = ? AND employment_status = 'active'", [req.user.id]);
  const all = can(req.user, 'academic.setup');
  const classes = await query(`SELECT DISTINCT c.id, c.name, c.grade_level FROM classes c
    ${all ? '' : 'JOIN teaching_assignments ta ON ta.class_id = c.id'}
    WHERE c.is_active = 1 ${all ? '' : 'AND ta.teacher_record_id = ?'} ORDER BY c.grade_level, c.name`, all ? [] : [own ? own.id : 0]);
  const teachers = all ? await query("SELECT id, full_name FROM teacher_records WHERE employment_status = 'active' ORDER BY full_name") : [];
  res.json({ data: { classes, teachers, own_teacher_id: own ? own.id : null } });
}));

router.get('/pkl', requirePerm('pkl.manage', 'academic.reports.view'), asyncHandler(async (req, res) => {
  const teacher = await one("SELECT id FROM teacher_records WHERE user_id = ? AND employment_status = 'active'", [req.user.id]);
  const rows = await query(`SELECT p.*, c.name AS class_name, t.full_name AS supervising_teacher,
      CASE WHEN ? = 1 OR p.supervising_teacher_id = ? THEN 1 ELSE 0 END AS can_manage,
      (SELECT COUNT(*) FROM pkl_student_attendance a WHERE a.activity_id = p.id) AS attendance_count
    FROM pkl_activities p JOIN classes c ON c.id = p.class_id JOIN teacher_records t ON t.id = p.supervising_teacher_id
    WHERE (? = 1 OR p.supervising_teacher_id = ? OR EXISTS (SELECT 1 FROM teaching_assignments ta WHERE ta.class_id = p.class_id AND ta.teacher_record_id = ?))
    ORDER BY p.starts_on DESC, p.id DESC`, [can(req.user, 'academic.setup') ? 1 : 0, teacher ? teacher.id : 0, can(req.user, 'academic.reports.view') ? 1 : 0, teacher ? teacher.id : 0, teacher ? teacher.id : 0]);
  res.json({ data: rows });
}));

router.post('/pkl', requirePerm('pkl.manage'), asyncHandler(async (req, res) => {
  const classId = Number(req.body.class_id); const title = String(req.body.title || '').trim();
  const startsOn = String(req.body.starts_on || ''); const endsOn = String(req.body.ends_on || '');
  const location = String(req.body.location || '').trim().slice(0, 200) || null; const description = String(req.body.description || '').trim().slice(0, 1000) || null;
  if (!Number.isInteger(classId) || classId < 1 || title.length < 3 || title.length > 160 || !validDate(startsOn) || !validDate(endsOn) || endsOn < startsOn) throw new HttpError(422, 'Kelas, nama kegiatan, dan periode PKL wajib valid.', 'VALIDATION_ERROR');
  const own = await one("SELECT id FROM teacher_records WHERE user_id = ? AND employment_status = 'active'", [req.user.id]);
  let supervisorId = Number(req.body.supervising_teacher_id || (own && own.id) || 0);
  if (!can(req.user, 'academic.setup')) {
    if (!own) throw new HttpError(403, 'Akun belum terhubung dengan data guru.', 'TEACHER_PROFILE_NOT_FOUND');
    const assignment = await one('SELECT id FROM teaching_assignments WHERE class_id = ? AND teacher_record_id = ?', [classId, own.id]);
    if (!assignment) throw new HttpError(403, 'Anda tidak ditugaskan pada kelas tersebut.', 'PKL_CLASS_FORBIDDEN');
    supervisorId = own.id;
  }
  const valid = await one("SELECT c.id FROM classes c JOIN teacher_records t ON t.id = ? AND t.employment_status = 'active' WHERE c.id = ? AND c.is_active = 1", [supervisorId, classId]);
  if (!valid) throw new HttpError(422, 'Kelas atau guru pembimbing tidak valid.', 'PKL_REFERENCE_INVALID');
  const created = await query(`INSERT INTO pkl_activities (class_id, supervising_teacher_id, title, starts_on, ends_on, location, description, created_by)
    VALUES (?,?,?,?,?,?,?,?)`, [classId, supervisorId, title, startsOn, endsOn, location, description, req.user.id]);
  await audit(req, 'pkl.activity_created', 'pkl_activity', created.insertId, { class_id: classId, starts_on: startsOn, ends_on: endsOn });
  res.status(201).json({ message: 'Kegiatan PKL tersimpan sebagai draf. Konfirmasikan setelah data diperiksa.', data: { id: created.insertId, status: 'draft' } });
}));

router.post('/pkl/:activityId(\\d+)/confirm', requirePerm('pkl.manage'), asyncHandler(async (req, res) => {
  const id = Number(req.params.activityId);
  const activity = await one('SELECT * FROM pkl_activities WHERE id = ?', [id]);
  if (!activity) throw new HttpError(404, 'Kegiatan PKL tidak ditemukan.', 'PKL_NOT_FOUND');
  const own = await one("SELECT id FROM teacher_records WHERE user_id = ? AND employment_status = 'active'", [req.user.id]);
  if (!can(req.user, 'academic.setup') && (!own || Number(own.id) !== Number(activity.supervising_teacher_id))) throw new HttpError(403, 'Hanya pembimbing atau admin berwenang yang dapat mengonfirmasi kegiatan.', 'PKL_FORBIDDEN');
  if (activity.status !== 'draft') throw new HttpError(409, 'Hanya kegiatan PKL berstatus draf yang dapat dikonfirmasi.', 'PKL_NOT_DRAFT');
  await withTransaction(async (conn) => {
    const locked = await one('SELECT status FROM pkl_activities WHERE id = ? FOR UPDATE', [id], conn);
    if (!locked || locked.status !== 'draft') throw new HttpError(409, 'Kegiatan PKL sudah berubah status. Muat ulang data.', 'PKL_NOT_DRAFT');
    await query("UPDATE pkl_activities SET status = 'confirmed', confirmed_by = ?, confirmed_at = NOW() WHERE id = ?", [req.user.id, id], conn);
    await audit(req, 'pkl.activity_confirmed', 'pkl_activity', id, { class_id: activity.class_id, starts_on: activity.starts_on, ends_on: activity.ends_on }, conn);
  });
  res.json({ message: 'Kegiatan PKL dikonfirmasi. Pencatatan kehadiran hanya berlaku dalam periode yang disetujui.' });
}));

router.get('/pkl/:activityId(\\d+)/roster', requirePerm('pkl.manage', 'academic.reports.view'), asyncHandler(async (req, res) => {
  const id = Number(req.params.activityId); const date = String(req.query.date || '');
  if (!validDate(date)) throw new HttpError(422, 'Tanggal PKL tidak valid.', 'VALIDATION_ERROR');
  const activity = await one("SELECT * FROM pkl_activities WHERE id = ? AND status = 'confirmed' AND ? BETWEEN starts_on AND ends_on", [id, date]);
  if (!activity) throw new HttpError(409, 'Tanggal di luar periode atau kegiatan belum dikonfirmasi.', 'PKL_PERIOD_INVALID');
  const own = await one("SELECT id FROM teacher_records WHERE user_id = ? AND employment_status = 'active'", [req.user.id]);
  if (!can(req.user, 'academic.reports.view') && (!own || Number(own.id) !== Number(activity.supervising_teacher_id))) throw new HttpError(403, 'Anda bukan pembimbing kegiatan ini.', 'PKL_FORBIDDEN');
  const students = await query(`SELECT sr.id AS student_record_id, sr.student_number, sr.full_name, a.status
    FROM student_class_enrollments e JOIN student_records sr ON sr.id = e.student_record_id
    LEFT JOIN pkl_student_attendance a ON a.activity_id = ? AND a.student_record_id = sr.id AND a.attendance_date = ?
    WHERE e.class_id = ? AND e.status = 'active' ORDER BY sr.full_name`, [id, date, activity.class_id]);
  res.json({ data: { activity, students } });
}));

router.post('/pkl/:activityId(\\d+)/attendance', requirePerm('pkl.manage'), asyncHandler(async (req, res) => {
  const id = Number(req.params.activityId); const date = String(req.body.date || ''); const records = req.body.records;
  if (!validDate(date) || !Array.isArray(records) || !records.length) throw new HttpError(422, 'Tanggal dan daftar kehadiran wajib diisi.', 'VALIDATION_ERROR');
  const activity = await one("SELECT * FROM pkl_activities WHERE id = ? AND status = 'confirmed' AND ? BETWEEN starts_on AND ends_on", [id, date]);
  if (!activity) throw new HttpError(409, 'Tanggal di luar periode atau kegiatan PKL belum dikonfirmasi.', 'PKL_PERIOD_INVALID');
  const own = await one("SELECT id FROM teacher_records WHERE user_id = ? AND employment_status = 'active'", [req.user.id]);
  if (!can(req.user, 'academic.setup') && (!own || Number(own.id) !== Number(activity.supervising_teacher_id))) throw new HttpError(403, 'Hanya pembimbing atau admin berwenang yang dapat mencatat PKL.', 'PKL_FORBIDDEN');
  const regularSession = await one("SELECT id FROM attendance_sessions WHERE attendance_type = 'student' AND class_id = ? AND DATE(starts_at) = ? LIMIT 1", [activity.class_id, date]);
  if (regularSession) throw new HttpError(409, 'Sudah ada sesi absensi kelas reguler pada tanggal ini. Periksa benturan jadwal sebelum mencatat PKL.', 'PKL_REGULAR_ATTENDANCE_CONFLICT');
  const allowed = new Set(['present','sick','permission','absent']);
  const ids = records.map((r) => Number(r.student_record_id));
  if (ids.some((n) => !Number.isInteger(n) || n < 1) || new Set(ids).size !== ids.length || records.some((r) => !allowed.has(r.status))) throw new HttpError(422, 'Daftar siswa atau status tidak valid.', 'PKL_ATTENDANCE_INVALID');
  await withTransaction(async (conn) => {
    const roster = await query("SELECT student_record_id FROM student_class_enrollments WHERE class_id = ? AND status = 'active'", [activity.class_id], conn);
    const expected = new Set(roster.map((r) => Number(r.student_record_id)));
    if (expected.size !== ids.length || ids.some((n) => !expected.has(n))) throw new HttpError(422, 'Daftar harus mencakup semua siswa aktif pada kelas PKL.', 'PKL_ROSTER_MISMATCH');
    for (const row of records) {
      const exists = await one('SELECT id FROM pkl_student_attendance WHERE activity_id = ? AND student_record_id = ? AND attendance_date = ? FOR UPDATE', [id, Number(row.student_record_id), date], conn);
      if (exists) throw new HttpError(409, 'Sebagian absensi PKL tanggal ini sudah ada. Gunakan alur koreksi, jangan kirim ulang.', 'PKL_ATTENDANCE_EXISTS');
    }
    for (const row of records) await query('INSERT INTO pkl_student_attendance (activity_id, student_record_id, attendance_date, status, recorded_by) VALUES (?,?,?,?,?)', [id, Number(row.student_record_id), date, row.status, req.user.id], conn);
    await audit(req, 'pkl.attendance_recorded', 'pkl_activity', id, { date, count: records.length }, conn);
  });
  res.status(201).json({ message: 'Kehadiran PKL tersimpan untuk tanggal yang dipilih.', data: { count: records.length, date } });
}));

router.put('/pkl/:activityId(\\d+)/attendance/:studentId(\\d+)', requirePerm('academic.setup'), asyncHandler(async (req, res) => {
  const activityId = Number(req.params.activityId); const studentId = Number(req.params.studentId);
  const date = String(req.body.date || ''); const status = String(req.body.status || ''); const reason = String(req.body.reason || '').trim().slice(0, 500);
  if (!validDate(date) || !['present','sick','permission','absent'].includes(status) || reason.length < 5) throw new HttpError(422, 'Tanggal, status, dan alasan koreksi wajib valid.', 'PKL_CORRECTION_INVALID');
  await withTransaction(async (conn) => {
    const activity = await one('SELECT id FROM pkl_activities WHERE id = ? AND ? BETWEEN starts_on AND ends_on FOR UPDATE', [activityId, date], conn);
    const record = await one('SELECT id FROM pkl_student_attendance WHERE activity_id = ? AND student_record_id = ? AND attendance_date = ? FOR UPDATE', [activityId, studentId, date], conn);
    if (!activity || !record) throw new HttpError(404, 'Kegiatan atau catatan PKL tidak ditemukan.', 'PKL_ATTENDANCE_NOT_FOUND');
    await query('UPDATE pkl_student_attendance SET status = ?, corrected_by = ?, corrected_at = NOW(), correction_reason = ? WHERE id = ?', [status, req.user.id, reason, record.id], conn);
    await audit(req, 'pkl.attendance_corrected', 'pkl_student_attendance', record.id, { activity_id: activityId, student_record_id: studentId, date, status, reason }, conn);
  });
  res.json({ message: 'Koreksi kehadiran PKL tersimpan dan tercatat dalam audit log.' });
}));

router.get('/student/:studentId(\\d+)', requirePerm('academic.reports.view'), asyncHandler(async (req, res) => {
  const data = await studentSummary(Number(req.params.studentId));
  if (!data) throw new HttpError(404, 'Data siswa aktif tidak ditemukan.', 'STUDENT_NOT_FOUND');
  res.json({ data });
}));


// Daily arrival QR is deliberately separate from lesson/session attendance and honor calculation.
const attendancePolicySchema = require('zod').z.object({
  latitude: require('zod').z.coerce.number().min(-90).max(90),
  longitude: require('zod').z.coerce.number().min(-180).max(180),
  radius_m: require('zod').z.coerce.number().int().min(20).max(1000).default(100),
  max_accuracy_m: require('zod').z.coerce.number().int().min(5).max(250).default(50),
  qr_ttl_seconds: require('zod').z.coerce.number().int().min(30).max(180).default(60),
});
const qrTokenHash = (token) => crypto.createHash('sha256').update(token, 'utf8').digest('hex');
function distanceMetres(lat1, lon1, lat2, lon2) {
  const rad = (v) => v * Math.PI / 180;
  const dLat = rad(lat2 - lat1); const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
router.get('/teacher-attendance/qr/policy', requirePerm('attendance.qr.manage'), asyncHandler(async (req, res) => {
  const policy = await one('SELECT latitude, longitude, radius_m, max_accuracy_m, qr_ttl_seconds, updated_at FROM school_attendance_policy WHERE id=1');
  res.json({ data: policy || null });
}));
router.put('/teacher-attendance/qr/policy', requirePerm('attendance.qr.manage'), asyncHandler(async (req, res) => {
  const parsed = attendancePolicySchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(422, 'Koordinat dan kebijakan GPS/QR tidak valid.', 'VALIDATION_ERROR', parsed.error.flatten());
  const v = parsed.data;
  await query(`INSERT INTO school_attendance_policy (id, latitude, longitude, radius_m, max_accuracy_m, qr_ttl_seconds, updated_by)
    VALUES (1,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE latitude=VALUES(latitude),longitude=VALUES(longitude),radius_m=VALUES(radius_m),max_accuracy_m=VALUES(max_accuracy_m),qr_ttl_seconds=VALUES(qr_ttl_seconds),updated_by=VALUES(updated_by)`,
  [v.latitude, v.longitude, v.radius_m, v.max_accuracy_m, v.qr_ttl_seconds, req.user.id]);
  await query("UPDATE teacher_qr_challenges SET status='revoked', revoked_by=?, revoked_at=NOW() WHERE status='active'", [req.user.id]);
  await audit(req, 'teacher_qr.policy_updated', 'school_attendance_policy', 1, { radius_m: v.radius_m, max_accuracy_m: v.max_accuracy_m, qr_ttl_seconds: v.qr_ttl_seconds });
  res.json({ message: 'Kebijakan QR presensi disimpan. QR lama telah dicabut.' });
}));
router.post('/teacher-attendance/qr/issue', requirePerm('attendance.qr.manage'), asyncHandler(async (req, res) => {
  const policy = await one('SELECT latitude,longitude,qr_ttl_seconds FROM school_attendance_policy WHERE id=1');
  if (!policy || policy.latitude === null || policy.longitude === null) throw new HttpError(409, 'Koordinat sekolah belum dikonfigurasi.', 'SCHOOL_LOCATION_NOT_CONFIGURED');
  if (!env.internalServiceToken || !env.qrServiceUrl) throw new HttpError(503, 'QR renderer internal belum dikonfigurasi. Periksa service QR dan INTERNAL_SERVICE_TOKEN.', 'QR_RENDERER_NOT_CONFIGURED');
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = qrTokenHash(token);
  const expiresAt = new Date(Date.now() + Number(policy.qr_ttl_seconds) * 1000);
  const ins = await query("INSERT INTO teacher_qr_challenges (token_hash,status,expires_at,created_by) VALUES (?,'active',?,?)", [tokenHash, expiresAt, req.user.id]);
  await query("UPDATE teacher_qr_challenges SET status='revoked',revoked_by=?,revoked_at=NOW() WHERE id<>? AND status='active'", [req.user.id, ins.insertId]);
  try {
    const response = await fetch(`${env.qrServiceUrl.replace(/\/$/, '')}/internal/render`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.internalServiceToken}` },
      body: JSON.stringify({ text: token }), signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('QR renderer returned a non-success status');
    const svg = await response.text();
    if (!svg.startsWith('<?xml') && !svg.startsWith('<svg')) throw new Error('QR renderer response invalid');
    await audit(req, 'teacher_qr.issued', 'teacher_qr_challenge', ins.insertId, { expires_at: expiresAt.toISOString() });
    res.status(201).json({ data: { id: ins.insertId, expires_at: expiresAt.toISOString(), qr_data_uri: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` }, message: 'QR presensi diterbitkan.' });
  } catch {
    await query("UPDATE teacher_qr_challenges SET status='revoked',revoked_by=?,revoked_at=NOW() WHERE id=?", [req.user.id, ins.insertId]);
    throw new HttpError(503, 'Layanan pembuat QR tidak tersedia. QR tidak diaktifkan; silakan coba lagi.', 'QR_RENDERER_UNAVAILABLE');
  }
}));
router.get('/teacher-attendance/qr/checkins', requirePerm('attendance.qr.manage'), asyncHandler(async (req, res) => {
  const date = String(req.query.date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()));
  if (!validDate(date)) throw new HttpError(422, 'Tanggal tidak valid.', 'VALIDATION_ERROR');
  const rows = await query(`SELECT d.id,d.checkin_date,d.checked_in_at,d.accuracy_m,d.distance_m,d.verification_status,d.verification_notes,d.review_status,d.review_notes,t.id AS teacher_record_id,t.employee_number,t.full_name
    FROM teacher_daily_checkins d JOIN teacher_records t ON t.id=d.teacher_record_id WHERE d.checkin_date=? ORDER BY d.checked_in_at,t.full_name`, [date]);
  res.json({ data: rows, date });
}));
router.get('/teacher-attendance/qr/me', requirePerm('attendance.qr.self'), asyncHandler(async (req, res) => {
  const teacher = await one("SELECT id FROM teacher_records WHERE user_id=? AND employment_status='active'", [req.user.id]);
  if (!teacher) throw new HttpError(404, 'Akun belum terhubung dengan data guru aktif.', 'TEACHER_PROFILE_NOT_FOUND');
  const rows = await query('SELECT checkin_date,checked_in_at,accuracy_m,distance_m,verification_status,verification_notes,review_status,review_notes FROM teacher_daily_checkins WHERE teacher_record_id=? ORDER BY checkin_date DESC LIMIT 30', [teacher.id]);
  res.json({ data: rows });
}));
router.post('/teacher-attendance/qr/check-in', requirePerm('attendance.qr.self'), asyncHandler(async (req, res) => {
  const token = String(req.body.token || '');
  const latitude = Number(req.body.latitude); const longitude = Number(req.body.longitude); const accuracy = Number(req.body.accuracy_m);
  if (token.length < 30 || token.length > 200 || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 10000) {
    throw new HttpError(422, 'Token QR atau data lokasi tidak valid.', 'VALIDATION_ERROR');
  }
  const teacher = await one("SELECT id,full_name FROM teacher_records WHERE user_id=? AND employment_status='active'", [req.user.id]);
  if (!teacher) throw new HttpError(404, 'Akun belum terhubung dengan data guru aktif.', 'TEACHER_PROFILE_NOT_FOUND');
  const challenge = await one("SELECT id,expires_at,status FROM teacher_qr_challenges WHERE token_hash=? LIMIT 1", [qrTokenHash(token)]);
  if (!challenge || challenge.status !== 'active') throw new HttpError(401, 'QR tidak valid atau sudah dicabut.', 'QR_INVALID');
  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    await query("UPDATE teacher_qr_challenges SET status='expired' WHERE id=? AND status='active'", [challenge.id]);
    throw new HttpError(410, 'QR sudah kedaluwarsa. Minta Admin Sekolah menerbitkan QR baru.', 'QR_EXPIRED');
  }
  const policy = await one('SELECT latitude,longitude,radius_m,max_accuracy_m FROM school_attendance_policy WHERE id=1');
  if (!policy || policy.latitude === null || policy.longitude === null) throw new HttpError(409, 'Koordinat sekolah belum dikonfigurasi.', 'SCHOOL_LOCATION_NOT_CONFIGURED');
  if (accuracy > Number(policy.max_accuracy_m)) {
    await audit(req, 'teacher_qr.checkin_rejected_accuracy', 'teacher_record', teacher.id, { accuracy_m: Math.round(accuracy), max_accuracy_m: Number(policy.max_accuracy_m) });
    throw new HttpError(422, `Akurasi lokasi ${Math.round(accuracy)} m melebihi batas ${policy.max_accuracy_m} m. Aktifkan layanan lokasi dan coba kembali.`, 'GPS_ACCURACY_TOO_LOW');
  }
  const distance = distanceMetres(latitude, longitude, Number(policy.latitude), Number(policy.longitude));
  if (distance > Number(policy.radius_m)) {
    await audit(req, 'teacher_qr.checkin_rejected_geofence', 'teacher_record', teacher.id, { distance_m: Math.round(distance), radius_m: Number(policy.radius_m) });
    throw new HttpError(403, `Lokasi terukur sekitar ${Math.round(distance)} m dari titik sekolah, di luar radius yang diizinkan.`, 'OUTSIDE_GEOFENCE');
  }
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  try {
    const result = await query(`INSERT INTO teacher_daily_checkins (teacher_record_id,checkin_date,latitude,longitude,accuracy_m,distance_m,qr_challenge_id,verification_status)
      VALUES (?,?,?,?,?,?,?,'verified')`, [teacher.id, date, latitude, longitude, accuracy, distance, challenge.id]);
    await audit(req, 'teacher_qr.checkin_verified', 'teacher_daily_checkin', result.insertId, { checkin_date: date, accuracy_m: Math.round(accuracy), distance_m: Math.round(distance) });
    res.status(201).json({ data: { id: result.insertId, checkin_date: date, verification_status: 'verified', distance_m: Math.round(distance), checked_in_at: new Date().toISOString() }, message: `Presensi kedatangan tercatat untuk ${teacher.full_name}.` });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Presensi kedatangan hari ini sudah tercatat. Untuk koreksi, hubungi Admin Sekolah.', 'DAILY_CHECKIN_EXISTS');
    throw err;
  }
}));


// Admin review queue: teacher submission is not equivalent to official approval.
router.get('/attendance/review-queue', requirePerm('attendance.view'), asyncHandler(async (_req,res)=>{
  const [studentSessions, teacherSessions, dailyCheckins] = await Promise.all([
    query(`SELECT ats.id,ats.starts_at,ats.ends_at,ats.review_status,ats.review_notes,c.name AS class_name,sub.name AS subject_name,tr.full_name AS teacher_name,
      (SELECT COUNT(*) FROM attendance_records ar WHERE ar.session_id=ats.id AND ar.person_type='student') AS marked_count,
      (SELECT COUNT(*) FROM student_class_enrollments e WHERE e.class_id=ats.class_id AND e.status='active') AS roster_count
      FROM attendance_sessions ats JOIN classes c ON c.id=ats.class_id LEFT JOIN teaching_assignments ta ON ta.id=ats.teaching_assignment_id
      LEFT JOIN subjects sub ON sub.id=ta.subject_id LEFT JOIN teacher_records tr ON tr.id=ta.teacher_record_id
      WHERE ats.attendance_type='student' AND ats.closed_at IS NOT NULL AND ats.review_status IN ('pending','returned')
      ORDER BY ats.starts_at DESC LIMIT 200`),
    query(`SELECT tsa.id,tsa.status,tsa.source,tsa.notes,tsa.recorded_at,tsa.review_status,tsa.review_notes,ats.starts_at,c.name AS class_name,sub.name AS subject_name,t.full_name AS teacher_name
      FROM teacher_session_attendance tsa JOIN attendance_sessions ats ON ats.id=tsa.session_id
      JOIN teacher_records t ON t.id=tsa.teacher_record_id LEFT JOIN classes c ON c.id=ats.class_id LEFT JOIN teaching_assignments ta ON ta.id=ats.teaching_assignment_id LEFT JOIN subjects sub ON sub.id=ta.subject_id
      WHERE tsa.review_status IN ('pending','returned') ORDER BY tsa.recorded_at DESC LIMIT 200`),
    query(`SELECT d.id,d.checkin_date,d.checked_in_at,d.accuracy_m,d.distance_m,d.verification_status,d.verification_notes,d.review_status,d.review_notes,t.teacher_code,t.full_name AS teacher_name
      FROM teacher_daily_checkins d JOIN teacher_records t ON t.id=d.teacher_record_id
      WHERE d.review_status IN ('pending','returned') ORDER BY d.checked_in_at DESC LIMIT 200`),
  ]);
  res.json({data:{studentSessions:studentSessions.map(r=>({...r,marked_count:Number(r.marked_count),roster_count:Number(r.roster_count)})),teacherSessions,dailyCheckins}});
}));

router.post('/attendance/review/:type/:id(\\d+)', requirePerm('attendance.view'), asyncHandler(async(req,res)=>{
  const type=String(req.params.type),id=Number(req.params.id),decision=String(req.body.decision||''),notes=String(req.body.notes||'').trim().slice(0,500);
  if(!['student-session','teacher-session','daily-checkin'].includes(type)||!Number.isInteger(id)||id<1||!['approved','returned'].includes(decision))throw new HttpError(422,'Jenis data atau keputusan persetujuan tidak valid.','VALIDATION_ERROR');
  if(decision==='returned'&&notes.length<5)throw new HttpError(422,'Alasan pengembalian minimal 5 karakter.','REVIEW_NOTE_REQUIRED');
  const result=await withTransaction(async(conn)=>{
    if(type==='student-session'){
      const row=await one("SELECT id,closed_at,review_status FROM attendance_sessions WHERE id=? AND attendance_type='student' FOR UPDATE",[id],conn);
      if(!row||!row.closed_at)throw new HttpError(404,'Sesi absensi siswa yang sudah dikirim tidak ditemukan.','ATTENDANCE_SESSION_NOT_FOUND');
      await query('UPDATE attendance_sessions SET review_status=?,reviewed_by=?,reviewed_at=NOW(),review_notes=? WHERE id=?',[decision,req.user.id,notes||null,id],conn);
      await audit(req,`attendance.student_session.${decision}`,'attendance_session',id,{decision,notes},conn);
      return {id,type,decision};
    }
    if(type==='teacher-session'){
      const row=await one('SELECT id,review_status FROM teacher_session_attendance WHERE id=? FOR UPDATE',[id],conn);
      if(!row)throw new HttpError(404,'Catatan absensi mengajar tidak ditemukan.','TEACHER_ATTENDANCE_NOT_FOUND');
      await query('UPDATE teacher_session_attendance SET review_status=?,reviewed_by=?,reviewed_at=NOW(),review_notes=? WHERE id=?',[decision,req.user.id,notes||null,id],conn);
      await audit(req,`attendance.teacher_session.${decision}`,'teacher_session_attendance',id,{decision,notes},conn);
      return {id,type,decision};
    }
    const row=await one('SELECT id,review_status,verification_status FROM teacher_daily_checkins WHERE id=? FOR UPDATE',[id],conn);
    if(!row)throw new HttpError(404,'Catatan check-in guru tidak ditemukan.','TEACHER_CHECKIN_NOT_FOUND');
    if(row.verification_status!=='verified')throw new HttpError(409,'Check-in tidak lolos validasi teknis dan tidak dapat disetujui.','CHECKIN_NOT_VERIFIED');
    await query('UPDATE teacher_daily_checkins SET review_status=?,reviewed_by=?,reviewed_at=NOW(),review_notes=? WHERE id=?',[decision,req.user.id,notes||null,id],conn);
    await audit(req,`attendance.teacher_checkin.${decision}`,'teacher_daily_checkin',id,{decision,notes},conn);
    return {id,type,decision};
  });
  res.json({message:decision==='approved'?'Absensi disetujui dan dapat digunakan sebagai catatan resmi.':'Absensi dikembalikan dengan alasan; tindak lanjut diperlukan.',data:result});
}));

module.exports = router;
