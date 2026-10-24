const express = require('express');
const { query, one } = require('../config/db');
const { asyncHandler, parsePaging, maskNik, HttpError } = require('../utils/http');
const { requirePerm, can } = require('../middleware/auth');
const { audit } = require('../utils/audit');
const { toCsv } = require('../utils/csv');
const { processIntegration } = require('../services/integrationService');

const integrations = express.Router();
integrations.use(requirePerm('integration.process'));

integrations.get('/', asyncHandler(async (req, res) => {
  const { page, pageSize, offset } = parsePaging(req.query);
  const status = req.query.status || '';
  const where = `a.selection_status = 'accepted' AND a.re_registration_status = 'completed' AND EXISTS (SELECT 1 FROM selection_results sr WHERE sr.application_id = a.id AND sr.is_official = 1) AND (? = '' OR a.integration_status = ?)`;
  const total = await one(`SELECT COUNT(*) AS n FROM applications a WHERE ${where}`, [status, status]);
  const rows = await query(
    `SELECT a.id, a.registration_number, ap.full_name, a.integration_status, s.student_number,
      (SELECT message FROM integration_logs l WHERE l.application_id = a.id ORDER BY l.id DESC LIMIT 1) AS last_message
     FROM applications a JOIN applicants ap ON ap.id = a.applicant_id LEFT JOIN student_records s ON s.id = a.student_record_id
     WHERE ${where} ORDER BY a.updated_at DESC LIMIT ${pageSize} OFFSET ${offset}`, [status, status],
  );
  res.json({ data: rows, meta: { page, page_size: pageSize, total: Number(total.n) } });
}));

integrations.get('/logs', asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT l.*, a.registration_number, u.full_name AS operator_name FROM integration_logs l JOIN applications a ON a.id = l.application_id
     LEFT JOIN users u ON u.id = l.operator_id ORDER BY l.id DESC LIMIT 100`,
  );
  res.json({ data: rows });
}));

integrations.post('/:applicationId(\\d+)/process', asyncHandler(async (req, res) => {
  const result = await processIntegration(req, Number(req.params.applicationId));
  res.json({ message: result.status === 'success' ? 'Integrasi data induk berhasil.' : result.message, data: result });
}));

const reports = express.Router();
// Dashboard-level leadership may view aggregate PPDB summary only. Exports still require reports.export.
reports.use(requirePerm('reports.view', 'admissions.summary.view'));

const periodFilter = (q) => (q.period_id ? { sql: ' AND a.period_id = ?', params: [Number(q.period_id)] } : { sql: '', params: [] });
const countBy = (col, f) => query(`SELECT ${col} AS k, COUNT(*) AS n FROM applications a WHERE 1=1${f.sql} GROUP BY ${col}`, f.params);

reports.get('/summary', asyncHandler(async (req, res) => {
  const f = periodFilter(req.query);
  const [byPeriod, byPath, bySubmission, bySelection, byRereg, byIntegration, pendingDocs, daily] = await Promise.all([
    query(`SELECT p.name AS k, COUNT(a.id) AS n FROM admission_periods p LEFT JOIN applications a ON a.period_id = p.id GROUP BY p.id ORDER BY p.start_date DESC`),
    query(`SELECT COALESCE(pa.name,'(belum memilih)') AS k, COUNT(*) AS n, MAX(q.quota) AS quota FROM applications a LEFT JOIN admission_paths pa ON pa.id = a.path_id
           LEFT JOIN admission_quotas q ON q.path_id = pa.id WHERE 1=1${f.sql} GROUP BY pa.id, pa.name`, f.params),
    countBy('a.submission_status', f), countBy('a.selection_status', f), countBy('a.re_registration_status', f), countBy('a.integration_status', f),
    one(`SELECT COUNT(*) AS n FROM application_documents d JOIN applications a ON a.id = d.application_id WHERE d.status = 'pending'${f.sql}`, f.params),
    query(`SELECT DATE(a.submitted_at) AS k, COUNT(*) AS n FROM applications a WHERE a.submitted_at IS NOT NULL${f.sql}
           GROUP BY DATE(a.submitted_at) ORDER BY k DESC LIMIT 60`, f.params),
  ]);
  res.json({ data: { byPeriod, byPath, bySubmission, bySelection, byRereg, byIntegration, pendingDocs: Number(pendingDocs.n), daily: daily.reverse() } });
}));

const EXPORTS = {
  applicants: { title: 'pendaftar', where: '1=1' },
  complete: { title: 'lengkap-administratif', where: `a.submission_status = 'complete'` },
  revision: { title: 'perlu-perbaikan', where: `a.submission_status = 'needs_revision'` },
  selection: { title: 'hasil-seleksi-resmi', where: `r.is_official = 1` },
  accepted: { title: 'rekap-diterima', where: `a.selection_status = 'accepted'` },
  re_registration: { title: 'rekap-daftar-ulang', where: `a.selection_status = 'accepted'` },
  integration_ready: { title: 'siap-integrasi', where: `a.integration_status = 'ready'` },
  integration_failed: { title: 'integrasi-gagal', where: `a.integration_status IN ('failed','needs_review')` },
};

// Ekspor CSV dibuat langsung dari query database; NIK disamarkan dan kolom kontak pribadi tidak disertakan.
reports.get('/export/:type', requirePerm('reports.export'), asyncHandler(async (req, res) => {
  if (req.params.type === 'activity') {
    if (!can(req.user, 'audit.view')) throw new HttpError(403, 'Anda tidak berhak mengekspor aktivitas.', 'FORBIDDEN');
    const rows = await query(`SELECT l.created_at, u.full_name AS actor, l.action, l.entity_type, l.entity_id FROM audit_logs l
      LEFT JOIN users u ON u.id = l.user_id WHERE l.action NOT LIKE 'auth.%' ORDER BY l.id DESC LIMIT 5000`);
    await audit(req, 'report.export', 'report', 'activity', { rows: rows.length });
    res.set('Content-Disposition', 'attachment; filename="aktivitas-administratif.csv"');
    return res.type('text/csv').send(toCsv([
      { label: 'Waktu', key: 'created_at' }, { label: 'Pengguna', key: 'actor' }, { label: 'Tindakan', key: 'action' },
      { label: 'Entitas', key: 'entity_type' }, { label: 'ID Entitas', key: 'entity_id' }], rows));
  }
  const def = EXPORTS[req.params.type];
  if (!def) throw new HttpError(404, 'Jenis laporan tidak dikenal.', 'NOT_FOUND');
  const f = periodFilter(req.query);
  const rows = await query(
    `SELECT a.registration_number, ap.full_name, ap.nik, ap.gender, p.name AS period_name, pa.name AS path_name, a.submission_status,
      a.selection_status, a.re_registration_status, a.integration_status, a.submitted_at, IF(r.is_official = 1, r.proposed_status, '') AS official_result
     FROM applications a JOIN applicants ap ON ap.id = a.applicant_id JOIN admission_periods p ON p.id = a.period_id
     LEFT JOIN admission_paths pa ON pa.id = a.path_id LEFT JOIN selection_results r ON r.application_id = a.id
     WHERE ${def.where} AND a.submission_status <> 'draft'${f.sql} ORDER BY a.registration_number`, f.params,
  );
  await audit(req, 'report.export', 'report', req.params.type, { rows: rows.length, period_id: req.query.period_id || null });
  res.set('Content-Disposition', `attachment; filename="${def.title}.csv"`);
  res.type('text/csv').send(toCsv([
    { label: 'No. Pendaftaran', key: 'registration_number' }, { label: 'Nama', key: 'full_name' },
    { label: 'NIK (disamarkan)', value: (r) => maskNik(r.nik) }, { label: 'JK', key: 'gender' }, { label: 'Periode', key: 'period_name' },
    { label: 'Jalur', key: 'path_name' }, { label: 'Status Pengajuan', key: 'submission_status' }, { label: 'Status Seleksi', key: 'selection_status' },
    { label: 'Hasil Resmi', key: 'official_result' }, { label: 'Daftar Ulang', key: 're_registration_status' },
    { label: 'Integrasi', key: 'integration_status' }, { label: 'Tanggal Pengajuan', key: 'submitted_at' }], rows));
}));

module.exports = { integrations, reports };
