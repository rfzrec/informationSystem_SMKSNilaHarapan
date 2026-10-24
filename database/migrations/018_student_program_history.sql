-- Auditable student profile/program/class changes for Admin-managed student records.
CREATE TABLE IF NOT EXISTS student_program_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_record_id INT UNSIGNED NOT NULL,
  from_program_id INT UNSIGNED NULL,
  to_program_id INT UNSIGNED NOT NULL,
  from_class_id INT UNSIGNED NULL,
  to_class_id INT UNSIGNED NOT NULL,
  effective_on DATE NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  changed_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_student_program_history_student (student_record_id, created_at),
  INDEX idx_student_program_history_effective (effective_on),
  CONSTRAINT fk_sph_student FOREIGN KEY (student_record_id) REFERENCES student_records(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sph_from_program FOREIGN KEY (from_program_id) REFERENCES school_programs(id) ON DELETE SET NULL,
  CONSTRAINT fk_sph_to_program FOREIGN KEY (to_program_id) REFERENCES school_programs(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sph_from_class FOREIGN KEY (from_class_id) REFERENCES classes(id) ON DELETE SET NULL,
  CONSTRAINT fk_sph_to_class FOREIGN KEY (to_class_id) REFERENCES classes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sph_changed_by FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
