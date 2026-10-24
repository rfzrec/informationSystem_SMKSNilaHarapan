const { Resend } = require('resend');
const { query } = require('../config/db');
const env = require('../config/env');

const MAX_ATTEMPTS = 3;
const BATCH = 20;
const resend = env.email.apiKey ? new Resend(env.email.apiKey) : null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SUBJECTS = {
  document_revision: 'Dokumen PPDB Anda perlu diperbaiki',
  application_revision: 'Pengajuan PPDB Anda perlu diperbaiki',
  selection_published: 'Hasil seleksi PPDB telah diumumkan',
};

function buildEmail(n) {
  const url = `${env.appBaseUrl.replace(/\/$/, '')}${n.link || '/dashboard'}`;
  const subject = `${SUBJECTS[n.type] || n.title} — SMKS Nila Harapan TIK Sunggal`;
  const text = `Yth. ${n.full_name},\n\n${n.title}\n${n.message}\n\nSilakan masuk ke portal untuk detail dan tindak lanjut:\n${url}\n\nAdministrasi SMKS Nila Harapan TIK Sunggal\nEmail ini dikirim otomatis, mohon tidak membalas.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2a24">
  <div style="background:#0D5C3A;color:#fff;padding:18px 24px;font-weight:bold;font-size:16px">SMKS Nila Harapan TIK Sunggal · PPDB Online</div>
  <div style="padding:24px;border:1px solid #e3e8e5;border-top:0">
    <p>Yth. ${esc(n.full_name)},</p>
    <h2 style="font-size:18px;color:#0D5C3A;margin:16px 0 8px">${esc(n.title)}</h2>
    <p style="background:#f4f7f5;padding:12px 16px;border-left:3px solid #0D5C3A">${esc(n.message)}</p>
    <p><a href="${esc(url)}" style="display:inline-block;background:#0D5C3A;color:#fff;padding:10px 18px;text-decoration:none;border-radius:4px">Buka Portal PPDB</a></p>
    <p style="font-size:12px;color:#6b7a72;margin-top:24px">Email ini dikirim otomatis oleh sistem PPDB, mohon tidak membalas.</p>
  </div></div>`;
  return { subject, text, html };
}

async function sendOne(n) {
  const { subject, text, html } = buildEmail(n);
  const to = env.email.redirectTo || n.email;
  const { data, error } = await resend.emails.send(
    { from: env.email.from, to, subject, text, html },
    { idempotencyKey: `notif-${n.id}` },
  );
  if (error) throw new Error(`${error.name || 'error'}: ${error.message || 'ditolak penyedia email'}`);
  return data.id;
}

// Memproses antrean email notifikasi; dipanggil berkala oleh scheduler.
async function processEmailQueue() {
  if (!resend) return 0;
  const rows = await query(
    `SELECT n.id, n.type, n.title, n.message, n.link, n.email_attempts, u.email, u.full_name
     FROM notifications n JOIN users u ON u.id = n.user_id
     WHERE n.email_status = 'queued' ORDER BY n.id LIMIT ${BATCH}`,
  );
  let sent = 0;
  for (const n of rows) {
    try {
      const id = await sendOne(n);
      await query(`UPDATE notifications SET email_status = 'sent', email_message_id = ?, email_sent_at = NOW(), email_error = NULL, email_attempts = email_attempts + 1 WHERE id = ?`, [id, n.id]);
      sent += 1;
    } catch (err) {
      const attempts = n.email_attempts + 1;
      await query(`UPDATE notifications SET email_status = ?, email_attempts = ?, email_error = ? WHERE id = ?`,
        [attempts >= MAX_ATTEMPTS ? 'failed' : 'queued', attempts, err.message.slice(0, 250), n.id]);
      console.error(`[email] notifikasi #${n.id} gagal (percobaan ${attempts}): ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return sent;
}

module.exports = { processEmailQueue, buildEmail, EMAIL_TYPES: Object.keys(SUBJECTS) };
