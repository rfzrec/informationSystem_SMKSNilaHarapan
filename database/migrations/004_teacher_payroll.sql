-- Modul honor guru berbasis jam mengajar aktual, dengan approval terpisah dan riwayat pembayaran.
CREATE TABLE IF NOT EXISTS teacher_hourly_rates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_record_id INT UNSIGNED NOT NULL,
  hourly_rate DECIMAL(12,2) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_teacher_rate_start (teacher_record_id, effective_from),
  INDEX idx_teacher_rate_effective (teacher_record_id, effective_from, effective_to),
  CONSTRAINT fk_hourly_rate_teacher FOREIGN KEY (teacher_record_id) REFERENCES teacher_records(id) ON DELETE RESTRICT,
  CONSTRAINT fk_hourly_rate_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT chk_hourly_rate_positive CHECK (hourly_rate >= 0),
  CONSTRAINT chk_hourly_rate_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teacher_teaching_realizations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_record_id INT UNSIGNED NOT NULL,
  teaching_assignment_id INT UNSIGNED NOT NULL,
  teaching_date DATE NOT NULL,
  starts_at TIME NOT NULL,
  ends_at TIME NOT NULL,
  hours DECIMAL(6,2) NOT NULL,
  status ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  notes VARCHAR(500) NULL,
  submitted_by INT UNSIGNED NOT NULL,
  verified_by INT UNSIGNED NULL,
  verified_at DATETIME NULL,
  verification_note VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_teaching_realization (teaching_assignment_id, teaching_date, starts_at),
  INDEX idx_realization_teacher_date (teacher_record_id, teaching_date, status),
  CONSTRAINT fk_realization_teacher FOREIGN KEY (teacher_record_id) REFERENCES teacher_records(id) ON DELETE RESTRICT,
  CONSTRAINT fk_realization_assignment FOREIGN KEY (teaching_assignment_id) REFERENCES teaching_assignments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_realization_submitter FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_realization_verifier FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_realization_times CHECK (ends_at > starts_at),
  CONSTRAINT chk_realization_hours CHECK (hours > 0 AND hours <= 24)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teacher_payroll_periods (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  status ENUM('draft','pending_approval','approved','paid') NOT NULL DEFAULT 'draft',
  created_by INT UNSIGNED NOT NULL,
  principal_approved_by INT UNSIGNED NULL,
  principal_approved_at DATETIME NULL,
  foundation_approved_by INT UNSIGNED NULL,
  foundation_approved_at DATETIME NULL,
  paid_by INT UNSIGNED NULL,
  paid_at DATETIME NULL,
  payment_reference VARCHAR(100) NULL,
  payment_notes VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_payroll_period_dates (starts_on, ends_on, status),
  CONSTRAINT fk_payroll_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_principal FOREIGN KEY (principal_approved_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_payroll_foundation FOREIGN KEY (foundation_approved_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_payroll_paid_by FOREIGN KEY (paid_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_payroll_dates CHECK (ends_on >= starts_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teacher_payroll_details (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  period_id INT UNSIGNED NOT NULL,
  teacher_record_id INT UNSIGNED NOT NULL,
  actual_hours DECIMAL(8,2) NOT NULL DEFAULT 0,
  hourly_rate_snapshot DECIMAL(12,2) NOT NULL DEFAULT 0,
  gross_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  realization_ids_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payroll_period_teacher (period_id, teacher_record_id),
  CONSTRAINT fk_payroll_detail_period FOREIGN KEY (period_id) REFERENCES teacher_payroll_periods(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_detail_teacher FOREIGN KEY (teacher_record_id) REFERENCES teacher_records(id) ON DELETE RESTRICT,
  CONSTRAINT chk_payroll_detail_values CHECK (actual_hours >= 0 AND hourly_rate_snapshot >= 0 AND gross_amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
