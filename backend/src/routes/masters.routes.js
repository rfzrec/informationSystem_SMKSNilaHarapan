const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { query, one, withTransaction } = require('../config/db');
const { asyncHandler, HttpError } = require('../utils/http');
const { requireAuth, requirePerm } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { audit } = require('../utils/audit');
const { createUserWithRole, hashPassword } = require('../services/authService');

const router = express.Router();
router.use(requireAuth, requirePerm('masters.manage'));
const slugify = (s) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 180);
const tempPassword = () => `NH-${crypto.randomBytes(7).toString('base64url')}-7`;

// Program master is the single source used by PPDB choices, student records, classes and CMS pages.
router.get('/programs', asyncHandler(async (_req, res) => {
  const rows = await query(`SELECT p.id,p.code,p.title,p.slug,p.summary,p.status,p.is_active,p.created_at,p.updated_at,
    (SELECT COUNT(*) FROM student_records sr WHERE sr.program_id=p.id) AS student_count,
    (SELECT COUNT(*) FROM classes c WHERE c.program_id=p.id AND c.is_active=1) AS class_count,
    (SELECT COUNT(*) FROM application_preferences ap JOIN applications a ON a.id=ap.application_id WHERE ap.program_id=p.id AND a.submission_status<>'draft') AS applicant_count
    FROM school_programs p ORDER BY p.is_active DESC,p.title`);
  res.json({ data: rows.map(r => ({ ...r, is_active: !!Number(r.is_active), student_count:Number(r.student_count),class_count:Number(r.class_count),applicant_count:Number(r.applicant_count) })) });
}));

router.post('/programs', validate(z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,30}$/),
  title: z.string().trim().min(3).max(200), summary: z.string().trim().max(500).optional().default(''),
})), asyncHandler(async (req, res) => {
  const { code, title, summary } = req.valid;
  if (await one('SELECT id FROM school_programs WHERE code=? OR LOWER(title)=LOWER(?) LIMIT 1',[code,title])) throw new HttpError(409,'Kode atau nama jurusan sudah digunakan.','PROGRAM_EXISTS');
  let slug = slugify(title) || `program-${code.toLowerCase()}`;
  if (await one('SELECT id FROM school_programs WHERE slug=?',[slug])) slug = `${slug}-${code.toLowerCase()}`;
  const result = await query(`INSERT INTO school_programs (title,slug,summary,body,status,code,is_active,author_id,editor_id)
    VALUES (?,?,?,?,'draft',?,1,?,?)`,[title,slug,summary || `Program keahlian ${code}`, 'Deskripsi resmi dilengkapi oleh Admin Sekolah melalui CMS.',code,req.user.id,req.user.id]);
  await audit(req,'master.program_created','school_program',result.insertId,{code,title});
  res.status(201).json({ message:'Jurusan berhasil dibuat dan tersedia sebagai master aktif. Admin Sekolah dapat melengkapi serta menerbitkan halaman publiknya melalui CMS.',data:{id:result.insertId,code,title,slug,is_active:true,status:'draft'} });
}));

router.put('/programs/:id(\\d+)', validate(z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,30}$/), title: z.string().trim().min(3).max(200),
  summary: z.string().trim().max(500).optional().default(''), is_active: z.boolean(),
})), asyncHandler(async (req,res)=>{
  const id=Number(req.params.id); const {code,title,summary,is_active}=req.valid;
  const before=await one('SELECT * FROM school_programs WHERE id=?',[id]);
  if(!before) throw new HttpError(404,'Jurusan tidak ditemukan.','PROGRAM_NOT_FOUND');
  if(await one('SELECT id FROM school_programs WHERE id<>? AND (code=? OR LOWER(title)=LOWER(?)) LIMIT 1',[id,code,title])) throw new HttpError(409,'Kode atau nama jurusan sudah digunakan.','PROGRAM_EXISTS');
  if(!is_active){
    const use=await one(`SELECT (SELECT COUNT(*) FROM student_records WHERE program_id=?) + (SELECT COUNT(*) FROM classes WHERE program_id=? AND is_active=1) AS n`,[id,id]);
    if(Number(use.n)>0) throw new HttpError(409,'Jurusan masih dipakai siswa atau kelas aktif. Pindahkan relasi akademiknya sebelum menonaktifkan jurusan.','PROGRAM_IN_USE');
  }
  // Keep slugs unique when a master program is renamed, and synchronize human-readable legacy labels.
  const baseSlug=slugify(title)||`program-${code.toLowerCase()}`;
  let nextSlug=baseSlug; let suffix=1;
  while(await one('SELECT id FROM school_programs WHERE slug=? AND id<>? LIMIT 1',[nextSlug,id])) nextSlug=`${baseSlug}-${code.toLowerCase()}-${suffix++}`;
  await withTransaction(async(conn)=>{
    await query('UPDATE school_programs SET code=?,title=?,summary=?,slug=?,is_active=?,editor_id=? WHERE id=?',[code,title,summary || null,nextSlug, is_active?1:0,req.user.id,id],conn);
    await query('UPDATE classes SET study_program=? WHERE program_id=?',[title,id],conn);
    await query('UPDATE subjects SET study_program=? WHERE program_id=?',[title,id],conn);
    await audit(req,'master.program_updated','school_program',id,{before:{code:before.code,title:before.title,is_active:!!Number(before.is_active)},after:{code,title,is_active,slug:nextSlug}},conn);
  });
  res.json({message:'Master jurusan diperbarui; label kelas dan mata pelajaran diselaraskan tanpa mengubah ID relasi.',data:{id,code,title,slug:nextSlug,is_active}});
}));

// Superadmin creates a teacher record and its login together in one transaction.
router.get('/teachers', asyncHandler(async (_req,res)=>{
  const rows=await query(`SELECT COALESCE(t.id,u.id) AS id,t.id AS teacher_record_id,t.teacher_code,t.employee_number,t.nip,t.nuptk,u.full_name,t.gender,t.birth_date,t.address,
    t.education_level,t.subject_specialization,t.employment_type,t.employment_status,t.hired_on,t.created_at,
    u.id AS user_id,u.email,u.phone,u.position_code,u.position_name,u.employee_code,u.is_active,u.must_change_password,r.code AS role,r.name AS role_name,
    (SELECT COUNT(*) FROM teaching_assignments ta WHERE ta.teacher_record_id=t.id) AS assignment_count,
    (SELECT COUNT(*) FROM class_homeroom_assignments h WHERE h.teacher_record_id=t.id AND h.ends_on IS NULL) AS active_homeroom_count
    FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
    LEFT JOIN teacher_records t ON t.user_id=u.id
    WHERE u.deleted_at IS NULL AND r.code IN ('guru','school_leader') ORDER BY u.full_name`);
  res.json({data:rows.map(r=>({...r,is_active:!!Number(r.is_active),must_change_password:!!Number(r.must_change_password),assignment_count:Number(r.assignment_count),active_homeroom_count:Number(r.active_homeroom_count),is_leadership:r.role==='school_leader'}))});
}));

const teacherCreateSchema=z.object({
  full_name:z.string().trim().min(3).max(150), email:z.string().trim().toLowerCase().email().max(190), phone:z.string().trim().max(30).optional().default(''),
  employee_number:z.string().trim().max(40).optional().default(''), nip:z.string().trim().max(40).optional().default(''), nuptk:z.string().trim().max(40).optional().default(''),
  gender:z.enum(['male','female','unspecified']).optional().default('unspecified'), birth_date:z.string().trim().optional().default(''), address:z.string().trim().max(500).optional().default(''),
  education_level:z.string().trim().max(80).optional().default(''), subject_specialization:z.string().trim().max(120).optional().default(''),
  position_code:z.enum(['guru','kepala_sekolah','kepala_yayasan','staf']).default('guru'),
  position_name:z.string().trim().max(120).optional().default(''),
  employment_type:z.enum(['permanent','contract','honorary','other']).optional().default('other'), hired_on:z.string().trim().optional().default(''),
});
router.post('/teachers',validate(teacherCreateSchema),asyncHandler(async(req,res)=>{
  const v=req.valid;
  const duplicate=await one(`SELECT id FROM teacher_records WHERE (?<>'' AND employee_number=?) OR (?<>'' AND nip=?) OR (?<>'' AND nuptk=?) LIMIT 1`,[v.employee_number,v.employee_number,v.nip,v.nip,v.nuptk,v.nuptk]);
  if(duplicate) throw new HttpError(409,'Nomor pegawai, NIP, atau NUPTK sudah digunakan.','TEACHER_IDENTIFIER_TAKEN');
  const password=tempPassword();
  const created=await withTransaction(async(conn)=>{
    const roleCode = v.position_code === 'kepala_sekolah' || v.position_code === 'kepala_yayasan' ? 'school_leader' : 'guru';
    const userId=await createUserWithRole(conn,{email:v.email,fullName:v.full_name,phone:v.phone,password,roleCode,accountStage:'staff',mustChange:true});
    const rolePrefix = v.position_code === 'kepala_sekolah' ? 'KASEK' : v.position_code === 'kepala_yayasan' ? 'KAYAS' : v.position_code === 'guru' ? 'GURU' : 'STAF';
    const employeeCode = `${rolePrefix}-${String(userId).padStart(6,'0')}`;
    await query('UPDATE users SET position_code=?,position_name=?,employee_code=? WHERE id=?',[v.position_code,v.position_name||null,employeeCode,userId],conn);
    if (roleCode !== 'guru') return {userId,teacherId:null,teacherCode:employeeCode,employeeCode,role:roleCode,position_code:v.position_code};
    const teacher=await one('SELECT id FROM teacher_records WHERE user_id=? FOR UPDATE',[userId],conn);
    if(!teacher) throw new Error('Record guru tidak berhasil dibuat bersama akun.');
    const teacherCode=`GURU-${String(teacher.id).padStart(6,'0')}`;
    await query(`UPDATE teacher_records SET teacher_code=?,employee_number=?,nip=?,nuptk=?,full_name=?,gender=?,birth_date=?,address=?,education_level=?,subject_specialization=?,employment_type=?,employment_status='active',hired_on=? WHERE id=?`,
      [teacherCode,v.employee_number||null,v.nip||null,v.nuptk||null,v.full_name,v.gender,v.birth_date||null,v.address||null,v.education_level||null,v.subject_specialization||null,v.employment_type,v.hired_on||null,teacher.id],conn);
    return {userId,teacherId:Number(teacher.id),teacherCode,employeeCode,role:roleCode,position_code:v.position_code};
  });
  if (created.teacherId) await audit(req,'master.teacher_created','teacher_record',created.teacherId,{user_id:created.userId,teacher_code:created.teacherCode,email:v.email,position_code:v.position_code});
  else await audit(req,'master.employee_created','user',created.userId,{email:v.email,position_code:v.position_code,role:created.role});
  res.status(201).json({message:'Akun pegawai dan data pegawai dibuat secara terhubung. Simpan kode unik dan kata sandi sementara lalu sampaikan melalui kanal aman.',data:{...created,email:v.email,full_name:v.full_name,temporary_password:password,role:created.role,must_change_password:true}});
}));

router.put('/teachers/:id(\\d+)',validate(z.object({
  full_name:z.string().trim().min(3).max(150),email:z.string().trim().toLowerCase().email().max(190),phone:z.string().trim().max(30).optional().default(''),
  employee_number:z.string().trim().max(40).optional().default(''),nip:z.string().trim().max(40).optional().default(''),nuptk:z.string().trim().max(40).optional().default(''),
  gender:z.enum(['male','female','unspecified']),birth_date:z.string().trim().optional().default(''),address:z.string().trim().max(500).optional().default(''),
  education_level:z.string().trim().max(80).optional().default(''),subject_specialization:z.string().trim().max(120).optional().default(''),employment_type:z.enum(['permanent','contract','honorary','other']),hired_on:z.string().trim().optional().default(''),
})),asyncHandler(async(req,res)=>{
  const id=Number(req.params.id),v=req.valid;
  const t=await one('SELECT id,user_id,teacher_code FROM teacher_records WHERE id=?',[id]);
  if(!t) throw new HttpError(404,'Data guru tidak ditemukan. Akun pimpinan dikelola melalui Akun Pengguna.','TEACHER_NOT_FOUND');
  const emailDup=await one('SELECT id FROM users WHERE email=? AND id<>?',[v.email,t.user_id]);
  const identityDup=await one(`SELECT id FROM teacher_records WHERE id<>? AND ((?<>'' AND employee_number=?) OR (?<>'' AND nip=?) OR (?<>'' AND nuptk=?)) LIMIT 1`,[id,v.employee_number,v.employee_number,v.nip,v.nip,v.nuptk,v.nuptk]);
  if(emailDup) throw new HttpError(409,'Email sudah dipakai akun lain.','EMAIL_TAKEN');
  if(identityDup) throw new HttpError(409,'Nomor pegawai, NIP, atau NUPTK sudah digunakan.','TEACHER_IDENTIFIER_TAKEN');
  await withTransaction(async(conn)=>{
    await query('UPDATE users SET email=?,full_name=?,phone=? WHERE id=?',[v.email,v.full_name,v.phone||null,t.user_id],conn);
    await query(`UPDATE teacher_records SET employee_number=?,nip=?,nuptk=?,full_name=?,gender=?,birth_date=?,address=?,education_level=?,subject_specialization=?,employment_type=?,hired_on=? WHERE id=?`,
      [v.employee_number||null,v.nip||null,v.nuptk||null,v.full_name,v.gender,v.birth_date||null,v.address||null,v.education_level||null,v.subject_specialization||null,v.employment_type,v.hired_on||null,id],conn);
    await audit(req,'master.teacher_updated','teacher_record',id,{teacher_code:t.teacher_code,email:v.email},conn);
  });
  res.json({message:'Data guru diperbarui; kode unik dan relasi akun tetap dipertahankan.'});
}));

router.post('/teachers/:id(\\d+)/reset-password', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const employee = await one(`SELECT COALESCE(t.id,u.id) AS id, u.id AS user_id, u.employee_code, t.teacher_code, u.full_name, u.email, u.is_active, r.code AS role
    FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id LEFT JOIN teacher_records t ON t.user_id=u.id
    WHERE COALESCE(t.id,u.id)=? AND u.deleted_at IS NULL AND r.code IN ('guru','school_leader')`, [id]);
  if (!employee) throw new HttpError(404, 'Pegawai tidak ditemukan.', 'EMPLOYEE_NOT_FOUND');
  if (!employee.is_active) throw new HttpError(409, 'Aktifkan akun pegawai sebelum mengganti sandi.', 'EMPLOYEE_INACTIVE');
  const password = tempPassword();
  await withTransaction(async (conn) => {
    await query('UPDATE users SET password_hash=?, must_change_password=1 WHERE id=?', [await hashPassword(password), employee.user_id], conn);
    await query('DELETE FROM sessions WHERE data LIKE ? OR data LIKE ?', [`%"userId":${employee.user_id},%`, `%"userId":${employee.user_id}}%`], conn);
    await audit(req, 'master.employee_password_reset', 'user', employee.user_id, { employee_code: employee.employee_code, teacher_code: employee.teacher_code, user_id: employee.user_id }, conn);
  });
  res.json({ message: 'Kata sandi sementara pegawai berhasil dibuat. Pengguna wajib menggantinya saat login berikutnya.', data: { employee_code: employee.employee_code, teacher_code: employee.teacher_code, full_name: employee.full_name, email: employee.email, temporary_password: password, must_change_password: true } });
}));
router.post('/teachers/:id(\\d+)/status',validate(z.object({is_active:z.boolean()})),asyncHandler(async(req,res)=>{
  const id=Number(req.params.id),active=req.valid.is_active;
  const employee=await one(`SELECT COALESCE(t.id,u.id) AS id,u.id AS user_id,u.employee_code,t.teacher_code,u.position_code,u.full_name,r.code AS role FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id LEFT JOIN teacher_records t ON t.user_id=u.id WHERE COALESCE(t.id,u.id)=? AND r.code IN ('guru','school_leader')`,[id]);
  if(!employee) throw new HttpError(404,'Pegawai tidak ditemukan.','EMPLOYEE_NOT_FOUND');
  if(!active && Number(employee.user_id)===Number(req.user.id)) throw new HttpError(409,'Superadmin tidak dapat menonaktifkan akun sendiri melalui pengelolaan pegawai.','SELF_DEACTIVATE');
  await withTransaction(async(conn)=>{
    if (employee.role === 'guru') await query('UPDATE teacher_records SET employment_status=? WHERE user_id=?',[active?'active':'inactive',employee.user_id],conn);
    await query('UPDATE users SET is_active=? WHERE id=?',[active?1:0,employee.user_id],conn);
    if(!active) await query('DELETE FROM sessions WHERE data LIKE ? OR data LIKE ?',[`%"userId":${employee.user_id},%`,`%"userId":${employee.user_id}}%`],conn);
    await audit(req,active?'master.employee_activated':'master.employee_deactivated','user',employee.user_id,{employee_code:employee.employee_code,teacher_code:employee.teacher_code},conn);
  });
  res.json({message:active?'Akun pegawai diaktifkan.':'Akun pegawai dinonaktifkan; histori dan relasi tetap dipertahankan.'});
}));

module.exports=router;
