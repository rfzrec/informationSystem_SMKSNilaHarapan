-- Nonaktifkan akun demo lama yang redundan. Data akun tidak dihapus agar relasi historis tetap aman.
UPDATE users
SET is_active = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE LOWER(email) IN (
  'admin.sistem@contoh.sch.id',
  'panitia@demo.nilaharapan.test',
  'operator@demo.nilaharapan.test'
);
