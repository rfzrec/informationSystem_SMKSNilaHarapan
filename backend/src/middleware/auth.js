const { query, one } = require('../config/db');
const { HttpError } = require('../utils/http');

async function loadUserById(id) {
  const user = await one(
    `SELECT u.id, u.email, u.full_name, u.phone, u.position_code, u.position_name, u.is_active, u.deleted_at, u.must_change_password, u.account_stage, r.code AS role, r.name AS role_name
     FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE u.id = ?`,
    [id],
  );
  if (!user) return null;
  const perms = await query(
    `SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
     JOIN user_roles ur ON ur.role_id = rp.role_id WHERE ur.user_id = ?`,
    [id],
  );
  user.permissions = perms.map((p) => p.code);
  // Keep the applicant role stable across the lifecycle. After verified PPDB integration,
  // an applicant account at account_stage='student' receives the same self-service academic
  // permissions as the siswa role, without mutating its role assignment.
  if (user.role === 'applicant' && user.account_stage === 'student') {
    const studentPerms = await query(
      `SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
       JOIN roles r ON r.id = rp.role_id WHERE r.code = 'siswa'`,
    );
    user.permissions = [...new Set([...user.permissions, ...studentPerms.map((p) => p.code)])];
  }
  if (user.role === 'school_leader') {
    user.permissions = user.permissions.filter((p) => p !== 'leadership.school.view' && p !== 'leadership.foundation.view');
    if (user.position_code === 'kepala_sekolah') user.permissions.push('leadership.school.view');
    if (user.position_code === 'kepala_yayasan') user.permissions.push('leadership.foundation.view');
  }
  return user;
}

// Role & izin selalu dibaca dari database pada setiap request, bukan dari browser.
async function loadUser(req, res, next) {
  try {
    if (req.session && req.session.userId) {
      const user = await loadUserById(req.session.userId);
      if (!user || !user.is_active || user.deleted_at) {
        req.session.userId = null;
      } else {
        req.user = user;
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

function requireAuth(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'Silakan login terlebih dahulu.', 'UNAUTHENTICATED'));
  next();
}

const can = (user, perm) => !!user && user.permissions.includes(perm);

function requirePerm(...perms) {
  return (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'Silakan login terlebih dahulu.', 'UNAUTHENTICATED'));
    if (!perms.some((p) => can(req.user, p))) return next(new HttpError(403, 'Anda tidak memiliki izin untuk tindakan ini.', 'FORBIDDEN'));
    next();
  };
}

module.exports = { loadUser, loadUserById, requireAuth, requirePerm, can };
