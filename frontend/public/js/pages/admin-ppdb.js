import { api, state } from '../api.js';
import { esc, icon, $, $$, badge, options, fmtDate, fmtDateTime, empty, stat, dataTable, formDialog, confirmDialog, withLoading, toast, STAGE_LABEL, formFields, readForm, bindImageInputs, showErrors, paragraphs, openModal, LABELS } from '../ui.js';
import { dashHead, rerender } from './dashboard.js';

const periodsList = async () => (await api('/admissions/periods')).data;
const yesNo = (v) => (Number(v) ? 'Ya' : 'Tidak');
let charts = [];

export async function overview(el) {
  const d = (await api('/dashboard')).data;
  const s = d.submission; const total = Object.entries(s).filter(([k]) => k !== 'draft').reduce((a, [, n]) => a + n, 0);
  el.innerHTML = `${dashHead('Dashboard Administrator PPDB', 'Ringkasan penerimaan berdasarkan data aktual.')}
    <div class="grid g-4 mb">${stat('users', 'Total pendaftar', total, 'stat-total')}${stat('inbox', 'Menunggu verifikasi', s.submitted || 0, 'stat-submitted')}${stat('alert-triangle', 'Perlu perbaikan', s.needs_revision || 0, 'stat-revision')}${stat('check-circle', 'Lengkap administratif', s.complete || 0, 'stat-complete')}
    ${stat('hourglass', 'Hasil menunggu persetujuan', d.approvals_pending, 'stat-approvals')}${stat('award', 'Diterima (resmi)', d.selection.accepted || 0, 'stat-accepted')}${stat('clipboard-list', 'Daftar ulang belum selesai', ['awaiting_confirmation', 'in_process', 'awaiting_verification', 'needs_revision'].reduce((a, k) => a + (d.rereg[k] || 0), 0), 'stat-rereg-open')}${stat('database', 'Menunggu integrasi', d.integration.ready || 0, 'stat-integration')}</div>
    <div class="grid g-2"><div class="card"><h3>Pendaftaran berdasarkan waktu</h3><canvas id="ch1" height="200"></canvas></div><div class="card"><h3>Pendaftar per jalur</h3><canvas id="ch2" height="200"></canvas></div></div>
    <div class="card mt"><h3>Aktivitas terbaru</h3>${d.activity.length ? `<ol class="timeline">${d.activity.map((r) => `<li><strong>${esc(r.action)}</strong><div class="subtle">${esc(r.actor || 'Sistem')} · ${fmtDateTime(r.created_at)}</div></li>`).join('')}</ol>` : empty('Belum ada aktivitas.')}</div>`;
  charts.forEach((c) => c.destroy()); charts = [];
  if (!window.Chart) return;
  charts.push(new window.Chart($('#ch1', el), { type: 'bar', data: { labels: d.daily.map((x) => fmtDate(x.k)), datasets: [{ label: 'Pengajuan', data: d.daily.map((x) => Number(x.n)), backgroundColor: '#13794D' }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } }));
  charts.push(new window.Chart($('#ch2', el), { type: 'doughnut', data: { labels: d.by_path.map((x) => x.k), datasets: [{ data: d.by_path.map((x) => Number(x.n)), backgroundColor: ['#0D5C3A', '#10B981', '#A7F3D0', '#475569', '#CBD5E1'] }] } }));
}

const periodFields = [{ name: 'name', label: 'Nama periode', required: true, full: true }, { name: 'academic_year', label: 'Tahun ajaran (mis. 2027/2028)', required: true }, { name: 'level', label: 'Jenjang', required: true },
  { name: 'start_date', label: 'Tanggal mulai', type: 'date', required: true }, { name: 'end_date', label: 'Tanggal berakhir', type: 'date', required: true }, { name: 'description', label: 'Deskripsi', type: 'textarea' }];
const NEXT = { draft: ['scheduled', 'active'], scheduled: ['draft', 'active'], active: ['closed'], closed: ['active', 'archived'], archived: [] };

export async function periods(el) {
  const rows = await periodsList();
  const fields = (await api('/admissions/form-fields')).data;
  el.innerHTML = `${dashHead('Periode & Jadwal', 'Transisi status divalidasi server. Hanya satu periode dapat aktif.', `<button class="btn btn-primary" id="new-period" data-testid="period-create-btn">${icon('plus')} Periode Baru</button>`)}
    ${rows.length ? rows.map((p) => `<div class="card mb" data-testid="period-card-${p.id}"><div class="row between"><div><h3 style="margin:0">${esc(p.name)}</h3><div class="subtle">T.A. ${esc(p.academic_year)} · ${esc(p.level)} · ${fmtDate(p.start_date)} — ${fmtDate(p.end_date)} · ${p.application_count} pengajuan</div></div>${badge('period', p.status, `period-status-${p.id}`)}</div>
      <div class="grid g-2 mt"><div><strong>Jadwal tahapan</strong>${p.stages.length ? `<ol class="timeline mt">${p.stages.map((s) => `<li><strong>${STAGE_LABEL[s.stage_type]}</strong><div class="subtle">${fmtDateTime(s.start_at)} — ${fmtDateTime(s.end_at)}</div></li>`).join('')}</ol>` : empty('Belum ada jadwal.')}</div>
      <div><strong>Kolom formulir wajib tambahan</strong><p class="muted">${p.form_config.required_fields.length ? p.form_config.required_fields.map((f) => esc(fields.optional[f])).join(', ') : 'Tidak ada (hanya kolom inti).'}</p></div></div>
      <div class="row mt">${p.status !== 'archived' ? `<button class="btn btn-outline btn-sm" data-edit="${p.id}" data-testid="period-edit-${p.id}">${icon('pencil')} Ubah</button><button class="btn btn-outline btn-sm" data-stages="${p.id}" data-testid="period-stages-${p.id}">${icon('calendar')} Jadwal</button><button class="btn btn-outline btn-sm" data-form="${p.id}" data-testid="period-form-${p.id}">${icon('list-checks')} Formulir</button><button class="btn btn-outline btn-sm" data-rules="${p.id}" data-testid="period-rules-${p.id}">${icon('scale')} Aturan Seleksi</button>` : ''}
      ${NEXT[p.status].map((n) => `<button class="btn btn-ghost btn-sm" data-status="${p.id}" data-to="${n}" data-testid="period-to-${n}-${p.id}">→ ${esc(LABELS.period[n][0])}</button>`).join('')}</div></div>`).join('') : empty('Belum ada periode penerimaan.')}`;
  const find = (id) => rows.find((p) => String(p.id) === String(id));
  $('#new-period', el).onclick = () => formDialog({ title: 'Periode baru', fields: periodFields, onSubmit: async (v) => { toast((await api('/admissions/periods', { method: 'POST', body: v })).message); rerender(); } });
  $$('[data-edit]', el).forEach((b) => { b.onclick = () => formDialog({ title: 'Ubah periode', fields: periodFields, values: find(b.dataset.edit), onSubmit: async (v) => { toast((await api(`/admissions/periods/${b.dataset.edit}`, { method: 'PUT', body: v })).message); rerender(); } }); });
  $$('[data-status]', el).forEach((b) => { b.onclick = async () => { if (!(await confirmDialog({ title: 'Ubah status periode?', message: `Status akan diubah menjadi "${LABELS.period[b.dataset.to][0]}". Perubahan dicatat di log.` }))) return;
    withLoading(b, async () => { try { toast((await api(`/admissions/periods/${b.dataset.status}/status`, { method: 'POST', body: { status: b.dataset.to } })).message); rerender(); } catch (e) { toast(e.message, 'error'); } }); }; });
  $$('[data-stages]', el).forEach((b) => { b.onclick = () => {
    const p = find(b.dataset.stages);
    const types = Object.keys(STAGE_LABEL);
    const vals = Object.fromEntries(p.stages.flatMap((s) => [[`${s.stage_type}_start`, s.start_at.slice(0, 16).replace(' ', 'T')], [`${s.stage_type}_end`, s.end_at.slice(0, 16).replace(' ', 'T')]]));
    formDialog({ title: 'Jadwal tahapan', values: vals, intro: '<p class="muted">Kosongkan tahap yang belum dijadwalkan.</p>', fields: types.flatMap((t) => [{ name: `${t}_start`, label: `${STAGE_LABEL[t]} — mulai`, type: 'datetime-local' }, { name: `${t}_end`, label: `${STAGE_LABEL[t]} — selesai`, type: 'datetime-local' }]),
      onSubmit: async (v) => { toast((await api(`/admissions/periods/${p.id}/stages`, { method: 'PUT', body: { stages: types.filter((t) => v[`${t}_start`] && v[`${t}_end`]).map((t) => ({ stage_type: t, start_at: v[`${t}_start`], end_at: v[`${t}_end`] })) } })).message); rerender(); } });
  }; });
  $$('[data-form]', el).forEach((b) => { b.onclick = () => { const p = find(b.dataset.form); formDialog({ title: 'Konfigurasi formulir', intro: `<p class="muted">Kolom inti selalu wajib: ${fields.core.join(', ')}. Perubahan tidak mengubah data pengajuan tersimpan.</p>`, values: { required_fields: p.form_config.required_fields },
    fields: [{ name: 'required_fields', label: 'Kolom tambahan yang diwajibkan', type: 'checkboxes', full: true, options: Object.entries(fields.optional).map(([value, label]) => ({ value, label })) }],
    onSubmit: async (v) => { toast((await api(`/admissions/periods/${p.id}/form-config`, { method: 'PUT', body: v })).message); rerender(); } }); }; });
  $$('[data-rules]', el).forEach((b) => { b.onclick = async () => {
    const r = (await api(`/admissions/selections/rules/${b.dataset.rules}`)).data;
    formDialog({ title: 'Aturan seleksi', intro: '<p class="muted">Kriteria, bobot, dan pemeringkatan ditetapkan sekolah. Satu kriteria per baris dengan format: kode | label | nilai maksimum.</p>',
      values: { criteria: r.criteria.map((c) => `${c.key} | ${c.label} | ${c.max_score}`).join('\n'), ranking_notes: r.ranking_notes, waitlist_enabled: Number(r.waitlist_enabled) },
      fields: [{ name: 'criteria', label: 'Kriteria', type: 'textarea', rows: 5 }, { name: 'ranking_notes', label: 'Catatan aturan pemeringkatan/pemecah seri', type: 'textarea', rows: 3 }, { name: 'waitlist_enabled', label: 'Aktifkan daftar tunggu', type: 'checkbox', full: true }],
      onSubmit: async (v) => { const criteria = v.criteria.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((x) => x[0]).map(([key, label, max]) => ({ key, label, max_score: Number(max) }));
        toast((await api(`/admissions/selections/rules/${b.dataset.rules}`, { method: 'PUT', body: { criteria, ranking_notes: v.ranking_notes, waitlist_enabled: v.waitlist_enabled } })).message); } });
  }; });
}

export async function paths(el) {
  const ps = await periodsList();
  const rows = (await api('/admissions/paths')).data;
  const pf = [{ name: 'period_id', label: 'Periode', type: 'select', required: true, options: ps.map((p) => ({ value: p.id, label: p.name })) }, { name: 'name', label: 'Nama jalur', required: true },
    { name: 'quota', label: 'Kuota (kosongkan bila belum ditetapkan)', type: 'number', min: 0 }, { name: 'is_active', label: 'Jalur aktif', type: 'checkbox', default: true },
    { name: 'description', label: 'Deskripsi', type: 'textarea', rows: 3 }, { name: 'special_requirements', label: 'Persyaratan khusus', type: 'textarea', rows: 3 }, { name: 'terms', label: 'Ketentuan & jadwal khusus', type: 'textarea', rows: 3 }];
  el.innerHTML = `${dashHead('Jalur & Kuota', 'Jalur dan kuota resmi ditetapkan sekolah. Perubahan kuota dicatat di log.', `<button class="btn btn-primary" id="new-path" data-testid="path-create-btn">${icon('plus')} Jalur Baru</button>`)}
    <div class="table-wrap"><table class="data" data-testid="paths-table"><thead><tr><th>Jalur</th><th>Periode</th><th>Kuota</th><th>Pengajuan</th><th>Aktif</th><th></th></tr></thead><tbody>
    ${rows.length ? rows.map((r) => `<tr><td><strong>${esc(r.name)}</strong><div class="subtle">${esc(r.description || '')}</div></td><td>${esc(ps.find((p) => p.id === r.period_id)?.name || '')}</td><td class="mono">${r.quota == null ? 'Belum ditetapkan' : esc(r.quota)}</td><td class="mono">${r.application_count}</td><td>${badge('active', Number(r.is_active))}</td>
      <td><button class="btn btn-outline btn-sm" data-edit="${r.id}" data-testid="path-edit-${r.id}">${icon('pencil')} Ubah</button></td></tr>`).join('') : `<tr><td colspan="6">${empty('Belum ada jalur.')}</td></tr>`}</tbody></table></div>`;
  const save = (id) => async (v) => { const body = { ...v, period_id: Number(v.period_id), quota: v.quota === '' ? null : Number(v.quota) }; toast((await api(`/admissions/paths${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body })).message); rerender(); };
  $('#new-path', el).onclick = () => formDialog({ title: 'Jalur baru', fields: pf, onSubmit: save(null) });
  $$('[data-edit]', el).forEach((b) => { b.onclick = () => { const r = rows.find((x) => String(x.id) === b.dataset.edit); formDialog({ title: 'Ubah jalur', fields: pf, values: { ...r, is_active: Number(r.is_active) }, onSubmit: save(r.id) }); }; });
}

export async function requirements(el) {
  const ps = await periodsList();
  const allPaths = (await api('/admissions/paths')).data;
  const rows = (await api('/admissions/requirements')).data;
  const rf = [{ name: 'period_id', label: 'Periode', type: 'select', required: true, options: ps.map((p) => ({ value: p.id, label: p.name })) },
    { name: 'path_id', label: 'Khusus jalur', type: 'select', placeholder: 'Semua jalur', options: allPaths.map((p) => ({ value: p.id, label: p.name })) },
    { name: 'stage', label: 'Tahap', type: 'select', required: true, placeholder: false, options: [{ value: 'application', label: 'Pendaftaran' }, { value: 're_registration', label: 'Daftar ulang' }] },
    { name: 'name', label: 'Nama dokumen', required: true }, { name: 'max_size_kb', label: 'Batas ukuran (KB)', type: 'number', required: true, default: 2048, min: 50, max: 5120 },
    { name: 'allowed_types', label: 'Format diizinkan', type: 'checkboxes', options: ['pdf', 'jpg', 'png', 'webp'].map((t) => ({ value: t, label: t.toUpperCase() })), default: ['pdf', 'jpg', 'png'] },
    { name: 'is_required', label: 'Wajib', type: 'checkbox', default: true }, { name: 'is_active', label: 'Aktif', type: 'checkbox', default: true }, { name: 'description', label: 'Keterangan', type: 'textarea', rows: 2 }];
  el.innerHTML = `${dashHead('Persyaratan Dokumen', 'Perubahan persyaratan tidak mengubah dokumen yang sudah diunggah.', `<button class="btn btn-primary" id="new-req" data-testid="requirement-create-btn">${icon('plus')} Persyaratan Baru</button>`)}
    <div class="table-wrap"><table class="data" data-testid="requirements-table"><thead><tr><th>Dokumen</th><th>Tahap</th><th>Jalur</th><th>Wajib</th><th>Format</th><th>Aktif</th><th></th></tr></thead><tbody>
    ${rows.length ? rows.map((r) => `<tr><td><strong>${esc(r.name)}</strong></td><td>${r.stage === 'application' ? 'Pendaftaran' : 'Daftar ulang'}</td><td>${esc(r.path_name || 'Semua')}</td><td>${yesNo(r.is_required)}</td><td class="mono">${esc(r.allowed_types)} · ${r.max_size_kb}KB</td><td>${badge('active', Number(r.is_active))}</td>
      <td><button class="btn btn-outline btn-sm" data-edit="${r.id}" data-testid="requirement-edit-${r.id}">${icon('pencil')}</button></td></tr>`).join('') : `<tr><td colspan="7">${empty('Belum ada persyaratan.')}</td></tr>`}</tbody></table></div>`;
  const save = (id) => async (v) => { toast((await api(`/admissions/requirements${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: { ...v, period_id: Number(v.period_id), path_id: v.path_id ? Number(v.path_id) : null, max_size_kb: Number(v.max_size_kb) } })).message); rerender(); };
  $('#new-req', el).onclick = () => formDialog({ title: 'Persyaratan baru', fields: rf, onSubmit: save(null) });
  $$('[data-edit]', el).forEach((b) => { b.onclick = () => { const r = rows.find((x) => String(x.id) === b.dataset.edit); formDialog({ title: 'Ubah persyaratan', fields: rf, values: { ...r, allowed_types: r.allowed_types.split(','), is_required: Number(r.is_required), is_active: Number(r.is_active) }, onSubmit: save(r.id) }); }; });
}

export async function selection(el) {
  const ps = await periodsList();
  const pid = new URLSearchParams(location.search).get('period_id') || ps.find((p) => p.status === 'active')?.id || ps[0]?.id;
  if (!pid) { el.innerHTML = dashHead('Seleksi & Persetujuan') + empty('Belum ada periode.'); return; }
  const canManageSelection = !!state.user?.permissions?.includes('selection.manage');
  const canApproveSelection = !!state.user?.permissions?.includes('selection.approve');
  const [cands, rule, approvals] = await Promise.all([api(`/admissions/selections/candidates?period_id=${pid}`), api(`/admissions/selections/rules/${pid}`), api(`/admissions/selections/approvals?period_id=${pid}`)]);
  const crit = rule.data.criteria;
  const headerActions = canManageSelection ? `<button class="btn btn-primary" id="submit-batch" data-testid="selection-submit-batch-btn">${icon('send')} Ajukan untuk Persetujuan</button>` : '';
  el.innerHTML = `${dashHead('Seleksi & Persetujuan', 'Hasil sementara → diajukan → disetujui → dipublikasikan. Hasil sementara tidak terlihat oleh pendaftar.', headerActions)}
    <div class="row mb"><select class="input" style="width:auto" id="sel-period" data-testid="selection-period-filter">${ps.map((p) => `<option value="${p.id}" ${String(p.id) === String(pid) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      <span class="subtle">Kriteria: ${crit.length ? crit.map((c) => `${esc(c.label)} (maks ${c.max_score})`).join(', ') : 'belum dikonfigurasi (atur di menu Periode → Aturan Seleksi)'}</span></div>
    <h3>Pengajuan lengkap administratif</h3><div class="table-wrap mb"><table class="data" data-testid="selection-candidates-table"><thead><tr><th>No. Pendaftaran</th><th>Nama</th><th>Jalur</th><th>Nilai</th><th>Usulan</th><th>Status</th><th></th></tr></thead><tbody>
    ${cands.data.length ? cands.data.map((c) => `<tr><td class="mono">${esc(c.registration_number)}</td><td>${esc(c.full_name)}</td><td>${esc(c.path_name || '')}</td><td class="mono">${Object.entries(c.scores).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('<br>') || '—'}</td>
      <td>${c.proposed_status ? badge('proposed', c.proposed_status) : '—'}</td><td>${badge('selection', c.selection_status)}${c.approval_status ? ` ${badge('approval', c.approval_status)}` : ''}</td>
      <td>${!Number(c.is_official) && !['submitted', 'approved'].includes(c.approval_status) ? `<button class="btn btn-outline btn-sm" data-res="${c.id}" data-testid="selection-input-${c.id}">${icon('pencil')} Input Hasil</button>` : ''}</td></tr>`).join('') : `<tr><td colspan="7">${empty('Belum ada pengajuan lengkap administratif.')}</td></tr>`}</tbody></table></div>
    <h3>Riwayat persetujuan</h3><div class="table-wrap"><table class="data" data-testid="selection-approvals-table"><thead><tr><th>#</th><th>Jumlah</th><th>Status</th><th>Diajukan</th><th>Keputusan</th><th>Publikasi</th><th></th></tr></thead><tbody>
    ${approvals.data.length ? approvals.data.map((a) => `<tr><td class="mono">${a.id}</td><td class="mono">${a.result_count}</td><td>${badge('approval', a.status, `approval-status-${a.id}`)}</td><td>${esc(a.submitted_by_name || '')}<div class="subtle">${fmtDateTime(a.submitted_at)}</div></td>
      <td>${esc(a.decided_by_name || '—')}<div class="subtle">${esc(a.decision_notes || '')}</div></td><td>${a.published_at ? fmtDateTime(a.published_at) : a.publish_at ? `Terjadwal ${fmtDateTime(a.publish_at)}` : '—'}</td>
      <td class="row">${canApproveSelection && a.status === 'submitted' ? `<button class="btn btn-primary btn-sm" data-approve="${a.id}" data-testid="approval-approve-${a.id}">Setujui</button><button class="btn btn-danger btn-sm" data-reject="${a.id}" data-testid="approval-reject-${a.id}">Kembalikan</button>` : ''}
      ${canApproveSelection && a.status === 'approved' ? `<button class="btn btn-primary btn-sm" data-publish="${a.id}" data-testid="approval-publish-${a.id}">${icon('megaphone')} Publikasikan Sekarang</button>` : ''}</td></tr>`).join('') : `<tr><td colspan="7">${empty('Belum ada pengajuan persetujuan.')}</td></tr>`}</tbody></table></div>`;
  $('#sel-period', el).onchange = (e) => { history.replaceState({}, '', `/dashboard/seleksi?period_id=${e.target.value}`); rerender(); };
  const run = (b, fn) => withLoading(b, async () => { try { toast((await fn()).message); rerender(); } catch (e) { toast(e.message, 'error'); } });
  $$('[data-res]', el).forEach((b) => { b.onclick = () => {
    const c = cands.data.find((x) => String(x.id) === b.dataset.res);
    const opts = [{ value: 'accepted', label: 'Diterima' }, { value: 'rejected', label: 'Tidak Diterima' }, ...(Number(rule.data.waitlist_enabled) ? [{ value: 'waitlist', label: 'Daftar Tunggu' }] : [])];
    formDialog({ title: `Hasil sementara — ${c.full_name}`, values: { ...c.scores, proposed_status: c.proposed_status, notes: c.notes },
      fields: [...crit.map((k) => ({ name: k.key, label: `${k.label} (maks ${k.max_score})`, type: 'number', min: 0, max: k.max_score })), { name: 'proposed_status', label: 'Usulan hasil', type: 'select', required: true, options: opts }, { name: 'notes', label: 'Catatan', type: 'textarea', rows: 2 }],
      onSubmit: async (v) => { const scores = Object.fromEntries(crit.filter((k) => v[k.key] !== '').map((k) => [k.key, Number(v[k.key])])); toast((await api(`/admissions/selections/results/${c.id}`, { method: 'PUT', body: { scores, proposed_status: v.proposed_status, notes: v.notes } })).message); rerender(); } });
  }; });
  const submitBatchButton = $('#submit-batch', el);
  if (submitBatchButton && canManageSelection) submitBatchButton.onclick = async (e) => { const b = e.currentTarget; if (await confirmDialog({ title: 'Ajukan hasil untuk persetujuan?', message: 'Semua hasil sementara yang belum diajukan akan dikunci hingga diputuskan.' })) run(b, () => api('/admissions/selections/approvals', { method: 'POST', body: { period_id: Number(pid) } })); };
  $$('[data-approve]', el).forEach((b) => { b.onclick = () => formDialog({ title: 'Setujui hasil seleksi', intro: '<p class="muted">Isi waktu publikasi untuk publikasi terjadwal, atau kosongkan lalu publikasikan manual.</p>', fields: [{ name: 'publish_at', label: 'Waktu publikasi terjadwal', type: 'datetime-local' }, { name: 'notes', label: 'Catatan', type: 'textarea', rows: 2 }],
    onSubmit: async (v) => { toast((await api(`/admissions/selections/approvals/${b.dataset.approve}/decide`, { method: 'POST', body: { decision: 'approved', notes: v.notes, publish_at: v.publish_at || null } })).message); rerender(); } }); });
  $$('[data-reject]', el).forEach((b) => { b.onclick = async () => { const r = await confirmDialog({ title: 'Kembalikan hasil', message: 'Hasil dapat ditinjau dan diajukan ulang.', notes: 'Alasan', notesRequired: true, danger: true }); if (r) run(b, () => api(`/admissions/selections/approvals/${b.dataset.reject}/decide`, { method: 'POST', body: { decision: 'rejected', notes: r.notes } })); }; });
  $$('[data-publish]', el).forEach((b) => { b.onclick = async () => { if (await confirmDialog({ title: 'Publikasikan hasil resmi?', message: 'Hasil akan terlihat oleh pendaftar dan daftar ulang dibuka bagi yang diterima. Tindakan ini tidak dapat dibatalkan.', confirmText: 'Publikasikan' })) run(b, () => api(`/admissions/selections/approvals/${b.dataset.publish}/publish`, { method: 'POST' })); }; });
}

const contentFields = (extra = []) => [{ name: 'title', label: 'Judul', required: true, full: true }, { name: 'slug', label: 'Slug (opsional, otomatis dari judul)' },
  { name: 'status', label: 'Status', type: 'select', required: true, placeholder: false, options: options('content') }, ...extra, { name: 'published_at', label: 'Waktu publikasi', type: 'datetime-local' },
  { name: 'image_path', label: 'Gambar utama (PNG/JPG/WEBP, maks 2 MB)', type: 'image', full: true }, { name: 'summary', label: 'Ringkasan', type: 'textarea', rows: 2 }, { name: 'body', label: 'Isi', type: 'textarea', rows: 8 }];
const EXTRA = {
  announcements: [{ name: 'category', label: 'Kategori', type: 'select', placeholder: false, options: [{ value: 'general', label: 'Umum' }, { value: 'ppdb', label: 'PPDB' }] }, { name: 'audience', label: 'Visibilitas', type: 'select', placeholder: false, options: [{ value: 'public', label: 'Publik' }, { value: 'authenticated', label: 'Hanya setelah login' }] }],
  news: [{ name: 'article_type', label: 'Jenis', type: 'select', placeholder: false, options: [{ value: 'news', label: 'Berita' }, { value: 'article', label: 'Artikel' }] }],
  achievements: [{ name: 'achievement_year', label: 'Tahun', type: 'number' }, { name: 'achievement_level', label: 'Tingkat' }],
  events: [{ name: 'event_type', label: 'Jenis kegiatan', type: 'select', placeholder: false, options: [{ value: 'activity', label: 'Kegiatan sekolah' }, { value: 'academic', label: 'Akademik' }, { value: 'ppdb', label: 'PPDB' }, { value: 'other', label: 'Lainnya' }] }, { name: 'starts_at', label: 'Mulai kegiatan', type: 'datetime-local' }, { name: 'ends_at', label: 'Selesai kegiatan', type: 'datetime-local' }, { name: 'location', label: 'Lokasi', full: true }],
  staff_profiles: [{ name: 'staff_role', label: 'Peran publik', type: 'select', required: true, placeholder: false, options: [{ value: 'principal', label: 'Kepala Sekolah' }, { value: 'teacher', label: 'Guru' }, { value: 'staff', label: 'Staf' }, { value: 'organization', label: 'Struktur Organisasi' }] }, { name: 'teacher_record_id', label: 'ID data guru (opsional)', type: 'number', min: 1 }, { name: 'education', label: 'Pendidikan', full: true }, { name: 'subjects', label: 'Mata pelajaran/bidang', full: true }, { name: 'sort_order', label: 'Urutan tampilan', type: 'number', min: 0, default: 0 }],
};
const COLL_LABEL = { programs: 'Program Keahlian', facilities: 'Fasilitas', news: 'Berita & Artikel', announcements: 'Pengumuman', gallery: 'Galeri', achievements: 'Prestasi', extracurriculars: 'Ekstrakurikuler', events: 'Kegiatan Sekolah', staff_profiles: 'Kepala Sekolah, Guru & Staf' };

async function collectionManager(root, coll) {
  let extraFields = EXTRA[coll] || [];
  if (coll === 'staff_profiles') {
    const teachers = await api('/academics/setup-options').then(r => r.data.teachers || []).catch(() => []);
    extraFields = extraFields.map(f => f.name === 'teacher_record_id' ? { ...f, type: 'select', placeholder: 'Tidak ditautkan', options: [{ value: '', label: 'Tidak ditautkan' }, ...teachers.map(t => ({ value: t.id, label: `${t.full_name}${t.employee_number ? ` · ${t.employee_number}` : ''}` }))] } : f);
  }
  const fields = contentFields(extraFields);
  root.innerHTML = `<div class="row between mb"><h3 style="margin:0">${COLL_LABEL[coll]}</h3><button class="btn btn-primary btn-sm" data-new data-testid="cms-${coll}-create-btn">${icon('plus')} Tambah</button></div><div data-tbl></div>`;
  const toForm = (r) => ({ ...r, published_at: r.published_at ? r.published_at.slice(0, 16).replace(' ', 'T') : '', starts_at: r.starts_at ? r.starts_at.slice(0, 16).replace(' ', 'T') : '', ends_at: r.ends_at ? r.ends_at.slice(0, 16).replace(' ', 'T') : '' });
  const save = (id) => async (v) => { toast((await api(`/cms/${coll}${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: v })).message); t.reload(); };
  const t = dataTable({ el: root.querySelector('[data-tbl]'), endpoint: `/cms/${coll}`, testid: `cms-${coll}-table`, filters: [{ name: 'status', label: 'Status', options: options('content') }],
    columns: [{ label: 'Judul', render: (r) => `<strong>${esc(r.title)}</strong><div class="subtle mono">/${esc(r.slug)}</div>` }, { label: 'Status', render: (r) => badge('content', r.status) },
      { label: 'Publikasi', render: (r) => fmtDateTime(r.published_at) }, { label: 'Penulis / Editor', render: (r) => `${esc(r.author_name || '—')} / ${esc(r.editor_name || '—')}` },
      { label: '', render: (r) => `<div class="row"><button class="btn btn-outline btn-sm" data-preview="${r.id}" data-testid="cms-preview-${coll}-${r.id}">${icon('eye')}</button><button class="btn btn-outline btn-sm" data-edit="${r.id}" data-testid="cms-edit-${coll}-${r.id}">${icon('pencil')}</button><button class="btn btn-danger btn-sm" data-del="${r.id}" data-testid="cms-delete-${coll}-${r.id}">${icon('archive')}</button></div>` }] });
  root.querySelector('[data-new]').onclick = () => formDialog({ title: `Tambah ${COLL_LABEL[coll]}`, fields, values: { status: 'draft' }, onSubmit: save(null) });
  root.onclick = async (e) => {
    const b = e.target.closest('[data-edit],[data-del],[data-preview]'); if (!b) return;
    const id = b.dataset.edit || b.dataset.del || b.dataset.preview;
    if (b.dataset.del) { if (await confirmDialog({ title: 'Arsipkan konten?', message: 'Konten tidak lagi tampil di website publik, tetapi riwayatnya tetap disimpan dan dapat ditelusuri.', danger: false, confirmText: 'Arsipkan' })) withLoading(b, async () => { try { toast((await api(`/cms/${coll}/${id}`, { method: 'DELETE' })).message); t.reload(); } catch (er) { toast(er.message, 'error'); } }); return; }
    const r = (await api(`/cms/${coll}/${id}`)).data;
    if (b.dataset.preview) openModal(`Pratinjau: ${r.title}`, `<div class="prose" data-testid="cms-preview-content">${badge('content', r.status)}${r.image_path ? `<img src="${esc(r.image_path)}" alt="" class="mt mb">` : ''}<h2 class="mt">${esc(r.title)}</h2>${r.summary ? `<p><strong>${esc(r.summary)}</strong></p>` : ''}${paragraphs(r.body)}</div>`);
    else formDialog({ title: `Ubah ${COLL_LABEL[coll]}`, fields, values: toForm(r), onSubmit: save(r.id) });
  };
}

export async function announcements(el) {
  el.innerHTML = `${dashHead('Pengumuman', 'Pengumuman umum & PPDB, publik atau khusus pengguna login. Hasil seleksi pribadi tidak diumumkan di sini.')}<div class="card" id="mgr"></div>`;
  collectionManager($('#mgr', el), 'announcements');
}

export async function cms(el) {
  const tab = new URLSearchParams(location.search).get('tab') || 'sections';
  const tabs = [['branding', 'Logo & Identitas'], ['sections', 'Profil & Halaman'], ['staff_profiles', 'Kepala Sekolah / Guru'], ['programs', 'Program Keahlian'], ['facilities', 'Fasilitas'], ['extracurriculars', 'Ekstrakurikuler'], ['events', 'Kegiatan'], ['news', 'Berita & Artikel'], ['gallery', 'Galeri'], ['achievements', 'Prestasi']];
  el.innerHTML = `${dashHead('CMS Company Profile', 'Konten publik hanya tampil setelah berstatus Terbit. Lengkapi informasi resmi sekolah di sini.')}
    <div class="tabs">${tabs.map(([k, l]) => `<button class="${k === tab ? 'active' : ''}" data-tab="${k}" data-testid="cms-tab-${k}">${l}</button>`).join('')}</div><div class="card" id="cms-body"></div>`;
  $$('[data-tab]', el).forEach((b) => { b.onclick = () => { history.replaceState({}, '', `/dashboard/cms?tab=${b.dataset.tab}`); rerender(); }; });
  const body = $('#cms-body', el);
  if (tab === 'branding') {
    const row = (await api('/cms/branding')).data || {};
    const social = row.social || {};
    const fields = [
      { name: 'school_name', label: 'Nama resmi sekolah', required: true, full: true },
      { name: 'short_name', label: 'Nama singkat/brand', required: true },
      { name: 'tagline', label: 'Tagline', full: true },
      { name: 'established_on', label: 'Tanggal berdiri', type: 'date' },
      { name: 'logo_path', label: 'Logo sekolah (PNG/JPG/WEBP)', type: 'image', full: true },
      { name: 'favicon_path', label: 'Favicon (PNG/JPG/WEBP)', type: 'image', full: true },
      { name: 'primary_color', label: 'Warna utama', type: 'color', required: true },
      { name: 'secondary_color', label: 'Warna kedua', type: 'color', required: true },
      { name: 'address', label: 'Alamat publik', type: 'textarea', full: true },
      { name: 'phone', label: 'Telepon publik' }, { name: 'email', label: 'Email publik', type: 'email' },
      { name: 'map_url', label: 'Tautan Google Maps', type: 'url', full: true },
      { name: 'instagram', label: 'Instagram URL', type: 'url' }, { name: 'facebook', label: 'Facebook URL', type: 'url' },
      { name: 'youtube', label: 'YouTube URL', type: 'url' }, { name: 'footer_text', label: 'Teks footer', type: 'textarea', full: true },
    ];
    const values = { ...row, instagram: social.instagram || '', facebook: social.facebook || '', youtube: social.youtube || '' };
    body.innerHTML = `<p class="muted">Sumber tunggal identitas website. Logo di header dan footer sekaligus menjadi tombol kembali ke beranda. Gunakan hanya aset resmi yang telah disetujui sekolah.</p><form id="branding-form" novalidate data-testid="cms-branding-form">${formFields(fields, values)}<div class="form-actions"><button class="btn btn-primary" type="submit">${icon('save')} Simpan branding</button></div></form>`;
    bindImageInputs($('#branding-form', body));
    $('#branding-form', body).onsubmit = (e) => { e.preventDefault(); withLoading(e.submitter, async () => {
      try {
        const v = readForm(e.currentTarget, fields);
        const payload = { ...v, social: { instagram: v.instagram, facebook: v.facebook, youtube: v.youtube } };
        delete payload.instagram; delete payload.facebook; delete payload.youtube;
        const r = await api('/cms/branding', { method: 'PUT', body: payload });
        state.branding = r.data;
        toast(r.message);
        rerender();
      } catch (err) { showErrors(e.currentTarget, err); }
    }); };
    return;
  }
  if (tab !== 'sections') { await collectionManager(body, tab); return; }
  const rows = (await api('/cms/sections')).data;
  const sf = [{ name: 'title', label: 'Judul', required: true, full: true }, { name: 'status', label: 'Status', type: 'select', placeholder: false, options: options('content') }, { name: 'image_path', label: 'Gambar utama', type: 'image', full: true }, { name: 'content', label: 'Isi', type: 'textarea', rows: 10 }];
  body.innerHTML = `<div class="table-wrap"><table class="data" data-testid="cms-sections-table"><thead><tr><th>Bagian</th><th>Judul</th><th>Status</th><th>Diperbarui</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td class="mono">${esc(r.section_key)}</td><td>${esc(r.title)}</td><td>${badge('content', r.status)}</td><td>${fmtDateTime(r.updated_at)}<div class="subtle">${esc(r.editor_name || '')}</div></td>
    <td><button class="btn btn-outline btn-sm" data-sec="${r.section_key}" data-testid="cms-section-edit-${r.section_key}">${icon('pencil')} Ubah</button></td></tr>`).join('')}</tbody></table></div>`;
  $$('[data-sec]', body).forEach((b) => { b.onclick = () => { const r = rows.find((x) => x.section_key === b.dataset.sec); formDialog({ title: `Ubah bagian: ${r.section_key}`, fields: sf, values: r,
    onSubmit: async (v) => { toast((await api(`/cms/sections/${r.section_key}`, { method: 'PUT', body: v })).message); rerender(); } }); }; });
}

export async function faqs(el) {
  const rows = (await api('/admissions/faqs')).data;
  const ff = [{ name: 'question', label: 'Pertanyaan', required: true, full: true }, { name: 'answer', label: 'Jawaban', type: 'textarea', required: true }, { name: 'sort_order', label: 'Urutan', type: 'number', default: 0 }, { name: 'status', label: 'Status', type: 'select', placeholder: false, options: options('content') }];
  el.innerHTML = `${dashHead('FAQ PPDB', '', `<button class="btn btn-primary" id="new-faq" data-testid="faq-create-btn">${icon('plus')} FAQ Baru</button>`)}
    <div class="table-wrap"><table class="data" data-testid="faq-table"><thead><tr><th>#</th><th>Pertanyaan</th><th>Status</th><th></th></tr></thead><tbody>${rows.length ? rows.map((r) => `<tr><td class="mono">${r.sort_order}</td><td>${esc(r.question)}</td><td>${badge('content', r.status)}</td>
    <td class="row"><button class="btn btn-outline btn-sm" data-edit="${r.id}" data-testid="faq-edit-${r.id}">${icon('pencil')}</button><button class="btn btn-danger btn-sm" data-del="${r.id}" data-testid="faq-delete-${r.id}">${icon('trash-2')}</button></td></tr>`).join('') : `<tr><td colspan="4">${empty('Belum ada FAQ.')}</td></tr>`}</tbody></table></div>`;
  const save = (id) => async (v) => { toast((await api(`/admissions/faqs${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: { ...v, sort_order: Number(v.sort_order || 0) } })).message); rerender(); };
  $('#new-faq', el).onclick = () => formDialog({ title: 'FAQ baru', fields: ff, values: { status: 'published' }, onSubmit: save(null) });
  $$('[data-edit]', el).forEach((b) => { b.onclick = () => formDialog({ title: 'Ubah FAQ', fields: ff, values: rows.find((x) => String(x.id) === b.dataset.edit), onSubmit: save(b.dataset.edit) }); });
  $$('[data-del]', el).forEach((b) => { b.onclick = async () => { if (await confirmDialog({ title: 'Hapus FAQ?', message: 'FAQ akan dihapus.', danger: true })) withLoading(b, async () => { toast((await api(`/admissions/faqs/${b.dataset.del}`, { method: 'DELETE' })).message); rerender(); }); }; });
}
