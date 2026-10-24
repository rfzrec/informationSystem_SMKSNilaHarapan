-- Fondasi SIAKAD: role akademik, data tahun ajaran, kelas, guru, siswa, presensi, nilai, pembayaran, honor.
-- Migration additive: tidak menghapus atau menulis ulang tabel PPDB yang sudah ada.

CREATE TABLE IF NOT EXISTS academic_years (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(20) NOT NULL UNIQUE,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_academic_year_dates CHECK (ends_on > starts_on),
  INDEX idx_academic_year_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teacher_records (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL UNIQUE,
  employee_number VARCHAR(40) NULL UNIQUE,
  full_name VARCHAR(150) NOT NULL,
  employment_status ENUM('active','inactive','on_leave') NOT NULL DEFAULT 'active',
  hired_on DATE NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_teacher_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS classes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  academic_year_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  grade_level TINYINT UNSIGNED NOT NULL,
  study_program VARCHAR(100) NOT NULL,
  homeroom_teacher_id INT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_class_year_name (academic_year_id, name),
  INDEX idx_classes_program_grade (study_program, grade_level),
  CONSTRAINT fk_classes_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id),
  CONSTRAINT fk_classes_homeroom_teacher FOREIGN KEY (homeroom_teacher_id) REFERENCES teacher_records(id) ON DELETE SET NULL,
  CONSTRAINT chk_class_grade CHECK (grade_level BETWEEN 10 AND 12)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS student_accounts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_record_id INT UNSIGNED NOT NULL UNIQUE,
  user_id INT UNSIGNED NOT NULL UNIQUE,
  status ENUM('pending_activation','active','disabled') NOT NULL DEFAULT 'pending_activation',
  activated_by INT UNSIGNED NULL,
  activated_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_student_account_record FOREIGN KEY (student_record_id) REFERENCES student_records(id) ON DELETE RESTRICT,
  CONSTRAINT fk_student_account_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_student_account_activator FOREIGN KEY (activated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS guardian_student_links (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  guardian_user_id INT UNSIGNED NOT NULL,
  student_record_id INT UNSIGNED NOT NULL,
  relationship VARCHAR(40) NOT NULL,
  status ENUM('pending','verified','revoked') NOT NULL DEFAULT 'pending',
  verified_by INT UNSIGNED NULL,
  verified_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_guardian_student (guardian_user_id, student_record_id),
  CONSTRAINT fk_gsl_guardian FOREIGN KEY (guardian_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_gsl_student FOREIGN KEY (student_record_id) REFERENCES student_records(id) ON DELETE RESTRICT,
  CONSTRAINT fk_gsl_verifier FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_class_enrollments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_record_id INT UNSIGNED NOT NULL,
  class_id INT UNSIGNED NOT NULL,
  enrolled_on DATE NOT NULL,
  ended_on DATE NULL,
  status ENUM('active','promoted','transferred','withdrawn') NOT NULL DEFAULT 'active',
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_student_class_start (student_record_id, class_id),
  INDEX idx_enrollment_class_status (class_id, status),
  CONSTRAINT fk_enrollment_student FOREIGN KEY (student_record_id) REFERENCES student_records(id) ON DELETE RESTRICT,
  CONSTRAINT fk_enrollment_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_enrollment_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subjects (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  study_program VARCHAR(100) NULL,
  grade_level TINYINT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teaching_assignments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id INT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  teacher_record_id INT UNSIGNED NOT NULL,
  weekly_periods TINYINT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_teaching_assignment (class_id, subject_id, teacher_record_id),
  CONSTRAINT fk_assignment_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_assignment_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_assignment_teacher FOREIGN KEY (teacher_record_id) REFERENCES teacher_records(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS class_schedules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teaching_assignment_id INT UNSIGNED NOT NULL,
  day_of_week TINYINT UNSIGNED NOT NULL,
  starts_at TIME NOT NULL,
  ends_at TIME NOT NULL,
  room VARCHAR(60) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_schedule_day_time (day_of_week, starts_at, ends_at),
  CONSTRAINT fk_schedule_assignment FOREIGN KEY (teaching_assignment_id) REFERENCES teaching_assignments(id) ON DELETE CASCADE,
  CONSTRAINT chk_schedule_day CHECK (day_of_week BETWEEN 1 AND 6),
  CONSTRAINT chk_schedule_time CHECK (ends_at > starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS grade_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teaching_assignment_id INT UNSIGNED NOT NULL,
  semester TINYINT UNSIGNED NOT NULL,
  title VARCHAR(120) NOT NULL,
  category ENUM('assignment','quiz','midterm','final','practice','other') NOT NULL DEFAULT 'other',
  max_score DECIMAL(6,2) NOT NULL DEFAULT 100,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_grade_item_assignment FOREIGN KEY (teaching_assignment_id) REFERENCES teaching_assignments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_grade_item_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_grade_semester CHECK (semester IN (1,2)),
  CONSTRAINT chk_grade_max CHECK (max_score > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_grades (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  grade_item_id INT UNSIGNED NOT NULL,
  student_record_id INT UNSIGNED NOT NULL,
  score DECIMAL(6,2) NOT NULL,
  notes VARCHAR(500) NULL,
  entered_by INT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_grade_item_student (grade_item_id, student_record_id),
  CONSTRAINT fk_student_grade_item FOREIGN KEY (grade_item_id) REFERENCES grade_items(id) ON DELETE RESTRICT,
  CONSTRAINT fk_student_grade_record FOREIGN KEY (student_record_id) REFERENCES student_records(id) ON DELETE RESTRICT,
  CONSTRAINT fk_student_grade_teacher FOREIGN KEY (entered_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT chk_student_score CHECK (score >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  attendance_type ENUM('teacher','student') NOT NULL,
  teaching_assignment_id INT UNSIGNED NULL,
  teacher_record_id INT UNSIGNED NULL,
  class_id INT UNSIGNED NULL,
  token_hash CHAR(64) NULL,
  token_expires_at DATETIME NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  created_by INT UNSIGNED NOT NULL,
  closed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_attendance_session_window (attendance_type, starts_at, ends_at),
  CONSTRAINT fk_attendance_assignment FOREIGN KEY (teaching_assignment_id) REFERENCES teaching_assignments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_attendance_teacher FOREIGN KEY (teacher_record_id) REFERENCES teacher_records(id) ON DELETE RESTRICT,
  CONSTRAINT fk_attendance_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_attendance_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT chk_attendance_window CHECK (ends_at > starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance_records (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id INT UNSIGNED NOT NULL,
  person_type ENUM('teacher','student') NOT NULL,
  student_record_id INT UNSIGNED NULL,
  teacher_record_id INT UNSIGNED NULL,
  status ENUM('present','late','sick','permission','absent') NOT NULL,
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  recorded_by INT UNSIGNED NULL,
  correction_reason VARCHAR(500) NULL,
  corrected_by INT UNSIGNED NULL,
  corrected_at DATETIME NULL,
  UNIQUE KEY uq_attendance_student (session_id, student_record_id),
  UNIQUE KEY uq_attendance_teacher (session_id, teacher_record_id),
  INDEX idx_attendance_person_date (person_type, recorded_at),
  CONSTRAINT fk_attendance_record_session FOREIGN KEY (session_id) REFERENCES attendance_sessions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_attendance_record_student FOREIGN KEY (student_record_id) REFERENCES student_records(id) ON DELETE RESTRICT,
  CONSTRAINT fk_attendance_record_teacher FOREIGN KEY (teacher_record_id) REFERENCES teacher_records(id) ON DELETE RESTRICT,
  CONSTRAINT fk_attendance_recorded_by FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_attendance_corrected_by FOREIGN KEY (corrected_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fee_types (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_invoices (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_record_id INT UNSIGNED NOT NULL,
  fee_type_id INT UNSIGNED NOT NULL,
  academic_year_id INT UNSIGNED NULL,
  description VARCHAR(200) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  due_date DATE NULL,
  status ENUM('unpaid','partially_paid','paid','waived','cancelled') NOT NULL DEFAULT 'unpaid',
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_invoice_student_status (student_record_id, status),
  CONSTRAINT fk_invoice_student FOREIGN KEY (student_record_id) REFERENCES student_records(id) ON DELETE RESTRICT,
  CONSTRAINT fk_invoice_fee_type FOREIGN KEY (fee_type_id) REFERENCES fee_types(id) ON DELETE RESTRICT,
  CONSTRAINT fk_invoice_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE SET NULL,
  CONSTRAINT fk_invoice_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT chk_invoice_amount CHECK (amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_records (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_method ENUM('cash','bank_transfer','other') NOT NULL DEFAULT 'cash',
  reference_number VARCHAR(100) NULL,
  paid_at DATETIME NOT NULL,
  status ENUM('pending_verification','verified','rejected') NOT NULL DEFAULT 'pending_verification',
  proof_path VARCHAR(500) NULL,
  verified_by INT UNSIGNED NULL,
  verified_at DATETIME NULL,
  notes VARCHAR(500) NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_payment_invoice_status (invoice_id, status),
  CONSTRAINT fk_payment_invoice FOREIGN KEY (invoice_id) REFERENCES student_invoices(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payment_verifier FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_payment_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT chk_payment_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teacher_honor_periods (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  status ENUM('draft','calculated','approved','paid') NOT NULL DEFAULT 'draft',
  approved_by INT UNSIGNED NULL,
  approved_at DATETIME NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_honor_period_dates CHECK (ends_on >= starts_on),
  CONSTRAINT fk_honor_period_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_honor_period_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teacher_honor_details (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  period_id INT UNSIGNED NOT NULL,
  teacher_record_id INT UNSIGNED NOT NULL,
  scheduled_periods INT UNSIGNED NOT NULL DEFAULT 0,
  attended_periods INT UNSIGNED NOT NULL DEFAULT 0,
  excused_periods INT UNSIGNED NOT NULL DEFAULT 0,
  absent_periods INT UNSIGNED NOT NULL DEFAULT 0,
  rate_per_period DECIMAL(12,2) NOT NULL DEFAULT 0,
  deduction_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  gross_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  net_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  calculation_json JSON NULL,
  UNIQUE KEY uq_honor_period_teacher (period_id, teacher_record_id),
  CONSTRAINT fk_honor_detail_period FOREIGN KEY (period_id) REFERENCES teacher_honor_periods(id) ON DELETE RESTRICT,
  CONSTRAINT fk_honor_detail_teacher FOREIGN KEY (teacher_record_id) REFERENCES teacher_records(id) ON DELETE RESTRICT,
  CONSTRAINT chk_honor_amounts CHECK (rate_per_period >= 0 AND deduction_amount >= 0 AND gross_amount >= 0 AND net_amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
