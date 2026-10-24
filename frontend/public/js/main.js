import { api, state, loadMe } from './api.js';
import { esc, icon, icons, $, $$, toast } from './ui.js';
import * as company from './pages/company.js';
import * as ppdb from './pages/ppdb.js';
import * as auth from './pages/auth.js';
import { renderDashboard } from './pages/dashboard.js';

const COMPANY_LINKS = [
  ['/', 'Beranda'], ['/profil', 'Profil'], ['/sejarah', 'Sejarah'], ['/visi-misi', 'Visi & Misi'], ['/identitas', 'Identitas'],
  ['/guru-staf', 'Kepala Sekolah / Guru'], ['/program-keahlian', 'Program Keahlian'], ['/ekstrakurikuler', 'Ekstrakurikuler'], ['/kegiatan', 'Kegiatan'], ['/fasilitas', 'Fasilitas'], ['/berita', 'Berita & Artikel'], ['/pengumuman', 'Pengumuman'],
  ['/galeri', 'Galeri'], ['/prestasi', 'Prestasi'], ['/kontak', 'Kontak'], ['/lokasi', 'Lokasi'], ['/yayasan', 'Yayasan'],
];
export const PPDB_LINKS = [
  ['/ppdb', 'Beranda PPDB', 'home'], ['/ppdb/informasi', 'Informasi PPDB', 'info'], ['/ppdb/jalur', 'Jalur Pendaftaran', 'git-branch'],
  ['/ppdb/persyaratan', 'Persyaratan', 'file-check'], ['/ppdb/jadwal', 'Jadwal', 'calendar-days'], ['/ppdb/kuota', 'Kuota Penerimaan', 'users'],
  ['/ppdb/alur', 'Alur Pendaftaran', 'route'], ['/ppdb/faq', 'FAQ', 'help-circle'], ['/ppdb/pengumuman', 'Pengumuman', 'megaphone'],
  ['/ppdb/kontak', 'Kontak PPDB', 'phone'], ['/portal?from=ppdb', 'Login Pendaftar', 'log-in'], ['/portal/daftar', 'Registrasi Pendaftar', 'user-plus'],
];

const ROUTES = [
  ['/', company.home], ['/profil', company.section('profil')], ['/sejarah', company.section('sejarah')], ['/visi-misi', company.section('visi_misi')],
  ['/identitas', company.section('identitas')], ['/yayasan', company.section('yayasan')], ['/kontak', company.contact], ['/lokasi', company.location],
  ['/guru-staf', company.list('staff_profiles')], ['/program-keahlian', company.list('programs')], ['/ekstrakurikuler', company.list('extracurriculars')], ['/kegiatan', company.list('events')], ['/fasilitas', company.list('facilities')], ['/berita', company.list('news')],
  ['/pengumuman', company.list('announcements')], ['/galeri', company.list('gallery')], ['/prestasi', company.list('achievements')],
  ['/guru-staf/:slug', company.detail('staff_profiles')], ['/program-keahlian/:slug', company.detail('programs')], ['/ekstrakurikuler/:slug', company.detail('extracurriculars')], ['/kegiatan/:slug', company.detail('events')], ['/fasilitas/:slug', company.detail('facilities')], ['/berita/:slug', company.detail('news')],
  ['/pengumuman/:slug', company.detail('announcements')], ['/prestasi/:slug', company.detail('achievements')], ['/galeri/:slug', company.detail('gallery')],
  ['/ppdb', ppdb.home], ['/ppdb/:page', ppdb.page],
  ['/portal', auth.login], ['/portal/daftar', auth.register], ['/portal/lupa-sandi', auth.forgot], ['/portal/reset-sandi', auth.reset],
  ['/dashboard', renderDashboard], ['/dashboard/:section', renderDashboard], ['/dashboard/:section/:id', renderDashboard],
];

function match(pathname) {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  for (const [pattern, handler] of ROUTES) {
    const pp = pattern.split('/').filter(Boolean);
    if (pp.length !== parts.length) continue;
    const params = {};
    if (pp.every((p, i) => (p.startsWith(':') ? (params[p.slice(1)] = decodeURIComponent(parts[i])) : p === parts[i]))) return { handler, params };
  }
  return null;
}

const areaOf = (p) => (p.startsWith('/ppdb') ? 'ppdb' : p.startsWith('/portal') || p.startsWith('/dashboard') ? 'portal' : 'company');

async function ensureSystemConfig() {
  if (state.systemConfig) return state.systemConfig;
  try { state.systemConfig = (await api('/system/public-config')).data || {}; } catch { state.systemConfig = {}; }
  return state.systemConfig;
}
async function ensureBranding(force = false) {
  if (state.branding && !force) return state.branding;
  try {
    state.branding = (await api('/public/branding')).data || {};
  } catch {
    state.branding = { school_name: 'SMKS Nila Harapan TIK Sunggal', short_name: 'SMK Nila Harapan' };
  }
  const b = state.branding;
  const primary = /^#[0-9a-f]{6}$/i.test(b.primary_color || '') ? b.primary_color : '#0f766e';
  const secondary = /^#[0-9a-f]{6}$/i.test(b.secondary_color || '') ? b.secondary_color : '#123047';
  document.documentElement.style.setProperty('--g700', primary);
  document.documentElement.style.setProperty('--g600', primary);
  document.documentElement.style.setProperty('--g800', secondary);
  document.documentElement.style.setProperty('--g900', secondary);
  document.documentElement.style.setProperty('--dark', secondary);
  const name = b.school_name || 'SMKS Nila Harapan TIK Sunggal';
  document.title = `${name} — Sistem Informasi Sekolah`;
  let favicon = document.querySelector('link[rel="icon"]');
  if (!favicon) { favicon = document.createElement('link'); favicon.rel = 'icon'; document.head.appendChild(favicon); }
  if (b.favicon_path) favicon.href = b.favicon_path;
  return b;
}

function renderHeader(area) {
  const u = state.user;
  const nav = [['/', 'Company Profile', 'company', '01'], ['/ppdb', 'PPDB', 'ppdb', '02'], ['/portal', 'Portal SIAKAD', 'portal', '03']];
  $('#site-header').innerHTML = `<nav class="navbar" aria-label="Navigasi utama"><div class="container">
    <a href="/" class="brand brand-mark" aria-label="Kembali ke beranda" data-testid="nav-brand-logo">${state.branding?.logo_path ? `<img class="brand-logo" src="${esc(state.branding.logo_path)}" alt="Logo ${esc(state.branding.short_name || state.branding.school_name || 'sekolah')}" loading="eager">` : '<span class="seal" aria-hidden="true">NH</span>'}<span class="brand"><span class="brand-title">${esc(state.branding?.short_name || 'SMK Nila Harapan')}</span><span class="brand-subtitle">${esc((state.branding?.school_name || 'SMKS Nila Harapan TIK Sunggal').replace(/^SMKS?\s*/i, '').toUpperCase())}</span></span></a>
    <button class="icon-btn nav-toggle" id="nav-toggle" aria-label="Buka menu utama" aria-expanded="false" data-testid="nav-mobile-toggle">${icon('menu')}</button>
    <div class="nav-main" id="nav-main">${nav.map(([h, l, a, n]) => `<a href="${h}" class="${area === a ? 'active' : ''}" data-testid="nav-${a}-link"><span class="step">${n}</span>${l}</a>`).join('')}</div>
    <div class="nav-actions">${u ? `
      <a href="/dashboard/notifikasi" class="icon-btn" aria-label="Notifikasi" data-testid="nav-notifications-btn">${icon('bell')}${state.unread ? `<span class="dot" data-testid="nav-unread-count">${state.unread}</span>` : ''}</a>
      <div class="user-menu" id="user-menu"><button class="btn btn-outline" id="user-menu-btn" aria-haspopup="true" aria-expanded="false" data-testid="nav-user-menu-btn">${icon('user-circle')}<span class="btn-label">${esc(u.full_name.split(' ')[0])}</span></button>
        <div class="menu" role="menu"><div class="who"><strong>${esc(u.full_name)}</strong><div class="subtle">${esc(u.role_name)}</div></div>
        <a href="/dashboard" data-testid="nav-dashboard-link">${icon('layout-dashboard')} Dashboard</a><a href="/dashboard/akun" data-testid="nav-account-link">${icon('settings')} Pengaturan Akun</a>
        <button id="logout-btn" data-testid="nav-logout-btn">${icon('log-out')} Keluar</button></div></div>`
    : `<a href="/portal" class="btn btn-primary" data-testid="nav-login-btn">${icon('log-in')}<span class="btn-label">Login</span></a>`}</div></div></nav>`;
  $('#nav-toggle').onclick = () => { const m = $('#nav-main'); m.classList.toggle('open'); $('#nav-toggle').setAttribute('aria-expanded', m.classList.contains('open')); };
  const um = $('#user-menu');
  if (um) {
    $('#user-menu-btn').onclick = (e) => { e.stopPropagation(); um.classList.toggle('open'); $('#user-menu-btn').setAttribute('aria-expanded', um.classList.contains('open')); };
    $('#logout-btn').onclick = async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); state.user = null; state.csrf = null; toast('Anda telah keluar.'); navigate('/portal'); };
  }
}

function renderSubnav(area, path) {
  const el = $('#subnav');
  if (area === 'company') {
    el.innerHTML = `<nav class="subnav" aria-label="Menu Company Profile"><div class="container">${COMPANY_LINKS.map(([h, l]) => `<a href="${h}" class="${path === h || (h !== '/' && path.startsWith(h)) ? 'active' : ''}" data-testid="company-subnav-${h === '/' ? 'beranda' : h.slice(1)}">${l}</a>`).join('')}</div></nav>`;
  } else if (area === 'ppdb') {
    const cur = PPDB_LINKS.find(([h]) => h === path);
    el.innerHTML = `<nav class="subnav" aria-label="Menu PPDB"><div class="container"><button class="ppdb-burger" id="ppdb-burger" aria-controls="ppdb-drawer" aria-expanded="false" data-testid="ppdb-hamburger-btn">${icon('menu')} Menu PPDB</button>
      <span class="subtle">PPDB Online ${cur ? `· <strong>${esc(cur[1])}</strong>` : ''}</span></div></nav>`;
    $('#ppdb-burger').onclick = openDrawer;
  } else el.innerHTML = '';
}

async function renderDrawerContent(path) {
  let status = '';
  try {
    const d = (await api('/admissions/public')).data;
    status = d.period ? `<div class="caption" style="color:var(--mint)">Tahun Ajaran ${esc(d.period.academic_year)}</div><strong>${d.registration_open ? 'Pendaftaran sedang dibuka' : 'Pendaftaran belum/tidak dibuka'}</strong>` : '<strong>Belum ada periode penerimaan</strong>';
  } catch { status = '<strong>Status pendaftaran tidak tersedia</strong>'; }
  $('#ppdb-drawer').innerHTML = `<div class="drawer-head"><strong>Menu PPDB</strong><button class="icon-btn" id="drawer-close" aria-label="Tutup menu PPDB" data-testid="ppdb-drawer-close-btn">${icon('x')}</button></div>
    <div class="drawer-body"><div class="drawer-status" data-testid="ppdb-drawer-status">${status}</div>
    ${PPDB_LINKS.map(([h, l, ic], i) => `${i === 10 ? '<div class="drawer-sep"></div>' : ''}<a href="${h}" class="${h === path ? 'active' : ''}" data-testid="ppdb-menu-${h === '/ppdb' ? 'beranda' : h.includes('from=ppdb') ? 'login' : h.includes('/daftar') ? 'registrasi' : h.split('/').pop()}">${icon(ic)} ${esc(l)}</a>`).join('')}</div>`;
  $('#drawer-close').onclick = closeDrawer;
  applySystemConfig();
  icons();
}

let lastFocus = null;
function openDrawer() {
  lastFocus = document.activeElement;
  $('#ppdb-drawer').classList.add('open'); $('#ppdb-drawer').setAttribute('aria-hidden', 'false'); $('#overlay').classList.add('open');
  const b = $('#ppdb-burger'); if (b) b.setAttribute('aria-expanded', 'true');
  setTimeout(() => { const f = $('#ppdb-drawer a, #ppdb-drawer button'); if (f) f.focus(); }, 50);
}
export function closeDrawer() {
  $('#ppdb-drawer').classList.remove('open'); $('#ppdb-drawer').setAttribute('aria-hidden', 'true'); $('#overlay').classList.remove('open');
  const b = $('#ppdb-burger'); if (b) b.setAttribute('aria-expanded', 'false');
  if (lastFocus) lastFocus.focus();
}

function renderFooter(path) {
  if (path.startsWith('/dashboard')) { $('#site-footer').innerHTML = ''; return; }
  $('#site-footer').innerHTML = `<div class="footer"><div class="container"><div class="cols">
    <div><a class="brand brand-mark" href="/" aria-label="Kembali ke beranda">${state.branding?.logo_path ? `<img class="brand-logo footer-logo" src="${esc(state.branding.logo_path)}" alt="Logo ${esc(state.branding.short_name || 'sekolah')}">` : '<span class="seal" aria-hidden="true">NH</span>'}<span><span class="brand-title" style="color:#fff">${esc(state.branding?.short_name || 'SMK Nila Harapan')}</span><span class="brand-subtitle">${esc(state.branding?.tagline || 'TIK SUNGGAL')}</span></span></a><p class="mt">${esc(state.branding?.address || 'Jl. Binjai Km 11,2, Mulyorejo, Sunggal, Deli Serdang, Sumatera Utara')}</p>${state.branding?.phone ? `<p>Telepon: ${esc(state.branding.phone)}</p>` : ''}${state.branding?.email ? `<p>Email: ${esc(state.branding.email)}</p>` : ''}</div>
    <div><h4>Company Profile</h4><ul><li><a href="/profil">Profil Sekolah</a></li><li><a href="/program-keahlian">Program Keahlian</a></li><li><a href="/berita">Berita</a></li><li><a href="/kontak">Kontak</a></li></ul></div>
    <div><h4>PPDB</h4><ul><li><a href="/ppdb">Beranda PPDB</a></li><li><a href="/ppdb/persyaratan">Persyaratan</a></li><li><a href="/ppdb/jadwal">Jadwal</a></li><li><a href="/portal/daftar">Registrasi</a></li></ul></div>
    <div><h4>Portal SIAKAD</h4><ul><li><a href="/portal">Login</a></li><li><a href="/portal/lupa-sandi">Pemulihan Kata Sandi</a></li><li><a href="/portal#bantuan">Bantuan Akses</a></li></ul></div>
    </div><div class="bottom">© ${new Date().getFullYear()} ${esc(state.branding?.school_name || 'SMKS Nila Harapan TIK Sunggal')} · ${esc(state.branding?.footer_text || 'Data pribadi dikelola sesuai ketentuan perlindungan data pribadi yang berlaku di Indonesia.')}</div></div></div>`;
}

export function errorPage(code) {
  const t = { 401: ['Perlu Login', 'Silakan login untuk mengakses halaman ini.'], 403: ['Akses Ditolak', 'Akun Anda tidak memiliki izin untuk halaman ini.'], 404: ['Halaman Tidak Ditemukan', 'Halaman yang Anda cari tidak tersedia.'] }[code];
  return `<div class="error-page" data-testid="error-page-${code}"><div class="code">${code}</div><h2>${t[0]}</h2><p class="muted">${t[1]}</p><div class="row" style="justify-content:center"><a class="btn btn-primary" href="/">Ke Beranda</a>${code === 401 ? '<a class="btn btn-outline" href="/portal">Login</a>' : ''}</div></div>`;
}

export async function refreshUnread() {
  if (!state.user) { state.unread = 0; return; }
  try { state.unread = (await api('/notifications')).meta.unread; } catch { state.unread = 0; }
}

export async function render() {
  await ensureSystemConfig();
  const applySystemConfig = () => {
    const systemNotice = state.systemConfig?.maintenance_notice;
    const systemSupport = state.systemConfig?.support_contact_note;
    const notice = document.getElementById('system-maintenance-notice');
    if (notice) { notice.innerHTML = systemNotice ? `${icon('triangle-alert')}<span>${esc(systemNotice)}</span>` : ''; icons(); }
    const help = document.querySelector('[data-testid="portal-help"] p');
    if (help && systemSupport) help.textContent = systemSupport;
  };
  applySystemConfig();

  await ensureBranding();
  const path = location.pathname;
  const area = areaOf(path);
  await refreshUnread();
  renderHeader(area);
  renderSubnav(area, path);
  renderFooter(path);
  if (area === 'ppdb') renderDrawerContent(path);
  const m = match(path);
  const main = $('#main');
  if (!m) main.innerHTML = errorPage(404);
  else {
    try { await m.handler(main, m.params, new URLSearchParams(location.search)); } catch (e) {
      main.innerHTML = e.status === 401 ? errorPage(401) : e.status === 403 ? errorPage(403) : e.status === 404 ? errorPage(404) : `<div class="container section"><div class="form-error">${esc(e.message)}</div></div>`;
    }
  }
  applySystemConfig();
  icons();
}

export function navigate(to, replace) {
  window.dispatchEvent(new Event('app:navigate'));
  if (replace) history.replaceState({}, '', to); else history.pushState({}, '', to);
  window.scrollTo(0, 0);
  render();
}

document.addEventListener('click', (e) => {
  const um = $('#user-menu'); if (um && !um.contains(e.target)) um.classList.remove('open');
  const a = e.target.closest('a');
  if (!a || a.target || a.hasAttribute('download') || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const href = a.getAttribute('href');
  if (!href || !href.startsWith('/') || href.startsWith('/api') || href.startsWith('/uploads')) return;
  e.preventDefault();
  const url = new URL(href, location.origin);
  if (url.pathname === location.pathname && url.search === location.search && url.hash) { const t = document.getElementById(url.hash.slice(1)); if (t) t.scrollIntoView(); return; }
  navigate(href);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#ppdb-drawer').classList.contains('open')) closeDrawer(); });
$('#overlay').addEventListener('click', closeDrawer);
window.addEventListener('popstate', render);

loadMe().then(render);
