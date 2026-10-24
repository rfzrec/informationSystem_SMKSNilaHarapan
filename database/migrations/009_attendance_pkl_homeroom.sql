-- Fondasi tambahan akademik: riwayat wali kelas, kegiatan PKL, dan presensi PKL.
-- Migrasi bersifat aditif; tidak menghapus atau mereset data lama.
CREATE TABLE IF NOT EXISTS class_homeroom_assignments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id INT UNSIGNED NOT NULL,
  teacher_record_id INT UNSIGNED NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NULL,
  assigned_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_homeroom_class_dates (class_id, starts_on, ends_on),
  INDEX idx_homeroom_teacher_dates (teacher_record_id, starts_on, ends_on),
  CONSTRAINT fk_homeroom_history_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_homeroom_history_teacher FOREIGN KEY (teacher_record_id) REFERENCES teacher_records(id) ON DELETE RESTRICT,
  CONSTRAINT fk_homeroom_history_assigner FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT chk_homeroom_dates CHECK (ends_on IS NULL OR ends_on >= starts_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pkl_activities (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id INT UNSIGNED NOT NULL,
  supervising_teacher_id INT UNSIGNED NOT NULL,
  title VARCHAR(160) NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  location VARCHAR(200) NULL,
  description VARCHAR(1000) NULL,
  status ENUM('draft','confirmed','cancelled','completed') NOT NULL DEFAULT 'draft',
  created_by INT UNSIGNED NOT NULL,
  confirmed_by INT UNSIGNED NULL,
  confirmed_at DATETIME NULL,
  cancelled_by INT UNSIGNED NULL,
  cancelled_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pkl_class_period (class_id, starts_on, ends_on, status),
  INDEX idx_pkl_teacher_period (supervising_teacher_id, starts_on, ends_on),
  CONSTRAINT fk_pkl_activity_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pkl_activity_teacher FOREIGN KEY (supervising_teacher_id) REFERENCES teacher_records(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pkl_activity_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pkl_activity_confirmer FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_pkl_activity_canceller FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_pkl_activity_dates CHECK (ends_on >= starts_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pkl_student_attendance (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  activity_id BIGINT UNSIGNED NOT NULL,
  student_record_id INT UNSIGNED NOT NULL,
  attendance_date DATE NOT NULL,
  status ENUM('present','sick','permission','absent') NOT NULL,
  notes VARCHAR(500) NULL,
  recorded_by INT UNSIGNED NOT NULL,
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  correction_reason VARCHAR(500) NULL,
  corrected_by INT UNSIGNED NULL,
  corrected_at DATETIME NULL,
  UNIQUE KEY uq_pkl_attendance_student_date (activity_id, student_record_id, attendance_date),
  INDEX idx_pkl_attendance_date_status (attendance_date, status),
  CONSTRAINT fk_pkl_attendance_activity FOREIGN KEY (activity_id) REFERENCES pkl_activities(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pkl_attendance_student FOREIGN KEY (student_record_id) REFERENCES student_records(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pkl_attendance_recorder FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pkl_attendance_corrector FOREIGN KEY (corrected_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE attendance_sessions
  ADD INDEX idx_attendance_assignment_start (teaching_assignment_id, starts_at);

-- Kehadiran guru per sesi dicatat terpisah dari konfirmasi absensi siswa.
CREATE TABLE IF NOT EXISTS teacher_session_attendance (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id INT UNSIGNED NOT NULL,
  teacher_record_id INT UNSIGNED NOT NULL,
  status ENUM('present','absent','permission','sick','pending') NOT NULL DEFAULT 'pending',
  source ENUM('physical_verification','manual_admin','assignment') NOT NULL,
  notes VARCHAR(500) NULL,
  recorded_by INT UNSIGNED NOT NULL,
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  corrected_by INT UNSIGNED NULL,
  corrected_at DATETIME NULL,
  correction_reason VARCHAR(500) NULL,
  UNIQUE KEY uq_teacher_session_attendance (session_id, teacher_record_id),
  INDEX idx_teacher_attendance_date_status (teacher_record_id, status, recorded_at),
  CONSTRAINT fk_tsa_session FOREIGN KEY (session_id) REFERENCES attendance_sessions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tsa_teacher FOREIGN KEY (teacher_record_id) REFERENCES teacher_records(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tsa_recorder FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tsa_corrector FOREIGN KEY (corrected_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
