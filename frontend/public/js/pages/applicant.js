import { api, state } from '../api.js';
import { esc, icon, icons, $, $$, badge, label, fmtDate, fmtDateTime, empty, stat, formFields, readForm, showErrors, clearErrors, withLoading, toast, confirmDialog, STAGE_LABEL } from '../ui.js';
import { dashHead, rerender, notifList } from './dashboard.js';

const me = async () => (await api('/admissions/me')).data;
const editable = (d) => !d.application || ['draft', 'needs_revision'].includes(d.application.submission_status);
const docOf = (d, reqId) => d.documents.find((x) => x.requirement_id === reqId);

export async function overview(el) {
  const [d, dash] = await Promise.all([me(), api('/dashboard').then((r) => r.data)]);
  const a = d.application;
  el.innerHTML = `${dashHead(`Halo, ${d.applicant.full_name}`, d.period ? `${esc(d.period.name)} · T.A. ${esc(d.period.academic_year)}` : 'Belum ada periode penerimaan aktif.', `<a class="btn btn-primary" href="/dashboard/formulir" data-testid="overview-form-btn">${icon('file-pen')} ${a && a.submission_status !== 'draft' ? 'Lihat Formulir' : 'Lanjutkan Formulir'}</a>`)}
    ${a && a.submission_status === 'needs_revision' ? `<div class="notice warn mb" data-testid="revision-notice">${icon('alert-triangle')}<div><strong>Pengajuan perlu diperbaiki.</strong> ${esc(a.revision_notes || 'Periksa catatan pada dokumen.')}</div></div>` : ''}
    <div class="grid g-4 mb">${stat('hash', 'No. Pendaftaran', a?.registration_number || 'Belum ada', 'applicant-reg-number')}${stat('git-branch', 'Jalur', d.paths.find((p) => p.id === a?.path_id)?.name || 'Belum dipilih', 'applicant-path')}
      ${stat('percent', 'Kelengkapan', `${d.completeness.percent}%`, 'applicant-completeness')}${stat('bell', 'Notifikasi baru', dash.notifications.filter((n) => !n.is_read).length, 'applicant-unread')}</div>
    <div class="card mb"><div class="row between"><strong>Kelengkapan formulir</strong><span class="mono">${d.completeness.percent}%</span></div><div class="progress mt"><span style="width:${d.completeness.percent}%"></span></div></div>
    <div class="grid g-2"><div class="card" data-testid="applicant-status-card"><h3>Status</h3><dl class="kv">
      <dt>Pengajuan</dt><dd>${badge('submission', a?.submission_status || 'draft', 'status-submission')}</dd>
      <dt>Dokumen</dt><dd>${d.documents.length ? d.documents.map((x) => `${badge('doc', x.status)}`).join(' ') : badge('doc', 'not_uploaded')}</dd>
      <dt>Seleksi</dt><dd>${badge('selection', a?.selection_status || 'not_processed', 'status-selection')}</dd>
      <dt>Daftar ulang</dt><dd>${badge('rereg', a?.re_registration_status || 'not_open', 'status-rereg')}</dd></dl>
      <p class="subtle mt">Lengkap administratif bukan berarti diterima. Hasil resmi tampil setelah dipublikasikan sekolah.</p></div>
    <div class="card"><h3>Jadwal tahapan</h3>${d.stages.length ? `<ol class="timeline">${d.stages.map((s) => `<li><strong>${STAGE_LABEL[s.stage_type]}</strong><div class="subtle">${fmtDateTime(s.start_at)} — ${fmtDateTime(s.end_at)}</div></li>`).join('')}</ol>` : empty('Belum ada jadwal.')}</div>
    <div class="card"><h3>Notifikasi terbaru</h3>${notifList(dash.notifications)}</div>
    <div class="card"><h3>Riwayat aktivitas</h3>${d.history.length ? `<ol class="timeline" data-testid="applicant-history">${d.history.map((h) => `<li><strong>${esc(h.target === 'document' ? 'Dokumen' : h.target === 're_registration' ? 'Daftar ulang' : 'Pengajuan')}: ${esc(h.new_status)}</strong><div class="muted">${esc(h.notes || '')}</div><div class="subtle">${fmtDateTime(h.created_at)}</div></li>`).join('')}</ol>` : empty('Belum ada aktivitas.')}</div></div>`;
}

const STEPS = [['profil', 'Data Diri', 'user'], ['orang_tua', 'Orang Tua/Wali', 'users'], ['pendidikan', 'Pendidikan Asal', 'graduation-cap'], ['jalur', 'Jalur & Program', 'git-branch'], ['dokumen', 'Dokumen', 'upload'], ['pratinjau', 'Pratinjau & Kirim', 'send']];

export async function form(el) {
  const d = await me();
  const step = new URLSearchParams(location.search).get('langkah') || 'profil';
  const lock = !editable(d);
  const done = (k) => !d.completeness.missing.some((m) => m.startsWith(k));
  el.innerHTML = `${dashHead('Formulir Pendaftaran', lock ? 'Pengajuan telah dikirim. Data hanya dapat diubah bila Admin Sekolah meminta perbaikan.' : 'Setiap bagian tersimpan sebagai draf. Kirim pengajuan setelah semua bagian lengkap.')}
    ${!d.registration_open && !d.application ? `<div class="notice warn mb" data-testid="registration-closed-notice">${icon('lock')}<span>Pendaftaran belum dibuka atau sudah ditutup. Anda belum dapat membuat pengajuan baru.</span></div>` : ''}
    <div class="tabs" role="tablist">${STEPS.map(([k, l, ic]) => `<button role="tab" class="${k === step ? 'active' : ''}" data-step="${k}" data-testid="form-step-${k}">${icon(done(k) && k !== 'pratinjau' ? 'check-circle' : ic)} ${l}</button>`).join('')}</div>
    <div class="card" id="step-body"></div>`;
  $$('[data-step]', el).forEach((b) => { b.onclick = () => { history.replaceState({}, '', `/dashboard/formulir?langkah=${b.dataset.step}`); form(el).then(icons); }; });
  const body = $('#step-body', el);
  ({ profil: stepProfile, orang_tua: stepGuardians, pendidikan: stepEducation, jalur: stepChoice, dokumen: stepDocuments, pratinjau: stepPreview })[step](body, d, lock, el);
  icons();
}

function simpleStep(body, { fields, values, path, wrapBody = (v) => v, lock, el, next }) {
  body.innerHTML = `<form novalidate data-testid="step-form">${formFields(fields, values)}${lock ? '' : `<div class="form-actions"><button class="btn btn-primary" type="submit" data-testid="step-save-btn">${icon('save')} Simpan Draf</button></div>`}</form>`;
  const f = body.querySelector('form');
  if (lock) $$('input,select,textarea', f).forEach((i) => { i.disabled = true; });
  f.onsubmit = (e) => {
    e.preventDefault();
    withLoading(f.querySelector('[type=submit]'), async () => {
      try { clearErrors(f); const r = await api(path, { method: 'PUT', body: wrapBody(readForm(f, fields)) }); toast(r.message); history.replaceState({}, '', `/dashboard/formulir?langkah=${next}`); await form(el); } catch (err) { showErrors(f, err); }
    });
  };
}

function stepProfile(body, d, lock, el) {
  simpleStep(body, { lock, el, next: 'orang_tua', path: '/admissions/me/profile', values: d.applicant, fields: [
    { name: 'full_name', label: 'Nama lengkap', required: true }, { name: 'nik', label: 'NIK (16 digit)', required: true },
    { name: 'nisn', label: 'NISN (10 digit)' }, { name: 'gender', label: 'Jenis kelamin', type: 'select', required: true, options: [{ value: 'L', label: 'Laki-laki' }, { value: 'P', label: 'Perempuan' }] },
    { name: 'birth_place', label: 'Tempat lahir' }, { name: 'birth_date', label: 'Tanggal lahir', type: 'date', required: true },
    { name: 'religion', label: 'Agama' }, { name: 'phone', label: 'Nomor telepon' }, { name: 'address', label: 'Alamat lengkap', type: 'textarea', required: true, rows: 3 }] });
}

function stepGuardians(body, d, lock, el) {
  const rels = [['ayah', 'Ayah'], ['ibu', 'Ibu'], ['wali', 'Wali']];
  const fields = rels.flatMap(([r, l]) => [{ name: `${r}_full_name`, label: `Nama ${l}` }, { name: `${r}_occupation`, label: `Pekerjaan ${l}` }, { name: `${r}_phone`, label: `Telepon ${l}` }, { name: `${r}_address`, label: `Alamat ${l}`, full: true }]);
  const values = Object.fromEntries(d.guardians.flatMap((g) => ['full_name', 'occupation', 'phone', 'address'].map((k) => [`${g.relation}_${k}`, g[k]])));
  simpleStep(body, { lock, el, next: 'pendidikan', path: '/admissions/me/guardians', values, fields,
    wrapBody: (v) => ({ guardians: rels.map(([r]) => ({ relation: r, full_name: v[`${r}_full_name`], occupation: v[`${r}_occupation`], phone: v[`${r}_phone`], address: v[`${r}_address`] })) }) });
  body.insertAdjacentHTML('afterbegin', '<p class="muted">Isi minimal satu orang tua/wali. Data ini hanya menjadi bagian dari formulir PPDB; orang tua/wali tidak memiliki akun portal terpisah.</p>');
}

function stepEducation(body, d, lock, el) {
  simpleStep(body, { lock, el, next: 'jalur', path: '/admissions/me/education', values: d.education || {}, fields: [
    { name: 'school_name', label: 'Nama sekolah asal', required: true }, { name: 'npsn', label: 'NPSN sekolah asal (8 digit)' },
    { name: 'graduation_year', label: 'Tahun lulus', type: 'number', min: 2000, max: 2100 }, { name: 'school_address', label: 'Alamat sekolah asal', type: 'textarea', rows: 3 }] });
}

function stepChoice(body, d, lock, el) {
  const a = d.application;
  const fields = [{ name: 'path_id', label: 'Jalur pendaftaran', type: 'select', required: true, full: true, options: d.paths.map((p) => ({ value: p.id, label: p.name })) }];
  if (d.programs.length) [1, 2, 3].forEach((i) => fields.push({ name: `program_${i}`, label: `Pilihan program keahlian ${i}`, type: 'select', required: i === 1, options: d.programs.map((p) => ({ value: p.id, label: p.title })) }));
  const values = { path_id: a?.path_id, ...Object.fromEntries(d.preferences.map((p) => [`program_${p.preference_rank}`, p.program_id])) };
  if (!d.paths.length) { body.innerHTML = empty('Belum ada jalur pendaftaran aktif.'); return; }
  simpleStep(body, { lock, el, next: 'dokumen', path: '/admissions/me/choice', values, fields,
    wrapBody: (v) => ({ path_id: v.path_id, program_ids: [1, 2, 3].map((i) => v[`program_${i}`]).filter(Boolean) }) });
  body.insertAdjacentHTML('beforeend', `${d.paths.map((p) => `<div class="subtle mt"><strong>${esc(p.name)}:</strong> ${esc(p.description || '')}</div>`).join('')}${d.programs.length ? '' : '<p class="subtle mt">Daftar program keahlian belum diterbitkan sekolah; pilihan program dapat dilengkapi kemudian.</p>'}`);
}

export function docRows(d, reqs, canUpload, stage) {
  if (!reqs.length) return empty('Belum ada persyaratan dokumen untuk tahap ini.');
  return `<div class="table-wrap"><table class="data" data-testid="documents-table-${stage}"><thead><tr><th>Dokumen</th><th>Status</th><th>Berkas</th><th>Aksi</th></tr></thead><tbody>${reqs.map((r) => {
    const x = docOf(d, r.id);
    return `<tr><td><strong>${esc(r.name)}</strong> ${r.is_required ? '<span class="badge b-warn">Wajib</span>' : '<span class="badge b-neutral">Opsional</span>'}<div class="subtle">${esc(r.allowed_types.toUpperCase())} · maks ${r.max_size_kb} KB</div>${x?.notes ? `<div class="form-error" style="margin:6px 0 0">${esc(x.notes)}</div>` : ''}</td>
      <td>${badge('doc', x?.status || 'not_uploaded', `doc-status-${r.id}`)}</td><td>${x?.version_id ? `<a href="/api/admissions/applications/documents/${x.version_id}/download" target="_blank" rel="noopener">${esc(x.original_name)}</a><div class="subtle">Versi ${x.version_no}</div>` : '—'}</td>
      <td>${canUpload && x?.status !== 'verified' ? `<label class="btn btn-outline btn-sm">${icon('upload')} ${x?.version_id ? 'Ganti' : 'Unggah'}<input type="file" hidden data-upload="${r.id}" accept="${r.allowed_types.split(',').map((t) => (t === 'pdf' ? 'application/pdf' : `image/${t === 'jpg' ? 'jpeg' : t}`)).join(',')}" data-testid="doc-upload-input-${r.id}"></label>` : ''}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

export function bindUploads(root, onDone) {
  $$('[data-upload]', root).forEach((inp) => {
    inp.onchange = async () => {
      const lbl = inp.closest('label');
      const fd = new FormData(); fd.append('file', inp.files[0]);
      lbl.classList.add('loading');
      try { const r = await api(`/admissions/me/documents/${inp.dataset.upload}`, { method: 'POST', form: fd }); toast(r.message); await onDone(); } catch (e) { toast(e.message, 'error'); lbl.classList.remove('loading'); }
    };
  });
}

function stepDocuments(body, d, lock, el) {
  if (!d.application?.path_id) { body.innerHTML = empty('Pilih jalur pendaftaran terlebih dahulu untuk melihat dokumen yang diperlukan.', 'git-branch'); return; }
  body.innerHTML = `<p class="muted">Berkas disimpan secara privat dan hanya dapat diakses oleh Anda dan petugas berwenang.</p>${docRows(d, d.requirements, !lock, 'application')}`;
  bindUploads(body, () => form(el));
}

function stepPreview(body, d, lock, el) {
  const a = d.application; const ap = d.applicant;
  const g = d.guardians.filter((x) => x.full_name);
  body.innerHTML = `<div data-testid="form-preview"><h3>Pratinjau formulir</h3><dl class="kv"><dt>Nama</dt><dd>${esc(ap.full_name)}</dd><dt>NIK</dt><dd class="mono">${esc(ap.nik || '—')}</dd><dt>NISN</dt><dd class="mono">${esc(ap.nisn || '—')}</dd>
    <dt>Jenis kelamin</dt><dd>${ap.gender === 'L' ? 'Laki-laki' : ap.gender === 'P' ? 'Perempuan' : '—'}</dd><dt>Tempat, tgl lahir</dt><dd>${esc(ap.birth_place || '—')}, ${fmtDate(ap.birth_date)}</dd><dt>Alamat</dt><dd>${esc(ap.address || '—')}</dd>
    <dt>Orang tua/wali</dt><dd>${g.length ? g.map((x) => `${esc(x.relation)}: ${esc(x.full_name)}`).join('<br>') : '—'}</dd><dt>Sekolah asal</dt><dd>${esc(d.education?.school_name || '—')}</dd>
    <dt>Jalur</dt><dd>${esc(d.paths.find((p) => p.id === a?.path_id)?.name || '—')}</dd><dt>Dokumen</dt><dd>${d.requirements.map((r) => `${esc(r.name)}: ${label('doc', docOf(d, r.id)?.status || 'not_uploaded')}`).join('<br>') || '—'}</dd></dl>
    ${d.completeness.missing.length ? `<div class="notice warn mt" data-testid="form-missing-notice">${icon('alert-triangle')}<span>Belum lengkap: ${esc(d.completeness.missing.join(', '))}</span></div>` : ''}
    <div class="form-actions">${lock ? `<a class="btn btn-outline" href="/dashboard/bukti">${icon('printer')} Bukti Pendaftaran</a>` : `<button class="btn btn-primary" id="submit-app" data-testid="submit-application-btn" ${d.completeness.percent < 100 ? 'disabled' : ''}>${icon('send')} ${a?.submission_status === 'needs_revision' ? 'Kirim Ulang Pengajuan' : 'Kirim Pengajuan'}</button>`}</div></div>`;
  const b = $('#submit-app', body);
  if (b) b.onclick = async () => {
    const ok = await confirmDialog({ title: 'Kirim pengajuan?', message: 'Setelah dikirim, data tidak dapat diubah kecuali Admin Sekolah meminta perbaikan. Pastikan data sudah benar.', confirmText: 'Kirim Pengajuan' });
    if (!ok) return;
    withLoading(b, async () => { try { const r = await api('/admissions/me/submit', { method: 'POST' }); toast(`${r.message} No. ${r.registration_number}`); history.replaceState({}, '', '/dashboard/bukti'); rerender(); } catch (e) { toast(e.message, 'error'); } });
  };
}

export async function proof(el) {
  let p;
  try { p = (await api('/admissions/me/proof')).data; } catch (e) { if (e.status === 404) { el.innerHTML = `${dashHead('Bukti Pendaftaran')}${empty(e.message, 'file-x')}`; return; } throw e; }
  el.innerHTML = `${dashHead('Bukti Pendaftaran', 'Cetak atau simpan sebagai PDF melalui dialog cetak browser.', `<button class="btn btn-primary" id="print" data-testid="proof-print-btn">${icon('printer')} Cetak / Simpan PDF</button>`)}
    <div class="proof" data-testid="registration-proof"><div class="proof-head"><div><div class="brand-title" style="color:var(--g800)">SMKS Nila Harapan TIK Sunggal</div><div class="subtle">Yayasan Perguruan Nila Harapan<br>Jl. Binjai Km 11,2, Mulyorejo, Sunggal, Deli Serdang, Sumatera Utara</div></div><div style="text-align:right"><div class="caption">Bukti Pendaftaran PPDB</div><div class="mono" style="font-size:1.3rem;font-weight:600" data-testid="proof-reg-number">${esc(p.registration_number)}</div></div></div>
    <dl class="kv"><dt>Nama calon peserta didik</dt><dd>${esc(p.full_name)}</dd><dt>NISN</dt><dd class="mono">${esc(p.nisn || '—')}</dd><dt>Periode penerimaan</dt><dd>${esc(p.period_name)} (T.A. ${esc(p.academic_year)})</dd><dt>Jalur pendaftaran</dt><dd>${esc(p.path_name || '—')}</dd>
    <dt>Tanggal pengajuan</dt><dd>${fmtDateTime(p.submitted_at)}</dd><dt>Status pengajuan</dt><dd>${badge('submission', p.submission_status)}</dd></dl>
    <div class="notice warn mt">${icon('info')}<span><strong>Bukti ini bukan jaminan diterima.</strong> Hasil seleksi resmi diumumkan melalui akun pendaftar setelah dipublikasikan sekolah.</span></div><p class="subtle mt">Dicetak ${fmtDateTime(new Date().toISOString().replace('T', ' '))}</p></div>`;
  $('#print').onclick = () => window.print();
}

export async function result(el) {
  const d = await me();
  const a = d.application;
  el.innerHTML = `${dashHead('Hasil Seleksi', 'Hanya hasil resmi yang telah dipublikasikan yang ditampilkan di sini.')}
    <div class="card" data-testid="selection-result-card">${d.result ? `<div class="caption">Hasil resmi</div><div class="mt">${badge('selection', d.result.status, 'official-result-badge')}</div>${d.result.notes ? `<p class="mt">${esc(d.result.notes)}</p>` : ''}
      ${d.result.status === 'accepted' ? `<a class="btn btn-primary mt" href="/dashboard/daftar-ulang">${icon('clipboard-check')} Lanjut ke Daftar Ulang</a>` : ''}`
    : `${badge('selection', a?.selection_status || 'not_processed', 'selection-status-badge')}<p class="muted mt">Hasil seleksi belum dipublikasikan.</p>`}</div>`;
}

export async function reRegistration(el) {
  const d = await me();
  const a = d.application;
  const st = a?.re_registration_status || 'not_open';
  const canUpload = ['in_process', 'needs_revision'].includes(st);
  el.innerHTML = `${dashHead('Daftar Ulang', 'Status daftar ulang terpisah dari hasil seleksi.')}<div class="card mb"><strong>Status:</strong> ${badge('rereg', st, 'rereg-status-badge')}</div>
    ${st === 'not_open' ? empty('Daftar ulang dibuka untuk peserta yang dinyatakan diterima secara resmi.', 'lock') : ''}
    ${st === 'awaiting_confirmation' ? `<div class="card"><h3>Konfirmasi kesediaan</h3><p class="muted">Apakah Anda bersedia melanjutkan sebagai peserta didik baru?</p><div class="row"><button class="btn btn-primary" data-willing="1" data-testid="rereg-confirm-yes-btn">${icon('check')} Bersedia</button><button class="btn btn-danger" data-willing="0" data-testid="rereg-confirm-no-btn">Tidak melanjutkan</button></div></div>` : ''}
    ${['in_process', 'needs_revision', 'awaiting_verification', 'completed'].includes(st) ? `<div class="card"><h3>Dokumen daftar ulang</h3>${docRows(d, d.re_requirements, canUpload, 're_registration')}
      ${canUpload ? `<div class="form-actions"><button class="btn btn-primary" id="rr-submit" data-testid="rereg-submit-btn">${icon('send')} Kirim Daftar Ulang</button></div>` : ''}</div>` : ''}`;
  $$('[data-willing]', el).forEach((b) => { b.onclick = async () => {
    const yes = b.dataset.willing === '1';
    if (!(await confirmDialog({ title: yes ? 'Konfirmasi bersedia' : 'Tidak melanjutkan?', message: yes ? 'Anda akan melanjutkan proses daftar ulang.' : 'Pernyataan ini akan mengakhiri proses daftar ulang Anda.', danger: !yes }))) return;
    withLoading(b, async () => { try { toast((await api('/admissions/me/re-registration/confirm', { method: 'POST', body: { willing: yes } })).message); rerender(); } catch (e) { toast(e.message, 'error'); } });
  }; });
  bindUploads(el, () => reRegistration(el).then(icons));
  const s = $('#rr-submit', el);
  if (s) s.onclick = () => withLoading(s, async () => { try { toast((await api('/admissions/me/re-registration/submit', { method: 'POST' })).message); rerender(); } catch (e) { toast(e.message, 'error'); } });
}
