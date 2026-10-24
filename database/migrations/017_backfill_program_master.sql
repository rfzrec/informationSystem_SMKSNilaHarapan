-- Complete the canonical jurusan linkage after migration 014 seeds the standard program master rows.
-- Safe for databases migrated from the previous ZIP as well as fresh installs.

UPDATE student_records sr
JOIN applications a ON a.id = sr.source_application_id
JOIN application_preferences pref ON pref.application_id = a.id AND pref.preference_rank = 1
JOIN school_programs p ON p.id = pref.program_id AND p.is_active = 1
SET sr.program_id = p.id
WHERE sr.program_id IS NULL;

UPDATE classes c
JOIN school_programs p
  ON LOWER(TRIM(c.study_program)) = LOWER(TRIM(p.title))
  OR LOWER(TRIM(c.study_program)) = LOWER(TRIM(p.code))
  OR LOWER(TRIM(c.study_program)) LIKE CONCAT(LOWER(TRIM(p.code)), ' -%')
SET c.program_id = p.id
WHERE c.program_id IS NULL;

UPDATE subjects s
JOIN school_programs p
  ON LOWER(TRIM(s.study_program)) = LOWER(TRIM(p.title))
  OR LOWER(TRIM(s.study_program)) = LOWER(TRIM(p.code))
  OR LOWER(TRIM(s.study_program)) LIKE CONCAT(LOWER(TRIM(p.code)), ' -%')
SET s.program_id = p.id
WHERE s.program_id IS NULL;
