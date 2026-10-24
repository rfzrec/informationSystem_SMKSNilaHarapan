-- Upgrade safety for databases that already marked older migrations as applied.
-- This migration enforces the latest four-role model without deleting business records.

INSERT IGNORE INTO roles (code, name, description) VALUES
  ('superadmin','Superadmin','Mengelola master jurusan, master guru dan akun guru, konfigurasi teknis, audit, dan pemulihan.'),
  ('admin','Admin Sekolah','Mengelola seluruh operasional sekolah termasuk PPDB, CMS, akademik, absensi dan rapor.'),
  ('guru','Guru','Mengakses jadwal dan proses yang menjadi penugasan guru.'),
  ('siswa','Siswa','Mengakses PPDB sebelum aktivasi dan data akademik pribadi setelah aktivasi.');

-- Legacy parent accounts are not portal roles. Deactivate them before removing the role assignment.
UPDATE users u
JOIN user_roles ur ON ur.user_id=u.id
JOIN roles oldr ON oldr.id=ur.role_id AND oldr.code='guardian'
SET u.is_active=0, u.account_stage='staff';

-- One user has one canonical role (user_roles primary key is user_id), so mapping is atomic per account.
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

DELETE ur FROM user_roles ur
JOIN roles oldr ON oldr.id=ur.role_id
WHERE oldr.code='guardian';

UPDATE users u
JOIN applicants ap ON ap.user_id=u.id
LEFT JOIN student_accounts sa ON sa.user_id=u.id AND sa.status='active'
SET u.account_stage=IF(sa.user_id IS NULL,'applicant','student');
UPDATE users u
JOIN user_roles ur ON ur.user_id=u.id
JOIN roles r ON r.id=ur.role_id
SET u.account_stage='staff'
WHERE r.code IN ('superadmin','admin','guru');

DELETE rp FROM role_permissions rp
JOIN roles r ON r.id=rp.role_id
WHERE r.code IN ('super_admin','sysadmin','school_admin','admin_ppdb','committee','operator','principal','foundation_head','teacher','student','applicant','guardian');
DELETE FROM roles
WHERE code IN ('super_admin','sysadmin','school_admin','admin_ppdb','committee','operator','principal','foundation_head','teacher','student','applicant','guardian');

-- Recovery for accounts that may have lost their role in an older migration attempt
-- (user_roles is keyed by user_id, so the old INSERT IGNORE pattern was unsafe).
-- Reconstruct only roles that are unambiguous from a linked master record.
INSERT INTO user_roles (user_id, role_id)
SELECT t.user_id, r.id
FROM teacher_records t JOIN roles r ON r.code='guru'
WHERE t.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id=t.user_id);

INSERT INTO user_roles (user_id, role_id)
SELECT a.user_id, r.id
FROM applicants a JOIN roles r ON r.code='siswa'
WHERE a.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id=a.user_id);

INSERT INTO user_roles (user_id, role_id)
SELECT sa.user_id, r.id
FROM student_accounts sa JOIN roles r ON r.code='siswa'
WHERE sa.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id=sa.user_id);
