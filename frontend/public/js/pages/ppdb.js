import { api, state } from '../api.js';
import { esc, icon, paragraphs, fmtDate, fmtDateTime, empty, STAGE_LABEL } from '../ui.js';
import { errorPage } from '../main.js';

const getData = async () => (await api('/admissions/public')).data;
const head = (title, lead) => `<section class="page-head"><div class="container"><div class="breadcrumb"><a href="/ppdb">PPDB</a> / ${esc(title)}</div><h1 data-testid="page-title">${esc(title)}</h1>${lead ? `<p class="muted prose">${esc(lead)}</p>` : ''}</div></section>`;
const wrap = (inner) => `<section class="section"><div class="container">${inner}</div></section>`;

function statusBanner(d) {
  if (!d.period) return `<div class="status-banner closed" data-testid="ppdb-status-banner">${icon('calendar-x')}<div><strong>Belum ada periode penerimaan</strong><div>Informasi akan diumumkan oleh Admin Sekolah.</div></div></div>`;
  return d.registration_open
    ? `<div class="status-banner open" data-testid="ppdb-status-banner">${icon('door-open')}<div><strong>Pendaftaran dibuka</strong><div>${esc(d.period.name)} · Tahun Ajaran ${esc(d.period.academic_year)}</div></div></div>`
    : `<div class="status-banner closed" data-testid="ppdb-status-banner">${icon('lock')}<div><strong>Pendaftaran belum dibuka atau sudah ditutup</strong><div>${esc(d.period.name)}. Pengajuan baru tidak dapat dikirim saat ini.</div></div></div>`;
}

const stagesList = (stages) => (stages.length ? `<ol class="timeline" data-testid="ppdb-schedule">${stages.map((s) => {
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return `<li class="${s.start_at <= now && now <= s.end_at ? 'now' : ''}"><strong>${esc(STAGE_LABEL[s.stage_type])}</strong><div class="subtle">${fmtDateTime(s.start_at)} — ${fmtDateTime(s.end_at)}</div>${s.notes ? `<div class="muted">${esc(s.notes)}</div>` : ''}</li>`;
}).join('')}</ol>` : empty('Jadwal belum ditetapkan.', 'calendar'));

const pathsGrid = (paths, showQuota) => (paths.length ? `<div class="grid g-3">${paths.map((p) => `<div class="card reveal" data-testid="ppdb-path-card">
  <div class="icon-tile">${icon('git-branch')}</div><h3>${esc(p.name)}</h3><p class="muted">${esc(p.description || '')}</p>
  ${p.special_requirements ? `<div class="subtle"><strong>Persyaratan khusus:</strong> ${esc(p.special_requirements)}</div>` : ''}
  ${showQuota ? `<dl class="kv mt"><dt>Kuota</dt><dd class="mono">${p.quota == null ? 'Belum ditetapkan' : esc(p.quota)}</dd><dt>Pengajuan masuk</dt><dd class="mono">${esc(p.applicant_count)}</dd></dl>` : ''}</div>`).join('')}</div>` : empty('Jalur penerimaan belum ditetapkan.', 'git-branch'));

const reqTable = (reqs) => (reqs.length ? `<div class="table-wrap"><table class="data" data-testid="ppdb-requirements-table"><thead><tr><th>Dokumen</th><th>Tahap</th><th>Jalur</th><th>Sifat</th><th>Format & Ukuran</th></tr></thead><tbody>
  ${reqs.map((r) => `<tr><td><strong>${esc(r.name)}</strong><div class="subtle">${esc(r.description || '')}</div></td><td>${r.stage === 'application' ? 'Pendaftaran' : 'Daftar Ulang'}</td><td>${esc(r.path_name || 'Semua jalur')}</td>
  <td>${r.is_required ? '<span class="badge b-warn">Wajib</span>' : '<span class="badge b-neutral">Opsional</span>'}</td><td class="mono">${esc(r.allowed_types.toUpperCase())} · maks ${esc(r.max_size_kb)} KB</td></tr>`).join('')}</tbody></table></div>`
  : empty('Persyaratan dokumen belum ditetapkan.', 'file-check'));

const FLOW = [
  ['Buat akun', 'Registrasi akun pendaftar menggunakan email aktif.'], ['Lengkapi formulir', 'Isi data diri, orang tua/wali, pendidikan asal, dan pilih jalur.'],
  ['Unggah dokumen', 'Unggah dokumen sesuai persyaratan dan format yang ditentukan.'], ['Kirim pengajuan', 'Periksa pratinjau lalu kirim; bukti pendaftaran dapat dicetak.'],
  ['Verifikasi Admin Sekolah', 'Admin Sekolah memeriksa dokumen dan meminta perbaikan bila diperlukan.'], ['Pengumuman hasil', 'Hasil seleksi resmi tampil di dashboard setelah dipublikasikan.'],
  ['Daftar ulang', 'Peserta diterima mengonfirmasi dan melengkapi daftar ulang.'],
];
const flowList = `<ol class="steps" data-testid="ppdb-flow">${FLOW.map(([t, d]) => `<li><strong>${t}</strong><div class="muted">${d}</div></li>`).join('')}</ol>`;

const ctas = (d) => `<div class="hero-actions">${d.registration_open ? `<a class="btn btn-primary" href="/portal/daftar" data-testid="ppdb-register-btn">${icon('user-plus')} Daftar Sekarang</a>`
  : `<button class="btn btn-primary" disabled data-testid="ppdb-register-btn" title="Pendaftaran tidak dibuka">${icon('lock')} Pendaftaran Ditutup</button>`}
  <a class="btn btn-outline" href="${state.user ? '/dashboard' : '/portal?from=ppdb'}" data-testid="ppdb-login-btn">${icon('log-in')} Login Pendaftar</a></div>`;

export async function home(main) {
  const d = await getData();
  main.innerHTML = `<section class="hero"><div class="container hero-grid"><div class="reveal">
    <span class="pill">${icon('calendar-check')} ${d.period ? `PPDB T.A. ${esc(d.period.academic_year)}` : 'PPDB Online'}</span>
    <h1 data-testid="ppdb-hero-title">Penerimaan Peserta Didik Baru</h1>
    <p class="lead">SMKS Nila Harapan TIK Sunggal membuka layanan pendaftaran daring. Ikuti tahapan, siapkan dokumen, dan pantau status pengajuan Anda secara langsung.</p>
    ${statusBanner(d)}${ctas(d)}</div>
    <div class="hero-panel reveal"><div class="caption" style="color:var(--mint)">Periode Penerimaan</div><h3 style="color:#fff;margin-top:6px">${esc(d.period ? d.period.name : 'Belum ditetapkan')}</h3>
      ${d.period ? `<dl><div class="fact"><dt>Tahun ajaran</dt><dd>${esc(d.period.academic_year)}</dd></div><div class="fact"><dt>Jenjang</dt><dd>${esc(d.period.level)}</dd></div>
      <div class="fact"><dt>Periode</dt><dd>${fmtDate(d.period.start_date)} — ${fmtDate(d.period.end_date)}</dd></div><div class="fact"><dt>Jalur</dt><dd>${d.paths.length} jalur tersedia</dd></div></dl>` : ''}</div></div></section>
  <section class="section alt"><div class="container"><div class="section-head"><div><div class="caption">Tahapan</div><h2>Alur pendaftaran</h2></div><a class="btn btn-outline" href="/ppdb/alur">Detail alur ${icon('arrow-right')}</a></div>${flowList}</div></section>
  <section class="section"><div class="container grid g-2"><div><div class="caption">Jadwal Penting</div><h2>Jadwal tahapan</h2>${stagesList(d.stages)}</div>
    <div><div class="caption">Persyaratan</div><h2>Ringkasan dokumen</h2>${d.requirements.length ? `<ul>${d.requirements.slice(0, 6).map((r) => `<li>${esc(r.name)} ${r.is_required ? '<span class="badge b-warn">Wajib</span>' : '<span class="badge b-neutral">Opsional</span>'}</li>`).join('')}</ul>` : empty('Belum ditetapkan.')}<a class="btn btn-outline" href="/ppdb/persyaratan">Lihat semua persyaratan</a></div></div></section>
  <section class="section alt"><div class="container"><div class="section-head"><div><div class="caption">Jalur & Kuota</div><h2>Jalur penerimaan</h2></div></div>${pathsGrid(d.paths, true)}</div></section>
  <section class="section"><div class="container grid g-2"><div class="faq"><div class="caption">FAQ</div><h2>Pertanyaan umum</h2>${faqList(d.faqs.slice(0, 4))}</div>
    <div><div class="caption">Pengumuman PPDB</div><h2>Informasi terbaru</h2>${annList(d.announcements)}
    <div class="card mt" data-testid="ppdb-contact-card"><h3>${icon('phone')} ${esc(d.contact ? d.contact.title : 'Kontak PPDB')}</h3>${paragraphs(d.contact ? d.contact.content : 'Belum dilengkapi.')}</div>
    <div class="card mt"><h3>${icon('school')} Tentang Sekolah</h3><p class="muted">SMKS Nila Harapan TIK Sunggal · Yayasan Perguruan Nila Harapan · berdiri 21 Mei 2002 · Jl. Binjai Km 11,2, Sunggal, Deli Serdang.</p><a href="/profil">Profil lengkap sekolah →</a></div></div></div></section>`;
}

const faqList = (faqs) => (faqs.length ? faqs.map((f) => `<details data-testid="faq-item"><summary>${esc(f.question)}</summary><div class="mt">${paragraphs(f.answer)}</div></details>`).join('') : empty('Belum ada FAQ.', 'help-circle'));
const annList = (anns) => (anns.length ? anns.map((a) => `<a class="card hover card-link mb" href="/pengumuman/${esc(a.slug)}" data-testid="ppdb-announcement-item"><div class="subtle">${fmtDate(a.published_at)}</div><strong>${esc(a.title)}</strong><div class="muted">${esc(a.summary || '')}</div></a>`).join('') : empty('Belum ada pengumuman PPDB.', 'megaphone'));

const PAGES = {
  informasi: ['Informasi PPDB', (d) => `${statusBanner(d)}${d.period ? `<dl class="kv mt card"><dt>Periode</dt><dd>${esc(d.period.name)}</dd><dt>Tahun ajaran</dt><dd>${esc(d.period.academic_year)}</dd><dt>Jenjang</dt><dd>${esc(d.period.level)}</dd><dt>Tanggal</dt><dd>${fmtDate(d.period.start_date)} — ${fmtDate(d.period.end_date)}</dd><dt>Keterangan</dt><dd>${paragraphs(d.period.description)}</dd></dl>` : ''}${ctas(d)}`],
  jalur: ['Jalur Pendaftaran', (d) => pathsGrid(d.paths, false) + d.paths.filter((p) => p.terms).map((p) => `<div class="card mt"><h3>Ketentuan ${esc(p.name)}</h3>${paragraphs(p.terms)}</div>`).join('')],
  persyaratan: ['Persyaratan', (d) => reqTable(d.requirements)],
  jadwal: ['Jadwal', (d) => stagesList(d.stages)],
  kuota: ['Kuota Penerimaan', (d) => `<p class="muted">Kuota ditetapkan oleh sekolah. "Belum ditetapkan" berarti kuota resmi belum diumumkan.</p>${pathsGrid(d.paths, true)}`],
  alur: ['Alur Pendaftaran', () => flowList],
  faq: ['FAQ', (d) => `<div class="faq">${faqList(d.faqs)}</div>`],
  pengumuman: ['Pengumuman PPDB', (d) => annList(d.announcements)],
  kontak: ['Kontak PPDB', (d) => `<div class="card" data-testid="ppdb-contact-card">${paragraphs(d.contact ? d.contact.content : 'Belum dilengkapi.')}</div>`],
};

export async function page(main, { page: p }) {
  const def = PAGES[p];
  if (!def) { main.innerHTML = errorPage(404); return; }
  const d = await getData();
  main.innerHTML = head(def[0]) + wrap(def[1](d));
}
