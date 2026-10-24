-- Additive monitoring table; existing operational records are not modified.
CREATE TABLE IF NOT EXISTS system_bug_findings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  module_name VARCHAR(120) NOT NULL DEFAULT 'Umum',
  affected_role VARCHAR(80) NOT NULL DEFAULT '',
  severity ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  reproduction_steps TEXT NULL,
  implementation_status ENUM('new','analyzing','fixing','ready_for_test','closed','reopened') NOT NULL DEFAULT 'new',
  test_status ENUM('not_tested','passed','failed') NOT NULL DEFAULT 'not_tested',
  fix_summary TEXT NULL,
  test_notes TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_bug_status (implementation_status, test_status),
  INDEX idx_bug_severity (severity),
  INDEX idx_bug_module (module_name),
  INDEX idx_bug_created (created_at)
) ENGINE=InnoDB;
