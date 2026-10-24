-- Public CMS collections missing from the legacy profile schema.
-- Same publication lifecycle and audit ownership as existing CMS content.

CREATE TABLE IF NOT EXISTS school_extracurriculars (
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
  INDEX idx_extracurricular_status (status, published_at),
  CONSTRAINT fk_extra_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_extra_editor FOREIGN KEY (editor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_events (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  slug VARCHAR(220) NOT NULL UNIQUE,
  summary VARCHAR(500) NULL,
  body TEXT NULL,
  event_type ENUM('activity','academic','ppdb','other') NOT NULL DEFAULT 'activity',
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  location VARCHAR(200) NULL,
  image_path VARCHAR(255) NULL,
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  published_at DATETIME NULL,
  author_id INT UNSIGNED NULL,
  editor_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_school_event_status_date (status, starts_at, published_at),
  CONSTRAINT fk_school_event_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_school_event_editor FOREIGN KEY (editor_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_school_event_dates CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_staff_profiles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_record_id INT UNSIGNED NULL UNIQUE,
  title VARCHAR(200) NOT NULL,
  slug VARCHAR(220) NOT NULL UNIQUE,
  summary VARCHAR(500) NULL,
  body TEXT NULL,
  staff_role ENUM('principal','teacher','staff','organization') NOT NULL DEFAULT 'teacher',
  education VARCHAR(300) NULL,
  subjects VARCHAR(500) NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  image_path VARCHAR(255) NULL,
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  published_at DATETIME NULL,
  author_id INT UNSIGNED NULL,
  editor_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_staff_role_status (staff_role, status, sort_order),
  CONSTRAINT fk_staff_teacher_record FOREIGN KEY (teacher_record_id) REFERENCES teacher_records(id) ON DELETE SET NULL,
  CONSTRAINT fk_staff_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_staff_editor FOREIGN KEY (editor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
