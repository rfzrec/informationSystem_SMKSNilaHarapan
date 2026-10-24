-- Integrated workflows: centralized branding, assessment/report-card lifecycle,
-- education-aid tracking, graduation review, and role-scope normalization.
-- Additive and versioned; never drops operational records.

CREATE TABLE IF NOT EXISTS school_branding (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  school_name VARCHAR(180) NOT NULL DEFAULT 'SMKS Nila Harapan TIK Sunggal',
  short_name VARCHAR(100) NOT NULL DEFAULT 'SMK Nila Harapan',
  tagline VARCHAR(250) NULL,
  logo_path VARCHAR(255) NULL,
  favicon_path VARCHAR(255) NULL,
  primary_color CHAR(7) NOT NULL DEFAULT '#0f766e',
  secondary_color CHAR(7) NOT NULL DEFAULT '#123047',
  address VARCHAR(500) NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(180) NULL,
  map_url VARCHAR(500) NULL,
  social_json JSON NULL,
  footer_text VARCHAR(500) NULL,
  updated_by INT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_branding_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO school_branding (id, school_name, short_name, tagline, address, phone, email, map_url, footer_text)
VALUES (1, 'SMKS Nila Harapan TIK Sunggal', 'SMK Nila Harapan', 'Sekolah Menengah Kejuruan',
  'Jl. Binjai Km 11,2 II, Mulyorejo, Sunggal, Deli Serdang, Sumatera Utara, 20352',
  '0618457561', 'smknilaharapan@yahoo.co.id',
  'https://maps.app.goo.gl/dUPBaa5WUybwR9wH8?g_st=aw',
  'SMKS Nila Harapan TIK Sunggal · Informasi resmi sekolah');

CREATE TABLE IF NOT EXISTS assessment_periods (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  academic_year_id INT UNSIGNED NOT NULL,
  semester TINYINT UNSIGNED NOT NULL,
  period_type ENUM('monthly','uts','uas') NOT NULL,
  period_number TINYINT UNSIGNED NULL,
  period_number_key TINYINT UNSIGNED GENERATED ALWAYS AS (COALESCE(period_number, 0)) STORED,
  label VARCHAR(100) NOT NULL,
  starts_on DATE NULL,
  ends_on DATE NULL,
  task_weight DECIMAL(5,2) NOT NULL DEFAULT 40.00,
  exam_weight DECIMAL(5,2) NOT NULL DEFAULT 60.00,
  status ENUM('draft','open','closed','locked') NOT NULL DEFAULT 'draft',
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_assessment_period (academic_year_id, semester, period_type, period_number_key),
  CONSTRAINT fk_assessment_period_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT,
  CONSTRAINT fk_assessment_period_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT chk_assessment_semester CHECK (semester IN (1,2)),
  CONSTRAINT chk_assessment_weights CHECK (task_weight >= 0 AND exam_weight >= 0 AND task_weight + exam_weight = 100),
  CONSTRAINT chk_assessment_dates CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assessment_submissions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  period_id BIGINT UNSIGNED NOT NULL,
  teaching_assignment_id INT UNSIGNED NOT NULL,
  status ENUM('draft','submitted_to_homeroom','returned_to_teacher','approved_by_homeroom') NOT NULL DEFAULT 'draft',
  submitted_by INT UNSIGNED NULL,
  submitted_at DATETIME NULL,
  reviewed_by INT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  review_reason VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_assessment_submission (period_id, teaching_assignment_id),
  INDEX idx_assessment_submission_status (status, period_id),
  CONSTRAINT fk_assess_submission_period FOREIGN KEY (period_id) REFERENCES assessment_periods(id) ON DELETE RESTRICT,
  CONSTRAINT fk_assess_submission_assignment FOREIGN KEY (teaching_assignment_id) REFERENCES teaching_assignments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_assess_submission_submitter FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_assess_submission_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assessment_scores (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  submission_id BIGINT UNSIGNED NOT NULL,
  student_record_id INT UNSIGNED NOT NULL,
  component ENUM('task','monthly_exam','uts','uas') NOT NULL,
  item_label VARCHAR(160) NOT NULL DEFAULT '',
  score DECIMAL(6,2) NULL,
  notes VARCHAR(500) NULL,
  entered_by INT UNSIGNED NOT NULL,
  updated_by INT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_assessment_score (submission_id, student_record_id, component, item_label),
  INDEX idx_assessment_score_student (student_record_id, submission_id),
  CONSTRAINT fk_assessment_score_submission FOREIGN KEY (submission_id) REFERENCES assessment_submissions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_assessment_score_student FOREIGN KEY (student_record_id) REFERENCES student_records(id) ON DELETE RESTRICT,
  CONSTRAINT fk_assessment_score_entered_by FOREIGN KEY (entered_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_assessment_score_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_assessment_score_range CHECK (score IS NULL OR (score >= 0 AND score <= 100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS report_card_packages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id INT UNSIGNED NOT NULL,
  period_id BIGINT UNSIGNED NOT NULL,
  version_no INT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('draft','pending_admin','returned','published') NOT NULL DEFAULT 'draft',
  created_by INT UNSIGNED NOT NULL,
  submitted_at DATETIME NULL,
  reviewed_by INT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  review_reason VARCHAR(1000) NULL,
  published_by INT UNSIGNED NULL,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_report_package_version (class_id, period_id, version_no),
  INDEX idx_report_package_status (status, period_id),
  CONSTRAINT fk_report_package_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_report_package_period FOREIGN KEY (period_id) REFERENCES assessment_periods(id) ON DELETE RESTRICT,
  CONSTRAINT fk_report_package_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_report_package_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_report_package_publisher FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS report_card_entries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  package_id BIGINT UNSIGNED NOT NULL,
  student_record_id INT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  score_payload JSON NOT NULL,
  final_score DECIMAL(6,2) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_report_entry (package_id, student_record_id, subject_id),
  CONSTRAINT fk_report_entry_package FOREIGN KEY (package_id) REFERENCES report_card_packages(id) ON DELETE RESTRICT,
  CONSTRAINT fk_report_entry_student FOREIGN KEY (student_record_id) REFERENCES student_records(id) ON DELETE RESTRICT,
  CONSTRAINT fk_report_entry_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS education_aid_programs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  provider VARCHAR(160) NULL,
  academic_year_id INT UNSIGNED NULL,
  starts_on DATE NULL,
  ends_on DATE NULL,
  requirements_json JSON NULL,
  status ENUM('draft','open','closed','archived') NOT NULL DEFAULT 'draft',
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_aid_program_status (status, starts_on, ends_on),
  CONSTRAINT fk_aid_program_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE SET NULL,
  CONSTRAINT fk_aid_program_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT chk_aid_program_dates CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS education_aid_applications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  program_id BIGINT UNSIGNED NOT NULL,
  student_record_id INT UNSIGNED NOT NULL,
  status ENUM('draft','submitted','under_review','needs_correction','proposed','approved','rejected','disbursed','closed') NOT NULL DEFAULT 'draft',
  evidence_json JSON NULL,
  decision_notes VARCHAR(1000) NULL,
  submitted_at DATETIME NULL,
  reviewed_by INT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  updated_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_aid_application (program_id, student_record_id),
  INDEX idx_aid_application_status (status, program_id),
  CONSTRAINT fk_aid_app_program FOREIGN KEY (program_id) REFERENCES education_aid_programs(id) ON DELETE RESTRICT,
  CONSTRAINT fk_aid_app_student FOREIGN KEY (student_record_id) REFERENCES student_records(id) ON DELETE RESTRICT,
  CONSTRAINT fk_aid_app_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_aid_app_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS graduation_reviews (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  academic_year_id INT UNSIGNED NOT NULL,
  student_record_id INT UNSIGNED NOT NULL,
  status ENUM('draft','review_required','eligible','ineligible','approved','not_approved') NOT NULL DEFAULT 'draft',
  attendance_complete TINYINT(1) NOT NULL DEFAULT 0,
  grades_complete TINYINT(1) NOT NULL DEFAULT 0,
  pkl_complete TINYINT(1) NOT NULL DEFAULT 0,
  administration_complete TINYINT(1) NOT NULL DEFAULT 0,
  evidence_json JSON NULL,
  decision_reason VARCHAR(1000) NULL,
  reviewed_by INT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  updated_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_graduation_review (academic_year_id, student_record_id),
  INDEX idx_graduation_status (academic_year_id, status),
  CONSTRAINT fk_graduation_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT,
  CONSTRAINT fk_graduation_student FOREIGN KEY (student_record_id) REFERENCES student_records(id) ON DELETE RESTRICT,
  CONSTRAINT fk_graduation_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_graduation_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Permissions are created here so the migration can safely assign role links before seed runs.
INSERT INTO permissions (code, description) VALUES
 ('aid.manage','Mengelola program dan permohonan bantuan pendidikan'),
 ('aid.view','Melihat data bantuan pendidikan sesuai kewenangan'),
 ('graduation.manage','Meninjau kelengkapan dan keputusan kelulusan'),
 ('assessments.review','Meninjau nilai yang dikirim guru dan wali kelas'),
 ('reports.publish','Menerbitkan paket rapor resmi'),
 ('attendance.qr.manage','Mengatur dan menerbitkan QR presensi guru')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- Role boundary: Super Admin is technical. School Admin owns operational school content.
-- Admin PPDB retains admission responsibilities but cannot edit the entire school CMS.
DELETE rp FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE r.code = 'super_admin'
  AND p.code IN ('academic.setup','students.manage','academic.reports.view','grades.manage','attendance.view',
    'attendance.homeroom.manage','pkl.manage','finance.manage','finance.view','honor.view','honor.approve',
    'honor.manage','honor.realization.verify','honor.approve.principal','honor.approve.foundation','cms.manage');
DELETE rp FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE r.code = 'admin_ppdb' AND p.code = 'cms.manage';
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('cms.manage','academic.setup','students.manage',
  'academic.reports.view','grades.manage','attendance.view','attendance.homeroom.manage','pkl.manage',
  'finance.manage','finance.view','honor.view','honor.manage','honor.realization.verify','attendance.qr.manage','aid.manage',
  'aid.view','graduation.manage','assessments.review','reports.publish')
WHERE r.code = 'school_admin';
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('aid.view','grades.self','academic.self','attendance.self')
WHERE r.code = 'student';
