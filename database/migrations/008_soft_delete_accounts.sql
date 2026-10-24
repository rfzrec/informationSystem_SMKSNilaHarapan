-- Soft-delete akun: cabut akses login dan sembunyikan dari daftar akun tanpa merusak FK/riwayat PPDB.
ALTER TABLE users ADD COLUMN deleted_at DATETIME NULL AFTER is_active;
CREATE INDEX idx_users_deleted_at ON users (deleted_at);
