-- Versioned weekly roster: published version remains active until a new draft is validated and published.
CREATE TABLE IF NOT EXISTS weekly_roster_versions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  academic_year_id INT UNSIGNED NOT NULL,
  version_no INT UNSIGNED NOT NULL,
  status ENUM('draft','published','superseded') NOT NULL DEFAULT 'draft',
  revision_notes VARCHAR(500) NULL,
  created_by INT UNSIGNED NULL,
  published_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at DATETIME NULL,
  UNIQUE KEY uq_roster_academic_year_version (academic_year_id, version_no),
  INDEX idx_roster_status_year (academic_year_id, status),
  CONSTRAINT fk_roster_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT,
  CONSTRAINT fk_roster_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_roster_published_by FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE class_schedules ADD COLUMN roster_version_id INT UNSIGNED NULL;
ALTER TABLE class_schedules ADD CONSTRAINT fk_schedule_roster_version FOREIGN KEY (roster_version_id) REFERENCES weekly_roster_versions(id) ON DELETE RESTRICT;

-- Existing schedules are preserved and become version 1 (published) for their academic year.
INSERT INTO weekly_roster_versions (academic_year_id, version_no, status, published_at)
SELECT c.academic_year_id, 1, 'published', NOW()
FROM class_schedules cs
JOIN teaching_assignments ta ON ta.id = cs.teaching_assignment_id
JOIN classes c ON c.id = ta.class_id
GROUP BY c.academic_year_id
ON DUPLICATE KEY UPDATE status = IF(status='draft','draft',VALUES(status));

UPDATE class_schedules cs
JOIN teaching_assignments ta ON ta.id = cs.teaching_assignment_id
JOIN classes c ON c.id = ta.class_id
JOIN weekly_roster_versions rv ON rv.academic_year_id = c.academic_year_id AND rv.version_no = 1
SET cs.roster_version_id = rv.id
WHERE cs.roster_version_id IS NULL;

CREATE INDEX idx_schedule_roster_day_time ON class_schedules (roster_version_id, day_of_week, starts_at, ends_at);
