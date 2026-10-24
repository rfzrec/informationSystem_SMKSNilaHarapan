-- Additive role expansion: preserve applicant as a distinct, stable role and add school leadership.
-- Does not reassign existing admin accounts to school_leader because migration 019 already
-- consolidated legacy principal/foundation_head roles into admin and removed their distinction.

INSERT INTO roles (code, name, description) VALUES
  ('applicant', 'Calon Murid', 'Mengelola pengajuan PPDB milik sendiri; identitas role dipertahankan setelah aktivasi'),
  ('school_leader', 'Pimpinan Sekolah', 'Kepala Sekolah dan Kepala Yayasan; akses ringkasan dan laporan sesuai kewenangan')
ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description);

INSERT INTO permissions (code, description) VALUES
  ('applicant.self', 'Mengelola pengajuan PPDB milik sendiri sebelum aktivasi siswa'),
  ('admissions.summary.view', 'Melihat ringkasan agregat PPDB tanpa mengelola pengajuan individual')
ON DUPLICATE KEY UPDATE description=VALUES(description);

-- Restore the distinct applicant role only for accounts still in the applicant lifecycle.
-- Accounts with an active student account are left as-is to avoid changing existing student access.
UPDATE user_roles ur
JOIN users u ON u.id=ur.user_id
JOIN roles current_role ON current_role.id=ur.role_id AND current_role.code IN ('siswa','applicant')
JOIN applicants ap ON ap.user_id=u.id
LEFT JOIN student_accounts sa ON sa.user_id=u.id AND sa.status='active'
JOIN roles applicant_role ON applicant_role.code='applicant'
SET ur.role_id=applicant_role.id
WHERE u.account_stage='applicant' AND sa.user_id IS NULL;

-- A Calon Murid gets only self-service PPDB permission. Active student permissions are
-- inherited dynamically by middleware when account_stage='student'; role identity stays stable.
DELETE rp FROM role_permissions rp
JOIN roles r ON r.id=rp.role_id
WHERE r.code IN ('applicant','school_leader');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code='applicant.self'
WHERE r.code='applicant';

-- Leadership is read-only by default. No user is automatically assigned this role.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code = 'admissions.summary.view'
WHERE r.code='school_leader';

-- Do not grant applicant.self to the general siswa role; this avoids exposing PPDB endpoints
-- to active student accounts through permission alone. applicant.routes also checks account_stage.
DELETE rp FROM role_permissions rp
JOIN roles r ON r.id=rp.role_id
JOIN permissions p ON p.id=rp.permission_id
WHERE r.code='siswa' AND p.code='applicant.self';
