-- Integrasi profil Guru dengan akun login dan modul honor.
-- Additive migration: tidak menghapus data yang sudah ada.
ALTER TABLE teacher_records
  ADD COLUMN nip VARCHAR(40) NULL,
  ADD COLUMN nuptk VARCHAR(40) NULL,
  ADD COLUMN gender ENUM('male','female','unspecified') NOT NULL DEFAULT 'unspecified',
  ADD COLUMN birth_date DATE NULL,
  ADD COLUMN address VARCHAR(500) NULL,
  ADD COLUMN education_level VARCHAR(80) NULL,
  ADD COLUMN subject_specialization VARCHAR(120) NULL,
  ADD COLUMN employment_type ENUM('permanent','contract','honorary','other') NOT NULL DEFAULT 'other',
  ADD COLUMN bank_name VARCHAR(100) NULL,
  ADD COLUMN bank_account_name VARCHAR(150) NULL,
  ADD COLUMN bank_account_number VARCHAR(60) NULL;

-- Perbaiki akun role teacher lama yang belum mempunyai teacher_records.
-- Nomor pegawai dan tanggal masuk dibiarkan NULL untuk akun lama karena nilainya tidak boleh dikarang.
INSERT INTO teacher_records (user_id, employee_number, full_name, employment_status, hired_on)
SELECT u.id, NULL, u.full_name, 'active', NULL
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id AND r.code = 'teacher'
LEFT JOIN teacher_records t ON t.user_id = u.id
WHERE t.id IS NULL;

-- Akun guru yang sudah memiliki profil dipastikan aktif; tidak mengaktifkan role lain.
UPDATE users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id AND r.code = 'teacher'
JOIN teacher_records t ON t.user_id = u.id AND t.employment_status = 'active'
SET u.is_active = 1;
