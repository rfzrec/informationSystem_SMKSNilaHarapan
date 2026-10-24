import { api, state } from '../api.js';
import { esc, $, toast, empty, fmtDate } from '../ui.js';
import { dashHead, rerender } from './dashboard.js';

const money = (v) => `Rp${Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })}`;
const dateInput = (name, label, value = '') => `<label>${label}<input name="${name}" type="date" value="${esc(value)}" required></label>`;
const timeInput = (name, label) => `<label>${label}<input name="${name}" type="time" required></label>`;
const actionButton = (label, attrs = '') => `<button class="btn btn-primary btn-sm" ${attrs}>${label}</button>`;
const table = (heads, rows) => rows.length ? `<div class="table-wrap"><table class="data"><thead><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : empty('Belum ada data.');

async function managerPage(el) {
  const [teachersRes, ratesRes, periodsRes, realRes] = await Promise.all([
    api('/payroll/teachers'), api('/payroll/rates'), api('/payroll/periods'), api('/payroll/realizations'),
  ]);
  const teachers = teachersRes.data, rates = ratesRes.data, periods = periodsRes.data, realizations = realRes.data;
  el.innerHTML = `${dashHead('Penggajian Guru', 'Tarif berdasarkan jam mengajar aktual yang telah diverifikasi. Periode dihitung, diperiksa, disetujui Admin, lalu pembayaran dicatat.')}
    <div class="grid g-2 mb">
      <section class="card"><h2>Tarif per jam</h2><form id="rate-form" class="form-grid">
        <label>Guru<select name="teacher_record_id" required><option value="">Pilih guru</option>${teachers.map(t => `<option value="${t.id}">${esc(t.full_name)}${t.employee_number ? ` · ${esc(t.employee_number)}` : ''}</option>`).join('')}</select></label>
        <label>Tarif per jam (Rp)<input name="hourly_rate" type="number" min="0" step="100" required></label>
        ${dateInput('effective_from', 'Berlaku mulai')}
        ${dateInput('effective_to', 'Berlaku sampai (opsional)')}
        <button class="btn btn-primary" type="submit">Simpan tarif</button></form>
        <h3 class="mt">Riwayat tarif</h3>${table(['Guru','Tarif/jam','Berlaku'], rates.map(r => `<tr><td>${esc(r.full_name)}</td><td>${money(r.hourly_rate)}</td><td>${fmtDate(r.effective_from)} – ${fmtDate(r.effective_to)}</td></tr>`))}
      </section>
      <section class="card"><h2>Periode penggajian</h2><form id="period-form" class="form-grid">
        <label>Nama periode<input name="name" placeholder="Honor Oktober 2026" maxlength="100" required></label>
        ${dateInput('starts_on', 'Tanggal mulai')}${dateInput('ends_on', 'Tanggal akhir')}
        <button class="btn btn-primary" type="submit">Buat periode</button></form>
        <p class="subtle">Hitung periode hanya setelah realisasi mengajar terverifikasi dan tarif berlaku sudah dimasukkan.</p>
      </section>
    </div>
    <section class="card mb"><h2>Realisasi mengajar menunggu verifikasi</h2>
      ${table(['Tanggal','Guru','Kelas / mapel','Jam','Status','Tindakan'], realizations.filter(r => r.status === 'pending').map(r => `<tr><td>${fmtDate(r.teaching_date)}</td><td>${esc(r.full_name || state.user.full_name)}</td><td>${esc(r.class_name)} / ${esc(r.subject_name)}</td><td>${esc(r.starts_at)}–${esc(r.ends_at)} (${Number(r.hours)} jam)</td><td>${esc(r.status)}</td><td><div class="row"><button class="btn btn-primary btn-sm" data-realization="${r.id}" data-decision="verified">Verifikasi</button><button class="btn btn-outline btn-sm" data-realization="${r.id}" data-decision="rejected">Tolak</button></div></td></tr>`))}
    </section>
    <section class="card"><h2>Daftar periode</h2>${table(['Periode','Status','Guru','Total honor','Persetujuan','Tindakan'], periods.map(p => `<tr><td><strong>${esc(p.name)}</strong><div class="subtle">${fmtDate(p.starts_on)} – ${fmtDate(p.ends_on)}</div></td><td>${esc(p.status)}</td><td>${Number(p.teacher_count || 0)}</td><td>${money(p.total_amount)}</td><td>${p.admin_approved_at ? `Disetujui ${fmtDate(p.admin_approved_at)}` : p.status === 'pending_approval' ? 'Menunggu review' : '—'}</td><td><div class="row">${p.status === 'draft' ? actionButton('Hitung', `data-calculate="${p.id}"`) : ''}<button class="btn btn-outline btn-sm" data-details="${p.id}">Rincian</button>${p.status === 'pending_approval' ? `<button class="btn btn-primary btn-sm" data-approve="${p.id}">Setujui</button><button class="btn btn-outline btn-sm" data-reject="${p.id}">Kembalikan</button>` : ''}${p.status === 'approved' ? `<button class="btn btn-primary btn-sm" data-pay="${p.id}">Catat dibayar</button>` : ''}</div></td></tr>`))}</section>
    <div id="payroll-details" class="mt"></div>`;
  $('#rate-form', el).onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.currentTarget); const body = Object.fromEntries(f.entries()); if (!body.effective_to) body.effective_to = null;
    try { await api('/payroll/rates', { method: 'POST', body }); toast('Tarif disimpan.'); rerender(); } catch (err) { toast(err.message, 'error'); }
  };
  $('#period-form', el).onsubmit = async (e) => {
    e.preventDefault(); const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    try { await api('/payroll/periods', { method: 'POST', body }); toast('Periode dibuat.'); rerender(); } catch (err) { toast(err.message, 'error'); }
  };
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-realization],[data-calculate],[data-details],[data-pay],[data-approve],[data-reject]'); if (!b) return;
    try {
      if (b.dataset.realization) {
        const note = b.dataset.decision === 'rejected' ? prompt('Alasan penolakan wajib diisi:') : '';
        if (b.dataset.decision === 'rejected' && !note) return;
        await api(`/payroll/realizations/${b.dataset.realization}/verify`, { method: 'POST', body: { status: b.dataset.decision, note } });
        toast('Status realisasi diperbarui.'); rerender();
      } else if (b.dataset.calculate) {
        if (!confirm('Hitung honor dari semua realisasi terverifikasi pada periode ini?')) return;
        const r = await api(`/payroll/periods/${b.dataset.calculate}/calculate`, { method: 'POST', body: {} }); toast(r.message); rerender();
      } else if (b.dataset.details) {
        const d = (await api(`/payroll/periods/${b.dataset.details}/details`)).data;
        $('#payroll-details', el).innerHTML = `<section class="card"><h2>Rincian honor</h2>${table(['Guru','Jam aktual','Tarif efektif rata-rata','Total'], d.map(x => `<tr><td>${esc(x.full_name)}</td><td>${Number(x.actual_hours).toLocaleString('id-ID')}</td><td>${money(x.hourly_rate_snapshot)}</td><td>${money(x.gross_amount)}</td></tr>`))}</section>`;
      } else if (b.dataset.approve || b.dataset.reject) {
        const decision = b.dataset.approve ? 'approve' : 'reject';
        const note = decision === 'reject' ? prompt('Alasan pengembalian wajib diisi:') : '';
        if (decision === 'reject' && !note) return;
        const r = await api(`/payroll/periods/${b.dataset.approve || b.dataset.reject}/approve`, { method: 'POST', body: { decision, note } }); toast(r.message); rerender();
      } else if (b.dataset.pay) {
        const payment_reference = prompt('Nomor referensi pembayaran (opsional):') || '';
        const payment_notes = prompt('Catatan pembayaran (opsional):') || '';
        if (!confirm('Tandai periode ini sebagai sudah dibayar?')) return;
        const r = await api(`/payroll/periods/${b.dataset.pay}/pay`, { method: 'POST', body: { payment_reference, payment_notes } }); toast(r.message); rerender();
      }
    } catch (err) { toast(err.message, 'error'); }
  });
}

async function teacherPage(el) {
  const [assignments, realizations, slips] = await Promise.all([
    api('/payroll/assignments/me'), api('/payroll/realizations'), api('/payroll/me/payslips'),
  ]);
  el.innerHTML = `${dashHead('Realisasi Mengajar & Slip Honor', 'Catat jam mengajar yang benar-benar dilaksanakan. Jam terjadwal tidak otomatis dihitung sebagai honor.')}
    <section class="card mb"><h2>Kirim realisasi mengajar</h2><form id="realization-form" class="form-grid">
      <label>Penugasan mengajar<select name="teaching_assignment_id" required><option value="">Pilih kelas dan mata pelajaran</option>${assignments.data.map(a => `<option value="${a.id}">${esc(a.class_name)} · ${esc(a.subject_name)}</option>`).join('')}</select></label>
      ${dateInput('teaching_date', 'Tanggal mengajar')}${timeInput('starts_at', 'Mulai')}${timeInput('ends_at', 'Selesai')}
      <label>Catatan (opsional)<input name="notes" maxlength="500"></label><button class="btn btn-primary" type="submit">Kirim untuk verifikasi</button></form></section>
    <section class="card mb"><h2>Realisasi saya</h2>${table(['Tanggal','Jam','Durasi','Status','Catatan'], realizations.data.map(r => `<tr><td>${fmtDate(r.teaching_date)}</td><td>${esc(r.starts_at)}–${esc(r.ends_at)}</td><td>${Number(r.hours)} jam</td><td>${esc(r.status)}</td><td>${esc(r.verification_note || r.notes || '—')}</td></tr>`))}</section>
    <section class="card"><h2>Slip honor yang sudah dibayar</h2>${table(['Periode','Jam aktual','Tarif efektif rata-rata','Total','Tanggal bayar','Slip'], slips.data.map(s => `<tr><td>${esc(s.name)}</td><td>${Number(s.actual_hours)}</td><td>${money(s.hourly_rate_snapshot)}</td><td>${money(s.gross_amount)}</td><td>${fmtDate(s.paid_at)}</td><td><button class="btn btn-outline btn-sm" data-slip="${s.period_id}">Cetak / Simpan PDF</button></td></tr>`))}</section>`;
  $('#realization-form', el).onsubmit = async (e) => {
    e.preventDefault(); const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    try { const r = await api('/payroll/realizations', { method: 'POST', body }); toast(`Realisasi dikirim (${r.data.hours} jam).`); rerender(); } catch (err) { toast(err.message, 'error'); }
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-slip]'); if (!b) return;
    const s = slips.data.find(x => Number(x.period_id) === Number(b.dataset.slip)); if (!s) return;
    const w = window.open('', '_blank'); if (!w) { toast('Izinkan pop-up untuk mencetak slip.', 'error'); return; }
    w.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Slip Honor</title><style>body{font:14px Arial,sans-serif;max-width:700px;margin:40px auto;color:#111}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:20px}td{padding:10px;border:1px solid #ccc}strong{font-size:18px}@media print{button{display:none}}</style></head><body><h1>SMKS Nila Harapan TIK Sunggal</h1><h2>Slip Honor Guru</h2><p>Nama: ${esc(state.user.full_name)}</p><p>Periode: ${esc(s.name)} (${fmtDate(s.starts_on)} – ${fmtDate(s.ends_on)})</p><table><tr><td>Jam mengajar terverifikasi</td><td>${Number(s.actual_hours)} jam</td></tr><tr><td>Tarif efektif rata-rata</td><td>${money(s.hourly_rate_snapshot)}</td></tr><tr><td><strong>Total honor dibayar</strong></td><td><strong>${money(s.gross_amount)}</strong></td></tr><tr><td>Tanggal pembayaran</td><td>${fmtDate(s.paid_at)}</td></tr><tr><td>Referensi</td><td>${esc(s.payment_reference || '—')}</td></tr></table><p>Dokumen ini dapat dicetak atau disimpan sebagai PDF melalui dialog cetak browser.</p><button onclick="window.print()">Cetak / Simpan PDF</button></body></html>`);
    w.document.close();
  });
}

export async function page(el) {
  const perms = state.user?.permissions || [];
  if (perms.includes('honor.manage')) return managerPage(el);
  if (perms.includes('honor.self')) return teacherPage(el);
  el.innerHTML = empty('Anda tidak memiliki izin untuk membuka modul honor.');
}
