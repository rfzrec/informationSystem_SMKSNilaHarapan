const { publishDue } = require('../services/selectionService');
const { processEmailQueue } = require('../services/emailService');

// Publikasi terjadwal hasil seleksi yang sudah disetujui.
function startJobs() {
  const timer = setInterval(() => {
    publishDue()
      .then((n) => { if (n) console.log(`[job] ${n} batch hasil seleksi dipublikasikan sesuai jadwal`); })
      .catch((err) => console.error('[job] publikasi terjadwal gagal:', err.message));
  }, 60 * 1000);
  timer.unref();

  let busy = false;
  const emailTimer = setInterval(() => {
    if (busy) return;
    busy = true;
    processEmailQueue()
      .then((n) => { if (n) console.log(`[job] ${n} email notifikasi terkirim`); })
      .catch((err) => console.error('[job] antrean email gagal:', err.message))
      .finally(() => { busy = false; });
  }, 10 * 1000);
  emailTimer.unref();
}

module.exports = { startJobs };
