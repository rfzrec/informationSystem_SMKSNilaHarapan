import { api } from '../api.js';
import { esc, icon, paragraphs, isPlaceholder, fmtDate, empty } from '../ui.js';

const COLL = {
  programs: { title: 'Program Keahlian', base: '/program-keahlian', ic: 'cpu', intro: 'Program keahlian yang diselenggarakan sekolah.' },
  facilities: { title: 'Fasilitas Sekolah', base: '/fasilitas', ic: 'building-2', intro: 'Sarana dan prasarana pendukung pembelajaran.' },
  news: { title: 'Berita & Artikel', base: '/berita', ic: 'newspaper', intro: 'Kabar terbaru dan tulisan dari lingkungan sekolah.' },
  announcements: { title: 'Pengumuman Umum', base: '/pengumuman', ic: 'megaphone', intro: 'Pengumuman resmi sekolah untuk masyarakat.' },
  gallery: { title: 'Galeri Foto', base: '/galeri', ic: 'image', intro: 'Dokumentasi kegiatan sekolah.' },
  achievements: { title: 'Prestasi', base: '/prestasi', ic: 'trophy', intro: 'Capaian siswa dan sekolah.' },
  extracurriculars: { title: 'Ekstrakurikuler', base: '/ekstrakurikuler', ic: 'users', intro: 'Kegiatan pengembangan minat dan bakat siswa.' },
  events: { title: 'Kegiatan Sekolah', base: '/kegiatan', ic: 'calendar-days', intro: 'Agenda dan dokumentasi kegiatan resmi sekolah.' },
  staff_profiles: { title: 'Kepala Sekolah, Guru & Staf', base: '/guru-staf', ic: 'graduation-cap', intro: 'Informasi publik pimpinan, guru, dan staf sekolah.' },
};
const ADDRESS = 'Jl. Binjai Km 11,2, Mulyorejo, Sunggal, Deli Serdang, Sumatera Utara';

const pageHead = (title, crumb, lead) => `<section class="page-head"><div class="container"><div class="breadcrumb"><a href="/">Company Profile</a> / ${esc(crumb)}</div><h1 data-testid="page-title">${esc(title)}</h1>${lead ? `<p class="muted prose">${esc(lead)}</p>` : ''}</div></section>`;
const placeholderNote = `<div class="placeholder-note mb" data-testid="placeholder-note">${icon('info')}<span>Sebagian informasi resmi belum dilengkapi. Konten akan diperbarui oleh pihak sekolah melalui CMS.</span></div>`;

const profile = async () => (await api('/public/profile')).data;
const listOf = async (c, n = 6, extra = '') => (await api(`/public/content/${c}?page_size=${n}${extra}`)).data;

function card(c, item) {
  const meta = COLL[c];
  return `<a class="card hover card-link reveal" href="${meta.base}/${esc(item.slug)}" data-testid="content-card-${esc(item.slug)}">
    <div class="thumb">${item.image_path ? `<img src="${esc(item.image_path)}" alt="${esc(item.title)}" loading="lazy">` : icon(meta.ic)}</div>
    ${item.published_at && c !== 'programs' && c !== 'facilities' ? `<div class="subtle">${fmtDate(item.published_at)}</div>` : ''}
    <h3>${esc(item.title)}</h3>${item.staff_role ? `<p class="subtle">${esc(({principal:'Kepala Sekolah',teacher:'Guru',staff:'Staf',organization:'Struktur Organisasi'})[item.staff_role] || item.staff_role)}</p>` : ''}${item.starts_at ? `<p class="subtle">${fmtDate(item.starts_at)}${item.location ? ` · ${esc(item.location)}` : ''}</p>` : ''}<p class="muted">${esc(item.summary || '')}</p></a>`;
}

export async function home(main) {
  const [p, news, ann, adm, branding] = await Promise.all([profile(), listOf('news', 3), listOf('announcements', 3, '&category=general'), api('/admissions/public').then((r) => r.data), api('/public/branding').then((r) => r.data).catch(() => ({}))]);
  const schoolName = branding.school_name || 'SMKS Nila Harapan TIK Sunggal';
  const address = branding.address || ADDRESS;
  const established = branding.established_on ? fmtDate(branding.established_on) : '21 Mei 2002';
  const hero = p.beranda || { title: schoolName, content: '' };
  main.innerHTML = `<section class="hero"><div class="container hero-grid">
    <div class="reveal"><span class="pill">${icon('school')} Yayasan Perguruan Nila Harapan</span>
      <h1 data-testid="home-hero-title">${esc(hero.title)}</h1><p class="lead">${esc(hero.content)}</p>
      <div class="hero-actions"><a class="btn btn-primary" href="/profil" data-testid="home-profile-btn">${icon('book-open')} Kenali Sekolah</a>
      <a class="btn btn-outline" href="/ppdb" data-testid="home-ppdb-btn">${icon('clipboard-list')} Informasi PPDB</a></div></div>
    <div class="hero-panel reveal" data-testid="home-facts-panel">${hero.image_path ? `<img class="cover" src="${esc(hero.image_path)}" alt="">` : ''}
      <div class="caption" style="color:var(--mint)">Sejak</div><div class="big">2002</div><p style="color:#d1fae5">Berdiri pada 21 Mei 2002</p>
      <dl><div class="fact"><dt>Sekolah</dt><dd>SMKS Nila Harapan TIK Sunggal</dd></div><div class="fact"><dt>Yayasan</dt><dd>Yayasan Perguruan Nila Harapan</dd></div><div class="fact"><dt>Alamat</dt><dd>${ADDRESS}</dd></div>
      <div class="fact"><dt>PPDB</dt><dd>${adm.period ? `${esc(adm.period.academic_year)} · ${adm.registration_open ? 'Pendaftaran dibuka' : 'Pendaftaran belum/tidak dibuka'}` : 'Belum ada periode aktif'}</dd></div></dl></div></div></section>
  <section class="section alt"><div class="container"><div class="section-head"><div><div class="caption">Ekosistem Sekolah</div><h2>Satu pintu layanan sekolah</h2></div></div>
    <div class="grid g-3">
      <a class="card hover card-link reveal" href="/profil" data-testid="eco-company-card"><div class="icon-tile">${icon('landmark')}</div><div class="caption">01</div><h3>Company Profile</h3><p class="muted">Profil, sejarah, visi misi, program keahlian, fasilitas, berita, dan kontak sekolah.</p></a>
      <a class="card hover card-link reveal" href="/ppdb" data-testid="eco-ppdb-card"><div class="icon-tile">${icon('clipboard-check')}</div><div class="caption">02</div><h3>PPDB Online</h3><p class="muted">Informasi penerimaan, registrasi, pengisian formulir, unggah dokumen, dan pemantauan status.</p></a>
      <a class="card hover card-link reveal" href="/portal" data-testid="eco-portal-card"><div class="icon-tile">${icon('shield-check')}</div><div class="caption">03</div><h3>Portal SIAKAD</h3><p class="muted">Layanan internal sekolah dengan dashboard sesuai peran pengguna.</p></a>
    </div></div></section>
  <section class="section"><div class="container"><div class="section-head"><div><div class="caption">Kabar Sekolah</div><h2>Berita terbaru</h2></div><a class="btn btn-outline" href="/berita">Semua berita ${icon('arrow-right')}</a></div>
    ${news.length ? `<div class="grid g-3">${news.map((n) => card('news', n)).join('')}</div>` : empty('Belum ada berita yang diterbitkan.', 'newspaper')}</div></section>
  <section class="section alt"><div class="container"><div class="section-head"><div><div class="caption">Informasi</div><h2>Pengumuman umum</h2></div><a class="btn btn-outline" href="/pengumuman">Semua pengumuman ${icon('arrow-right')}</a></div>
    ${ann.length ? `<div class="grid g-3">${ann.map((n) => card('announcements', n)).join('')}</div>` : empty('Belum ada pengumuman yang diterbitkan.', 'megaphone')}</div></section>`;
}

export const section = (key) => async (main) => {
  const p = await profile();
  const s = p[key];
  if (!s) { main.innerHTML = `${pageHead('Konten belum tersedia', key)}<section class="section"><div class="container">${empty('Bagian ini belum diterbitkan oleh pihak sekolah.')}</div></section>`; return; }
  main.innerHTML = `${pageHead(s.title, s.title)}<section class="section"><div class="container grid g-2" style="grid-template-columns:2fr 1fr;align-items:start">
    <article class="prose" data-testid="section-content">${isPlaceholder(s.content) ? placeholderNote : ''}${s.image_path ? `<img src="${esc(s.image_path)}" alt="${esc(s.title)}" class="mb" style="border-radius:var(--r-md)">` : ''}${paragraphs(s.content)}<p class="subtle">Diperbarui ${fmtDate(s.updated_at)}</p></article>
    <aside class="card"><div class="caption">Identitas Singkat</div><dl class="kv mt" style="grid-template-columns:1fr"><dt>Nama</dt><dd>SMKS Nila Harapan TIK Sunggal</dd><dt>Yayasan</dt><dd>Yayasan Perguruan Nila Harapan</dd><dt>Berdiri</dt><dd>21 Mei 2002</dd><dt>Alamat</dt><dd>${ADDRESS}</dd></dl></aside></div></section>`;
};

export const list = (c) => async (main) => {
  const meta = COLL[c];
  const items = await listOf(c, 24, c === 'announcements' ? '&category=general' : '');
  main.innerHTML = `${pageHead(meta.title, meta.title, meta.intro)}<section class="section"><div class="container">
    ${items.length ? `<div class="grid g-3" data-testid="content-list">${items.map((i) => card(c, i)).join('')}</div>` : empty(`${meta.title} belum diterbitkan. Konten akan dilengkapi oleh pihak sekolah melalui CMS.`, meta.ic)}</div></section>`;
};

export const detail = (c) => async (main, { slug }) => {
  const meta = COLL[c];
  const item = (await api(`/public/content/${c}/${encodeURIComponent(slug)}`)).data;
  main.innerHTML = `${pageHead(item.title, meta.title)}<section class="section"><div class="container"><article class="prose" data-testid="content-detail">
    <p class="subtle">${item.published_at ? `Diterbitkan ${fmtDate(item.published_at)}` : ''}${item.author_name ? ` · ${esc(item.author_name)}` : ''}${item.achievement_year ? ` · ${esc(item.achievement_year)}` : ''}${item.achievement_level ? ` · Tingkat ${esc(item.achievement_level)}` : ''}</p>
    ${item.image_path ? `<img src="${esc(item.image_path)}" alt="${esc(item.title)}" class="mb" style="border-radius:var(--r-md)">` : ''}
    ${item.summary ? `<p><strong>${esc(item.summary)}</strong></p>` : ''}${item.education ? `<p><strong>Pendidikan:</strong> ${esc(item.education)}</p>` : ''}${item.subjects ? `<p><strong>Mata pelajaran/bidang:</strong> ${esc(item.subjects)}</p>` : ''}${item.staff_role ? `<p><strong>Peran:</strong> ${esc(({principal:'Kepala Sekolah',teacher:'Guru',staff:'Staf',organization:'Struktur Organisasi'})[item.staff_role] || item.staff_role)}</p>` : ''}${item.starts_at ? `<p><strong>Waktu:</strong> ${fmtDate(item.starts_at)}${item.ends_at ? ` — ${fmtDate(item.ends_at)}` : ''}</p>` : ''}${item.location ? `<p><strong>Lokasi:</strong> ${esc(item.location)}</p>` : ''}${paragraphs(item.body)}<a class="btn btn-outline mt" href="${meta.base}">${icon('arrow-left')} Kembali</a></article></div></section>`;
};

export async function contact(main) {
  const p = await profile();
  const k = p.kontak; const kp = p.kontak_panitia;
  main.innerHTML = `${pageHead('Kontak Sekolah', 'Kontak')}<section class="section"><div class="container grid g-2">
    <div class="card" data-testid="contact-school">${icon('building')}<h3 class="mt">${esc(k ? k.title : 'Kontak Sekolah')}</h3>${k && isPlaceholder(k.content) ? placeholderNote : ''}${paragraphs(k ? k.content : ADDRESS)}</div>
    <div class="card" data-testid="contact-ppdb">${icon('phone')}<h3 class="mt">${esc(kp ? kp.title : 'Kontak PPDB')}</h3>${paragraphs(kp ? kp.content : 'Belum dilengkapi.')}</div></div></section>`;
}

export async function location(main) {
  const p = await profile();
  const l = p.lokasi;
  const q = encodeURIComponent(`${l ? l.content : ADDRESS}`);
  main.innerHTML = `${pageHead('Lokasi Sekolah', 'Lokasi')}<section class="section"><div class="container"><p class="muted">${esc(l ? l.content : ADDRESS)}</p>
    <iframe class="map" title="Peta lokasi SMKS Nila Harapan" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=${q}&output=embed" data-testid="location-map"></iframe>
    <a class="btn btn-outline mt" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener" data-testid="location-open-maps">${icon('map-pin')} Buka di Google Maps</a></div></section>`;
}
