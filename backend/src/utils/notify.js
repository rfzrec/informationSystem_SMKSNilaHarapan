const { query } = require('../config/db');
const env = require('../config/env');

// opts.email = true: email ikut diantrekan (diproses scheduler) bila Resend terkonfigurasi.
async function notify(userId, type, title, message, link, conn, opts = {}) {
  const emailStatus = !opts.email ? 'skipped' : env.emailProvider ? 'queued' : 'not_configured';
  await query(
    'INSERT INTO notifications (user_id, type, title, message, link, email_status) VALUES (?,?,?,?,?,?)',
    [userId, type, title, message, link || null, emailStatus],
    conn,
  );
}

async function notifyApplicationOwner(applicationId, type, title, message, link, conn, opts) {
  const rows = await query(
    `SELECT ap.user_id FROM applications a JOIN applicants ap ON ap.id = a.applicant_id WHERE a.id = ?`,
    [applicationId], conn,
  );
  if (rows[0]) await notify(rows[0].user_id, type, title, message, link || '/dashboard', conn, opts);
}

module.exports = { notify, notifyApplicationOwner };
