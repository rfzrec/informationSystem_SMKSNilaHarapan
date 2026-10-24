const { query, one, withTransaction } = require('../config/db');
const { HttpError } = require('../utils/http');
const { audit } = require('../utils/audit');
const { notify } = require('../utils/notify');

const STATUS_LABEL = { accepted: 'Diterima', rejected: 'Tidak Diterima', waitlist: 'Daftar Tunggu' };

async function publishApproval(req, approvalId, conn) {
  const approval = await one('SELECT * FROM selection_approvals WHERE id = ? FOR UPDATE', [approvalId], conn);
  if (!approval || approval.status !== 'approved') throw new HttpError(409, 'Hanya hasil yang sudah disetujui yang dapat dipublikasikan.', 'NOT_APPROVED');
  const results = await query(
    `SELECT r.application_id, r.proposed_status, ap.user_id FROM selection_results r
     JOIN applications a ON a.id = r.application_id JOIN applicants ap ON ap.id = a.applicant_id WHERE r.approval_id = ?`,
    [approvalId], conn,
  );
  for (const r of results) {
    await query('UPDATE selection_results SET is_official = 1 WHERE application_id = ?', [r.application_id], conn);
    const accepted = r.proposed_status === 'accepted';
    await query(
      `UPDATE applications SET selection_status = ?, re_registration_status = ? WHERE id = ?`,
      [r.proposed_status, accepted ? 'awaiting_confirmation' : 'not_open', r.application_id], conn,
    );
    const msg = `Status seleksi Anda: ${STATUS_LABEL[r.proposed_status]}.${accepted ? ' Silakan lanjutkan daftar ulang melalui portal.' : ''}`;
    await notify(r.user_id, 'selection_published', 'Hasil seleksi telah diumumkan', msg, '/dashboard/hasil', conn, { email: true });
    if (accepted) {
      await notify(r.user_id, 're_registration_open', 'Daftar ulang dibuka', 'Silakan konfirmasi kesediaan dan lengkapi daftar ulang.', '/dashboard/daftar-ulang', conn);
    }
  }
  await query(`UPDATE selection_approvals SET status = 'published', published_at = NOW() WHERE id = ?`, [approvalId], conn);
  await audit(req, 'selection.publish', 'selection_approval', approvalId, { result_count: results.length }, conn);
  return results.length;
}

// Dipanggil oleh job terjadwal: publikasikan hasil yang disetujui dan sudah melewati waktu publikasi.
async function publishDue() {
  const due = await query(`SELECT id FROM selection_approvals WHERE status = 'approved' AND publish_at IS NOT NULL AND publish_at <= NOW()`);
  for (const d of due) {
    await withTransaction((conn) => publishApproval(null, d.id, conn));
  }
  return due.length;
}

module.exports = { publishApproval, publishDue, STATUS_LABEL };
