const express = require('express');
const { z } = require('zod');
const { query, one, withTransaction } = require('../config/db');
const { asyncHandler, HttpError, parseJson } = require('../utils/http');
const { validate } = require('../middleware/validate');
const { requirePerm } = require('../middleware/auth');
const { audit } = require('../utils/audit');
const svc = require('../services/applicationService');

const router = express.Router();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD');
const dt = z.string().regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/, 'Format waktu tidak valid').transform((v) => v.replace('T', ' ').slice(0, 16) + ':00');
const text = (max) => z.string().trim().max(max).optional().default('');

// ===== Publik =====
router.get('/public', asyncHandler(async (req, res) => {
  const period = await svc.getCurrentPeriod();
  const data = { period: null, registration_open: false, stages: [], paths: [], requirements: [], faqs: [], announcements: [], contact: null };
  if (period) {
    data.period = { id: period.id, name: period.name, academic_year: period.academic_year, level: period.level, start_date: period.start_date, end_date: period.end_date, status: period.status, description: period.description };
    data.registration_open = await svc.isRegistrationOpen(period);
    data.stages = await svc.getStages(period.id);
    data.paths = await query(`SELECT p.id, p.name, p.description, p.special_requirements, p.terms, q.quota,
      (SELECT COUNT(*) FROM applications a WHERE a.path_id = p.id AND a.submission_status <> 'draft') AS applicant_count
      FROM admission_paths p LEFT JOIN admission_quotas q ON q.path_id = p.id WHERE p.period_id = ? AND p.is_active = 1 ORDER BY p.id`, [period.id]);
    data.requirements = await query(`SELECT r.name, r.description, r.is_required, r.allowed_types, r.max_size_kb, r.stage, pa.name AS path_name
      FROM document_requirements r LEFT JOIN admission_paths pa ON pa.id = r.path_id WHERE r.period_id = ? AND r.is_active = 1 ORDER BY r.stage, r.id`, [period.id]);
  }
  data.faqs = await query(`SELECT id, question, answer FROM ppdb_faqs WHERE status = 'published' ORDER BY sort_order, id`);
  data.announcements = await query(`SELECT title, slug, summary, published_at FROM announcements WHERE category = 'ppdb' AND audience = 'public'
    AND status = 'published' AND published_at <= NOW() ORDER BY published_at DESC LIMIT 10`);
  data.contact = await one(`SELECT title, content FROM school_profiles WHERE section_key = 'kontak_panitia' AND status = 'published'`);
  res.json({ data });
}));

// ===== Periode =====
const periodSchema = z.object({
  name: z.string().trim().min(3).max(150), academic_year: z.string().regex(/^\d{4}\/\d{4}$/, 'Format tahun ajaran: 2027/2028'),
  level: z.string().trim().min(2).max(60), start_date: date, end_date: date, description: text(5000),
}).refine((v) => v.start_date <= v.end_date, { message: 'Tanggal mulai harus sebelum tanggal berakhir', path: ['end_date'] });

const TRANSITIONS = { draft: ['scheduled', 'active'], scheduled: ['draft', 'active'], active: ['closed'], closed: ['active', 'archived'], archived: [] };

router.get('/periods', requirePerm('admission.config', 'applications.view', 'reports.view', 'selection.manage'), asyncHandler(async (req, res) => {
  const rows = await query(`SELECT p.*, (SELECT COUNT(*) FROM applications a WHERE a.period_id = p.id) AS application_count FROM admission_periods p ORDER BY p.start_date DESC`);
  const stages = await query('SELECT * FROM admission_stages ORDER BY start_at');
  res.json({ data: rows.map((p) => ({ ...p, form_config: parseJson(p.form_config_json, { required_fields: [] }), stages: stages.filter((s) => s.period_id === p.id) })) });
}));

router.post('/periods', requirePerm('admission.config'), validate(periodSchema), asyncHandler(async (req, res) => {
  const v = req.valid;
  const r = await query('INSERT INTO admission_periods (name, academic_year, level, start_date, end_date, description, form_config_json) VALUES (?,?,?,?,?,?,?)',
    [v.name, v.academic_year, v.level, v.start_date, v.end_date, v.description, JSON.stringify({ required_fields: [] })]);
  await audit(req, 'config.period_create', 'admission_period', r.insertId, v);
  res.status(201).json({ message: 'Periode dibuat dengan status Draf.', id: r.insertId });
}));

router.put('/periods/:id(\\d+)', requirePerm('admission.config'), validate(periodSchema), asyncHandler(async (req, res) => {
  const before = await one('SELECT * FROM admission_periods WHERE id = ?', [req.params.id]);
  if (!before) throw new HttpError(404, 'Periode tidak ditemukan.', 'NOT_FOUND');
  if (before.status === 'archived') throw new HttpError(409, 'Periode yang diarsipkan tidak dapat diubah.', 'LOCKED');
  const used = await one('SELECT COUNT(*) AS n FROM applications WHERE period_id = ?', [before.id]);
  const v = req.valid;
  if (Number(used.n) && (v.academic_year !== before.academic_year || v.level !== before.level)) {
    throw new HttpError(409, 'Tahun ajaran/jenjang tidak dapat diubah karena sudah ada pengajuan.', 'IN_USE');
  }
  await query('UPDATE admission_periods SET name=?, academic_year=?, level=?, start_date=?, end_date=?, description=? WHERE id=?',
    [v.name, v.academic_year, v.level, v.start_date, v.end_date, v.description, before.id]);
  await audit(req, 'config.period_update', 'admission_period', before.id, { before: { start_date: before.start_date, end_date: before.end_date, name: before.name }, after: v });
  res.json({ message: 'Periode diperbarui.' });
}));

router.post('/periods/:id(\\d+)/status', requirePerm('admission.config'), validate(z.object({ status: z.enum(['draft', 'scheduled', 'active', 'closed', 'archived']) })), asyncHandler(async (req, res) => {
  await withTransaction(async (conn) => {
    const p = await one('SELECT * FROM admission_periods WHERE id = ? FOR UPDATE', [req.params.id], conn);
    if (!p) throw new HttpError(404, 'Periode tidak ditemukan.', 'NOT_FOUND');
    if (!TRANSITIONS[p.status].includes(req.valid.status)) throw new HttpError(409, `Perubahan status dari ${p.status} ke ${req.valid.status} tidak diizinkan.`, 'INVALID_TRANSITION');
    if (req.valid.status === 'active') {
      const other = await one(`SELECT id FROM admission_periods WHERE status = 'active' AND id <> ?`, [p.id], conn);
      if (other) throw new HttpError(409, 'Hanya satu periode yang dapat aktif. Tutup periode aktif lainnya terlebih dahulu.', 'ANOTHER_ACTIVE');
    }
    await query('UPDATE admission_periods SET status = ? WHERE id = ?', [req.valid.status, p.id], conn);
    await audit(req, 'config.period_status', 'admission_period', p.id, { from: p.status, to: req.valid.status }, conn);
  });
  res.json({ message: 'Status periode diperbarui.' });
}));

router.put('/periods/:id(\\d+)/stages', requirePerm('admission.config'), validate(z.object({
  stages: z.array(z.object({
    stage_type: z.enum(['registration', 'verification', 'selection', 'announcement', 're_registration']),
    start_at: dt, end_at: dt, notes: text(255),
  })).max(5),
})), asyncHandler(async (req, res) => {
  const p = await one('SELECT id FROM admission_periods WHERE id = ?', [req.params.id]);
  if (!p) throw new HttpError(404, 'Periode tidak ditemukan.', 'NOT_FOUND');
  for (const s of req.valid.stages) if (s.start_at >= s.end_at) throw new HttpError(422, `Waktu mulai tahap ${s.stage_type} harus sebelum waktu selesai.`, 'INVALID_RANGE');
  await withTransaction(async (conn) => {
    for (const s of req.valid.stages) {
      await query(`INSERT INTO admission_stages (period_id, stage_type, start_at, end_at, notes) VALUES (?,?,?,?,?)
        ON DUPLICATE KEY UPDATE start_at=VALUES(start_at), end_at=VALUES(end_at), notes=VALUES(notes)`, [p.id, s.stage_type, s.start_at, s.end_at, s.notes], conn);
    }
    await audit(req, 'config.stages', 'admission_period', p.id, req.valid, conn);
  });
  res.json({ message: 'Jadwal tahapan tersimpan.' });
}));

router.put('/periods/:id(\\d+)/form-config', requirePerm('admission.config'), validate(z.object({
  required_fields: z.array(z.enum(Object.keys(svc.OPTIONAL_FIELDS))).max(20),
})), asyncHandler(async (req, res) => {
  const p = await one('SELECT id, form_config_json FROM admission_periods WHERE id = ?', [req.params.id]);
  if (!p) throw new HttpError(404, 'Periode tidak ditemukan.', 'NOT_FOUND');
  // Hanya menandai kolom wajib; data pengajuan yang sudah tersimpan tidak diubah.
  await query('UPDATE admission_periods SET form_config_json = ? WHERE id = ?', [JSON.stringify(req.valid), p.id]);
  await audit(req, 'config.form', 'admission_period', p.id, { before: parseJson(p.form_config_json, {}), after: req.valid });
  res.json({ message: 'Konfigurasi formulir tersimpan.' });
}));

router.get('/form-fields', requirePerm('admission.config'), (req, res) => res.json({ data: { core: svc.CORE_FIELDS, optional: svc.OPTIONAL_FIELDS } }));

// ===== Jalur & Kuota =====
const pathSchema = z.object({
  period_id: z.coerce.number().int().positive(), name: z.string().trim().min(3).max(150), description: text(5000),
  special_requirements: text(5000), terms: text(5000), is_active: z.boolean().default(true),
  quota: z.union([z.coerce.number().int().min(0).max(100000), z.literal(''), z.null()]).optional().transform((v) => (v === '' || v === undefined ? null : v)),
});

router.get('/paths', requirePerm('admission.config', 'applications.view', 'reports.view'), asyncHandler(async (req, res) => {
  const rows = await query(`SELECT p.*, q.quota, (SELECT COUNT(*) FROM applications a WHERE a.path_id = p.id) AS application_count FROM admission_paths p
    LEFT JOIN admission_quotas q ON q.path_id = p.id WHERE (? = 0 OR p.period_id = ?) ORDER BY p.period_id DESC, p.id`, [Number(req.query.period_id) || 0, Number(req.query.period_id) || 0]);
  res.json({ data: rows });
}));

async function savePath(req, id) {
  const v = req.valid;
  return withTransaction(async (conn) => {
    let pathId = id;
    if (id) {
      const before = await one('SELECT p.*, q.quota FROM admission_paths p LEFT JOIN admission_quotas q ON q.path_id = p.id WHERE p.id = ?', [id], conn);
      if (!before) throw new HttpError(404, 'Jalur tidak ditemukan.', 'NOT_FOUND');
      if (before.period_id !== v.period_id) throw new HttpError(409, 'Periode jalur tidak dapat dipindahkan.', 'LOCKED');
      await query('UPDATE admission_paths SET name=?, description=?, special_requirements=?, terms=?, is_active=? WHERE id=?',
        [v.name, v.description, v.special_requirements, v.terms, v.is_active ? 1 : 0, id], conn);
      if (String(before.quota) !== String(v.quota)) await audit(req, 'config.quota', 'admission_path', id, { before: before.quota, after: v.quota }, conn);
    } else {
      pathId = (await query('INSERT INTO admission_paths (period_id, name, description, special_requirements, terms, is_active) VALUES (?,?,?,?,?,?)',
        [v.period_id, v.name, v.description, v.special_requirements, v.terms, v.is_active ? 1 : 0], conn)).insertId;
    }
    await query('INSERT INTO admission_quotas (path_id, quota) VALUES (?,?) ON DUPLICATE KEY UPDATE quota = VALUES(quota)', [pathId, v.quota], conn);
    await audit(req, id ? 'config.path_update' : 'config.path_create', 'admission_path', pathId, v, conn);
    return pathId;
  });
}

router.post('/paths', requirePerm('admission.config'), validate(pathSchema), asyncHandler(async (req, res) => {
  res.status(201).json({ message: 'Jalur dibuat.', id: await savePath(req, null) });
}));
router.put('/paths/:id(\\d+)', requirePerm('admission.config'), validate(pathSchema), asyncHandler(async (req, res) => {
  await savePath(req, Number(req.params.id));
  res.json({ message: 'Jalur diperbarui.' });
}));

// ===== Persyaratan dokumen =====
const reqSchema = z.object({
  period_id: z.coerce.number().int().positive(), path_id: z.union([z.coerce.number().int().positive(), z.literal(''), z.null()]).optional().transform((v) => v || null),
  stage: z.enum(['application', 're_registration']), name: z.string().trim().min(3).max(150), description: text(500),
  is_required: z.boolean().default(true), is_active: z.boolean().default(true),
  allowed_types: z.array(z.enum(['pdf', 'jpg', 'png', 'webp'])).min(1).transform((a) => a.join(',')),
  max_size_kb: z.coerce.number().int().min(50).max(5120),
});

router.get('/requirements', requirePerm('admission.config'), asyncHandler(async (req, res) => {
  const rows = await query(`SELECT r.*, pa.name AS path_name FROM document_requirements r LEFT JOIN admission_paths pa ON pa.id = r.path_id
    WHERE (? = 0 OR r.period_id = ?) ORDER BY r.period_id DESC, r.stage, r.id`, [Number(req.query.period_id) || 0, Number(req.query.period_id) || 0]);
  res.json({ data: rows });
}));

router.post('/requirements', requirePerm('admission.config'), validate(reqSchema), asyncHandler(async (req, res) => {
  const v = req.valid;
  const r = await query('INSERT INTO document_requirements (period_id, path_id, stage, name, description, is_required, allowed_types, max_size_kb, is_active) VALUES (?,?,?,?,?,?,?,?,?)',
    [v.period_id, v.path_id, v.stage, v.name, v.description, v.is_required ? 1 : 0, v.allowed_types, v.max_size_kb, v.is_active ? 1 : 0]);
  await audit(req, 'config.requirement_create', 'document_requirement', r.insertId, v);
  res.status(201).json({ message: 'Persyaratan dibuat.', id: r.insertId });
}));

router.put('/requirements/:id(\\d+)', requirePerm('admission.config'), validate(reqSchema), asyncHandler(async (req, res) => {
  const v = req.valid;
  const before = await one('SELECT * FROM document_requirements WHERE id = ?', [req.params.id]);
  if (!before) throw new HttpError(404, 'Persyaratan tidak ditemukan.', 'NOT_FOUND');
  await query('UPDATE document_requirements SET path_id=?, stage=?, name=?, description=?, is_required=?, allowed_types=?, max_size_kb=?, is_active=? WHERE id=?',
    [v.path_id, v.stage, v.name, v.description, v.is_required ? 1 : 0, v.allowed_types, v.max_size_kb, v.is_active ? 1 : 0, before.id]);
  await audit(req, 'config.requirement_update', 'document_requirement', before.id, { before, after: v });
  res.json({ message: 'Persyaratan diperbarui. Dokumen yang sudah diunggah tidak berubah.' });
}));

// ===== FAQ =====
const faqSchema = z.object({ question: z.string().trim().min(5).max(300), answer: z.string().trim().min(2).max(5000), sort_order: z.coerce.number().int().default(0), status: z.enum(['draft', 'published', 'archived']) });
router.get('/faqs', requirePerm('admission.config'), asyncHandler(async (req, res) => res.json({ data: await query('SELECT * FROM ppdb_faqs ORDER BY sort_order, id') })));
router.post('/faqs', requirePerm('admission.config'), validate(faqSchema), asyncHandler(async (req, res) => {
  const v = req.valid;
  const r = await query('INSERT INTO ppdb_faqs (question, answer, sort_order, status) VALUES (?,?,?,?)', [v.question, v.answer, v.sort_order, v.status]);
  await audit(req, 'config.faq_create', 'faq', r.insertId);
  res.status(201).json({ message: 'FAQ dibuat.' });
}));
router.put('/faqs/:id(\\d+)', requirePerm('admission.config'), validate(faqSchema), asyncHandler(async (req, res) => {
  const v = req.valid;
  await query('UPDATE ppdb_faqs SET question=?, answer=?, sort_order=?, status=? WHERE id=?', [v.question, v.answer, v.sort_order, v.status, req.params.id]);
  await audit(req, 'config.faq_update', 'faq', req.params.id);
  res.json({ message: 'FAQ diperbarui.' });
}));
router.delete('/faqs/:id(\\d+)', requirePerm('admission.config'), asyncHandler(async (req, res) => {
  await query('DELETE FROM ppdb_faqs WHERE id = ?', [req.params.id]);
  await audit(req, 'config.faq_delete', 'faq', req.params.id);
  res.json({ message: 'FAQ dihapus.' });
}));



module.exports = router;
