const { query, one, withTransaction } = require('../config/db');
const { HttpError, parseJson } = require('../utils/http');
const { audit } = require('../utils/audit');
const { notify } = require('../utils/notify');

const OPTIONAL_FIELDS = {
  nisn: 'NISN', religion: 'Agama', phone: 'Nomor telepon pendaftar', birth_place: 'Tempat lahir',
  guardian_phone: 'Nomor telepon orang tua/wali', npsn: 'NPSN sekolah asal', graduation_year: 'Tahun lulus',
};
const CORE_FIELDS = ['full_name', 'nik', 'gender', 'birth_date', 'address'];
const EDITABLE_STATUSES = ['draft', 'needs_revision'];

async function getCurrentPeriod(conn) {
  return one(
    `SELECT * FROM admission_periods WHERE status IN ('active','scheduled')
     ORDER BY FIELD(status,'active','scheduled'), start_date DESC LIMIT 1`, [], conn,
  );
}

async function getStages(periodId, conn) {
  return query('SELECT stage_type, start_at, end_at, notes FROM admission_stages WHERE period_id = ? ORDER BY start_at', [periodId], conn);
}

async function isRegistrationOpen(period, conn) {
  if (!period || period.status !== 'active') return false;
  const row = await one(
    `SELECT (CASE WHEN s.id IS NULL THEN CURDATE() BETWEEN p.start_date AND p.end_date
             ELSE NOW() BETWEEN s.start_at AND s.end_at END) AS open_now
     FROM admission_periods p LEFT JOIN admission_stages s ON s.period_id = p.id AND s.stage_type = 'registration'
     WHERE p.id = ?`, [period.id], conn,
  );
  return !!(row && Number(row.open_now));
}

async function getApplicantByUser(userId, conn) {
  const applicant = await one('SELECT * FROM applicants WHERE user_id = ?', [userId], conn);
  if (!applicant) throw new HttpError(404, 'Data pendaftar tidak ditemukan.', 'NOT_FOUND');
  return applicant;
}

async function getRequirements(periodId, pathId, stage, conn) {
  return query(
    `SELECT * FROM document_requirements WHERE period_id = ? AND stage = ? AND is_active = 1
     AND (path_id IS NULL OR path_id = ?) ORDER BY is_required DESC, id`, [periodId, stage, pathId || 0], conn,
  );
}

async function getDocuments(applicationId, conn) {
  return query(
    `SELECT d.id, d.requirement_id, d.status, d.notes, d.updated_at, v.id AS version_id, v.original_name, v.size_bytes, v.version_no, v.created_at AS uploaded_at
     FROM application_documents d LEFT JOIN document_versions v ON v.id = d.current_version_id WHERE d.application_id = ?`,
    [applicationId], conn,
  );
}

async function computeCompleteness(applicant, application, conn) {
  const period = application ? await one('SELECT * FROM admission_periods WHERE id = ?', [application.period_id], conn) : await getCurrentPeriod(conn);
  const config = parseJson(period && period.form_config_json, { required_fields: [] });
  const guardians = await query('SELECT * FROM applicant_guardians WHERE applicant_id = ?', [applicant.id], conn);
  const education = await one('SELECT * FROM applicant_education WHERE applicant_id = ?', [applicant.id], conn);
  const required = config.required_fields || [];
  const missing = [];
  const profileFields = [...CORE_FIELDS, ...required.filter((f) => ['nisn', 'religion', 'phone', 'birth_place'].includes(f))];
  profileFields.forEach((f) => { if (!applicant[f]) missing.push(`profil.${f}`); });
  const namedGuardians = guardians.filter((g) => g.full_name);
  if (!namedGuardians.length) missing.push('orang_tua.nama');
  if (required.includes('guardian_phone') && !namedGuardians.some((g) => g.phone)) missing.push('orang_tua.telepon');
  if (!education || !education.school_name) missing.push('pendidikan.sekolah_asal');
  if (required.includes('npsn') && !(education && education.npsn)) missing.push('pendidikan.npsn');
  if (required.includes('graduation_year') && !(education && education.graduation_year)) missing.push('pendidikan.tahun_lulus');
  if (!application || !application.path_id) missing.push('jalur');
  const preferences = application ? await query('SELECT program_id FROM application_preferences WHERE application_id=? ORDER BY preference_rank', [application.id], conn) : [];
  if (!preferences.length) missing.push('jalur.program');
  if (application && application.path_id) {
    const reqs = await getRequirements(application.period_id, application.path_id, 'application', conn);
    const docs = await getDocuments(application.id, conn);
    reqs.filter((r) => r.is_required).forEach((r) => {
      const d = docs.find((x) => x.requirement_id === r.id);
      if (!d || d.status === 'not_uploaded') missing.push(`dokumen.${r.name}`);
    });
  } else {
    missing.push('dokumen');
  }
  const sections = ['profil', 'orang_tua', 'pendidikan', 'jalur', 'dokumen'];
  const done = sections.filter((s) => !missing.some((m) => m.startsWith(s))).length;
  return { percent: Math.round((done / sections.length) * 100), missing };
}

function assertEditable(application) {
  if (application && !EDITABLE_STATUSES.includes(application.submission_status)) {
    throw new HttpError(409, 'Pengajuan sudah dikirim dan tidak dapat diubah kecuali diminta perbaikan oleh Admin Sekolah.', 'LOCKED');
  }
}

async function ensureDraft(applicant, conn) {
  const period = await getCurrentPeriod(conn);
  if (!period || !(await isRegistrationOpen(period, conn))) {
    throw new HttpError(409, 'Pendaftaran belum dibuka atau sudah ditutup.', 'REGISTRATION_CLOSED');
  }
  await query('INSERT IGNORE INTO applications (applicant_id, period_id) VALUES (?,?)', [applicant.id, period.id], conn);
  return one('SELECT * FROM applications WHERE applicant_id = ? AND period_id = ?', [applicant.id, period.id], conn);
}

async function getMyApplication(applicantId, conn) {
  return one('SELECT * FROM applications WHERE applicant_id = ? ORDER BY id DESC LIMIT 1', [applicantId], conn);
}

const registrationNumber = (period, appId) => `NH-${String(period.academic_year).slice(0, 4)}-${String(appId).padStart(6, '0')}`;

async function submitApplication(req, applicantId) {
  return withTransaction(async (conn) => {
    const application = await one('SELECT * FROM applications WHERE applicant_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE', [applicantId], conn);
    if (!application) throw new HttpError(409, 'Formulir pendaftaran belum dibuat.', 'NO_APPLICATION');
    if (!EDITABLE_STATUSES.includes(application.submission_status)) {
      throw new HttpError(409, 'Pengajuan sudah dikirim sebelumnya.', 'ALREADY_SUBMITTED');
    }
    const period = await one('SELECT * FROM admission_periods WHERE id = ?', [application.period_id], conn);
    if (application.submission_status === 'draft' && !(await isRegistrationOpen(period, conn))) {
      throw new HttpError(409, 'Pendaftaran sudah ditutup.', 'REGISTRATION_CLOSED');
    }
    const applicant = await one('SELECT * FROM applicants WHERE id = ?', [applicantId], conn);
    const completeness = await computeCompleteness(applicant, application, conn);
    if (completeness.percent < 100) {
      throw new HttpError(422, 'Formulir belum lengkap. Lengkapi seluruh bagian wajib sebelum mengirim.', 'INCOMPLETE', completeness.missing);
    }
    const regNo = application.registration_number || registrationNumber(period, application.id);
    const previous = application.submission_status;
    await query(
      `UPDATE applications SET submission_status = 'submitted', registration_number = ?, revision_notes = NULL,
       submitted_at = COALESCE(submitted_at, NOW()) WHERE id = ?`, [regNo, application.id], conn,
    );
    await query(
      `INSERT INTO verification_records (application_id, target, previous_status, new_status, notes, verifier_id)
       VALUES (?, 'application', ?, 'submitted', ?, ?)`,
      [application.id, previous, previous === 'needs_revision' ? 'Pengajuan ulang setelah perbaikan' : 'Pengajuan dikirim pendaftar', req.user.id], conn,
    );
    await notify(req.user.id, 'application_submitted', 'Pengajuan berhasil dikirim',
      `Nomor pendaftaran Anda: ${regNo}. Pengajuan akan diverifikasi Admin Sekolah.`, '/dashboard/bukti', conn);
    await audit(req, previous === 'draft' ? 'application.submit' : 'application.resubmit', 'application', application.id, { registration_number: regNo }, conn);
    return { registration_number: regNo };
  });
}

module.exports = {
  OPTIONAL_FIELDS, CORE_FIELDS, EDITABLE_STATUSES, getCurrentPeriod, getStages, isRegistrationOpen, getApplicantByUser,
  getRequirements, getDocuments, computeCompleteness, assertEditable, ensureDraft, getMyApplication, submitApplication,
};
