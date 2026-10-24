-- Consolidasi role lama menjadi tujuh role inti. Tidak menghapus akun pengguna.
INSERT INTO roles (code, name, description)
VALUES ('school_admin', 'Admin Sekolah', 'Mengelola data akademik, data induk, guru, presensi, keuangan, dan operasional sekolah')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

-- Pindahkan akun role lama ke role inti yang paling sesuai.
UPDATE user_roles ur JOIN roles oldr ON oldr.id = ur.role_id
JOIN roles newr ON newr.code = CASE
  WHEN oldr.code IN ('committee') THEN 'admin_ppdb'
  WHEN oldr.code IN ('operator', 'principal', 'foundation_head') THEN 'school_admin'
  WHEN oldr.code IN ('sysadmin') THEN 'super_admin'
  ELSE oldr.code END
SET ur.role_id = newr.id
WHERE oldr.code IN ('committee','operator','principal','foundation_head','sysadmin');

-- Setelah seluruh akun dipindahkan, hapus role lama agar daftar akun tidak membingungkan.
DELETE FROM roles WHERE code IN ('committee','operator','principal','foundation_head','sysadmin');
