const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { z } = require('zod');
const { query, one, withTransaction } = require('../config/db');
const { asyncHandler, HttpError } = require('../utils/http');
const { validate } = require('../middleware/validate');
const { requirePerm } = require('../middleware/auth');
const { runUpload, checkFile, saveFile } = require('../middleware/upload');
const { audit } = require('../utils/audit');
const env = require('../config/env');
const svc = require('../services/applicationService');
const { STATUS_LABEL } = require('../services/selectionService');

const router = express.Router();
router.use(requirePerm('applicant.self'));
// Only the applicant stage may edit PPDB data. The same login later becomes an active student.
router.use((req, _res, next) => {
  if (req.user.account_stage !== 'applicant') return next(new HttpError(403, 'Tahap PPDB sudah selesai untuk akun ini. Data akademik siswa dikelola melalui portal siswa.', 'APPLICANT_STAGE_REQUIRED'));
  next();
});

const opt = (s) => s.optional().or(z.literal('')).transform((v) => (v === '' ? null : v));

router.get('/', asyncHandler(async (req, res) => {
  const applicant = await svc.getApplicantByUser(req.user.id);
  const application = await svc.getMyApplication(applicant.id);
  const period = application
    ? await one('SELECT * FROM admission_periods WHERE id = ?', [application.period_id])
    : await svc.getCurrentPeriod();
  const [guardians, education, completeness] = await Promise.all([
    query('SELECT relation, full_name, occupation, phone, address FROM applicant_guardians WHERE applicant_id = ?', [applicant.id]),
    one('SELECT school_name, npsn, graduation_year, school_address FROM applicant_education WHERE applicant_id = ?', [applicant.id]),
    svc.computeCompleteness(applicant, application),
  ]);
  const data = {
    applicant, guardians, education, application, period, completeness,
    registration_open: await svc.isRegistrationOpen(period),
    stages: period ? await svc.getStages(period.id) : [],
    paths: period ? await query(
      `SELECT p.id, p.name, p.description, p.special_requirements, q.quota FROM admission_paths p
       LEFT JOIN admission_quotas q ON q.path_id = p.id WHERE p.period_id = ? AND p.is_active = 1 ORDER BY p.id`, [period.id]) : [],
    programs: await query(`SELECT id, code, title FROM school_programs WHERE is_active = 1 ORDER BY title`),
    preferences: [], requirements: [], re_requirements: [], documents: [], history: [], result: null,
  };
  if (application) {
    data.preferences = await query('SELECT program_id, preference_rank FROM application_preferences WHERE application_id = ? ORDER BY preference_rank', [application.id]);
    data.requirements = await svc.getRequirements(application.period_id, application.path_id, 'application');
    data.re_requirements = await svc.getRequirements(application.period_id, application.path_id, 're_registration');
    data.documents = await svc.getDocuments(application.id);
    data.history = await query(
      `SELECT 'verifikasi' AS kind, target, previous_status, new_status, notes, created_at FROM verification_records WHERE application_id = ?
       UNION ALL SELECT 'daftar_ulang', 're_registration', previous_status, new_status, notes, created_at FROM re_registration_records WHERE application_id = ?
       ORDER BY created_at DESC LIMIT 50`, [application.id, application.id]);
    const result = await one('SELECT proposed_status, notes, updated_at FROM selection_results WHERE application_id = ? AND is_official = 1', [application.id]);
    if (result) data.result = { status: result.proposed_status, label: STATUS_LABEL[result.proposed_status], notes: result.notes };
    // Hasil sementara tidak pernah dikirim ke pendaftar sebelum dipublikasikan resmi.
    if (!result && ['accepted', 'rejected', 'waitlist'].includes(application.selection_status)) data.application.selection_status = 'pending_decision';
  }
  res.json({ data });
}));

router.put('/profile', validate(z.object({
  full_name: z.string().trim().min(3).max(150),
  nik: z.string().regex(/^\d{16}$/, 'NIK harus 16 digit angka'),
  nisn: opt(z.string().regex(/^\d{10}$/, 'NISN harus 10 digit angka')),
  gender: z.enum(['L', 'P'], { errorMap: () => ({ message: 'Pilih jenis kelamin' }) }),
  birth_place: opt(z.string().trim().max(100)),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal lahir wajib diisi'),
  religion: opt(z.string().trim().max(30)),
  address: z.string().trim().min(5, 'Alamat minimal 5 karakter').max(1000),
  phone: opt(z.string().trim().regex(/^[0-9+\-\s]{6,30}$/, 'Nomor telepon tidak valid')),
})), asyncHandler(async (req, res) => {
  const applicant = await svc.getApplicantByUser(req.user.id);
  svc.assertEditable(await svc.getMyApplication(applicant.id));
  const v = req.valid;
  await query(
    `UPDATE applicants SET full_name=?, nik=?, nisn=?, gender=?, birth_place=?, birth_date=?, religion=?, address=?, phone=? WHERE id=?`,
    [v.full_name, v.nik, v.nisn, v.gender, v.birth_place, v.birth_date, v.religion, v.address, v.phone, applicant.id],
  );
  res.json({ message: 'Data diri tersimpan sebagai draf.' });
}));

const guardianSchema = z.object({
  relation: z.enum(['ayah', 'ibu', 'wali']),
  full_name: opt(z.string().trim().max(150)),
  occupation: opt(z.string().trim().max(100)),
  phone: opt(z.string().trim().regex(/^[0-9+\-\s]{6,30}$/, 'Nomor telepon tidak valid')),
  address: opt(z.string().trim().max(1000)),
});

router.put('/guardians', validate(z.object({ guardians: z.array(guardianSchema).min(1).max(3) })), asyncHandler(async (req, res) => {
  const applicant = await svc.getApplicantByUser(req.user.id);
  svc.assertEditable(await svc.getMyApplication(applicant.id));
  await withTransaction(async (conn) => {
    for (const g of req.valid.guardians) {
      await query(
        `INSERT INTO applicant_guardians (applicant_id, relation, full_name, occupation, phone, address) VALUES (?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), occupation=VALUES(occupation), phone=VALUES(phone), address=VALUES(address)`,
        [applicant.id, g.relation, g.full_name, g.occupation, g.phone, g.address], conn,
      );
    }
  });
  res.json({ message: 'Data orang tua/wali tersimpan.' });
}));

router.put('/education', validate(z.object({
  school_name: z.string().trim().min(3, 'Nama sekolah asal wajib diisi').max(150),
  npsn: opt(z.string().regex(/^\d{8}$/, 'NPSN harus 8 digit angka')),
  graduation_year: z.union([z.coerce.number().int().min(2000).max(2100), z.literal('')]).optional().transform((v) => (v === '' || v === undefined ? null : v)),
  school_address: opt(z.string().trim().max(1000)),
})), asyncHandler(async (req, res) => {
  const applicant = await svc.getApplicantByUser(req.user.id);
  svc.assertEditable(await svc.getMyApplication(applicant.id));
  const v = req.valid;
  await query(
    `INSERT INTO applicant_education (applicant_id, school_name, npsn, graduation_year, school_address) VALUES (?,?,?,?,?)
     ON DUPLICATE KEY UPDATE school_name=VALUES(school_name), npsn=VALUES(npsn), graduation_year=VALUES(graduation_year), school_address=VALUES(school_address)`,
    [applicant.id, v.school_name, v.npsn, v.graduation_year, v.school_address],
  );
  res.json({ message: 'Data pendidikan asal tersimpan.' });
}));

router.put('/choice', validate(z.object({
  path_id: z.coerce.number().int().positive('Pilih jalur pendaftaran'),
  program_ids: z.array(z.coerce.number().int().positive()).min(1, 'Pilih minimal satu program keahlian').max(3),
})), asyncHandler(async (req, res) => {
  const applicant = await svc.getApplicantByUser(req.user.id);
  const existing = await svc.getMyApplication(applicant.id);
  svc.assertEditable(existing);
  await withTransaction(async (conn) => {
    const application = existing || (await svc.ensureDraft(applicant, conn));
    const p = await one('SELECT id FROM admission_paths WHERE id = ? AND period_id = ? AND is_active = 1', [req.valid.path_id, application.period_id], conn);
    if (!p) throw new HttpError(422, 'Jalur tidak tersedia untuk periode ini.', 'PATH_INVALID');
    const ids = [...new Set(req.valid.program_ids)];
    if (ids.length) {
      const found = await query(`SELECT id FROM school_programs WHERE is_active=1 AND id IN (${ids.map(() => '?').join(',')})`, ids, conn);
      if (found.length !== ids.length) throw new HttpError(422, 'Program keahlian tidak valid.', 'PROGRAM_INVALID');
    }
    await query('UPDATE applications SET path_id = ? WHERE id = ?', [p.id, application.id], conn);
    await query('DELETE FROM application_preferences WHERE application_id = ?', [application.id], conn);
    for (const [i, id] of ids.entries()) {
      await query('INSERT INTO application_preferences (application_id, program_id, preference_rank) VALUES (?,?,?)', [application.id, id, i + 1], conn);
    }
  });
  res.json({ message: 'Pilihan jalur tersimpan.' });
}));

router.post('/documents/:requirementId', asyncHandler(async (req, res) => {
  await runUpload(req, res);
  const applicant = await svc.getApplicantByUser(req.user.id);
  const application = await svc.getMyApplication(applicant.id);
  if (!application) throw new HttpError(409, 'Pilih jalur pendaftaran terlebih dahulu.', 'NO_APPLICATION');
  const reqRow = await one('SELECT * FROM document_requirements WHERE id = ? AND period_id = ? AND is_active = 1', [req.params.requirementId, application.period_id]);
  if (!reqRow || (reqRow.path_id && reqRow.path_id !== application.path_id)) throw new HttpError(404, 'Persyaratan dokumen tidak ditemukan.', 'NOT_FOUND');
  if (reqRow.stage === 'application') svc.assertEditable(application);
  if (reqRow.stage === 're_registration' && !['in_process', 'needs_revision'].includes(application.re_registration_status)) {
    throw new HttpError(409, 'Unggah dokumen daftar ulang belum dibuka atau sudah dikirim.', 'LOCKED');
  }
  const doc0 = await one('SELECT status FROM application_documents WHERE application_id = ? AND requirement_id = ?', [application.id, reqRow.id]);
  if (doc0 && doc0.status === 'verified') throw new HttpError(409, 'Dokumen sudah terverifikasi dan tidak perlu diganti.', 'LOCKED');
  const detected = checkFile(req.file, reqRow.allowed_types.split(','), reqRow.max_size_kb);
  const storageName = await saveFile(env.privateStorageDir, req.file.buffer, detected.type);
  const sha = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
  await withTransaction(async (conn) => {
    await query(
      `INSERT INTO application_documents (application_id, requirement_id, status) VALUES (?,?,'not_uploaded')
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`, [application.id, reqRow.id], conn,
    );
    const doc = await one('SELECT * FROM application_documents WHERE application_id = ? AND requirement_id = ? FOR UPDATE', [application.id, reqRow.id], conn);
    const last = await one('SELECT COALESCE(MAX(version_no),0) AS v FROM document_versions WHERE document_id = ?', [doc.id], conn);
    const ver = await query(
      `INSERT INTO document_versions (document_id, version_no, storage_name, original_name, mime_type, size_bytes, sha256, uploaded_by) VALUES (?,?,?,?,?,?,?,?)`,
      [doc.id, Number(last.v) + 1, storageName, path.basename(req.file.originalname).slice(0, 255), detected.mime, req.file.size, sha, req.user.id], conn,
    );
    await query(`UPDATE application_documents SET status = 'pending', current_version_id = ?, notes = NULL WHERE id = ?`, [ver.insertId, doc.id], conn);
    await audit(req, Number(last.v) ? 'document.replace' : 'document.upload', 'application_document', doc.id, { requirement: reqRow.name, version: Number(last.v) + 1 }, conn);
  });
  res.status(201).json({ message: 'Dokumen berhasil diunggah.' });
}));

router.post('/submit', asyncHandler(async (req, res) => {
  const applicant = await svc.getApplicantByUser(req.user.id);
  const result = await svc.submitApplication(req, applicant.id);
  res.json({ message: 'Pengajuan berhasil dikirim.', ...result });
}));

router.get('/proof', asyncHandler(async (req, res) => {
  const applicant = await svc.getApplicantByUser(req.user.id);
  const row = await one(
    `SELECT a.registration_number, a.submission_status, a.submitted_at, p.name AS period_name, p.academic_year, ap2.name AS path_name, ap.full_name, ap.nisn
     FROM applications a JOIN applicants ap ON ap.id = a.applicant_id JOIN admission_periods p ON p.id = a.period_id
     LEFT JOIN admission_paths ap2 ON ap2.id = a.path_id WHERE a.applicant_id = ? AND a.registration_number IS NOT NULL ORDER BY a.id DESC LIMIT 1`,
    [applicant.id],
  );
  if (!row) throw new HttpError(404, 'Bukti pendaftaran tersedia setelah pengajuan dikirim.', 'NOT_FOUND');
  const identity = await one(`SELECT content FROM school_profiles WHERE section_key = 'identitas'`);
  res.json({ data: { ...row, school_identity: identity ? identity.content : '' } });
}));

const RR = async (req, conn, application, action, next, notes) => {
  await query('UPDATE applications SET re_registration_status = ? WHERE id = ?', [next, application.id], conn);
  await query('INSERT INTO re_registration_records (application_id, action, previous_status, new_status, notes, actor_id) VALUES (?,?,?,?,?,?)',
    [application.id, action, application.re_registration_status, next, notes || null, req.user.id], conn);
  await audit(req, `re_registration.${action}`, 'application', application.id, { from: application.re_registration_status, to: next }, conn);
};

router.post('/re-registration/confirm', validate(z.object({ willing: z.boolean() })), asyncHandler(async (req, res) => {
  const applicant = await svc.getApplicantByUser(req.user.id);
  await withTransaction(async (conn) => {
    const application = await one('SELECT * FROM applications WHERE applicant_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE', [applicant.id], conn);
    if (!application || application.re_registration_status !== 'awaiting_confirmation') throw new HttpError(409, 'Konfirmasi daftar ulang tidak tersedia.', 'NOT_AVAILABLE');
    await RR(req, conn, application, req.valid.willing ? 'confirm' : 'decline', req.valid.willing ? 'in_process' : 'withdrawn', req.valid.willing ? 'Bersedia melanjutkan' : 'Tidak melanjutkan');
  });
  res.json({ message: req.valid.willing ? 'Kesediaan daftar ulang tercatat. Lengkapi dokumen daftar ulang.' : 'Pernyataan tidak melanjutkan tercatat.' });
}));

router.post('/re-registration/submit', asyncHandler(async (req, res) => {
  const applicant = await svc.getApplicantByUser(req.user.id);
  await withTransaction(async (conn) => {
    const application = await one('SELECT * FROM applications WHERE applicant_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE', [applicant.id], conn);
    if (!application || !['in_process', 'needs_revision'].includes(application.re_registration_status)) throw new HttpError(409, 'Daftar ulang tidak dapat dikirim pada status ini.', 'NOT_AVAILABLE');
    const reqs = await svc.getRequirements(application.period_id, application.path_id, 're_registration', conn);
    const docs = await svc.getDocuments(application.id, conn);
    const missing = reqs.filter((r) => r.is_required && !docs.some((d) => d.requirement_id === r.id && d.status !== 'not_uploaded'));
    if (missing.length) throw new HttpError(422, `Dokumen daftar ulang belum lengkap: ${missing.map((m) => m.name).join(', ')}`, 'INCOMPLETE');
    await RR(req, conn, application, 'submit', 'awaiting_verification');
  });
  res.json({ message: 'Daftar ulang dikirim dan menunggu verifikasi Admin Sekolah.' });
}));

module.exports = router;
