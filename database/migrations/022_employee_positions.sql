-- Employee position metadata and scoped leadership policy.
ALTER TABLE users ADD COLUMN position_code VARCHAR(40) NULL AFTER account_stage;
ALTER TABLE users ADD COLUMN position_name VARCHAR(120) NULL AFTER position_code;

UPDATE users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
SET u.position_code='guru', u.position_name='Guru'
WHERE r.code='guru' AND (u.position_code IS NULL OR u.position_code='');

UPDATE users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
SET u.position_code='admin_sekolah', u.position_name='Admin Sekolah'
WHERE r.code='admin' AND (u.position_code IS NULL OR u.position_code='');

UPDATE users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
SET u.position_code='superadmin', u.position_name='Superadmin'
WHERE r.code='superadmin' AND (u.position_code IS NULL OR u.position_code='');

INSERT INTO permissions (code, description) VALUES
 ('leadership.school.view','Melihat ringkasan akademik dan PPDB sesuai kewenangan Kepala Sekolah'),
 ('leadership.foundation.view','Melihat ringkasan sekolah, PPDB, dan laporan keuangan sesuai kewenangan Kepala Yayasan')
ON DUPLICATE KEY UPDATE description=VALUES(description);

UPDATE users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
SET u.position_code=CASE WHEN u.position_code IS NULL OR u.position_code='' THEN 'kepala_sekolah' ELSE u.position_code END,
    u.position_name=CASE WHEN u.position_name IS NULL OR u.position_name='' THEN 'Kepala Sekolah' ELSE u.position_name END
WHERE r.code='school_leader';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code='leadership.school.view' WHERE r.code='school_leader';
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code='leadership.foundation.view' WHERE r.code='school_leader';
