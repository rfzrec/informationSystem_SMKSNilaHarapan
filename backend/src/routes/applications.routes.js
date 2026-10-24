const express = require('express');
const path = require('path');
const { z } = require('zod');
const { query, one, withTransaction } = require('../config/db');
const { asyncHandler, HttpError, parsePaging, maskNik } = require('../utils/http');
const { validate } = require('../middleware/validate');
const { requirePerm, requireAuth, can } = require('../middleware/auth');
const { audit } = require('../utils/audit');
const { notifyApplicationOwner } = require('../utils/notify');
const env = require('../config/env');
const svc = require('../services/applicationService');
const { processIntegration } = require('../services/integrationService');

const router = express.Router();

// PPDB sepenuhnya dikelola oleh role admin; tidak ada role/pembagian akun panitia terpisah.
function scopeClause(user) {
  if (user.role === 'admin' || can(user, 'applications.view_all')) return { sql: '', params: [] };
  return { sql: ` AND a.submission_status <> 'draft'`, params: [] };
}

async function loadScopedApplication(req, id, conn) {
  const scope = scopeClause(req.user);
  const app = await one(`SELECT a.* FROM applications a WHERE a.id = ?${scope.sql}`, [id, ...scope.params], conn);
  if (!app) throw new HttpError(404, 'Pengajuan tidak ditemukan atau di luar kewenangan Anda.', 'NOT_FOUND');
  return app;
}

function buildFilters(q, user) {
  const where = ['1=1'];
  const params = [];
  const add = (sql, v) => { where.push(sql); params.push(v); };
  if (q.q) { where.push('(ap.full_name LIKE ? OR a.registration_number LIKE ?)'); params.push(`%${q.q}%`, `%${q.q}%`); }
  if (q.period_id) add('a.period_id = ?', q.period_id);
  if (q.path_id) add('a.path_id = ?', q.path_id);
  if (q.submission_status) add('a.submission_status = ?', q.submission_status);
  if (q.selection_status) add('a.selection_status = ?', q.selection_status);
  if (q.re_registration_status) add('a.re_registration_status = ?', q.re_registration_status);
  if (q.integration_status) add('a.integration_status = ?', q.integration_status);
  if (q.doc_status) add('EXISTS (SELECT 1 FROM application_documents d WHERE d.application_id = a.id AND d.status = ?)', q.doc_status);
  const scope = scopeClause(user);
  return { where: where.join(' AND ') + scope.sql, params: [...params, ...scope.params] };
}

const BASE_FROM = `FROM applications a JOIN applicants ap ON ap.id = a.applicant_id JOIN admission_periods p ON p.id = a.period_id
  LEFT JOIN admission_paths pa ON pa.id = a.path_id`;

router.get('/', requirePerm('applications.view'), asyncHandler(async (req, res) => {
  const { page, pageSize, offset } = parsePaging(req.query);
  const f = buildFilters(req.query, req.user);
  const total = await one(`SELECT COUNT(*) AS n ${BASE_FROM} WHERE ${f.where}`, f.params);
  const rows = await query(
    `SELECT a.id, a.registration_number, ap.full_name, p.name AS period_name, pa.name AS path_name, a.submission_status, a.selection_status,
      a.re_registration_status, a.integration_status, a.submitted_at,
      (SELECT COUNT(*) FROM application_documents d WHERE d.application_id = a.id AND d.status = 'pending') AS pending_docs
     ${BASE_FROM} WHERE ${f.where} ORDER BY a.updated_at DESC LIMIT ${pageSize} OFFSET ${offset}`, f.params,
  );
  res.json({ data: rows, meta: { page, page_size: pageSize, total: Number(total.n) } });
}));

router.delete('/:id(\\d+)/force-delete', requirePerm('applications.view_all'), asyncHandler(async (_req, _res) => {
  throw new HttpError(410, 'Penghapusan permanen melalui UI dinonaktifkan untuk menjaga histori PPDB dan akademik. Gunakan penarikan/pembatalan yang tercatat; purge legal harus dilakukan melalui prosedur database terpisah dan terotorisasi.', 'HARD_DELETE_DISABLED');
}));

router.get('/:id(\\d+)', requirePerm('applications.view'), asyncHandler(async (req, res) => {
  const app = await loadScopedApplication(req, req.params.id);
  const applicant = await one('SELECT * FROM applicants WHERE id = ?', [app.applicant_id]);
  if (!can(req.user, 'applications.assist_edit') && !can(req.user, 'applications.verify')) applicant.nik = maskNik(applicant.nik);
  const [guardians, education, documents, verifications, rereg, integration, result, history, period, pathRow, prefs] = await Promise.all([
    query('SELECT * FROM applicant_guardians WHERE applicant_id = ?', [app.applicant_id]),
    one('SELECT * FROM applicant_education WHERE applicant_id = ?', [app.applicant_id]),
    query(`SELECT d.id, d.status, d.notes, r.name, r.stage, r.is_required, v.id AS version_id, v.original_name, v.version_no, v.created_at AS uploaded_at
           FROM application_documents d JOIN document_requirements r ON r.id = d.requirement_id
           LEFT JOIN document_versions v ON v.id = d.current_version_id WHERE d.application_id = ? ORDER BY r.stage, r.id`, [app.id]),
    query(`SELECT v.*, u.full_name AS verifier_name, r.name AS document_name FROM verification_records v LEFT JOIN users u ON u.id = v.verifier_id
           LEFT JOIN application_documents d ON d.id = v.document_id LEFT JOIN document_requirements r ON r.id = d.requirement_id
           WHERE v.application_id = ? ORDER BY v.id DESC`, [app.id]),
    query(`SELECT rr.*, u.full_name AS actor_name FROM re_registration_records rr LEFT JOIN users u ON u.id = rr.actor_id WHERE application_id = ? ORDER BY rr.id DESC`, [app.id]),
    query('SELECT * FROM integration_logs WHERE application_id = ? ORDER BY id DESC', [app.id]),
    one('SELECT proposed_status, scores_json, notes, is_official, approval_id FROM selection_results WHERE application_id = ?', [app.id]),
    query(`SELECT l.action, l.details_json, l.created_at, u.full_name AS actor FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id
           WHERE l.entity_type = 'application' AND l.entity_id = ? ORDER BY l.id DESC LIMIT 50`, [String(app.id)]),
    one('SELECT name, academic_year FROM admission_periods WHERE id = ?', [app.period_id]),
    app.path_id ? one('SELECT name FROM admission_paths WHERE id = ?', [app.path_id]) : null,
    query(`SELECT sp.title, pr.preference_rank FROM application_preferences pr JOIN school_programs sp ON sp.id = pr.program_id WHERE pr.application_id = ? ORDER BY pr.preference_rank`, [app.id]),
  ]);
  res.json({ data: { application: app, applicant, guardians, education, documents, verifications, rereg, integration, result, history, period, path: pathRow, preferences: prefs } });
}));

router.get('/documents/:versionId(\\d+)/download', requireAuth, asyncHandler(async (req, res) => {
  const v = await one(
    `SELECT v.*, d.application_id, ap.user_id AS owner_id FROM document_versions v JOIN application_documents d ON d.id = v.document_id
     JOIN applications a ON a.id = d.application_id JOIN applicants ap ON ap.id = a.applicant_id WHERE v.id = ?`, [req.params.versionId],
  );
  if (!v) throw new HttpError(404, 'Dokumen tidak ditemukan.', 'NOT_FOUND');
  const isOwner = v.owner_id === req.user.id;
  if (!isOwner) {
    if (!can(req.user, 'applications.view')) throw new HttpError(403, 'Anda tidak berhak mengakses dokumen ini.', 'FORBIDDEN');
    await loadScopedApplication(req, v.application_id);
    await audit(req, 'document.view', 'application_document', v.document_id, { version: v.version_no });
  }
  res.set('Cache-Control', 'private, no-store');
  res.set('Content-Disposition', `inline; filename="dokumen-${v.document_id}-v${v.version_no}${path.extname(v.storage_name)}"`);
  res.type(v.mime_type);
  res.sendFile(path.join(env.privateStorageDir, v.storage_name));
}));

const notes = z.string().trim().max(1000).optional().default('');

router.post('/documents/:docId(\\d+)/verify', requirePerm('applications.verify', 're_registration.verify'), validate(z.object({
  status: z.enum(['verified', 'needs_revision', 'rejected']), notes,
})), asyncHandler(async (req, res) => {
  const { status } = req.valid;
  if (status !== 'verified' && !req.valid.notes) throw new HttpError(422, 'Alasan wajib diisi untuk perbaikan/penolakan dokumen.', 'NOTES_REQUIRED');
  await withTransaction(async (conn) => {
    const doc = await one(`SELECT d.*, r.stage, r.name FROM application_documents d JOIN document_requirements r ON r.id = d.requirement_id WHERE d.id = ? FOR UPDATE`, [req.params.docId], conn);
    if (!doc) throw new HttpError(404, 'Dokumen tidak ditemukan.', 'NOT_FOUND');
    const app = await loadScopedApplication(req, doc.application_id, conn);
    const allowed = doc.stage === 'application'
      ? can(req.user, 'applications.verify') && app.submission_status === 'submitted'
      : can(req.user, 're_registration.verify') && app.re_registration_status === 'awaiting_verification';
    if (!allowed) throw new HttpError(409, 'Dokumen tidak dapat diverifikasi pada status pengajuan saat ini.', 'INVALID_STATE');
    if (doc.status === 'not_uploaded') throw new HttpError(409, 'Dokumen belum diunggah.', 'INVALID_STATE');
    await query('UPDATE application_documents SET status = ?, notes = ? WHERE id = ?', [status, req.valid.notes || null, doc.id], conn);
    await query(`INSERT INTO verification_records (application_id, document_id, target, previous_status, new_status, notes, verifier_id) VALUES (?,?,'document',?,?,?,?)`,
      [app.id, doc.id, doc.status, status, req.valid.notes || null, req.user.id], conn);
    if (status === 'verified') await notifyApplicationOwner(app.id, 'document_verified', 'Dokumen telah diverifikasi', `Dokumen "${doc.name}" telah diverifikasi.`, null, conn);
    else await notifyApplicationOwner(app.id, 'document_revision', 'Dokumen perlu diperbaiki', `Dokumen "${doc.name}": ${req.valid.notes}`, null, conn, { email: true });
    await audit(req, 'verification.document', 'application', app.id, { document: doc.name, from: doc.status, to: status }, conn);
  });
  res.json({ message: 'Keputusan verifikasi dokumen tersimpan.' });
}));

router.post('/:id(\\d+)/decision', requirePerm('applications.verify'), validate(z.object({
  decision: z.enum(['needs_revision', 'complete']), notes,
})), asyncHandler(async (req, res) => {
  await withTransaction(async (conn) => {
    const app = await loadScopedApplication(req, req.params.id, conn);
    await one('SELECT id FROM applications WHERE id = ? FOR UPDATE', [app.id], conn);
    if (app.submission_status !== 'submitted') throw new HttpError(409, 'Keputusan hanya untuk pengajuan berstatus Diajukan.', 'INVALID_STATE');
    if (req.valid.decision === 'needs_revision') {
      if (!req.valid.notes) throw new HttpError(422, 'Alasan perbaikan wajib diisi.', 'NOTES_REQUIRED');
      await query(`UPDATE applications SET submission_status = 'needs_revision', revision_notes = ? WHERE id = ?`, [req.valid.notes, app.id], conn);
      await notifyApplicationOwner(app.id, 'application_revision', 'Pengajuan perlu diperbaiki', req.valid.notes, null, conn, { email: true });
    } else {
      const reqs = await svc.getRequirements(app.period_id, app.path_id, 'application', conn);
      const docs = await svc.getDocuments(app.id, conn);
      const unverified = reqs.filter((r) => r.is_required && !docs.some((d) => d.requirement_id === r.id && d.status === 'verified'));
      if (unverified.length) throw new HttpError(422, `Dokumen wajib belum terverifikasi: ${unverified.map((u) => u.name).join(', ')}`, 'DOCS_UNVERIFIED');
      await query(`UPDATE applications SET submission_status = 'complete', completed_at = NOW() WHERE id = ?`, [app.id], conn);
      await notifyApplicationOwner(app.id, 'application_complete', 'Pengajuan lengkap administratif', 'Pengajuan Anda dinyatakan lengkap secara administratif. Ini belum merupakan hasil seleksi.', null, conn);
    }
    await query(`INSERT INTO verification_records (application_id, target, previous_status, new_status, notes, verifier_id) VALUES (?,'application',?,?,?,?)`,
      [app.id, app.submission_status, req.valid.decision, req.valid.notes || null, req.user.id], conn);
    await audit(req, 'verification.application', 'application', app.id, { decision: req.valid.decision }, conn);
  });
  res.json({ message: 'Keputusan verifikasi pengajuan tersimpan.' });
}));

router.post('/:id(\\d+)/re-registration-decision', requirePerm('re_registration.verify'), validate(z.object({
  decision: z.enum(['needs_revision', 'completed', 'withdrawn']), notes,
})), asyncHandler(async (req, res) => {
  await withTransaction(async (conn) => {
    const app = await loadScopedApplication(req, req.params.id, conn);
    if (app.re_registration_status !== 'awaiting_verification') throw new HttpError(409, 'Daftar ulang tidak sedang menunggu verifikasi.', 'INVALID_STATE');
    if (req.valid.decision !== 'completed' && !req.valid.notes) throw new HttpError(422, 'Catatan wajib diisi.', 'NOTES_REQUIRED');
    if (req.valid.decision === 'completed') {
      const reqs = await svc.getRequirements(app.period_id, app.path_id, 're_registration', conn);
      const docs = await svc.getDocuments(app.id, conn);
      const unverified = reqs.filter((r) => r.is_required && !docs.some((d) => d.requirement_id === r.id && d.status === 'verified'));
      if (unverified.length) throw new HttpError(422, `Dokumen daftar ulang belum terverifikasi: ${unverified.map((u) => u.name).join(', ')}`, 'DOCS_UNVERIFIED');
    }
    await query(`UPDATE applications SET re_registration_status = ?, integration_status = IF(? = 'completed', 'ready', integration_status) WHERE id = ?`,
      [req.valid.decision, req.valid.decision, app.id], conn);
    await query('INSERT INTO re_registration_records (application_id, action, previous_status, new_status, notes, actor_id) VALUES (?,?,?,?,?,?)',
      [app.id, 'verify', app.re_registration_status, req.valid.decision, req.valid.notes || null, req.user.id], conn);
    const msg = { completed: ['re_registration_completed', 'Daftar ulang selesai', 'Daftar ulang Anda telah dinyatakan selesai.'],
      needs_revision: ['re_registration_revision', 'Daftar ulang perlu diperbaiki', req.valid.notes],
      withdrawn: ['re_registration_withdrawn', 'Daftar ulang tidak dilanjutkan', req.valid.notes] }[req.valid.decision];
    await notifyApplicationOwner(app.id, msg[0], msg[1], msg[2], '/dashboard/daftar-ulang', conn);
    await audit(req, 're_registration.decision', 'application', app.id, { decision: req.valid.decision }, conn);
  });
  let integration = null;
  if (req.valid.decision === 'completed') {
    try {
      integration = await processIntegration(req, Number(req.params.id));
    } catch (err) {
      // Keputusan daftar ulang tetap tersimpan; integrasi dapat dicoba ulang dari menu Integrasi Siswa.
      integration = { status: 'failed', message: err.message || 'Integrasi belum berhasil.' };
    }
  }
  const message = integration?.status === 'success'
    ? 'Daftar ulang selesai dan akun siswa berhasil diaktifkan.'
    : integration
      ? `Daftar ulang tersimpan. Integrasi belum selesai: ${integration.message || integration.status}. Periksa menu Integrasi Siswa.`
      : 'Keputusan daftar ulang tersimpan.';
  res.json({ message, data: { integration } });
}));

router.put('/:id(\\d+)/admin-data', requirePerm('applications.assist_edit'), validate(z.object({
  reason: z.string().trim().min(5, 'Alasan koreksi wajib diisi (min. 5 karakter)').max(500),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(1000).optional(),
  birth_place: z.string().trim().max(100).optional(),
  religion: z.string().trim().max(30).optional(),
  nisn: z.string().regex(/^(\d{10})?$/, 'NISN harus 10 digit').optional(),
})), asyncHandler(async (req, res) => {
  const app = await loadScopedApplication(req, req.params.id);
  const before = await one('SELECT phone, address, birth_place, religion, nisn FROM applicants WHERE id = ?', [app.applicant_id]);
  const fields = ['phone', 'address', 'birth_place', 'religion', 'nisn'].filter((f) => req.valid[f] !== undefined);
  if (!fields.length) throw new HttpError(422, 'Tidak ada data yang diubah.', 'NO_CHANGES');
  await query(`UPDATE applicants SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...fields.map((f) => req.valid[f] || null), app.applicant_id]);
  await audit(req, 'application.assist_edit', 'application', app.id, { reason: req.valid.reason, before, after: Object.fromEntries(fields.map((f) => [f, req.valid[f]])) });
  res.json({ message: 'Koreksi data administratif tersimpan dan tercatat di audit trail.' });
}));



module.exports = router;
