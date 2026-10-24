const express = require('express');
const { z } = require('zod');
const { query, one, withTransaction } = require('../config/db');
const { asyncHandler, HttpError, parseJson } = require('../utils/http');
const { validate } = require('../middleware/validate');
const { requirePerm } = require('../middleware/auth');
const { audit } = require('../utils/audit');
const { publishApproval } = require('../services/selectionService');

const router = express.Router();
const dt = z.string().regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/, 'Format waktu tidak valid').transform((v) => v.replace('T', ' ').slice(0, 16) + ':00');

async function lockedBatch(periodId, conn) {
  return one(`SELECT id FROM selection_approvals WHERE period_id = ? AND status IN ('submitted','approved') LIMIT 1`, [periodId], conn);
}

router.get('/rules/:periodId(\\d+)', requirePerm('selection.manage', 'admission.config'), asyncHandler(async (req, res) => {
  const rule = await one('SELECT * FROM selection_rules WHERE period_id = ?', [req.params.periodId]);
  res.json({ data: rule ? { ...rule, criteria: parseJson(rule.criteria_json, []) } : { period_id: Number(req.params.periodId), criteria: [], ranking_notes: '', waitlist_enabled: 0 } });
}));

router.put('/rules/:periodId(\\d+)', requirePerm('admission.config'), validate(z.object({
  criteria: z.array(z.object({
    key: z.string().regex(/^[a-z0-9_]{2,30}$/, 'Kode kriteria: huruf kecil/angka/underscore'),
    label: z.string().trim().min(2).max(100),
    max_score: z.coerce.number().positive().max(10000),
  })).max(20),
  ranking_notes: z.string().trim().max(2000).optional().default(''),
  waitlist_enabled: z.boolean().default(false),
})), asyncHandler(async (req, res) => {
  const periodId = Number(req.params.periodId);
  if (!(await one('SELECT id FROM admission_periods WHERE id = ?', [periodId]))) throw new HttpError(404, 'Periode tidak ditemukan.', 'NOT_FOUND');
  if (await lockedBatch(periodId)) throw new HttpError(409, 'Aturan seleksi tidak dapat diubah saat hasil sedang menunggu persetujuan/publikasi.', 'LOCKED');
  const keys = req.valid.criteria.map((c) => c.key);
  if (new Set(keys).size !== keys.length) throw new HttpError(422, 'Kode kriteria tidak boleh sama.', 'DUPLICATE_KEY');
  await query(`INSERT INTO selection_rules (period_id, criteria_json, ranking_notes, waitlist_enabled, updated_by) VALUES (?,?,?,?,?)
    ON DUPLICATE KEY UPDATE criteria_json=VALUES(criteria_json), ranking_notes=VALUES(ranking_notes), waitlist_enabled=VALUES(waitlist_enabled), updated_by=VALUES(updated_by)`,
  [periodId, JSON.stringify(req.valid.criteria), req.valid.ranking_notes, req.valid.waitlist_enabled ? 1 : 0, req.user.id]);
  await audit(req, 'config.selection_rules', 'admission_period', periodId, req.valid);
  res.json({ message: 'Aturan seleksi tersimpan.' });
}));

router.get('/candidates', requirePerm('selection.manage'), asyncHandler(async (req, res) => {
  const periodId = Number(req.query.period_id);
  if (!periodId) throw new HttpError(422, 'Pilih periode.', 'PERIOD_REQUIRED');
  const rows = await query(
    `SELECT a.id, a.registration_number, ap.full_name, pa.name AS path_name, a.selection_status, r.proposed_status, r.scores_json, r.notes,
      r.is_official, sa.status AS approval_status
     FROM applications a JOIN applicants ap ON ap.id = a.applicant_id LEFT JOIN admission_paths pa ON pa.id = a.path_id
     LEFT JOIN selection_results r ON r.application_id = a.id LEFT JOIN selection_approvals sa ON sa.id = r.approval_id
     WHERE a.period_id = ? AND a.submission_status = 'complete' ORDER BY pa.name, ap.full_name`, [periodId],
  );
  res.json({ data: rows.map((r) => ({ ...r, scores: parseJson(r.scores_json, {}) })) });
}));

router.put('/results/:applicationId(\\d+)', requirePerm('selection.manage'), validate(z.object({
  scores: z.record(z.coerce.number().min(0)).default({}),
  proposed_status: z.enum(['accepted', 'rejected', 'waitlist']),
  notes: z.string().trim().max(1000).optional().default(''),
})), asyncHandler(async (req, res) => {
  await withTransaction(async (conn) => {
    const app = await one('SELECT * FROM applications WHERE id = ? FOR UPDATE', [req.params.applicationId], conn);
    if (!app || app.submission_status !== 'complete') throw new HttpError(409, 'Hasil seleksi hanya untuk pengajuan lengkap administratif.', 'INVALID_STATE');
    const existing = await one('SELECT r.*, sa.status AS approval_status FROM selection_results r LEFT JOIN selection_approvals sa ON sa.id = r.approval_id WHERE r.application_id = ?', [app.id], conn);
    if (existing && (Number(existing.is_official) || ['submitted', 'approved'].includes(existing.approval_status))) {
      throw new HttpError(409, 'Hasil sudah diajukan/dipublikasikan dan tidak dapat diubah.', 'LOCKED');
    }
    const rule = await one('SELECT * FROM selection_rules WHERE period_id = ?', [app.period_id], conn);
    const criteria = parseJson(rule && rule.criteria_json, []);
    if (req.valid.proposed_status === 'waitlist' && !(rule && Number(rule.waitlist_enabled))) throw new HttpError(422, 'Daftar tunggu tidak diaktifkan untuk periode ini.', 'WAITLIST_DISABLED');
    for (const [k, v] of Object.entries(req.valid.scores)) {
      const c = criteria.find((x) => x.key === k);
      if (!c) throw new HttpError(422, `Kriteria "${k}" tidak terdaftar pada aturan seleksi.`, 'UNKNOWN_CRITERIA');
      if (v > c.max_score) throw new HttpError(422, `Nilai ${c.label} melebihi maksimum ${c.max_score}.`, 'SCORE_TOO_HIGH');
    }
    await query(`INSERT INTO selection_results (application_id, scores_json, proposed_status, notes, approval_id, updated_by) VALUES (?,?,?,?,NULL,?)
      ON DUPLICATE KEY UPDATE scores_json=VALUES(scores_json), proposed_status=VALUES(proposed_status), notes=VALUES(notes), approval_id=NULL, updated_by=VALUES(updated_by)`,
    [app.id, JSON.stringify(req.valid.scores), req.valid.proposed_status, req.valid.notes, req.user.id], conn);
    await query(`UPDATE applications SET selection_status = 'in_process' WHERE id = ?`, [app.id], conn);
    await audit(req, 'selection.result_change', 'application', app.id, {
      before: existing ? { status: existing.proposed_status, scores: parseJson(existing.scores_json, {}) } : null,
      after: { status: req.valid.proposed_status, scores: req.valid.scores },
    }, conn);
  });
  res.json({ message: 'Hasil sementara tersimpan (belum resmi).' });
}));

router.get('/approvals', requirePerm('selection.manage', 'selection.approve'), asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT sa.*, p.name AS period_name, s.full_name AS submitted_by_name, d.full_name AS decided_by_name FROM selection_approvals sa
     JOIN admission_periods p ON p.id = sa.period_id LEFT JOIN users s ON s.id = sa.submitted_by LEFT JOIN users d ON d.id = sa.decided_by
     WHERE (? = 0 OR sa.period_id = ?) ORDER BY sa.id DESC`, [Number(req.query.period_id) || 0, Number(req.query.period_id) || 0],
  );
  res.json({ data: rows });
}));

router.post('/approvals', requirePerm('selection.manage'), validate(z.object({ period_id: z.coerce.number().int().positive() })), asyncHandler(async (req, res) => {
  const id = await withTransaction(async (conn) => {
    if (await lockedBatch(req.valid.period_id, conn)) throw new HttpError(409, 'Masih ada pengajuan hasil yang belum selesai diproses.', 'LOCKED');
    const pending = await query(
      `SELECT r.application_id FROM selection_results r JOIN applications a ON a.id = r.application_id
       LEFT JOIN selection_approvals sa ON sa.id = r.approval_id
       WHERE a.period_id = ? AND r.is_official = 0 AND (r.approval_id IS NULL OR sa.status = 'rejected') FOR UPDATE`, [req.valid.period_id], conn,
    );
    if (!pending.length) throw new HttpError(422, 'Belum ada hasil sementara untuk diajukan.', 'EMPTY');
    const ins = await query('INSERT INTO selection_approvals (period_id, result_count, submitted_by) VALUES (?,?,?)', [req.valid.period_id, pending.length, req.user.id], conn);
    const ids = pending.map((p) => p.application_id);
    const ph = ids.map(() => '?').join(',');
    await query(`UPDATE selection_results SET approval_id = ? WHERE application_id IN (${ph})`, [ins.insertId, ...ids], conn);
    await query(`UPDATE applications SET selection_status = 'pending_decision' WHERE id IN (${ph})`, ids, conn);
    await audit(req, 'selection.submit_for_approval', 'selection_approval', ins.insertId, { result_count: ids.length }, conn);
    return ins.insertId;
  });
  res.status(201).json({ message: 'Hasil diajukan untuk persetujuan.', id });
}));

router.post('/approvals/:id(\\d+)/decide', requirePerm('selection.approve'), validate(z.object({
  decision: z.enum(['approved', 'rejected']),
  notes: z.string().trim().max(1000).optional().default(''),
  publish_at: dt.optional().nullable(),
})), asyncHandler(async (req, res) => {
  await withTransaction(async (conn) => {
    const a = await one('SELECT * FROM selection_approvals WHERE id = ? FOR UPDATE', [req.params.id], conn);
    if (!a || a.status !== 'submitted') throw new HttpError(409, 'Pengajuan hasil tidak dalam status menunggu persetujuan.', 'INVALID_STATE');
    if (req.valid.decision === 'rejected' && !req.valid.notes) throw new HttpError(422, 'Alasan penolakan wajib diisi.', 'NOTES_REQUIRED');
    await query('UPDATE selection_approvals SET status = ?, decided_by = ?, decided_at = NOW(), decision_notes = ?, publish_at = ? WHERE id = ?',
      [req.valid.decision, req.user.id, req.valid.notes || null, req.valid.decision === 'approved' ? req.valid.publish_at || null : null, a.id], conn);
    if (req.valid.decision === 'rejected') {
      await query(`UPDATE applications a JOIN selection_results r ON r.application_id = a.id SET a.selection_status = 'in_process' WHERE r.approval_id = ?`, [a.id], conn);
    }
    await audit(req, `selection.${req.valid.decision === 'approved' ? 'approve' : 'reject'}`, 'selection_approval', a.id, req.valid, conn);
  });
  res.json({ message: req.valid.decision === 'approved' ? 'Hasil disetujui.' : 'Hasil dikembalikan untuk ditinjau.' });
}));

router.post('/approvals/:id(\\d+)/publish', requirePerm('selection.approve'), asyncHandler(async (req, res) => {
  const count = await withTransaction((conn) => publishApproval(req, Number(req.params.id), conn));
  res.json({ message: `Hasil seleksi resmi dipublikasikan untuk ${count} pendaftar.` });
}));

module.exports = router;
