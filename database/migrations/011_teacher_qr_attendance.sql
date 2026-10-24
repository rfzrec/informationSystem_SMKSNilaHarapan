-- Dynamic teacher daily check-in. It does not replace per-lesson attendance records.
CREATE TABLE IF NOT EXISTS school_attendance_policy (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  radius_m SMALLINT UNSIGNED NOT NULL DEFAULT 100,
  max_accuracy_m SMALLINT UNSIGNED NOT NULL DEFAULT 50,
  qr_ttl_seconds SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  updated_by INT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_attendance_policy_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_policy_lat CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT chk_policy_lon CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  CONSTRAINT chk_policy_radius CHECK (radius_m BETWEEN 20 AND 1000),
  CONSTRAINT chk_policy_accuracy CHECK (max_accuracy_m BETWEEN 5 AND 250),
  CONSTRAINT chk_policy_qr_ttl CHECK (qr_ttl_seconds BETWEEN 30 AND 180)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO school_attendance_policy (id, radius_m, max_accuracy_m, qr_ttl_seconds) VALUES (1, 100, 50, 60);

CREATE TABLE IF NOT EXISTS teacher_qr_challenges (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  status ENUM('active','revoked','expired') NOT NULL DEFAULT 'active',
  issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  created_by INT UNSIGNED NOT NULL,
  revoked_by INT UNSIGNED NULL,
  revoked_at DATETIME NULL,
  INDEX idx_teacher_qr_status_expiry (status, expires_at),
  CONSTRAINT fk_teacher_qr_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_teacher_qr_revoker FOREIGN KEY (revoked_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teacher_daily_checkins (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_record_id INT UNSIGNED NOT NULL,
  checkin_date DATE NOT NULL,
  checked_in_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  accuracy_m DECIMAL(8,2) NOT NULL,
  distance_m DECIMAL(8,2) NOT NULL,
  qr_challenge_id BIGINT UNSIGNED NOT NULL,
  verification_status ENUM('verified','manual_review') NOT NULL DEFAULT 'verified',
  verification_notes VARCHAR(500) NULL,
  UNIQUE KEY uq_teacher_daily_checkin (teacher_record_id, checkin_date),
  INDEX idx_teacher_checkin_date_status (checkin_date, verification_status),
  CONSTRAINT fk_teacher_checkin_teacher FOREIGN KEY (teacher_record_id) REFERENCES teacher_records(id) ON DELETE RESTRICT,
  CONSTRAINT fk_teacher_checkin_qr FOREIGN KEY (qr_challenge_id) REFERENCES teacher_qr_challenges(id) ON DELETE RESTRICT,
  CONSTRAINT chk_teacher_checkin_accuracy CHECK (accuracy_m >= 0),
  CONSTRAINT chk_teacher_checkin_distance CHECK (distance_m >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO permissions (code, description) VALUES
 ('attendance.qr.manage','Mengatur dan menerbitkan QR presensi guru'),
 ('attendance.qr.self','Presensi kedatangan pribadi guru dengan QR dinamis')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code='attendance.qr.manage' WHERE r.code='school_admin';
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code='attendance.qr.self' WHERE r.code='teacher';
