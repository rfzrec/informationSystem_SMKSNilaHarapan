-- Skema awal Sistem Informasi Sekolah SMKS Nila Harapan (InnoDB, utf8mb4)

CREATE TABLE IF NOT EXISTS roles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(60) NOT NULL UNIQUE,
  description VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(30) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id INT UNSIGNED NOT NULL,
  role_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_ur_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ur_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  expires INT UNSIGNED NOT NULL,
  data MEDIUMTEXT COLLATE utf8mb4_bin
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(60) NULL,
  entity_id VARCHAR(60) NULL,
  details_json TEXT NULL,
  ip_address VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_action (action),
  INDEX idx_audit_entity (entity_type, entity_id),
  INDEX idx_audit_created (created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_error_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  method VARCHAR(10) NULL,
  path VARCHAR(255) NULL,
  message VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_err_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value TEXT NULL,
  updated_by INT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_settings_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS backup_records (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  status ENUM('success','failed') NOT NULL,
  size_bytes BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===== CMS Company Profile =====
CREATE TABLE IF NOT EXISTS school_profiles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  section_key VARCHAR(40) NOT NULL UNIQUE,
  title VARCHAR(200) NOT NULL,
  content TEXT NULL,
  image_path VARCHAR(255) NULL,
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  updated_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sp_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_programs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  slug VARCHAR(220) NOT NULL UNIQUE,
  summary VARCHAR(500) NULL,
  body TEXT NULL,
  image_path VARCHAR(255) NULL,
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  published_at DATETIME NULL,
  author_id INT UNSIGNED NULL,
  editor_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_prog_status (status, published_at),
  CONSTRAINT fk_prog_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_prog_editor FOREIGN KEY (editor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_facilities LIKE school_programs;
CREATE TABLE IF NOT EXISTS school_gallery LIKE school_programs;

CREATE TABLE IF NOT EXISTS school_achievements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  slug VARCHAR(220) NOT NULL UNIQUE,
  summary VARCHAR(500) NULL,
  body TEXT NULL,
  achievement_year SMALLINT UNSIGNED NULL,
  achievement_level VARCHAR(80) NULL,
  image_path VARCHAR(255) NULL,
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  published_at DATETIME NULL,
  author_id INT UNSIGNED NULL,
  editor_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ach_status (status, published_at),
  CONSTRAINT fk_ach_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_ach_editor FOREIGN KEY (editor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS news_articles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  article_type ENUM('news','article') NOT NULL DEFAULT 'news',
  title VARCHAR(200) NOT NULL,
  slug VARCHAR(220) NOT NULL UNIQUE,
  summary VARCHAR(500) NULL,
  body TEXT NULL,
  image_path VARCHAR(255) NULL,
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  published_at DATETIME NULL,
  author_id INT UNSIGNED NULL,
  editor_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_news_status (status, published_at),
  CONSTRAINT fk_news_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_news_editor FOREIGN KEY (editor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS announcements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category ENUM('general','ppdb') NOT NULL DEFAULT 'general',
  audience ENUM('public','authenticated') NOT NULL DEFAULT 'public',
  title VARCHAR(200) NOT NULL,
  slug VARCHAR(220) NOT NULL UNIQUE,
  summary VARCHAR(500) NULL,
  body TEXT NULL,
  image_path VARCHAR(255) NULL,
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  published_at DATETIME NULL,
  author_id INT UNSIGNED NULL,
  editor_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ann_status (category, audience, status, published_at),
  CONSTRAINT fk_ann_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_ann_editor FOREIGN KEY (editor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ppdb_faqs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  question VARCHAR(300) NOT NULL,
  answer TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===== PPDB =====
CREATE TABLE IF NOT EXISTS admission_periods (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  academic_year VARCHAR(20) NOT NULL,
  level VARCHAR(60) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status ENUM('draft','scheduled','active','closed','archived') NOT NULL DEFAULT 'draft',
  description TEXT NULL,
  form_config_json TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_period_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admission_stages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  period_id INT UNSIGNED NOT NULL,
  stage_type ENUM('registration','verification','selection','announcement','re_registration') NOT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  notes VARCHAR(255) NULL,
  UNIQUE KEY uq_stage (period_id, stage_type),
  CONSTRAINT fk_stage_period FOREIGN KEY (period_id) REFERENCES admission_periods(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admission_paths (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  period_id INT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  special_requirements TEXT NULL,
  terms TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_path_name (period_id, name),
  CONSTRAINT fk_path_period FOREIGN KEY (period_id) REFERENCES admission_periods(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admission_quotas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  path_id INT UNSIGNED NOT NULL UNIQUE,
  quota INT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_quota_path FOREIGN KEY (path_id) REFERENCES admission_paths(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS document_requirements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  period_id INT UNSIGNED NOT NULL,
  path_id INT UNSIGNED NULL,
  stage ENUM('application','re_registration') NOT NULL DEFAULT 'application',
  name VARCHAR(150) NOT NULL,
  description VARCHAR(500) NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 1,
  allowed_types VARCHAR(60) NOT NULL DEFAULT 'pdf,jpg,png',
  max_size_kb INT UNSIGNED NOT NULL DEFAULT 2048,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_req_period (period_id, stage, is_active),
  CONSTRAINT fk_req_period FOREIGN KEY (period_id) REFERENCES admission_periods(id),
  CONSTRAINT fk_req_path FOREIGN KEY (path_id) REFERENCES admission_paths(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS applicants (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL UNIQUE,
  full_name VARCHAR(150) NOT NULL,
  nik VARCHAR(16) NULL,
  nisn VARCHAR(10) NULL,
  gender ENUM('L','P') NULL,
  birth_place VARCHAR(100) NULL,
  birth_date DATE NULL,
  religion VARCHAR(30) NULL,
  address TEXT NULL,
  phone VARCHAR(30) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_applicant_name (full_name),
  INDEX idx_applicant_nik (nik),
  CONSTRAINT fk_applicant_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS applicant_guardians (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  applicant_id INT UNSIGNED NOT NULL,
  relation ENUM('ayah','ibu','wali') NOT NULL,
  full_name VARCHAR(150) NULL,
  occupation VARCHAR(100) NULL,
  phone VARCHAR(30) NULL,
  address TEXT NULL,
  UNIQUE KEY uq_guardian_rel (applicant_id, relation),
  CONSTRAINT fk_guardian_applicant FOREIGN KEY (applicant_id) REFERENCES applicants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS applicant_education (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  applicant_id INT UNSIGNED NOT NULL UNIQUE,
  school_name VARCHAR(150) NULL,
  npsn VARCHAR(12) NULL,
  graduation_year SMALLINT UNSIGNED NULL,
  school_address TEXT NULL,
  CONSTRAINT fk_edu_applicant FOREIGN KEY (applicant_id) REFERENCES applicants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_records (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_number VARCHAR(30) NOT NULL UNIQUE,
  source_application_id INT UNSIGNED NOT NULL UNIQUE,
  nik VARCHAR(16) NOT NULL UNIQUE,
  full_name VARCHAR(150) NOT NULL,
  gender ENUM('L','P') NULL,
  birth_date DATE NULL,
  entry_year VARCHAR(20) NOT NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_student_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS applications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  applicant_id INT UNSIGNED NOT NULL,
  period_id INT UNSIGNED NOT NULL,
  path_id INT UNSIGNED NULL,
  registration_number VARCHAR(30) NULL UNIQUE,
  submission_status ENUM('draft','submitted','needs_revision','complete','cancelled') NOT NULL DEFAULT 'draft',
  selection_status ENUM('not_processed','in_process','pending_decision','accepted','rejected','waitlist') NOT NULL DEFAULT 'not_processed',
  re_registration_status ENUM('not_open','awaiting_confirmation','in_process','awaiting_verification','needs_revision','completed','withdrawn') NOT NULL DEFAULT 'not_open',
  integration_status ENUM('not_processed','ready','in_process','success','failed','needs_review') NOT NULL DEFAULT 'not_processed',
  revision_notes TEXT NULL,
  assigned_committee_id INT UNSIGNED NULL,
  student_record_id INT UNSIGNED NULL,
  submitted_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_app_applicant_period (applicant_id, period_id),
  INDEX idx_app_status (period_id, submission_status),
  INDEX idx_app_selection (selection_status),
  INDEX idx_app_rereg (re_registration_status),
  INDEX idx_app_integration (integration_status),
  CONSTRAINT fk_app_applicant FOREIGN KEY (applicant_id) REFERENCES applicants(id),
  CONSTRAINT fk_app_period FOREIGN KEY (period_id) REFERENCES admission_periods(id),
  CONSTRAINT fk_app_path FOREIGN KEY (path_id) REFERENCES admission_paths(id),
  CONSTRAINT fk_app_committee FOREIGN KEY (assigned_committee_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_app_student FOREIGN KEY (student_record_id) REFERENCES student_records(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS application_preferences (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id INT UNSIGNED NOT NULL,
  program_id INT UNSIGNED NOT NULL,
  preference_rank TINYINT UNSIGNED NOT NULL,
  UNIQUE KEY uq_pref_rank (application_id, preference_rank),
  UNIQUE KEY uq_pref_program (application_id, program_id),
  CONSTRAINT fk_pref_app FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
  CONSTRAINT fk_pref_program FOREIGN KEY (program_id) REFERENCES school_programs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS application_documents (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id INT UNSIGNED NOT NULL,
  requirement_id INT UNSIGNED NOT NULL,
  status ENUM('not_uploaded','pending','verified','needs_revision','rejected') NOT NULL DEFAULT 'not_uploaded',
  current_version_id INT UNSIGNED NULL,
  notes VARCHAR(500) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_doc_req (application_id, requirement_id),
  INDEX idx_doc_status (status),
  CONSTRAINT fk_doc_app FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_doc_req FOREIGN KEY (requirement_id) REFERENCES document_requirements(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS document_versions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  document_id INT UNSIGNED NOT NULL,
  version_no INT UNSIGNED NOT NULL,
  storage_name VARCHAR(100) NOT NULL UNIQUE,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  uploaded_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_doc_version (document_id, version_no),
  CONSTRAINT fk_ver_doc FOREIGN KEY (document_id) REFERENCES application_documents(id),
  CONSTRAINT fk_ver_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS verification_records (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id INT UNSIGNED NOT NULL,
  document_id INT UNSIGNED NULL,
  target ENUM('document','application','re_registration') NOT NULL,
  previous_status VARCHAR(40) NULL,
  new_status VARCHAR(40) NOT NULL,
  notes VARCHAR(1000) NULL,
  verifier_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ver_app (application_id),
  CONSTRAINT fk_vr_app FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_vr_doc FOREIGN KEY (document_id) REFERENCES application_documents(id),
  CONSTRAINT fk_vr_user FOREIGN KEY (verifier_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS selection_rules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  period_id INT UNSIGNED NOT NULL UNIQUE,
  criteria_json TEXT NOT NULL,
  ranking_notes TEXT NULL,
  waitlist_enabled TINYINT(1) NOT NULL DEFAULT 0,
  updated_by INT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rule_period FOREIGN KEY (period_id) REFERENCES admission_periods(id),
  CONSTRAINT fk_rule_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS selection_approvals (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  period_id INT UNSIGNED NOT NULL,
  status ENUM('submitted','approved','rejected','published') NOT NULL DEFAULT 'submitted',
  result_count INT UNSIGNED NOT NULL DEFAULT 0,
  submitted_by INT UNSIGNED NULL,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by INT UNSIGNED NULL,
  decided_at DATETIME NULL,
  decision_notes VARCHAR(1000) NULL,
  publish_at DATETIME NULL,
  published_at DATETIME NULL,
  INDEX idx_appr_status (status, publish_at),
  CONSTRAINT fk_appr_period FOREIGN KEY (period_id) REFERENCES admission_periods(id),
  CONSTRAINT fk_appr_sub FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_appr_dec FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS selection_results (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id INT UNSIGNED NOT NULL UNIQUE,
  scores_json TEXT NULL,
  proposed_status ENUM('accepted','rejected','waitlist') NOT NULL,
  notes VARCHAR(1000) NULL,
  approval_id INT UNSIGNED NULL,
  is_official TINYINT(1) NOT NULL DEFAULT 0,
  updated_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_res_app FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_res_appr FOREIGN KEY (approval_id) REFERENCES selection_approvals(id) ON DELETE SET NULL,
  CONSTRAINT fk_res_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS re_registration_records (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id INT UNSIGNED NOT NULL,
  action VARCHAR(40) NOT NULL,
  previous_status VARCHAR(40) NULL,
  new_status VARCHAR(40) NOT NULL,
  notes VARCHAR(1000) NULL,
  actor_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rr_app (application_id),
  CONSTRAINT fk_rr_app FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_rr_user FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS guardian_links (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  guardian_user_id INT UNSIGNED NOT NULL,
  applicant_id INT UNSIGNED NOT NULL,
  status ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  verified_by INT UNSIGNED NULL,
  verified_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_guardian_link (guardian_user_id, applicant_id),
  CONSTRAINT fk_gl_guardian FOREIGN KEY (guardian_user_id) REFERENCES users(id),
  CONSTRAINT fk_gl_applicant FOREIGN KEY (applicant_id) REFERENCES applicants(id),
  CONSTRAINT fk_gl_verifier FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  type VARCHAR(60) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message VARCHAR(1000) NOT NULL,
  link VARCHAR(255) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  email_status ENUM('not_configured','queued','sent','failed') NOT NULL DEFAULT 'not_configured',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_user (user_id, is_read),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS integration_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id INT UNSIGNED NOT NULL,
  idempotency_key VARCHAR(80) NOT NULL,
  status ENUM('in_process','success','failed','needs_review') NOT NULL,
  message VARCHAR(1000) NULL,
  student_record_id INT UNSIGNED NULL,
  operator_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_int_app (application_id),
  CONSTRAINT fk_il_app FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_il_student FOREIGN KEY (student_record_id) REFERENCES student_records(id),
  CONSTRAINT fk_il_user FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
