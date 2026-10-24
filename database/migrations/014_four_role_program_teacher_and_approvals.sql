-- Four-role consolidation and master data model.
-- Additive/transformative migration: preserves student/admission/academic records.

ALTER TABLE users
  ADD COLUMN account_stage ENUM('staff','applicant','student') NOT NULL DEFAULT 'staff';

INSERT INTO roles (code, name, description) VALUES
 ('superadmin','Superadmin','Mengelola master jurusan, data dan akun guru, konfigurasi teknis, audit, dan pemulihan sistem.'),
 ('admin','Admin Sekolah','Mengelola PPDB, CMS, kesiswaan, kelas, roster, persetujuan absensi, nilai/rapor, dan administrasi sekolah.'),
 ('guru','Guru','Mengelola jadwal dan sesi yang ditugaskan, presensi, pengajuan nilai, serta tugas tambahan berdasarkan penugasan.'),
 ('siswa','Siswa','Mengakses proses PPDB sebelum aktif dan portal akademik setelah aktivasi; data terbatas pada identitas sendiri.')
ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description);

-- Convert old roles into exactly four canonical roles. Applicant accounts become the siswa role with an applicant lifecycle stage.
UPDATE users u JOIN applicants ap ON ap.user_id=u.id SET u.account_stage='applicant';
UPDATE users u JOIN student_accounts sa ON sa.user_id=u.id AND sa.status='active' SET u.account_stage='student';

-- Guardian logins are retired, rather than incorrectly converting a parent into a student.
UPDATE users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles oldr ON oldr.id=ur.role_id AND oldr.code='guardian'
SET u.is_active=0, u.account_stage='staff';
DELETE ur FROM user_roles ur JOIN roles oldr ON oldr.id=ur.role_id WHERE oldr.code='guardian';

-- Replace role_id in-place. user_roles has PRIMARY KEY(user_id), so INSERT IGNORE followed
-- by deleting old rows would accidentally remove the account's only role.
UPDATE user_roles ur
JOIN roles oldr ON oldr.id=ur.role_id
JOIN roles newr ON newr.code = CASE oldr.code
  WHEN 'super_admin' THEN 'superadmin'
  WHEN 'sysadmin' THEN 'superadmin'
  WHEN 'school_admin' THEN 'admin'
  WHEN 'admin_ppdb' THEN 'admin'
  WHEN 'committee' THEN 'admin'
  WHEN 'operator' THEN 'admin'
  WHEN 'principal' THEN 'admin'
  WHEN 'foundation_head' THEN 'admin'
  WHEN 'teacher' THEN 'guru'
  WHEN 'student' THEN 'siswa'
  WHEN 'applicant' THEN 'siswa'
  ELSE oldr.code END
SET ur.role_id=newr.id
WHERE oldr.code IN ('super_admin','sysadmin','school_admin','admin_ppdb','committee','operator','principal','foundation_head','teacher','student','applicant');
DELETE ur FROM user_roles ur JOIN roles oldr ON oldr.id=ur.role_id WHERE oldr.code='guardian';

DELETE rp FROM role_permissions rp JOIN roles r ON r.id=rp.role_id
WHERE r.code IN ('applicant','guardian','admin_ppdb','school_admin','super_admin','teacher','student');
DELETE FROM roles WHERE code IN ('applicant','guardian','admin_ppdb','school_admin','super_admin','teacher','student');

-- Convert account lifecycle separately from role. A calon siswa is not a fifth role.
UPDATE users u JOIN applicants ap ON ap.user_id=u.id
LEFT JOIN student_accounts sa ON sa.user_id=u.id AND sa.status='active'
SET u.account_stage=IF(sa.user_id IS NULL,'applicant','student');
UPDATE users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
SET u.account_stage='staff' WHERE r.code IN ('superadmin','admin','guru');

-- The school-program collection doubles as the single master for jurusan and its public CMS page.
ALTER TABLE school_programs
  ADD COLUMN code VARCHAR(30) NULL,
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1;
UPDATE school_programs SET code=CONCAT('PRG-', LPAD(id,4,'0')) WHERE code IS NULL OR code='';
ALTER TABLE school_programs ADD UNIQUE KEY uq_school_program_code (code);

-- Stable unique teacher code is a reference key, not a credential/authentication secret.
ALTER TABLE teacher_records ADD COLUMN teacher_code VARCHAR(40) NULL;
UPDATE teacher_records SET teacher_code=CONCAT('GURU-', LPAD(id,6,'0')) WHERE teacher_code IS NULL OR teacher_code='';
ALTER TABLE teacher_records ADD UNIQUE KEY uq_teacher_code (teacher_code);

-- One authoritative program reference drives applicant choices, student placement, class grouping and timetable.
ALTER TABLE student_records ADD COLUMN program_id INT UNSIGNED NULL;
ALTER TABLE classes ADD COLUMN program_id INT UNSIGNED NULL;
ALTER TABLE subjects ADD COLUMN program_id INT UNSIGNED NULL;

UPDATE student_records sr
JOIN applications a ON a.id=sr.source_application_id
JOIN application_preferences pref ON pref.application_id=a.id AND pref.preference_rank=1
SET sr.program_id=pref.program_id WHERE sr.program_id IS NULL;
UPDATE classes c JOIN school_programs p ON LOWER(TRIM(p.title))=LOWER(TRIM(c.study_program))
SET c.program_id=p.id WHERE c.program_id IS NULL;
UPDATE subjects s JOIN school_programs p ON LOWER(TRIM(p.title))=LOWER(TRIM(s.study_program))
SET s.program_id=p.id WHERE s.program_id IS NULL;

ALTER TABLE student_records ADD CONSTRAINT fk_student_program_master FOREIGN KEY (program_id) REFERENCES school_programs(id) ON DELETE RESTRICT;
ALTER TABLE classes ADD CONSTRAINT fk_class_program_master FOREIGN KEY (program_id) REFERENCES school_programs(id) ON DELETE RESTRICT;
ALTER TABLE subjects ADD CONSTRAINT fk_subject_program_master FOREIGN KEY (program_id) REFERENCES school_programs(id) ON DELETE RESTRICT;

-- Explicit review by Admin after teacher submits class attendance; submission is not publication.
ALTER TABLE attendance_sessions
  ADD COLUMN review_status ENUM('pending','approved','returned') NOT NULL DEFAULT 'pending',
  ADD COLUMN reviewed_by INT UNSIGNED NULL,
  ADD COLUMN reviewed_at DATETIME NULL,
  ADD COLUMN review_notes VARCHAR(500) NULL;
ALTER TABLE attendance_sessions ADD CONSTRAINT fk_attendance_review_user FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE teacher_session_attendance
  ADD COLUMN review_status ENUM('pending','approved','returned') NOT NULL DEFAULT 'pending',
  ADD COLUMN reviewed_by INT UNSIGNED NULL,
  ADD COLUMN reviewed_at DATETIME NULL,
  ADD COLUMN review_notes VARCHAR(500) NULL;
ALTER TABLE teacher_session_attendance ADD CONSTRAINT fk_teacher_session_review_user FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE teacher_daily_checkins
  ADD COLUMN review_status ENUM('pending','approved','returned') NOT NULL DEFAULT 'pending',
  ADD COLUMN reviewed_by INT UNSIGNED NULL,
  ADD COLUMN reviewed_at DATETIME NULL,
  ADD COLUMN review_notes VARCHAR(500) NULL;
ALTER TABLE teacher_daily_checkins ADD CONSTRAINT fk_teacher_daily_review_user FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_attendance_review_status ON attendance_sessions (review_status, attendance_type, starts_at);
CREATE INDEX idx_teacher_daily_review_status ON teacher_daily_checkins (review_status, checkin_date);
CREATE INDEX idx_teacher_session_review_status ON teacher_session_attendance (review_status, recorded_at);

-- Program availability is independently controlled from whether public descriptive content is published.
INSERT INTO school_programs (title, slug, summary, body, status, code, is_active)
SELECT 'Teknik Komputer dan Jaringan', 'teknik-komputer-jaringan', 'Program Keahlian TKJ', 'Isi profil resmi program ini melalui CMS.', 'draft', 'TKJ', 1
WHERE NOT EXISTS (SELECT 1 FROM school_programs WHERE code='TKJ' OR slug='teknik-komputer-jaringan');
INSERT INTO school_programs (title, slug, summary, body, status, code, is_active)
SELECT 'Teknik Sepeda Motor', 'teknik-sepeda-motor', 'Program Keahlian TSM', 'Isi profil resmi program ini melalui CMS.', 'draft', 'TSM', 1
WHERE NOT EXISTS (SELECT 1 FROM school_programs WHERE code='TSM' OR slug='teknik-sepeda-motor');
INSERT INTO school_programs (title, slug, summary, body, status, code, is_active)
SELECT 'Tata Busana', 'tata-busana', 'Program Keahlian Tata Busana', 'Isi profil resmi program ini melalui CMS.', 'draft', 'TB', 1
WHERE NOT EXISTS (SELECT 1 FROM school_programs WHERE code='TB' OR slug='tata-busana');
