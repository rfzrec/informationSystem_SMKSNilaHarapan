const express = require('express');
const { query, one } = require('../config/db');
const { asyncHandler } = require('../utils/http');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const u = req.user;
  const notifications = await query('SELECT id,title,message,link,is_read,created_at FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 5',[u.id]);
  let data = {};
  if (u.role === 'admin') {
    const [[students],[teachers],[classes],[programs],[applications],[pending],[accepted],[pendingAttendance],[pendingReports]] = await Promise.all([
      query('SELECT COUNT(*) AS n FROM student_records'),
      query("SELECT COUNT(*) AS n FROM teacher_records WHERE employment_status='active'"),
      query('SELECT COUNT(*) AS n FROM classes WHERE is_active=1'),
      query('SELECT COUNT(*) AS n FROM school_programs WHERE is_active=1'),
      query("SELECT COUNT(*) AS n FROM applications WHERE submission_status<>'draft'"),
      query("SELECT COUNT(*) AS n FROM applications WHERE submission_status IN ('submitted','needs_revision')"),
      query("SELECT COUNT(*) AS n FROM applications WHERE selection_status='accepted'"),
      query("SELECT COUNT(*) AS n FROM attendance_sessions WHERE attendance_type='student' AND closed_at IS NOT NULL AND review_status IN ('pending','returned')"),
      query("SELECT COUNT(*) AS n FROM report_card_packages WHERE status='pending_admin'")
    ]);
    data = { overview: { students:Number(students.n), teachers:Number(teachers.n), classes:Number(classes.n), programs:Number(programs.n), applications:Number(applications.n), pending_applications:Number(pending.n), accepted_applications:Number(accepted.n), pending_attendance:Number(pendingAttendance.n), pending_report_packages:Number(pendingReports.n) } };
  } else if (u.role === 'applicant' && u.account_stage === 'applicant') {
    const applicant = await one('SELECT id FROM applicants WHERE user_id=?', [u.id]);
    const application = applicant ? await one("SELECT id, submission_status, selection_status, re_registration_status FROM applications WHERE applicant_id=? ORDER BY id DESC LIMIT 1", [applicant.id]) : null;
    data = { overview: { has_applicant_record: !!applicant, application_status: application || null } };
  } else if (u.role === 'guru') {
    const teacher = await one("SELECT id FROM teacher_records WHERE user_id=? AND employment_status='active'",[u.id]);
    if (teacher) {
      const [[assignments],[realizations],[pendingRealizations],[paid],[homeroom]] = await Promise.all([
        query('SELECT COUNT(*) AS n FROM teaching_assignments WHERE teacher_record_id=?',[teacher.id]),
        query('SELECT COUNT(*) AS n FROM teacher_teaching_realizations WHERE teacher_record_id=?',[teacher.id]),
        query("SELECT COUNT(*) AS n FROM teacher_teaching_realizations WHERE teacher_record_id=? AND status='pending'",[teacher.id]),
        query("SELECT COUNT(*) AS n FROM teacher_payroll_details d JOIN teacher_payroll_periods p ON p.id=d.period_id WHERE d.teacher_record_id=? AND p.status='paid'",[teacher.id]),
        query('SELECT COUNT(*) AS n FROM class_homeroom_assignments WHERE teacher_record_id=? AND starts_on<=CURDATE() AND (ends_on IS NULL OR ends_on>=CURDATE())',[teacher.id])
      ]);
      data = { overview:{linked:true,assignments:Number(assignments.n),realizations:Number(realizations.n),pending_realizations:Number(pendingRealizations.n),paid_periods:Number(paid.n),homeroom_classes:Number(homeroom.n)} };
    } else data = { overview:{linked:false,assignments:0,realizations:0,pending_realizations:0,paid_periods:0,homeroom_classes:0} };
  } else if (u.role === 'school_leader') {
    const [[students],[teachers],[classes],[applications],[accepted],[pending]] = await Promise.all([
      query('SELECT COUNT(*) AS n FROM student_records'),
      query("SELECT COUNT(*) AS n FROM teacher_records WHERE employment_status='active'"),
      query('SELECT COUNT(*) AS n FROM classes WHERE is_active=1'),
      query("SELECT COUNT(*) AS n FROM applications WHERE submission_status <> 'draft'"),
      query("SELECT COUNT(*) AS n FROM applications WHERE selection_status='accepted'"),
      query("SELECT COUNT(*) AS n FROM applications WHERE submission_status IN ('submitted','needs_revision')"),
    ]);
    data = { overview: { students: Number(students.n), teachers: Number(teachers.n), classes: Number(classes.n), applications: Number(applications.n), accepted_applications: Number(accepted.n), pending_applications: Number(pending.n) } };
  } else if ((u.role === 'siswa' || u.role === 'applicant') && u.account_stage === 'student') {
    const student = await one("SELECT sr.id,sr.student_number,sr.full_name,e.class_id,c.name AS class_name,p.title AS program_title FROM student_accounts sa JOIN student_records sr ON sr.id=sa.student_record_id LEFT JOIN student_class_enrollments e ON e.student_record_id=sr.id AND e.status='active' LEFT JOIN classes c ON c.id=e.class_id LEFT JOIN school_programs p ON p.id=sr.program_id WHERE sa.user_id=? AND sa.status='active' ORDER BY e.id DESC LIMIT 1",[u.id]);
    data = { overview:{linked:!!student,student:student||null} };
  } else if (u.role === 'superadmin') {
    const [[programs],[teachers],[admins]] = await Promise.all([
      query('SELECT COUNT(*) AS n FROM school_programs WHERE is_active=1'),
      query("SELECT COUNT(*) AS n FROM teacher_records WHERE employment_status='active'"),
      query("SELECT COUNT(*) AS n FROM user_roles ur JOIN roles r ON r.id=ur.role_id JOIN users a ON a.id=ur.user_id WHERE r.code='admin' AND a.is_active=1 AND a.deleted_at IS NULL")
    ]);
    data = { overview:{active_programs:Number(programs.n),active_teachers:Number(teachers.n),active_admins:Number(admins.n)} };
  }
  res.json({data:{role:u.role,account_stage:u.account_stage,notifications,...data}});
}));
module.exports = router;
