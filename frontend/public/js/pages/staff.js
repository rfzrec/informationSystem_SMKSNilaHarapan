import { api, state } from '../api.js';
import { esc, icon, $, $$, badge, options, fmtDateTime, empty, stat, dataTable, formDialog, confirmDialog, withLoading, toast, LABELS } from '../ui.js';
import { dashHead, rerender } from './dashboard.js';

export const can = (p) => state.user.permissions.includes(p);
const periodsOpts = async () => (await api('/admissions/periods')).data.map((p) => ({ value: p.id, label: p.name }));
const sum = (m, keys) => keys.reduce((a, k) => a + (m[k] || 0), 0);
const activityList = (rows) => (rows.length ? `<ol class="timeline">${rows.map((r) => `<li><strong>${esc(r.action)}</strong> <span class="subtle">${esc(r.entity_type || '')} #${esc(r.entity_id || '')}</span><div class="subtle">${esc(r.actor || 'Sistem')} · ${fmtDateTime(r.created_at)}</div></li>`).join('')}</ol>` : empty('Belum ada aktivitas.'));

export async function overview(el) {
  const d = (await api('/dashboard')).data;
  const s = d.submission;
  if (state.user.role === 'admin') {
    el.innerHTML = `${dashHead('Dashboard Operasional Admin', 'Antrean PPDB dan tindak lanjut administrasi yang dikelola Admin Sekolah.', `<a class="btn btn-primary" href="/dashboard/pengajuan">${icon('inbox')} Buka Antrean</a>`)}
      <div class="grid g-3 mb">${stat('briefcase', 'Ditugaskan ke saya', d.assigned_to_me, 'stat-assigned')}${stat('inbox', 'Antrean verifikasi', s.submitted || 0, 'stat-queue')}${stat('alert-triangle', 'Perlu perbaikan', s.needs_revision || 0, 'stat-revision')}
      ${stat('file-clock', 'Dokumen menunggu', d.pending_docs, 'stat-pending-docs')}${stat('check-circle', 'Lengkap administratif', s.complete || 0, 'stat-complete')}${stat('clipboard-check', 'Daftar ulang menunggu verifikasi', d.rereg.awaiting_verification || 0, 'stat-rereg-pending')}</div>
      <div class="card"><h3>Aktivitas operasional terbaru</h3>${activityList(d.activity)}</div>`;
  } else {
    el.innerHTML = `${dashHead('Dashboard Operasional Sekolah', 'Data administratif, laporan, dan integrasi data induk.')}
      <div class="grid g-3 mb">${stat('users', 'Pendaftar (non-draf)', sum(s, ['submitted', 'needs_revision', 'complete']), 'stat-applicants')}${stat('check-circle', 'Pengajuan lengkap', s.complete || 0, 'stat-complete')}
      ${stat('clipboard-check', 'Daftar ulang selesai', d.rereg.completed || 0, 'stat-rereg-done')}${stat('database', 'Siap integrasi', d.integration.ready || 0, 'stat-integration-ready')}
      ${stat('x-circle', 'Integrasi gagal/periksa', sum(d.integration, ['failed', 'needs_review']), 'stat-integration-failed')}${stat('check', 'Integrasi berhasil', d.integration.success || 0, 'stat-integration-success')}</div>
      <div class="grid g-2"><div class="card"><h3>Pintasan</h3><div class="row"><a class="btn btn-outline" href="/dashboard/integrasi">${icon('database')} Integrasi</a><a class="btn btn-outline" href="/dashboard/laporan">${icon('bar-chart-3')} Laporan</a></div></div>
      <div class="card"><h3>Aktivitas terbaru</h3>${activityList(d.activity)}</div></div>`;
  }
}

export async function applications(el, params) {
  if (params.id) return detail(el, params.id);
  const periods = await periodsOpts().catch(() => []);
  el.innerHTML = `${dashHead(state.user.role === 'admin' ? 'Antrean Pengajuan' : 'Data Pendaftar', 'Pencarian, filter, dan pagination diproses di server.')}<div id="tbl"></div>`;
  const t = dataTable({ el: $('#tbl', el), endpoint: '/admissions/applications', testid: 'applications-table', emptyText: 'Tidak ada pengajuan yang sesuai filter.',
    filters: [{ name: 'period_id', label: 'Periode', options: periods }, { name: 'submission_status', label: 'Pengajuan', options: options('submission') },
      { name: 'doc_status', label: 'Dokumen', options: options('doc').filter((o) => o.value !== 'not_uploaded') }, { name: 'selection_status', label: 'Seleksi', options: options('selection') },
      { name: 're_registration_status', label: 'Daftar ulang', options: options('rereg') }],
    columns: [{ label: 'No. Pendaftaran', render: (r) => `<span class="mono">${esc(r.registration_number || '(draf)')}</span>` }, { label: 'Nama', key: 'full_name' }, { label: 'Jalur', key: 'path_name' },
      { label: 'Pengajuan', render: (r) => badge('submission', r.submission_status) }, { label: 'Dok. menunggu', render: (r) => `<span class="mono">${r.pending_docs}</span>` },
      { label: 'Seleksi', render: (r) => badge('selection', r.selection_status) }, { label: 'Daftar ulang', render: (r) => badge('rereg', r.re_registration_status) },
      { label: 'Aksi', render: (r) => `<a class="btn btn-outline btn-sm" href="/dashboard/pengajuan/${r.id}" data-testid="application-open-${r.id}">Detail</a>` }] });
}

async function act(btn, fn) { return withLoading(btn, async () => { try { const r = await fn(); toast(r.message); rerender(); } catch (e) { toast(e.message, 'error'); } }); }

async function detail(el, id) {
  const d = (await api(`/admissions/applications/${id}`)).data;
  const a = d.application; const ap = d.applicant;
  const vDoc = (doc) => (doc.stage === 'application' ? can('applications.verify') && a.submission_status === 'submitted' : can('re_registration.verify') && a.re_registration_status === 'awaiting_verification') && doc.status !== 'not_uploaded';
  el.innerHTML = `${dashHead(ap.full_name, `<span class="mono">${esc(a.registration_number || '(draf)')}</span> · ${esc(d.period.name)} · ${esc(d.path?.name || 'Jalur belum dipilih')}`, `<a class="btn btn-outline" href="/dashboard/pengajuan">${icon('arrow-left')} Kembali</a>`)}
    <div class="card mb row" data-testid="application-statuses">${badge('submission', a.submission_status, 'detail-submission-status')} ${badge('selection', a.selection_status, 'detail-selection-status')} ${badge('rereg', a.re_registration_status, 'detail-rereg-status')} ${badge('integration', a.integration_status, 'detail-integration-status')}
      ${d.result ? `<span class="badge b-info">${esc(LABELS.proposed[d.result.proposed_status][0])}${Number(d.result.is_official) ? ' (resmi)' : ' (sementara)'}</span>` : ''}</div>
    <div class="row mb no-print">
      ${can('applications.verify') && a.submission_status === 'submitted' ? `<button class="btn btn-primary" id="mark-complete" data-testid="mark-complete-btn">${icon('check-circle')} Lengkap Administratif</button><button class="btn btn-danger" id="req-revision" data-testid="request-revision-btn">${icon('alert-triangle')} Minta Perbaikan</button>` : ''}
      ${can('re_registration.verify') && a.re_registration_status === 'awaiting_verification' ? `<button class="btn btn-primary" data-rr="completed" data-testid="rereg-complete-btn">${icon('check')} Daftar Ulang Selesai</button><button class="btn btn-danger" data-rr="needs_revision" data-testid="rereg-revision-btn">Perbaikan Daftar Ulang</button><button class="btn btn-outline" data-rr="withdrawn" data-testid="rereg-withdraw-btn">Tidak Dilanjutkan</button>` : ''}
      ${can('applications.assist_edit') ? `<button class="btn btn-outline" id="assist-edit" data-testid="assist-edit-btn">${icon('pencil')} Koreksi Data Administratif</button>` : ''}
    </div>
    ${a.revision_notes ? `<div class="notice warn mb">${icon('message-square')}<span>Catatan perbaikan: ${esc(a.revision_notes)}</span></div>` : ''}
    <div class="grid g-2"><div class="card"><h3>Data diri</h3><dl class="kv"><dt>NIK</dt><dd class="mono">${esc(ap.nik || '—')}</dd><dt>NISN</dt><dd class="mono">${esc(ap.nisn || '—')}</dd><dt>JK</dt><dd>${esc(ap.gender || '—')}</dd><dt>Tempat/Tgl lahir</dt><dd>${esc(ap.birth_place || '—')} / ${esc(ap.birth_date || '—')}</dd><dt>Agama</dt><dd>${esc(ap.religion || '—')}</dd><dt>Telepon</dt><dd>${esc(ap.phone || '—')}</dd><dt>Alamat</dt><dd>${esc(ap.address || '—')}</dd></dl></div>
    <div class="card"><h3>Orang tua/wali & pendidikan</h3><dl class="kv">${d.guardians.filter((g) => g.full_name).map((g) => `<dt>${esc(g.relation)}</dt><dd>${esc(g.full_name)} · ${esc(g.occupation || '-')} · ${esc(g.phone || '-')}</dd>`).join('')}
      <dt>Sekolah asal</dt><dd>${esc(d.education?.school_name || '—')} ${d.education?.npsn ? `(NPSN ${esc(d.education.npsn)})` : ''}</dd><dt>Pilihan program</dt><dd>${d.preferences.map((p) => `${p.preference_rank}. ${esc(p.title)}`).join('<br>') || '—'}</dd>
    </dl></div></div>
    <div class="card mt"><h3>Dokumen</h3><div class="table-wrap"><table class="data" data-testid="detail-documents-table"><thead><tr><th>Dokumen</th><th>Tahap</th><th>Status</th><th>Berkas</th><th>Aksi</th></tr></thead><tbody>
      ${d.documents.length ? d.documents.map((x) => `<tr><td><strong>${esc(x.name)}</strong>${x.notes ? `<div class="subtle">${esc(x.notes)}</div>` : ''}</td><td>${x.stage === 'application' ? 'Pendaftaran' : 'Daftar ulang'}</td><td>${badge('doc', x.status)}</td>
        <td>${x.version_id ? `<a href="/api/admissions/applications/documents/${x.version_id}/download" target="_blank" rel="noopener" data-testid="doc-download-${x.id}">${esc(x.original_name)}</a> <span class="subtle">v${x.version_no}</span>` : '—'}</td>
        <td>${vDoc(x) ? `<div class="row"><button class="btn btn-primary btn-sm" data-doc="${x.id}" data-st="verified" data-testid="doc-verify-${x.id}">Verifikasi</button><button class="btn btn-outline btn-sm" data-doc="${x.id}" data-st="needs_revision" data-testid="doc-revision-${x.id}">Perbaikan</button><button class="btn btn-danger btn-sm" data-doc="${x.id}" data-st="rejected" data-testid="doc-reject-${x.id}">Tolak</button></div>` : ''}</td></tr>`).join('')
      : `<tr><td colspan="5">${empty('Belum ada dokumen diunggah.')}</td></tr>`}</tbody></table></div></div>
    <div class="grid g-2 mt"><div class="card"><h3>Riwayat verifikasi</h3>${d.verifications.length ? `<ol class="timeline" data-testid="verification-history">${d.verifications.map((v) => `<li><strong>${esc(v.document_name || v.target)}: ${esc(v.previous_status || '-')} → ${esc(v.new_status)}</strong><div class="muted">${esc(v.notes || '')}</div><div class="subtle">${esc(v.verifier_name || '')} · ${fmtDateTime(v.created_at)}</div></li>`).join('')}</ol>` : empty('Belum ada.')}</div>
    <div class="card"><h3>Riwayat daftar ulang & integrasi</h3>${[...d.rereg.map((r) => `<li><strong>Daftar ulang: ${esc(r.previous_status)} → ${esc(r.new_status)}</strong><div class="muted">${esc(r.notes || '')}</div><div class="subtle">${esc(r.actor_name || '')} · ${fmtDateTime(r.created_at)}</div></li>`), ...d.integration.map((l) => `<li><strong>Integrasi: ${esc(l.status)}</strong><div class="muted">${esc(l.message || '')}</div><div class="subtle">${fmtDateTime(l.created_at)}</div></li>`)].join('') ? `<ol class="timeline">${[...d.rereg.map((r) => `<li><strong>Daftar ulang: ${esc(r.previous_status)} → ${esc(r.new_status)}</strong><div class="muted">${esc(r.notes || '')}</div></li>`), ...d.integration.map((l) => `<li><strong>Integrasi: ${esc(l.status)}</strong><div class="muted">${esc(l.message || '')}</div></li>`)].join('')}</ol>` : empty('Belum ada.')}</div></div>
    <div class="card mt"><h3>Riwayat perubahan (audit)</h3>${d.history.length ? `<ol class="timeline">${d.history.map((h) => `<li><strong>${esc(h.action)}</strong><div class="subtle">${esc(h.actor || 'Sistem')} · ${fmtDateTime(h.created_at)}</div></li>`).join('')}</ol>` : empty('Belum ada.')}</div>`;

  $$('[data-doc]', el).forEach((b) => { b.onclick = async () => {
    const st = b.dataset.st;
    const r = st === 'verified' ? { notes: '' } : await confirmDialog({ title: st === 'rejected' ? 'Tolak dokumen' : 'Minta perbaikan dokumen', message: 'Alasan akan dikirim kepada pendaftar.', notes: 'Alasan', notesRequired: true, danger: st === 'rejected', confirmText: 'Simpan Keputusan' });
    if (r) act(b, () => api(`/admissions/applications/documents/${b.dataset.doc}/verify`, { method: 'POST', body: { status: st, notes: r.notes } }));
  }; });
  const mc = $('#mark-complete', el);
  if (mc) mc.onclick = async () => { if (await confirmDialog({ title: 'Tandai lengkap administratif?', message: 'Seluruh dokumen wajib harus sudah terverifikasi. Status ini bukan hasil seleksi.' })) act(mc, () => api(`/admissions/applications/${id}/decision`, { method: 'POST', body: { decision: 'complete' } })); };
  const rv = $('#req-revision', el);
  if (rv) rv.onclick = async () => { const r = await confirmDialog({ title: 'Minta perbaikan pengajuan', message: 'Pendaftar dapat mengubah data dan mengirim ulang.', notes: 'Alasan perbaikan', notesRequired: true, danger: true }); if (r) act(rv, () => api(`/admissions/applications/${id}/decision`, { method: 'POST', body: { decision: 'needs_revision', notes: r.notes } })); };
  $$('[data-rr]', el).forEach((b) => { b.onclick = async () => {
    const dec = b.dataset.rr;
    const r = await confirmDialog({ title: 'Keputusan daftar ulang', message: dec === 'completed' ? 'Dokumen daftar ulang wajib harus terverifikasi.' : 'Catatan akan dikirim kepada pendaftar.', notes: 'Catatan', notesRequired: dec !== 'completed' });
    if (r) act(b, () => api(`/admissions/applications/${id}/re-registration-decision`, { method: 'POST', body: { decision: dec, notes: r.notes } }));
  }; });
  const ae = $('#assist-edit', el);
  if (ae) ae.onclick = () => formDialog({ title: 'Koreksi data administratif', intro: '<p class="muted">Setiap koreksi dicatat di audit trail beserta alasan, nilai sebelum, dan sesudah.</p>', values: ap,
    fields: [{ name: 'phone', label: 'Telepon' }, { name: 'nisn', label: 'NISN' }, { name: 'birth_place', label: 'Tempat lahir' }, { name: 'religion', label: 'Agama' }, { name: 'address', label: 'Alamat', type: 'textarea', rows: 3 }, { name: 'reason', label: 'Alasan koreksi', required: true, full: true }],
    onSubmit: async (v) => { toast((await api(`/admissions/applications/${id}/admin-data`, { method: 'PUT', body: v })).message); rerender(); } });


}

export async function integration(el) {
  el.innerHTML = `${dashHead('Integrasi Data Induk SIAKAD', 'Target: tabel data induk peserta didik lokal (student_records). Konektor SIAKAD eksternal belum tersedia.')}
    <div class="notice mb">${icon('shield-check')}<span>Proses bersifat idempoten: mencoba ulang tidak akan membuat data induk ganda. NIK yang sudah terdaftar ditandai "Perlu Pemeriksaan".</span></div><div id="tbl"></div><h3 class="mt">Log integrasi</h3><div id="logs"></div>`;
  const t = dataTable({ el: $('#tbl', el), endpoint: '/admissions/integrations', testid: 'integration-table', search: false, emptyText: 'Belum ada peserta yang selesai daftar ulang.',
    filters: [{ name: 'status', label: 'Status', options: options('integration') }],
    columns: [{ label: 'No. Pendaftaran', render: (r) => `<span class="mono">${esc(r.registration_number)}</span>` }, { label: 'Nama', key: 'full_name' }, { label: 'Status', render: (r) => badge('integration', r.integration_status) },
      { label: 'No. Induk', render: (r) => `<span class="mono">${esc(r.student_number || '—')}</span>` }, { label: 'Pesan terakhir', render: (r) => esc(r.last_message || '—') },
      { label: 'Aksi', render: (r) => `<div class="row">${r.integration_status === 'success' ? '' : `<button class="btn btn-primary btn-sm" data-int="${r.id}" data-testid="integration-process-${r.id}">${icon('play')} ${r.integration_status === 'ready' ? 'Proses' : 'Coba Ulang'}</button>`}</div>` }] });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-int]'); if (!b) return;
    if (!(await confirmDialog({ title: 'Proses integrasi?', message: 'Sistem akan memeriksa kelengkapan dan duplikasi, lalu membuat/menautkan data induk.' }))) return;
    withLoading(b, async () => { try { const r = await api(`/admissions/integrations/${b.dataset.int}/process`, { method: 'POST' }); toast(r.message, r.data.status === 'success' ? 'success' : 'error'); t.reload(); loadLogs(); } catch (er) { toast(er.message, 'error'); } });
  });
  const loadLogs = async () => { const l = (await api('/admissions/integrations/logs')).data; $('#logs', el).innerHTML = l.length ? `<div class="table-wrap"><table class="data" data-testid="integration-logs-table"><thead><tr><th>Waktu</th><th>No. Pendaftaran</th><th>Status</th><th>Pesan</th><th>Operator</th></tr></thead><tbody>${l.map((x) => `<tr><td>${fmtDateTime(x.created_at)}</td><td class="mono">${esc(x.registration_number)}</td><td>${esc(x.status)}</td><td>${esc(x.message || '')}</td><td>${esc(x.operator_name || 'Sistem')}</td></tr>`).join('')}</tbody></table></div>` : empty('Belum ada log integrasi.'); };
  loadLogs();
}

const EXPORTS = [['applicants', 'Seluruh pendaftar'], ['complete', 'Lengkap administratif'], ['revision', 'Perlu perbaikan'], ['selection', 'Hasil seleksi resmi'], ['accepted', 'Rekap diterima'], ['re_registration', 'Rekap daftar ulang'], ['integration_ready', 'Siap integrasi'], ['integration_failed', 'Integrasi gagal']];
let charts = [];

export async function reports(el) {
  const periods = await periodsOpts();
  const pid = new URLSearchParams(location.search).get('period_id') || '';
  const d = (await api(`/admissions/reports/summary${pid ? `?period_id=${pid}` : ''}`)).data;
  const tbl = (rows, grp) => (rows.length ? `<table class="data"><tbody>${rows.map((r) => `<tr><td>${grp ? badge(grp, r.k) : esc(r.k || '—')}</td><td class="mono" style="text-align:right">${esc(r.n)}${r.quota != null && r.quota !== undefined ? ` / kuota ${esc(r.quota)}` : ''}</td></tr>`).join('')}</tbody></table>` : empty('Tidak ada data.'));
  el.innerHTML = `${dashHead('Laporan & Ekspor', 'Seluruh angka dan berkas CSV dihasilkan langsung dari database. NIK disamarkan pada ekspor.')}
    <div class="row mb"><select class="input" style="width:auto" id="rp-period" data-testid="report-period-filter"><option value="">Semua periode</option>${periods.map((p) => `<option value="${p.value}" ${String(p.value) === pid ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></div>
    <div class="grid g-2 mb"><div class="card"><h3>Pendaftaran per hari</h3><canvas id="ch-daily" height="180" aria-label="Grafik pendaftaran harian"></canvas></div><div class="card"><h3>Pendaftar per jalur</h3>${tbl(d.byPath)}</div></div>
    <div class="grid g-3 mb"><div class="card"><h3>Status pengajuan</h3>${tbl(d.bySubmission, 'submission')}<p class="subtle mt">Dokumen menunggu verifikasi: <strong class="mono">${d.pendingDocs}</strong></p></div><div class="card"><h3>Status seleksi</h3>${tbl(d.bySelection, 'selection')}</div><div class="card"><h3>Daftar ulang</h3>${tbl(d.byRereg, 'rereg')}</div>
    <div class="card"><h3>Integrasi</h3>${tbl(d.byIntegration, 'integration')}</div><div class="card"><h3>Pendaftar per periode</h3>${tbl(d.byPeriod)}</div></div>
    ${can('reports.export') ? `<div class="card"><h3>Ekspor CSV</h3><div class="row">${EXPORTS.map(([k, l]) => `<a class="btn btn-outline btn-sm" href="/api/admissions/reports/export/${k}${pid ? `?period_id=${pid}` : ''}" download data-testid="export-${k.replace(/_/g, '-')}-btn">${icon('download')} ${l}</a>`).join('')}
      ${can('audit.view') ? `<a class="btn btn-outline btn-sm" href="/api/admissions/reports/export/activity" download data-testid="export-activity-btn">${icon('download')} Aktivitas administratif</a>` : ''}</div></div>` : ''}`;
  $('#rp-period', el).onchange = (e) => { history.replaceState({}, '', `/dashboard/laporan${e.target.value ? `?period_id=${e.target.value}` : ''}`); rerender(); };
  charts.forEach((c) => c.destroy()); charts = [];
  if (window.Chart) charts.push(new window.Chart($('#ch-daily', el), { type: 'line', data: { labels: d.daily.map((x) => x.k), datasets: [{ label: 'Pengajuan', data: d.daily.map((x) => Number(x.n)), borderColor: '#0D5C3A', backgroundColor: 'rgba(16,185,129,.15)', fill: true, tension: .3 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } }));
}
