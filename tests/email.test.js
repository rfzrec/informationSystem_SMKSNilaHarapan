// Pengujian antrean email notifikasi dengan penyedia Resend tiruan (tidak mengirim email nyata).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.RESEND_API_KEY = 're_test_dummy';
const sent = [];
let failNext = false;
require.cache[require.resolve('resend')] = {
  exports: {
    Resend: class {
      constructor() {
        this.emails = { send: async (payload, opts) => {
          if (failNext) return { data: null, error: { name: 'validation_error', message: 'ditolak' } };
          sent.push({ payload, opts });
          return { data: { id: `msg_${sent.length}` }, error: null };
        } };
      }
    },
  },
};

const env = require('../backend/src/config/env');
if (!env.db.database.endsWith('_test')) throw new Error('Pengujian hanya boleh memakai database berakhiran _test');

let db; let svc; let notify; let userId; let EMAIL;

before(async () => {
  await require('../backend/src/scripts/migrate').migrate();
  db = require('../backend/src/config/db');
  svc = require('../backend/src/services/emailService');
  ({ notify } = require('../backend/src/utils/notify'));
  const { createUserWithRole } = require('../backend/src/services/authService');
  EMAIL = `email_uji_${Date.now()}@uji.test`;
  userId = await db.withTransaction((c) => createUserWithRole(c, { email: EMAIL, password: 'UjiCoba!2026x', fullName: 'Siswa <b>Uji</b>', roleCode: 'admin' }));
});

after(async () => {
  await db.query('DELETE FROM user_roles WHERE user_id = ?', [userId]);
  await db.query('DELETE FROM users WHERE id = ?', [userId]);
  await db.pool.end();
});

test('hanya notifikasi bertanda email yang diantrekan', async () => {
  await notify(userId, 'document_verified', 'Dokumen diverifikasi', 'ok', null, null);
  await notify(userId, 'document_revision', 'Dokumen perlu diperbaiki', 'Ijazah: <buram>', '/dashboard', null, { email: true });
  const rows = await db.query('SELECT type, email_status FROM notifications WHERE user_id = ? ORDER BY id', [userId]);
  assert.deepEqual(rows.map((r) => r.email_status), ['skipped', 'queued']);
});

test('antrean terkirim, isi di-escape, idempotency key per notifikasi', async () => {
  const n = await svc.processEmailQueue();
  assert.equal(n, 1);
  const { payload, opts } = sent[0];
  assert.equal(payload.to, EMAIL);
  assert.match(payload.subject, /perlu diperbaiki/);
  assert.ok(payload.html.includes('&lt;buram&gt;') && !payload.html.includes('<buram>'));
  assert.ok(payload.html.includes('Siswa &lt;b&gt;Uji&lt;/b&gt;'));
  assert.match(opts.idempotencyKey, /^notif-\d+$/);
  const row = await db.one("SELECT email_status, email_message_id FROM notifications WHERE user_id = ? AND type = 'document_revision'", [userId]);
  assert.equal(row.email_status, 'sent');
  assert.equal(row.email_message_id, 'msg_1');
  assert.equal(await svc.processEmailQueue(), 0);
});

test('gagal dicoba ulang lalu ditandai failed setelah 3 percobaan', async () => {
  await notify(userId, 'selection_published', 'Hasil seleksi telah diumumkan', 'Status seleksi Anda: Diterima.', '/dashboard/hasil', null, { email: true });
  failNext = true;
  for (let i = 0; i < 3; i += 1) await svc.processEmailQueue();
  failNext = false;
  const row = await db.one("SELECT email_status, email_attempts, email_error FROM notifications WHERE user_id = ? AND type = 'selection_published'", [userId]);
  assert.equal(row.email_status, 'failed');
  assert.equal(row.email_attempts, 3);
  assert.match(row.email_error, /ditolak/);
});
