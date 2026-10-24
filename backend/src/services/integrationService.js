const { query, one, withTransaction } = require('../config/db');
const { HttpError } = require('../utils/http');
const { audit } = require('../utils/audit');

// Target integrasi: tabel data induk lokal student_records. Konektor SIAKAD eksternal belum tersedia.
async function processIntegration(req, applicationId) {
  const idempotencyKey = `app-${applicationId}`;
  try {
    return await withTransaction(async (conn) => {
      const app = await one(
        `SELECT a.*, ap.user_id AS applicant_user_id, ap.full_name, ap.nik, ap.gender, ap.birth_date, p.academic_year, r.is_official,
          (SELECT pref.program_id FROM application_preferences pref WHERE pref.application_id=a.id ORDER BY pref.preference_rank LIMIT 1) AS program_id
         FROM applications a JOIN applicants ap ON ap.id = a.applicant_id JOIN admission_periods p ON p.id = a.period_id
         LEFT JOIN selection_results r ON r.application_id = a.id WHERE a.id = ? FOR UPDATE`, [applicationId], conn,
      );
      if (!app) throw new HttpError(404, 'Pengajuan tidak ditemukan.', 'NOT_FOUND');
      if (app.selection_status !== 'accepted' || !Number(app.is_official) || app.re_registration_status !== 'completed') {
        throw new HttpError(409, 'Integrasi hanya untuk peserta diterima resmi yang telah selesai daftar ulang.', 'NOT_ELIGIBLE');
      }
      if (app.integration_status === 'success' && app.student_record_id) {
        // Backfill aman untuk data yang terintegrasi oleh versi sebelumnya sebelum student_accounts ada.
        const currentRole = await one(
          'SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? FOR UPDATE',
          [app.applicant_user_id], conn,
        );
        if (!currentRole || !['siswa', 'applicant'].includes(currentRole.code)) {
          throw new HttpError(409, 'Akun pendaftar memiliki role yang tidak sesuai. Perlu pemeriksaan administrator.', 'ACCOUNT_ROLE_CONFLICT');
        }
        const accountConflict = await one(
          'SELECT student_record_id, user_id FROM student_accounts WHERE student_record_id = ? OR user_id = ? FOR UPDATE',
          [app.student_record_id, app.applicant_user_id], conn,
        );
        if (accountConflict && (Number(accountConflict.student_record_id) !== Number(app.student_record_id) || Number(accountConflict.user_id) !== Number(app.applicant_user_id))) {
          throw new HttpError(409, 'Akun atau data induk sudah ditautkan ke siswa lain. Perlu pemeriksaan manual.', 'STUDENT_ACCOUNT_CONFLICT');
        }
        await query(
          `INSERT INTO student_accounts (student_record_id, user_id, status, activated_by, activated_at)
           VALUES (?, ?, 'active', ?, NOW())
           ON DUPLICATE KEY UPDATE status = 'active', activated_by = VALUES(activated_by), activated_at = COALESCE(activated_at, VALUES(activated_at))`,
          [app.student_record_id, app.applicant_user_id, req && req.user ? req.user.id : null], conn,
        );
        await query("UPDATE users SET account_stage='student' WHERE id=?", [app.applicant_user_id], conn);
        return { status: 'success', student_record_id: app.student_record_id, account_activated: true, idempotent: true };
      }
      const log = async (status, message, studentId) => {
        await query('INSERT INTO integration_logs (application_id, idempotency_key, status, message, student_record_id, operator_id) VALUES (?,?,?,?,?,?)',
          [applicationId, idempotencyKey, status, message, studentId || null, req && req.user ? req.user.id : null], conn);
        await audit(req, 'integration.attempt', 'application', applicationId, { status, message }, conn);
      };
      const missing = ['full_name', 'nik', 'birth_date', 'gender', 'program_id'].filter((f) => !app[f]);
      if (missing.length) {
        await query(`UPDATE applications SET integration_status = 'failed' WHERE id = ?`, [applicationId], conn);
        await log('failed', `Data belum lengkap: ${missing.join(', ')}`);
        return { status: 'failed', message: `Data belum lengkap: ${missing.join(', ')}` };
      }
      let student = await one('SELECT id FROM student_records WHERE source_application_id = ?', [applicationId], conn);
      if (!student) {
        const dup = await one('SELECT id FROM student_records WHERE nik = ?', [app.nik], conn);
        if (dup) {
          await query(`UPDATE applications SET integration_status = 'needs_review' WHERE id = ?`, [applicationId], conn);
          await log('needs_review', 'NIK sudah terdaftar pada data induk lain. Perlu pemeriksaan manual.');
          return { status: 'needs_review', message: 'Kemungkinan data ganda (NIK sama). Perlu pemeriksaan.' };
        }
        const studentNumber = `NH${String(app.academic_year).slice(0, 4)}${String(applicationId).padStart(6, '0')}`;
        const ins = await query(
          `INSERT INTO student_records (student_number, source_application_id, nik, full_name, gender, birth_date, entry_year, program_id, created_by)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [studentNumber, applicationId, app.nik, app.full_name, app.gender, app.birth_date, app.academic_year, app.program_id, req && req.user ? req.user.id : null], conn,
        );
        student = { id: ins.insertId };
      }
      // Aktivasi akun akademik dilakukan dalam transaksi yang sama dengan integrasi data induk.
      // Akun pendaftar yang terkait diaktifkan sebagai siswa pada account_stage; role applicant tetap dipertahankan dan akun staf tidak pernah diubah oleh proses ini.
      const currentRole = await one(
        'SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? FOR UPDATE',
        [app.applicant_user_id], conn,
      );
      if (!currentRole || !['siswa', 'applicant'].includes(currentRole.code)) {
        throw new HttpError(409, 'Akun pendaftar memiliki role yang tidak sesuai. Perlu pemeriksaan administrator.', 'ACCOUNT_ROLE_CONFLICT');
      }
      const accountConflict = await one(
        'SELECT student_record_id, user_id FROM student_accounts WHERE student_record_id = ? OR user_id = ? FOR UPDATE',
        [student.id, app.applicant_user_id], conn,
      );
      if (accountConflict && (Number(accountConflict.student_record_id) !== Number(student.id) || Number(accountConflict.user_id) !== Number(app.applicant_user_id))) {
        throw new HttpError(409, 'Akun atau data induk sudah ditautkan ke siswa lain. Perlu pemeriksaan manual.', 'STUDENT_ACCOUNT_CONFLICT');
      }
      await query(
        `INSERT INTO student_accounts (student_record_id, user_id, status, activated_by, activated_at)
         VALUES (?, ?, 'active', ?, NOW())
         ON DUPLICATE KEY UPDATE status = 'active', activated_by = VALUES(activated_by), activated_at = COALESCE(activated_at, VALUES(activated_at))`,
        [student.id, app.applicant_user_id, req && req.user ? req.user.id : null], conn,
      );
      await query("UPDATE users SET account_stage='student' WHERE id=?", [app.applicant_user_id], conn);
      await query(`UPDATE applications SET integration_status = 'success', student_record_id = ? WHERE id = ?`, [student.id, applicationId], conn);
      await log('success', 'Data induk dibuat/ditautkan; akun siswa yang sama diaktifkan tanpa mengubah role dan tanpa membuat akun ganda.', student.id);
      return { status: 'success', student_record_id: student.id, account_activated: true };
    });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    await query(`UPDATE applications SET integration_status = 'failed' WHERE id = ?`, [applicationId]);
    await query('INSERT INTO integration_logs (application_id, idempotency_key, status, message, operator_id) VALUES (?,?,?,?,?)',
      [applicationId, idempotencyKey, 'failed', 'Kesalahan teknis saat integrasi.', req && req.user ? req.user.id : null]);
    throw err;
  }
}

module.exports = { processIntegration };
