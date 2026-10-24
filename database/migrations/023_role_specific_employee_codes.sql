-- Role-specific unique employee codes for professional account management.
ALTER TABLE users ADD COLUMN employee_code VARCHAR(30) NULL AFTER position_name;

UPDATE users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
SET u.employee_code=CASE
  WHEN r.code='superadmin' THEN CONCAT('SADM-',LPAD(u.id,6,'0'))
  WHEN r.code='admin' THEN CONCAT('ADMS-',LPAD(u.id,6,'0'))
  WHEN r.code='school_leader' AND u.position_code='kepala_sekolah' THEN CONCAT('KASEK-',LPAD(u.id,6,'0'))
  WHEN r.code='school_leader' AND u.position_code='kepala_yayasan' THEN CONCAT('KAYAS-',LPAD(u.id,6,'0'))
  WHEN r.code='school_leader' THEN CONCAT('PIM-',LPAD(u.id,6,'0'))
  WHEN r.code='guru' THEN CONCAT('GURU-',LPAD(u.id,6,'0'))
  ELSE CONCAT('STAF-',LPAD(u.id,6,'0')) END
WHERE u.employee_code IS NULL OR u.employee_code='';

ALTER TABLE users ADD UNIQUE KEY uq_users_employee_code (employee_code);
