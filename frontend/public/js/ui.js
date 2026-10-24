import { api } from './api.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const icons = () => window.lucide && window.lucide.createIcons();
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const icon = (name, cls = '') => `<i data-lucide="${name}" class="${cls}"></i>`;

export function paragraphs(text) {
  return String(text || '').split(/\n{2,}/).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
}
export const isPlaceholder = (t) => /\[Belum dilengkapi\]|\[belum dilengkapi\]/.test(t || '');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export function fmtDate(v) {
  if (!v) return '—';
  const [d] = String(v).split(' ');
  const [y, m, dd] = d.split('-');
  return `${Number(dd)} ${MONTHS[Number(m) - 1]} ${y}`;
}
export const fmtDateTime = (v) => (v ? `${fmtDate(v)}, ${String(v).slice(11, 16)}` : '—');

// [label, varian, ikon] — status selalu ditampilkan dengan teks + ikon, bukan warna saja.
export const LABELS = {
  submission: { draft: ['Draf', 'neutral', 'file-pen'], submitted: ['Diajukan', 'info', 'send'], needs_revision: ['Perlu Perbaikan', 'bad', 'alert-triangle'], complete: ['Lengkap Administratif', 'ok', 'check-circle'], cancelled: ['Dibatalkan', 'neutral', 'x-circle'] },
  selection: { not_processed: ['Belum Diproses', 'neutral', 'circle-dashed'], in_process: ['Dalam Proses', 'info', 'loader'], pending_decision: ['Menunggu Penetapan', 'warn', 'hourglass'], accepted: ['Diterima', 'ok', 'award'], rejected: ['Tidak Diterima', 'bad', 'x-circle'], waitlist: ['Daftar Tunggu', 'warn', 'list-ordered'] },
  rereg: { not_open: ['Belum Dibuka', 'neutral', 'lock'], awaiting_confirmation: ['Menunggu Konfirmasi', 'warn', 'hand'], in_process: ['Dalam Proses', 'info', 'loader'], awaiting_verification: ['Menunggu Verifikasi', 'warn', 'clock'], needs_revision: ['Perlu Perbaikan', 'bad', 'alert-triangle'], completed: ['Selesai', 'ok', 'check-circle'], withdrawn: ['Tidak Dilanjutkan', 'neutral', 'log-out'] },
  integration: { not_processed: ['Belum Diproses', 'neutral', 'circle-dashed'], ready: ['Siap Diproses', 'info', 'database'], in_process: ['Dalam Proses', 'info', 'loader'], success: ['Berhasil', 'ok', 'check-circle'], failed: ['Gagal', 'bad', 'x-circle'], needs_review: ['Perlu Pemeriksaan', 'warn', 'search'] },
  doc: { not_uploaded: ['Belum Diunggah', 'neutral', 'upload'], pending: ['Menunggu Verifikasi', 'warn', 'clock'], verified: ['Terverifikasi', 'ok', 'check-circle'], needs_revision: ['Perlu Perbaikan', 'bad', 'alert-triangle'], rejected: ['Ditolak', 'bad', 'x-circle'] },
  period: { draft: ['Draf', 'neutral', 'file-pen'], scheduled: ['Terjadwal', 'info', 'calendar'], active: ['Aktif', 'ok', 'radio'], closed: ['Ditutup', 'warn', 'lock'], archived: ['Diarsipkan', 'neutral', 'archive'] },
  content: { draft: ['Draf', 'neutral', 'file-pen'], published: ['Terbit', 'ok', 'globe'], archived: ['Arsip', 'neutral', 'archive'] },
  approval: { submitted: ['Menunggu Persetujuan', 'warn', 'hourglass'], approved: ['Disetujui', 'info', 'check'], rejected: ['Dikembalikan', 'bad', 'undo-2'], published: ['Dipublikasikan', 'ok', 'megaphone'] },
  active: { 1: ['Aktif', 'ok', 'check-circle'], 0: ['Nonaktif', 'neutral', 'ban'] },
  proposed: { accepted: ['Usulan: Diterima', 'info', 'award'], rejected: ['Usulan: Tidak Diterima', 'info', 'x-circle'], waitlist: ['Usulan: Daftar Tunggu', 'info', 'list-ordered'] },
};
export const STAGE_LABEL = { registration: 'Pendaftaran', verification: 'Verifikasi', selection: 'Seleksi', announcement: 'Pengumuman', re_registration: 'Daftar Ulang' };
export const label = (group, v) => (LABELS[group][v] || [v || '—'])[0];
export function badge(group, v, testid) {
  const [text, kind, ic] = LABELS[group][v] || [v || '—', 'neutral', 'circle'];
  return `<span class="badge b-${kind}" ${testid ? `data-testid="${testid}"` : ''}>${icon(ic)} ${esc(text)}</span>`;
}
export const options = (group) => Object.entries(LABELS[group]).map(([value, [l]]) => ({ value, label: l }));

export function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('data-testid', `toast-${type}`);
  el.innerHTML = `${icon(type === 'error' ? 'alert-circle' : 'check-circle')}<div>${esc(message)}</div>`;
  $('#toasts').appendChild(el);
  icons();
  setTimeout(() => el.remove(), 5000);
}

export const empty = (msg, ic = 'inbox') => `<div class="empty" data-testid="empty-state">${icon(ic)}<div>${esc(msg)}</div></div>`;
export const stat = (ic, k, v, testid) => `<div class="stat reveal" data-testid="${testid}"><div class="k">${icon(ic)} ${esc(k)}</div><div class="v">${esc(v ?? 0)}</div></div>`;

export async function withLoading(btn, fn) {
  if (btn.classList.contains('loading')) return;
  btn.classList.add('loading'); btn.disabled = true;
  try { return await fn(); } finally { btn.classList.remove('loading'); btn.disabled = false; }
}

// ===== Modal =====
export function openModal(title, body, testid = 'modal') {
  const d = $('#modal');
  d.setAttribute('data-testid', testid);
  d.innerHTML = `<div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Tutup" data-testid="modal-close-btn">${icon('x')}</button></div><div class="modal-body">${body}</div>`;
  d.querySelector('[data-close]').onclick = () => d.close();
  if (!d.open) d.showModal();
  icons();
  return d;
}

export function confirmDialog({ title, message, confirmText = 'Ya, lanjutkan', danger, notes, notesRequired }) {
  return new Promise((resolve) => {
    const d = openModal(title, `<p>${esc(message)}</p>
      ${notes ? `<div class="field"><label for="cd-notes">${esc(notes)}${notesRequired ? ' <span class="req">*</span>' : ''}</label><textarea id="cd-notes" class="input" data-testid="confirm-notes-input"></textarea><span class="err" id="cd-err"></span></div>` : ''}
      <div class="form-actions"><button class="btn btn-outline" data-act="no" data-testid="confirm-cancel-btn">Batal</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="yes" data-testid="confirm-ok-btn">${esc(confirmText)}</button></div>`, 'confirm-dialog');
    let done = false;
    const finish = (v) => { if (!done) { done = true; d.close(); resolve(v); } };
    d.querySelector('[data-act=no]').onclick = () => finish(null);
    d.querySelector('[data-act=yes]').onclick = () => {
      const n = d.querySelector('#cd-notes');
      if (notesRequired && n && !n.value.trim()) { d.querySelector('#cd-err').textContent = 'Wajib diisi.'; return; }
      finish({ notes: n ? n.value.trim() : '' });
    };
    d.addEventListener('close', () => finish(null), { once: true });
  });
}

// ===== Form builder =====
function fieldHtml(f, v) {
  const id = `f-${f.name}`;
  const req = f.required ? ' <span class="req">*</span>' : '';
  const tid = `data-testid="field-${f.name.replace(/_/g, '-')}"`;
  const common = `id="${id}" name="${f.name}" class="input" ${f.required ? 'required' : ''} ${tid}`;
  let control;
  if (f.type === 'textarea') control = `<textarea ${common} rows="${f.rows || 5}">${esc(v)}</textarea>`;
  else if (f.type === 'select') control = `<select ${common}>${f.placeholder !== false ? `<option value="">${esc(f.placeholder || '— Pilih —')}</option>` : ''}${(f.options || []).map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(v ?? '') ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  else if (f.type === 'checkbox') return `<div class="field ${f.full ? 'full' : ''}"><label class="check"><input type="checkbox" id="${id}" name="${f.name}" ${v ? 'checked' : ''} ${tid}> ${esc(f.label)}</label>${f.help ? `<span class="help">${esc(f.help)}</span>` : ''}</div>`;
  else if (f.type === 'checkboxes') control = `<div class="checks" ${tid}>${f.options.map((o) => `<label class="check"><input type="checkbox" name="${f.name}" value="${esc(o.value)}" ${(v || []).map(String).includes(String(o.value)) ? 'checked' : ''}> ${esc(o.label)}</label>`).join('')}</div>`;
  else if (f.type === 'image') control = `<input type="hidden" name="${f.name}" value="${esc(v)}"><div class="row"><input type="file" accept="image/png,image/jpeg,image/webp" data-image-for="${f.name}" class="input" ${tid}><span class="subtle" data-image-label="${f.name}">${v ? esc(v) : 'Belum ada gambar'}</span></div>`;
  else control = `<input type="${f.type || 'text'}" ${common} value="${esc(v)}" ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''} ${f.autocomplete ? `autocomplete="${f.autocomplete}"` : ''}>`;
  return `<div class="field ${f.full || f.type === 'textarea' ? 'full' : ''}"><label for="${id}">${esc(f.label)}${req}</label>${control}${f.help ? `<span class="help">${esc(f.help)}</span>` : ''}<span class="err" data-err="${f.name}"></span></div>`;
}

export const formFields = (fields, values = {}) => `<div class="form-grid">${fields.map((f) => fieldHtml(f, values[f.name] ?? f.default ?? '')).join('')}</div>`;

export function readForm(form, fields) {
  const out = {};
  fields.forEach((f) => {
    if (f.type === 'checkbox') out[f.name] = form.querySelector(`[name="${f.name}"]`).checked;
    else if (f.type === 'checkboxes') out[f.name] = $$(`[name="${f.name}"]:checked`, form).map((i) => i.value);
    else out[f.name] = form.querySelector(`[name="${f.name}"]`).value.trim();
  });
  return out;
}

export function bindImageInputs(form) {
  $$('[data-image-for]', form).forEach((inp) => {
    inp.onchange = async () => {
      const name = inp.dataset.imageFor;
      const lbl = form.querySelector(`[data-image-label="${name}"]`);
      const fd = new FormData(); fd.append('file', inp.files[0]);
      lbl.textContent = 'Mengunggah...';
      try {
        const r = await api('/cms/uploads', { method: 'POST', form: fd });
        form.querySelector(`input[name="${name}"]`).value = r.data.path;
        lbl.textContent = r.data.path;
      } catch (e) { lbl.textContent = e.message; toast(e.message, 'error'); }
    };
  });
}

export function showErrors(form, err) {
  $$('.err', form).forEach((e) => { e.textContent = ''; });
  $$('[aria-invalid]', form).forEach((e) => e.removeAttribute('aria-invalid'));
  let box = form.querySelector('.form-error');
  if (!box) { box = document.createElement('div'); box.className = 'form-error'; box.setAttribute('data-testid', 'form-error'); box.setAttribute('role', 'alert'); form.prepend(box); }
  box.textContent = err.message;
  (Array.isArray(err.details) ? err.details : []).forEach((d) => {
    if (typeof d !== 'object') return;
    const slot = form.querySelector(`[data-err="${d.field.split('.')[0]}"]`);
    if (slot) { slot.textContent = d.message; const inp = form.querySelector(`[name="${d.field.split('.')[0]}"]`); if (inp) inp.setAttribute('aria-invalid', 'true'); }
  });
  if (Array.isArray(err.details) && typeof err.details[0] === 'string') box.textContent = `${err.message} (${err.details.join(', ')})`;
}
export const clearErrors = (form) => { const b = form.querySelector('.form-error'); if (b) b.remove(); $$('.err', form).forEach((e) => { e.textContent = ''; }); };

export function formDialog({ title, fields, values, submitText = 'Simpan', onSubmit, intro = '' }) {
  const d = openModal(title, `${intro}<form novalidate data-testid="dialog-form">${formFields(fields, values)}<div class="form-actions"><button type="button" class="btn btn-outline" data-cancel data-testid="dialog-cancel-btn">Batal</button><button class="btn btn-primary" type="submit" data-testid="dialog-submit-btn">${esc(submitText)}</button></div></form>`, 'form-dialog');
  const form = d.querySelector('form');
  bindImageInputs(form);
  d.querySelector('[data-cancel]').onclick = () => d.close();
  form.onsubmit = (e) => {
    e.preventDefault();
    withLoading(form.querySelector('[type=submit]'), async () => {
      try { await onSubmit(readForm(form, fields)); d.close(); } catch (err) { showErrors(form, err); }
    });
  };
  return d;
}

// ===== Tabel server-side: pencarian, filter, pagination, empty state =====
export function dataTable({ el, endpoint, columns, filters = [], search = true, testid = 'data-table', emptyText = 'Belum ada data.', pageSize = 10, extraParams = () => ({}) }) {
  const st = { page: 1, q: '', f: {} };
  el.innerHTML = `<div class="table-tools">${search ? `<div class="search">${icon('search')}<input class="input" type="search" placeholder="Cari..." data-testid="${testid}-search" aria-label="Cari"></div>` : ''}
    ${filters.map((f) => `<select class="input" data-filter="${f.name}" data-testid="${testid}-filter-${f.name.replace(/_/g, '-')}" aria-label="${esc(f.label)}"><option value="">${esc(f.label)}: Semua</option>${f.options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select>`).join('')}</div>
    <div class="table-wrap"><table class="data" data-testid="${testid}"><thead><tr>${columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody></tbody></table></div>
    <div class="pager"><span data-info></span><div class="row"><button class="btn btn-outline btn-sm" data-prev data-testid="${testid}-prev">${icon('chevron-left')} Sebelumnya</button><button class="btn btn-outline btn-sm" data-next data-testid="${testid}-next">Berikutnya ${icon('chevron-right')}</button></div></div>`;
  const tbody = el.querySelector('tbody');
  let timer;
  async function load() {
    tbody.innerHTML = `<tr><td colspan="${columns.length}"><div class="skeleton"></div></td></tr>`;
    const params = new URLSearchParams({ page: st.page, page_size: pageSize, ...(st.q ? { q: st.q } : {}), ...Object.fromEntries(Object.entries({ ...st.f, ...extraParams() }).filter(([, v]) => v)) });
    try {
      const r = await api(`${endpoint}${endpoint.includes('?') ? '&' : '?'}${params}`);
      const rows = r.data || [];
      tbody.innerHTML = rows.length ? rows.map((row) => `<tr>${columns.map((c) => `<td>${c.render ? c.render(row) : esc(row[c.key] ?? '—')}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${columns.length}">${empty(emptyText)}</td></tr>`;
      const total = r.meta ? r.meta.total : rows.length;
      const pages = Math.max(1, Math.ceil(total / pageSize));
      el.querySelector('[data-info]').textContent = `Halaman ${st.page} dari ${pages} · ${total} data`;
      el.querySelector('[data-prev]').disabled = st.page <= 1;
      el.querySelector('[data-next]').disabled = st.page >= pages;
      icons();
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="${columns.length}"><div class="form-error">${esc(e.message)}</div></td></tr>`;
    }
  }
  const s = el.querySelector('input[type=search]');
  if (s) s.oninput = () => { clearTimeout(timer); timer = setTimeout(() => { st.q = s.value.trim(); st.page = 1; load(); }, 300); };
  $$('[data-filter]', el).forEach((sel) => { sel.onchange = () => { st.f[sel.dataset.filter] = sel.value; st.page = 1; load(); }; });
  el.querySelector('[data-prev]').onclick = () => { st.page -= 1; load(); };
  el.querySelector('[data-next]').onclick = () => { st.page += 1; load(); };
  load();
  return { reload: load };
}
