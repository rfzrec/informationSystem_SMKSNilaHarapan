import { api, state, loadMe } from '../api.js';
import { esc, icon, icons, $, fmtDateTime, empty, stat, formFields, readForm, showErrors, withLoading, toast, badge, STAGE_LABEL, fmtDate, confirmDialog, formDialog } from '../ui.js';
import { errorPage, navigate, refreshUnread } from '../main.js';
import * as applicant from './applicant.js';
import * as staff from './staff.js';
import * as adminPpdb from './admin-ppdb.js';
import * as sysadmin from './sysadmin.js';
import * as payroll from './payroll.js';
import * as workflows from './workflows.js';

const COMMON = [['notifikasi', 'Notifikasi', 'bell'], ['akun', 'Pengaturan Akun', 'user-cog']];
// Role PPDB dan pimpinan terpisah. Applicant tetap menjadi role stabil; account_stage
// menentukan apakah pengguna melihat portal PPDB atau portal akademik setelah aktivasi.
const MENUS = {
  applicantPortal: [['', 'Ringkasan PPDB', 'layout-dashboard'], ['formulir', 'Formulir Pendaftaran', 'file-pen'], ['bukti', 'Bukti Pendaftaran', 'printer'], ['hasil', 'Hasil Seleksi', 'award'], ['daftar-ulang', 'Daftar Ulang', 'clipboard-check'], ...COMMON],
  school_leader: [['', 'Ringkasan Pimpinan', 'layout-dashboard'], ...COMMON],
  siswa: [['', 'Ringkasan Akademik', 'layout-dashboard'], ['rapor', 'Rapor Saya', 'file-check'], ['bantuan', 'Bantuan Pendidikan', 'hand-coins'], ...COMMON],
  guru: [['', 'Ringkasan Guru', 'layout-dashboard'], ['absensi', 'Jadwal & Absensi', 'clipboard-check'], ['checkin', 'Presensi Kedatangan', 'map-pin-check'], ['nilai', 'Input Nilai', 'book-open-check'], ['pkl', 'Kegiatan PKL', 'briefcase-business'], ['honor', 'Realisasi & Slip Honor', 'wallet'], ...COMMON],
  admin: [['', 'Ringkasan Sekolah', 'layout-dashboard'], ['pengajuan', 'Pendaftar & PPDB', 'users'], ['integrasi', 'Integrasi Siswa', 'database'], ['cms', 'Website & Branding', 'layout-template'], ['akademik', 'Kesiswaan & Akademik', 'school'], ['wali-kelas', 'Penugasan Wali Kelas', 'user-round-check'], ['persetujuan-absen', 'Persetujuan Absensi', 'calendar-check'], ['kehadiran-guru', 'Kehadiran Mengajar', 'clipboard-check'], ['presensi-qr', 'QR Presensi Guru', 'scan-qr-code'], ['periode', 'Periode PPDB', 'calendar-range'], ['jalur', 'Jalur & Kuota', 'git-branch'], ['persyaratan', 'Persyaratan PPDB', 'file-check'], ['seleksi', 'Seleksi & Persetujuan', 'award'], ['cms-announcements', 'Pengumuman PPDB', 'megaphone'], ['faq', 'FAQ PPDB', 'help-circle'], ['rapor', 'Pemeriksaan & Publikasi Rapor', 'file-check'], ['bantuan', 'Bantuan Pendidikan', 'hand-coins'], ['kelulusan', 'Pemeriksaan Kelulusan', 'graduation-cap'], ['pkl', 'Kegiatan PKL', 'briefcase-business'], ['laporan', 'Laporan & Ekspor', 'bar-chart-3'], ['honor', 'Operasional & Honor', 'wallet'], ['audit', 'Riwayat Perubahan', 'history'], ...COMMON],
  superadmin: [['', 'Ringkasan Sistem', 'activity'], ['jurusan', 'Master Jurusan', 'layers'], ['guru', 'Master Akun Pegawai', 'users'], ['pengguna', 'Akun Admin', 'user-cog'], ['pengaturan', 'Pengaturan Sistem', 'sliders'], ['monitor-role', 'Monitoring Role', 'users-round'], ['monitor-bug', 'Monitoring Bug & Tes', 'bug'], ['audit', 'Audit Log', 'history'], ['log-error', 'Log Kesalahan', 'bug'], ...COMMON],
};

const HANDLERS = {
  applicantPortal: { '': applicant.overview, formulir: applicant.form, bukti: applicant.proof, hasil: applicant.result, 'daftar-ulang': applicant.reRegistration },
  siswa: { '': studentOverview, rapor: workflows.studentReportsPage, bantuan: workflows.educationAidPage },
  guru: { '': teacherOverview, absensi: teacherAttendancePage, checkin: workflows.teacherQrCheckinPage, nilai: workflows.teacherGradesPage, rapor: workflows.homeroomReportsPage, pkl: pklPage, honor: payroll.page },
  admin: { '': schoolOverview, pengajuan: staff.applications, periode: adminPpdb.periods, jalur: adminPpdb.paths, persyaratan: adminPpdb.requirements,
    seleksi: adminPpdb.selection, integrasi: staff.integration, 'cms-announcements': adminPpdb.announcements, faq: adminPpdb.faqs, cms: adminPpdb.cms,
    akademik: academicSetupPage, 'wali-kelas': homeroomPage, 'persetujuan-absen': attendanceReviewPage, 'kehadiran-guru': teacherAttendanceAdminPage,
    'presensi-qr': workflows.teacherQrAdminPage, rapor: workflows.homeroomReportsPage, bantuan: workflows.educationAidPage,
    kelulusan: workflows.graduationPage, pkl: pklPage, laporan: staff.reports, honor: payroll.page, audit: sysadmin.audit },
  school_leader: { '': schoolLeaderOverview },
  superadmin: { '': sysadmin.overview, jurusan: sysadmin.programs, guru: sysadmin.teachers, pengguna: sysadmin.users, pengaturan: sysadmin.settings, 'monitor-role': sysadmin.roleMonitoring, 'monitor-bug': sysadmin.bugMonitoring, audit: sysadmin.audit, 'log-error': sysadmin.errors },
};

export const dashHead = (title, sub, actions = '') => `<div class="dash-head"><div><h1 data-testid="dashboard-title">${esc(title)}</h1>${sub ? `<p class="muted" style="margin:0">${sub}</p>` : ''}</div><div class="row no-print">${actions}</div></div>`;

export async function renderDashboard(main, params) {
  if (!state.user) { main.innerHTML = errorPage(401); return; }
  const u = state.user;
  const section = params.section || '';
  if (u.must_change_password && section !== 'akun') { navigate('/dashboard/akun', true); return; }
  const dashboardKey = (u.role === 'applicant' && u.account_stage === 'applicant') || (u.role === 'siswa' && u.account_stage === 'applicant')
    ? 'applicantPortal'
    : ((u.role === 'applicant' || u.role === 'siswa') && u.account_stage === 'student' ? 'siswa' : u.role);
  const menu = [...(MENUS[dashboardKey] || [])];
  // Wali kelas adalah penugasan kelas-periode, bukan role. Menu hanya ditampilkan kepada Guru
  // yang memiliki penugasan wali kelas aktif; backend tetap memverifikasi setiap request.
  if (dashboardKey === 'guru') {
    try {
      const assigned = (await api('/academics/homeroom/mine')).data;
      if (assigned.length && !menu.some(([key]) => key === 'rapor')) menu.splice(4, 0, ['rapor', 'Pengelolaan Rapor Kelas', 'file-check']);
    } catch (err) { if (err.status !== 403) console.warn('Penugasan wali kelas tidak dapat dimuat:', err.message); }
  }
  main.innerHTML = `<div class="dash" data-testid="dashboard-${esc(dashboardKey)}"><aside class="sidebar" id="sidebar" aria-label="Menu dashboard">
    <div class="role" data-testid="sidebar-role"><span class="caption">Peran</span><strong>${esc(u.role_name)}</strong><span class="subtle">${esc(u.email)}</span></div>
    ${menu.map(([s, l, ic]) => `<a href="/dashboard${s ? `/${s}` : ''}" class="${s === section ? 'active' : ''}" data-testid="sidebar-${s || 'overview'}-link">${icon(ic)} ${esc(l)}</a>`).join('')}</aside>
    <div class="dash-main"><button class="btn btn-outline btn-sm dash-toggle mb no-print" id="dash-toggle" data-testid="sidebar-toggle-btn">${icon('panel-left')} Menu</button>
    ${u.must_change_password ? `<div class="notice warn mb no-print" data-testid="must-change-password-notice">${icon('key-round')}<span>Akun Anda menggunakan kata sandi sementara. <a href="/dashboard/akun">Ganti kata sandi sekarang</a>.</span></div>` : ''}
    <div id="dash-content"><div class="skeleton"></div></div></div></div>`;
  $('#dash-toggle').onclick = () => $('#sidebar').classList.toggle('open');
  const el = $('#dash-content');
  const handler = section === 'notifikasi' ? notificationsPage : section === 'akun' ? accountPage : (HANDLERS[dashboardKey] || {})[section];
  if (!handler) { el.innerHTML = errorPage(menu.some(([s]) => s === section) ? 404 : 403); return; }
  try { await handler(el, params); } catch (e) {
    el.innerHTML = e.status === 403 ? errorPage(403) : e.status === 404 ? errorPage(404) : `<div class="form-error">${esc(e.message)}</div>`;
  }
  icons();
}

export const rerender = () => navigate(location.pathname + location.search, true);

async function studentOverview(el) {
  const d = (await api('/academics/me')).data;
  const s = d.student;
  const gradeRows = d.grades.length ? d.grades.map((g) => `<tr><td>${esc(g.subject_name)}</td><td>${esc(g.title)}</td><td>${g.semester}</td><td>${Number(g.score).toLocaleString('id-ID')} / ${Number(g.max_score).toLocaleString('id-ID')}</td></tr>`).join('') : `<tr><td colspan="4">${empty('Nilai belum tersedia.')}</td></tr>`;
  const attendanceRows = d.attendance.length ? d.attendance.map((a) => `<tr><td>${fmtDateTime(a.recorded_at)}</td><td>${esc(a.subject_name || a.class_name || 'Presensi')}</td><td>${esc(({present:'Hadir',late:'Terlambat',sick:'Sakit',permission:'Izin',absent:'Alpa',pending_confirmation:'Belum dikonfirmasi'})[a.status] || a.status)}</td></tr>`).join('') : `<tr><td colspan="3">${empty('Riwayat presensi belum tersedia.')}</td></tr>`;
  const nextLesson = (d.todaySchedule || []).find((x) => String(x.starts_at).slice(0,5) >= new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
  const attendanceSummary = d.attendanceSummary || {};
  const scheduleRows = (d.todaySchedule || []).length ? d.todaySchedule.map((x) => `<tr><td>${esc(String(x.starts_at).slice(0,5))}–${esc(String(x.ends_at).slice(0,5))}</td><td>${esc(x.subject_name)}</td><td>${esc(x.teacher_name)}</td><td>${esc(x.room || 'Belum ditentukan')}</td><td>${x.confirmed ? esc(({present:'Hadir',late:'Terlambat',sick:'Sakit',permission:'Izin',absent:'Alpa',unmarked:'Belum diisi'})[x.attendance_status] || x.attendance_status) : 'Belum diabsen'}</td></tr>`).join('') : `<tr><td colspan="5">${empty('Tidak ada jadwal pelajaran hari ini.')}</td></tr>`;
  const invoiceRows = d.invoices.length ? d.invoices.map((i) => `<tr><td>${esc(i.description)}</td><td>Rp ${Number(i.amount).toLocaleString('id-ID')}</td><td>Rp ${Number(i.paid_amount).toLocaleString('id-ID')}</td><td>${esc(i.status)}</td></tr>`).join('') : `<tr><td colspan="4">${empty('Belum ada tagihan.')}</td></tr>`;
  el.innerHTML = `${dashHead(`Halo, ${s.full_name}`, 'Dashboard akademik siswa.')}
    <div class="grid g-3 mb"><div class="card"><div class="subtle">Nomor Induk</div><h3 class="mono">${esc(s.student_number)}</h3></div><div class="card"><div class="subtle">Kelas</div><h3>${esc(d.enrollment?.class_name || 'Belum ditempatkan')}</h3><div class="muted">${esc(d.enrollment ? `${d.enrollment.study_program} · ${d.enrollment.academic_year}${d.enrollment.homeroom_teacher ? ` · Wali kelas: ${d.enrollment.homeroom_teacher}` : ''}` : 'Hubungi operator sekolah')}</div></div><div class="card"><div class="subtle">Status Akun</div><h3>${esc(s.account_status === 'active' ? 'Aktif' : s.account_status)}</h3></div><div class="card"><div class="subtle">Jadwal Berikutnya</div><h3>${nextLesson ? esc(nextLesson.subject_name) : 'Tidak ada'}</h3><div class="muted">${nextLesson ? `${esc(String(nextLesson.starts_at).slice(0,5))} · ${esc(nextLesson.class_name)}` : 'Tidak ada jadwal berikutnya hari ini'}</div></div></div>
    <div class="grid g-3 mb">${[['Hadir',attendanceSummary.present || 0],['Terlambat',attendanceSummary.late || 0],['Izin',attendanceSummary.permission || 0],['Sakit',attendanceSummary.sick || 0],['Alpa',attendanceSummary.absent || 0],['Belum dikonfirmasi',attendanceSummary.pending || 0]].map(([label,value]) => `<div class="card"><div class="subtle">${label}</div><h2>${Number(value)}</h2><div class="muted">Sesi hari ini</div></div>`).join('')}</div>
    <div class="card mb"><h3>Jadwal Pelajaran Hari Ini</h3><div class="table-wrap"><table class="data"><thead><tr><th>Waktu</th><th>Mata Pelajaran</th><th>Guru</th><th>Ruang</th><th>Status Absensi</th></tr></thead><tbody>${scheduleRows}</tbody></table></div><p class="subtle mt">Status absensi hanya menjadi final setelah guru mengonfirmasi sesi. Belum diabsen bukan berarti hadir.</p></div>
    <div class="card mb"><h3>Nilai terbaru</h3><div class="table-wrap"><table class="data"><thead><tr><th>Mata Pelajaran</th><th>Penilaian</th><th>Semester</th><th>Nilai</th></tr></thead><tbody>${gradeRows}</tbody></table></div></div>
    <div class="card mb"><h3>Riwayat Presensi</h3><div class="table-wrap"><table class="data"><thead><tr><th>Waktu</th><th>Kelas/Mata Pelajaran</th><th>Status</th></tr></thead><tbody>${attendanceRows}</tbody></table></div></div>
    <div class="card mb"><h3>Riwayat Kehadiran PKL</h3>${(d.pklAttendance || []).length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Tanggal</th><th>Kegiatan</th><th>Lokasi</th><th>Status</th></tr></thead><tbody>${d.pklAttendance.map((p) => `<tr><td>${fmtDate(p.attendance_date)}</td><td>${esc(p.title)}</td><td>${esc(p.location || '—')}</td><td>${esc(({present:'Hadir PKL',sick:'Sakit',permission:'Izin',absent:'Alpa'})[p.status] || p.status)}</td></tr>`).join('')}</tbody></table></div>` : empty('Belum ada catatan kehadiran PKL.')}</div>
    <div class="card"><h3>Informasi Tagihan</h3><div class="table-wrap"><table class="data"><thead><tr><th>Tagihan</th><th>Jumlah</th><th>Terbayar</th><th>Status</th></tr></thead><tbody>${invoiceRows}</tbody></table></div><p class="subtle mt">Informasi ini merupakan pencatatan sekolah; pembayaran online belum tersedia.</p></div>`;
}

async function schoolOverview(el) {
  const response = await api('/dashboard');
  const d = response.data.overview || {};
  const title = 'Dashboard Admin Sekolah';
  const cards = [
    ['Jumlah Siswa', d.students ?? 0, 'users'],
    ['Guru Aktif', d.teachers ?? 0, 'graduation-cap'],
    ['Kelas Aktif', d.classes ?? 0, 'school'],
    ['Pendaftar PPDB', d.applications ?? 0, 'file-text'],
    ['Menunggu Tindak Lanjut', d.pending_applications ?? 0, 'clock'],
    ['Diterima', d.accepted_applications ?? 0, 'user-check'],
  ];
  el.innerHTML = `${dashHead(`Halo, ${state.user.full_name}`, `${title} · Ringkasan data sekolah dan PPDB dari database.`)}
    <div class="grid g-3 mb">${cards.map(([label, value, ic]) => `<div class="card" data-testid="overview-stat"><div class="row between"><span class="subtle">${label}</span>${icon(ic)}</div><h2>${Number(value).toLocaleString('id-ID')}</h2></div>`).join('')}</div>
    <div class="grid g-2"><div class="card"><h3>Pemantauan Sekolah</h3><p class="muted">Gunakan ringkasan ini untuk memantau kondisi sekolah. Rincian hanya tersedia melalui menu yang sesuai dengan hak akses akun.</p><ul><li>Data siswa dan guru aktif</li><li>Aktivitas pendaftaran peserta didik baru</li><li>Status tindak lanjut dan hasil seleksi</li></ul></div>
    <div class="card"><h3>Informasi Akun</h3><dl class="kv"><dt>Nama</dt><dd>${esc(state.user.full_name)}</dd><dt>Jabatan</dt><dd>${esc(state.user.role_name)}</dd><dt>Email</dt><dd>${esc(state.user.email)}</dd></dl><a class="btn btn-outline mt" href="/dashboard/akun">Pengaturan Akun</a></div></div>`;
}

async function schoolLeaderOverview(el) {
  const response = await api('/dashboard');
  const d = response.data.overview || {};
  const cards = [
    ['Siswa Terdaftar', d.students ?? 0, 'users'],
    ['Guru Aktif', d.teachers ?? 0, 'graduation-cap'],
    ['Kelas Aktif', d.classes ?? 0, 'school'],
    ['Pendaftar PPDB', d.applications ?? 0, 'file-text'],
    ['Perlu Tindak Lanjut', d.pending_applications ?? 0, 'clock'],
    ['Dinyatakan Diterima', d.accepted_applications ?? 0, 'user-check'],
  ];
  el.innerHTML = `${dashHead(`Halo, ${state.user.full_name}`, 'Dashboard Pimpinan Sekolah · ringkasan agregat untuk Kepala Sekolah dan Kepala Yayasan.')}
    <div class="notice mb">${icon('shield-check')}<span>Dashboard ini bersifat pemantauan. Perubahan data operasional tetap dilakukan oleh petugas yang memiliki kewenangan.</span></div>
    <div class="grid g-3 mb">${cards.map(([label, value, ic]) => `<div class="card" data-testid="leader-overview-stat"><div class="row between"><span class="subtle">${label}</span>${icon(ic)}</div><h2>${Number(value).toLocaleString('id-ID')}</h2></div>`).join('')}</div>
    <div class="card"><h3>Informasi Akun</h3><dl class="kv"><dt>Nama</dt><dd>${esc(state.user.full_name)}</dd><dt>Role</dt><dd>${esc(state.user.role_name)}</dd><dt>Email</dt><dd>${esc(state.user.email)}</dd></dl></div>`;
}

async function teacherOverview(el) {
  const response = await api('/dashboard');
  const d = response.data.overview || {};
  const cards = [
    ['Penugasan Mengajar', d.assignments ?? 0, 'book-open'],
    ['Total Realisasi', d.realizations ?? 0, 'clipboard-check'],
    ['Menunggu Verifikasi', d.pending_realizations ?? 0, 'clock'],
    ['Periode Honor Dibayar', d.paid_periods ?? 0, 'wallet'],
  ];
  let schedule = [];
  let scheduleError = '';
  try { schedule = (await api('/academics/teacher/today')).data; }
  catch (err) { scheduleError = err.status === 404 ? 'Akun guru belum ditautkan ke data guru aktif.' : err.message; }
  el.innerHTML = `${dashHead(`Halo, ${state.user.full_name}`, 'Ringkasan aktivitas mengajar. Konfirmasi absensi siswa tidak otomatis membuktikan kehadiran fisik guru.')}
    ${d.linked === false || scheduleError ? `<div class="notice warn mb">${icon('alert-triangle')}<span>${esc(scheduleError || 'Akun ini belum terhubung dengan data guru aktif. Hubungi Admin Sekolah.')}</span></div>` : ''}
    <div class="grid g-2 mb">${cards.map(([label, value, ic]) => `<div class="card" data-testid="overview-stat"><div class="row between"><span class="subtle">${label}</span>${icon(ic)}</div><h2>${Number(value).toLocaleString('id-ID')}</h2></div>`).join('')}</div>
    <div class="card mb"><div class="row between"><h3>Jadwal Mengajar Hari Ini</h3><a class="btn btn-outline btn-sm" href="/dashboard/absensi">Kelola Absensi</a></div>
    ${schedule.length ? `<div class="grid g-2">${schedule.map((x) => `<div class="card" data-testid="teacher-schedule-card"><div class="row between"><strong>${esc(x.subject_name)}</strong><span class="badge ${x.confirmed ? 'b-ok' : 'b-warn'}">${x.confirmed ? 'Absensi dikonfirmasi' : x.session_id ? 'Absensi belum dikonfirmasi' : 'Belum dimulai'}</span></div><p class="muted">${esc(x.class_name)} · ${esc(String(x.starts_at).slice(0,5))}–${esc(String(x.ends_at).slice(0,5))} · Ruang ${esc(x.room || '—')}</p><p class="subtle">${x.marked_count}/${x.student_count} siswa ditandai</p><button class="btn btn-primary" data-start-session="${Number(x.schedule_id)}" ${x.confirmed ? 'disabled' : ''}>${x.session_id ? 'Buka Absensi' : 'Mulai Absensi'}</button></div>`).join('')}</div>` : empty('Tidak ada jadwal mengajar hari ini, atau jadwal belum dimasukkan oleh Admin Sekolah.', 'calendar-off')}</div>
    <div class="grid g-2"><div class="card"><h3>Aktivitas Guru</h3><p class="muted">Gunakan menu Realisasi & Slip Honor untuk mencatat realisasi mengajar dan melihat informasi honor pribadi.</p><div class="row wrap mt"><a class="btn btn-primary" href="/dashboard/honor">Buka Realisasi & Slip Honor</a><a class="btn btn-outline" href="/dashboard/pkl">Kelola Kegiatan PKL</a></div></div>
    <div class="card"><h3>Informasi Akun</h3><dl class="kv"><dt>Nama</dt><dd>${esc(state.user.full_name)}</dd><dt>Email</dt><dd>${esc(state.user.email)}</dd><dt>Role</dt><dd>${esc(state.user.role_name)}</dd></dl></div></div>`;
  el.querySelectorAll('[data-start-session]').forEach((button) => {
    button.onclick = () => withLoading(button, async () => {
      try {
        const opened = await api('/academics/sessions/start', { method: 'POST', body: { schedule_id: Number(button.dataset.startSession) } });
        await openAttendanceSession(el, opened.data.id);
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}

async function teacherAttendancePage(el) {
  let schedule = [];
  try { schedule = (await api('/academics/teacher/today')).data; }
  catch (err) { el.innerHTML = `${dashHead('Jadwal & Absensi', 'Absensi per sesi pembelajaran.')}${`<div class="form-error">${esc(err.message)}</div>`}`; return; }
  el.innerHTML = `${dashHead('Jadwal & Absensi', 'Pilih sesi yang menjadi tanggung jawab Anda. Siswa yang belum diberi status tidak otomatis dianggap hadir.')}
    ${schedule.length ? `<div class="grid g-2">${schedule.map((x) => `<div class="card"><h3>${esc(x.subject_name)}</h3><p>${esc(x.class_name)} · ${esc(String(x.starts_at).slice(0,5))}–${esc(String(x.ends_at).slice(0,5))}</p><p class="muted">${x.student_count} siswa · ${x.marked_count} sudah ditandai</p><p>${x.confirmed ? 'Absensi disetujui Admin' : x.returned ? 'Dikembalikan Admin — perlu koreksi' : x.session_id ? (x.closed_at ? 'Menunggu persetujuan Admin' : 'Absensi masih draf') : 'Belum ada sesi absensi'}</p><button class="btn btn-primary" data-start-session="${Number(x.schedule_id)}" ${x.confirmed ? 'disabled' : ''}>${x.returned ? 'Perbaiki Absensi' : x.session_id ? 'Lanjutkan Absensi' : 'Mulai Absensi'}</button></div>`).join('')}</div>` : empty('Belum ada jadwal mengajar untuk hari ini.')}`;
  el.querySelectorAll('[data-start-session]').forEach((button) => {
    button.onclick = () => withLoading(button, async () => {
      try { const opened = await api('/academics/sessions/start', { method: 'POST', body: { schedule_id: Number(button.dataset.startSession) } }); if (opened.data.review_status === 'returned') await api(`/academics/sessions/${opened.data.id}/reopen-returned`, { method: 'POST', body: {} }); await openAttendanceSession(el, opened.data.id); }
      catch (err) { toast(err.message, 'error'); }
    });
  });
}

async function openAttendanceSession(el, sessionId) {
  const response = await api(`/academics/sessions/${sessionId}/roster`);
  const { session, students } = response.data;
  if (session.closed_at) { toast('Absensi sesi ini sudah dikonfirmasi.', 'error'); return; }
  const statusOptions = [['present','Hadir'],['permission','Izin'],['sick','Sakit'],['absent','Alpa']];
  el.innerHTML = `${dashHead('Pencatatan Absensi Siswa', 'Tandai setiap siswa sesuai hasil pemanggilan nama. Tidak ada status yang dipilih otomatis.', '<a class="btn btn-outline" href="/dashboard/absensi">Kembali ke Jadwal</a>')}
    <div class="card mb"><div class="row between"><div><strong>${students.length} siswa</strong><p class="subtle">Isi semua status sebelum konfirmasi.</p></div><div id="attendance-progress" class="badge b-warn">0/${students.length} ditandai</div></div>
    <div class="field"><label for="attendance-search">Cari nama siswa</label><input class="input" id="attendance-search" placeholder="Ketik nama atau nomor induk"></div>
    <div class="table-wrap"><table class="data"><thead><tr><th>Nama</th><th>Nomor Induk</th><th>Status Kehadiran</th></tr></thead><tbody>${students.map((student) => `<tr data-student-row="${esc(student.full_name.toLowerCase())} ${esc(student.student_number || '')}"><td>${esc(student.full_name)}</td><td>${esc(student.student_number || '—')}</td><td><select class="input" data-attendance-student="${Number(student.student_record_id)}"><option value="">— Belum ditandai —</option>${statusOptions.map(([v,l]) => `<option value="${v}" ${student.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>
    <div class="form-actions"><button class="btn btn-primary" id="confirm-attendance" disabled>Konfirmasi Absensi</button></div></div>`;
  const selects = [...el.querySelectorAll('[data-attendance-student]')];
  const updateProgress = () => { const count = selects.filter((x) => x.value).length; $('#attendance-progress', el).textContent = `${count}/${selects.length} ditandai`; $('#confirm-attendance', el).disabled = count !== selects.length || count === 0; };
  selects.forEach((x) => x.addEventListener('change', updateProgress));
  $('#attendance-search', el).oninput = (e) => { const term = e.target.value.toLowerCase(); el.querySelectorAll('[data-student-row]').forEach((row) => { row.hidden = !row.dataset.studentRow.includes(term); }); };
  updateProgress();
  $('#confirm-attendance', el).onclick = (event) => withLoading(event.currentTarget, async () => {
    const ok = await confirmDialog({ title: 'Konfirmasi absensi', message: `Anda akan menyimpan status kehadiran ${students.length} siswa. Setelah dikonfirmasi, koreksi memerlukan petugas berwenang. Pastikan seluruh status benar.`, confirmText: 'Simpan & Konfirmasi' });
    if (!ok) return;
    try {
      await api(`/academics/sessions/${sessionId}/confirm`, { method: 'POST', body: { records: selects.map((x) => ({ student_record_id: Number(x.dataset.attendanceStudent), status: x.value })) } });
      toast('Absensi berhasil dikonfirmasi. Status siswa kini tersedia di dashboard mereka.');
      await teacherOverview(el);
    } catch (err) { toast(err.message, 'error'); }
  });
}



async function academicSetupPage(el) {
  const optionsRes = await api('/academics/setup-options');
  const d = optionsRes.data;
  const yearOptions = d.academicYears.map((y) => `<option value="${Number(y.id)}">${esc(y.name)}${y.is_active ? ' · Aktif' : ''}</option>`).join('');
  const classOptions = d.classes.map((c) => `<option value="${Number(c.id)}" data-program-id="${Number(c.program_id || 0)}">${esc(c.name)} · ${esc(c.program_title || c.study_program)} · Kelas ${esc(c.grade_level)}</option>`).join('');
  const programOptions = (d.programs || []).map((p) => `<option value="${Number(p.id)}">${esc(p.code)} · ${esc(p.title)}</option>`).join('');
  const subjectOptions = d.subjects.filter((s) => Number(s.is_active)).map((s) => `<option value="${Number(s.id)}">${esc(s.code)} · ${esc(s.name)}</option>`).join('');
  const teacherOptions = d.teachers.map((t) => `<option value="${Number(t.id)}">${esc(t.teacher_code || '—')} · ${esc(t.full_name)}</option>`).join('');
  const studentOptions = d.students.map((st) => `<option value="${Number(st.id)}" data-program-id="${Number(st.program_id || 0)}" data-class-id="${Number(st.class_id || 0)}">${esc(st.full_name)} · ${esc(st.student_number)}${st.program_title ? ` · ${esc(st.program_code)} ${esc(st.program_title)}` : ' · Jurusan belum ditetapkan'}${st.class_name ? ` · Kelas ${esc(st.class_name)}` : ' · Belum ditempatkan'}</option>`).join('');
  const assignmentOptions = d.assignments.map((a) => `<option value="${Number(a.id)}">${esc(a.class_name)} · ${esc(a.subject_name)} · ${esc(a.teacher_name)}</option>`).join('');
  const days = [['1','Senin'],['2','Selasa'],['3','Rabu'],['4','Kamis'],['5','Jumat'],['6','Sabtu']];
  const dayName = (n) => days.find(([v]) => Number(v) === Number(n))?.[1] || n;
  const programTable = (d.programs || []).length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Kode</th><th>Jurusan</th><th>Pendaftar</th><th>Siswa aktif</th><th>Kelas aktif</th></tr></thead><tbody>${d.programs.map((p) => `<tr><td class="mono">${esc(p.code)}</td><td>${esc(p.title)}</td><td>${Number(p.applicant_count || 0)}</td><td>${Number(p.student_count || 0)}</td><td>${Number(p.class_count || 0)}</td></tr>`).join('')}</tbody></table></div>` : empty('Master jurusan belum dibuat Superadmin.');
  const teacherTable = (d.teachers || []).length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Kode unik</th><th>Nama guru</th><th>Nomor identitas</th></tr></thead><tbody>${d.teachers.map((t) => `<tr><td class="mono">${esc(t.teacher_code || '—')}</td><td>${esc(t.full_name)}</td><td>${esc(t.employee_number || '—')}</td></tr>`).join('')}</tbody></table></div>` : empty('Master guru belum dibuat Superadmin.');
  const studentTable = (d.students || []).length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Nomor induk</th><th>Nama siswa</th><th>Jurusan</th><th>Tingkat / Kelas</th><th>Aksi</th></tr></thead><tbody>${d.students.map((st) => `<tr><td class="mono">${esc(st.student_number)}</td><td>${esc(st.full_name)}</td><td>${esc(st.program_code || '—')} · ${esc(st.program_title || 'Belum ditetapkan')}</td><td>${st.class_name ? `Kelas ${esc(st.grade_level)} · ${esc(st.class_name)}` : 'Belum ditempatkan'}</td><td><div class="row"><button type="button" class="btn btn-outline btn-sm" data-edit-student="${Number(st.id)}">Edit data</button><button type="button" class="btn btn-outline btn-sm" data-change-student-placement="${Number(st.id)}">Jurusan / kelas</button></div></td></tr>`).join('')}</tbody></table></div>` : empty('Belum ada siswa aktif yang sudah terintegrasi dari PPDB.');
  const draftVersions = (d.rosterVersions || []).filter((v) => v.status === 'draft');
  const draftRosterHtml = draftVersions.length ? draftVersions.map((v) => {
    const rows = (d.draftSchedules || []).filter((x) => Number(x.roster_version_id) === Number(v.id));
    const table = rows.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Hari</th><th>Waktu</th><th>Kelas / Mapel</th><th>Guru</th><th>Ruang</th><th>Aksi</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${dayName(x.day_of_week)}</td><td>${esc(String(x.starts_at).slice(0,5))}–${esc(String(x.ends_at).slice(0,5))}</td><td>${esc(x.class_name)} / ${esc(x.subject_name)}</td><td>${esc(x.teacher_name)}</td><td>${esc(x.room || '—')}</td><td><button class="btn btn-outline btn-sm" data-remove-schedule="${Number(x.id)}">Hapus dari draf</button></td></tr>`).join('')}</tbody></table></div>` : empty('Draf roster kosong. Tambahkan jadwal sebelum publikasi.');
    return `<div class="card mb"><div class="row between"><div><h3>Draf roster v${Number(v.version_no)} · ${esc(v.academic_year)}</h3><p class="subtle">${rows.length} slot jadwal. Versi aktif belum berubah.</p></div><button class="btn btn-primary" data-publish-roster="${Number(v.id)}" ${rows.length ? '' : 'disabled'}>Validasi & Publikasikan</button></div>${table}</div>`;
  }).join('') : empty('Belum ada draf perubahan roster. Saat Admin menambah jadwal, sistem akan membuat versi draf secara otomatis.');
  const publishedVersions = (d.rosterVersions || []).filter((v) => v.status === 'published');
  const rosterHistoryHtml = publishedVersions.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Tahun ajaran</th><th>Versi</th><th>Slot</th><th>Diterbitkan</th></tr></thead><tbody>${publishedVersions.map((v) => `<tr><td>${esc(v.academic_year)}</td><td>v${Number(v.version_no)}</td><td>${Number(v.schedule_count)}</td><td>${fmtDateTime(v.published_at)}</td></tr>`).join('')}</tbody></table></div>` : empty('Belum ada roster yang diterbitkan.');
  el.innerHTML = `${dashHead('Data Akademik', 'Kelola data induk sekolah, penempatan siswa, penugasan guru, serta roster mingguan berversi. Jadwal baru menjadi aktif setelah draf divalidasi dan diterbitkan.')}
    <div class="grid g-2 mb">
      <form class="card" data-setup-form="year"><h3>Tahun Ajaran</h3><div class="field"><label>Nama tahun ajaran</label><input class="input" name="name" placeholder="2026/2027" pattern="[0-9]{4}/[0-9]{4}" required></div><div class="field"><label>Mulai</label><input class="input" name="starts_on" type="date" required></div><div class="field"><label>Selesai</label><input class="input" name="ends_on" type="date" required></div><label class="check"><input type="checkbox" name="is_active" checked> Jadikan tahun ajaran aktif</label><button class="btn btn-primary mt">Simpan Tahun Ajaran</button></form>
      <form class="card" data-setup-form="class"><h3>Tambah Kelas</h3><div class="field"><label>Tahun ajaran</label><select class="input" name="academic_year_id" required><option value="">Pilih tahun ajaran</option>${yearOptions}</select></div><div class="field"><label>Nama kelas</label><input class="input" name="name" placeholder="X TKJ 1" required maxlength="80"></div><div class="field"><label>Tingkat</label><select class="input" name="grade_level" required><option value="10">X</option><option value="11">XI</option><option value="12">XII</option></select></div><div class="field"><label>Jurusan</label><select class="input" name="program_id" required><option value="">Pilih jurusan</option>${programOptions}</select></div><button class="btn btn-primary mt" ${!d.academicYears.length ? 'disabled' : ''}>Tambah Kelas</button></form>
      <form class="card" data-setup-form="subject"><h3>Tambah Mata Pelajaran</h3><div class="field"><label>Kode</label><input class="input" name="code" required maxlength="30" placeholder="MTK-X"></div><div class="field"><label>Nama</label><input class="input" name="name" required maxlength="120"></div><div class="field"><label>Tingkat (opsional)</label><select class="input" name="grade_level"><option value="">Semua tingkat</option><option value="10">X</option><option value="11">XI</option><option value="12">XII</option></select></div><div class="field"><label>Jurusan (opsional untuk mapel umum)</label><select class="input" name="program_id"><option value="">Mapel umum</option>${programOptions}</select></div><button class="btn btn-primary mt">Tambah Mata Pelajaran</button></form>
      <form class="card" data-setup-form="enrollment"><h3>Penempatan / Pemindahan Siswa</h3><p class="subtle">Jurusan dan kelas selalu disimpan bersamaan. Riwayat penempatan lama dipertahankan.</p><div class="field"><label>Siswa aktif</label><select class="input" name="student_record_id" required><option value="">Pilih siswa</option>${studentOptions}</select></div><div class="field"><label>Jurusan</label><select class="input" name="program_id" required><option value="">Pilih jurusan</option>${programOptions}</select></div><div class="field"><label>Kelas tujuan</label><select class="input" name="class_id" required><option value="">Pilih kelas</option>${classOptions}</select></div><div class="field"><label>Tanggal mulai</label><input class="input" type="date" name="enrolled_on" required value="${new Date().toLocaleDateString('en-CA')}"></div><div class="field"><label>Alasan penempatan/perubahan</label><textarea class="input" name="reason" rows="3" minlength="5" required placeholder="Contoh: penempatan awal setelah aktivasi PPDB"></textarea></div><button class="btn btn-primary mt" ${!d.students.length || !d.classes.length ? 'disabled' : ''}>Simpan Penempatan</button></form>
      <form class="card" data-setup-form="assignment"><h3>Penugasan Mengajar</h3><div class="field"><label>Kelas</label><select class="input" name="class_id" required><option value="">Pilih kelas</option>${classOptions}</select></div><div class="field"><label>Mata pelajaran</label><select class="input" name="subject_id" required><option value="">Pilih mata pelajaran</option>${subjectOptions}</select></div><div class="field"><label>Guru</label><select class="input" name="teacher_record_id" required><option value="">Pilih guru aktif</option>${teacherOptions}</select></div><div class="field"><label>Jam pelajaran per minggu</label><input class="input" name="weekly_periods" type="number" min="1" max="48" value="1" required></div><button class="btn btn-primary mt" ${!d.classes.length || !d.subjects.length || !d.teachers.length ? 'disabled' : ''}>Buat Penugasan</button></form>
      <form class="card" data-setup-form="schedule"><h3>Susun Roster Mingguan</h3><p class="subtle">Jadwal masuk ke versi draf. Roster aktif tidak berubah sampai Admin menerbitkan versi baru.</p><div class="field"><label>Penugasan</label><select class="input" name="teaching_assignment_id" required><option value="">Pilih penugasan</option>${assignmentOptions}</select></div><div class="field"><label>Hari</label><select class="input" name="day_of_week" required>${days.map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}</select></div><div class="grid g-2"><div class="field"><label>Mulai</label><input class="input" name="starts_at" type="time" required></div><div class="field"><label>Selesai</label><input class="input" name="ends_at" type="time" required></div></div><div class="field"><label>Ruang</label><input class="input" name="room" maxlength="60"></div><button class="btn btn-primary mt" ${!d.assignments.length ? 'disabled' : ''}>Tambah Jadwal</button></form>
    </div>
    <div class="grid g-3 mb"><div class="card"><h3>Master Jurusan dari Superadmin</h3>${programTable}</div><div class="card"><h3>Master Guru & Kode Unik</h3>${teacherTable}</div><div class="card"><h3>Ringkasan Siswa Aktif</h3><p class="subtle">Program diambil dari pilihan PPDB; kelas ditetapkan Admin. Pendaftar belum aktif tidak ditampilkan sebagai siswa aktif.</p>${studentTable}</div></div>
    <div class="card mb"><div class="row between"><h3>Draf & Publikasi Roster Mingguan</h3><span class="subtle">Versi terbit tetap digunakan sampai versi baru disahkan.</span></div>${draftRosterHtml}</div>
    <div class="grid g-2 mb"><div class="card"><h3>Roster Aktif</h3>${rosterHistoryHtml}</div><div class="card"><h3>Kelas Terdaftar (${d.classes.length})</h3>${d.classes.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Kelas</th><th>Tingkat</th><th>Program</th><th>Wali Kelas</th></tr></thead><tbody>${d.classes.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.grade_level)}</td><td>${esc(c.program_title || c.study_program)}</td><td>${esc(c.homeroom_teacher || 'Belum ditetapkan')}</td></tr>`).join('')}</tbody></table></div>` : empty('Belum ada kelas. Tambahkan tahun ajaran terlebih dahulu.')}</div>
    <div class="card"><h3>Jadwal Terdaftar (${d.schedules.length})</h3>${d.schedules.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Hari</th><th>Waktu</th><th>Kelas / Mapel</th><th>Guru</th><th>Ruang</th></tr></thead><tbody>${d.schedules.map((x) => `<tr><td>${dayName(x.day_of_week)}</td><td>${esc(String(x.starts_at).slice(0,5))}–${esc(String(x.ends_at).slice(0,5))}</td><td>${esc(x.class_name)} / ${esc(x.subject_name)}</td><td>${esc(x.teacher_name)}</td><td>${esc(x.room || '—')}</td></tr>`).join('')}</tbody></table></div>` : empty('Belum ada jadwal pelajaran.')}</div></div>`;
  const reloadStudents = async () => academicSetupPage(el);
  el.querySelectorAll('[data-edit-student]').forEach((button) => { button.onclick = async () => {
    try {
      const id = Number(button.dataset.editStudent);
      const detail = (await api(`/academics/students/${id}/management`)).data;
      const fields = [
        { name: 'full_name', label: 'Nama lengkap', required: true },
        { name: 'nik', label: 'NIK (16 digit)', required: true },
        { name: 'nisn', label: 'NISN (10 digit, jika ada)' },
        { name: 'gender', label: 'Jenis kelamin', type: 'select', required: true, options: [{value:'L',label:'Laki-laki'},{value:'P',label:'Perempuan'}] },
        { name: 'birth_place', label: 'Tempat lahir' },
        { name: 'birth_date', label: 'Tanggal lahir', type: 'date', required: true },
        { name: 'religion', label: 'Agama' },
        { name: 'phone', label: 'Nomor kontak' },
        { name: 'address', label: 'Alamat lengkap', type: 'textarea', required: true, rows: 3 },
      ];
      formDialog({ title: `Edit data siswa · ${detail.student_number}`, intro: '<p class="subtle">Perubahan dicatat pada data induk dan profil PPDB sumber. Nomor induk tidak dapat diubah di formulir ini.</p>', fields, values: {
        full_name: detail.full_name || '', nik: detail.nik || '', nisn: detail.nisn || '', gender: detail.gender || '', birth_place: detail.birth_place || '',
        birth_date: String(detail.birth_date || '').slice(0,10), religion: detail.religion || '', phone: detail.applicant_phone || detail.account_phone || '', address: detail.address || '',
      }, onSubmit: async (values) => {
        const result = await api(`/academics/students/${id}/profile`, { method: 'PUT', body: values });
        toast(result.message); await reloadStudents();
      } });
    } catch (err) { toast(err.message, 'error'); }
  }; });
  el.querySelectorAll('[data-change-student-placement]').forEach((button) => { button.onclick = async () => {
    try {
      const id = Number(button.dataset.changeStudentPlacement);
      const detail = (await api(`/academics/students/${id}/management`)).data;
      const programs = (d.programs || []).filter((p) => Number(p.is_active));
      const classes = (d.classes || []).filter((c) => Number(c.is_active));
      if (!programs.length || !classes.length) { toast('Master jurusan dan kelas aktif harus tersedia terlebih dahulu.', 'error'); return; }
      const preferredProgram = Number(detail.program_id || detail.enrollment?.program_id || programs[0].id);
      const initialProgram = programs.some((p) => Number(p.id) === preferredProgram) ? preferredProgram : Number(programs[0].id);
      const classesFor = (programId) => classes.filter((c) => Number(c.program_id) === Number(programId));
      const fields = [
        { name: 'program_id', label: 'Jurusan aktif', type: 'select', required: true, options: programs.map((p) => ({ value: String(p.id), label: `${p.code} · ${p.title}` })) },
        { name: 'class_id', label: 'Kelas tujuan', type: 'select', required: true, options: classesFor(initialProgram).map((c) => ({ value: String(c.id), label: `${c.name} · Kelas ${c.grade_level} · ${c.academic_year || ''}` })) },
        { name: 'effective_on', label: 'Tanggal berlaku', type: 'date', required: true },
        { name: 'reason', label: 'Alasan perubahan', type: 'textarea', required: true, rows: 3 },
      ];
      const currentClass = Number(detail.enrollment?.class_id || 0);
      const preferredClass = classesFor(initialProgram).some((c) => Number(c.id) === currentClass) ? currentClass : Number(classesFor(initialProgram)[0]?.id || 0);
      const dlg = formDialog({ title: `Penempatan siswa · ${detail.student_number}`, intro: '<p class="subtle">Perubahan berlaku pada penempatan akademik. Pilihan jurusan pada formulir PPDB tetap tersimpan sebagai riwayat penerimaan. Wajib isi alasan dan tanggal efektif.</p>', fields, values: {
        program_id: String(initialProgram), class_id: String(preferredClass), effective_on: new Date().toLocaleDateString('en-CA'), reason: '',
      }, onSubmit: async (values) => {
        const result = await api(`/academics/students/${id}/program-class`, { method: 'PUT', body: values });
        toast(result.message); await reloadStudents();
      } });
      const programSelect = dlg.querySelector('[name="program_id"]');
      const classSelect = dlg.querySelector('[name="class_id"]');
      const refreshClassOptions = (preferred = '') => {
        const choices = classesFor(programSelect.value);
        classSelect.innerHTML = `<option value="">— Pilih kelas —</option>${choices.map((c) => `<option value="${Number(c.id)}">${esc(c.name)} · Kelas ${esc(c.grade_level)} · ${esc(c.academic_year || '')}</option>`).join('')}`;
        const selected = choices.some((c) => String(c.id) === String(preferred)) ? String(preferred) : String(choices[0]?.id || '');
        classSelect.value = selected;
        if (!choices.length) classSelect.setCustomValidity('Belum ada kelas aktif pada jurusan ini.'); else classSelect.setCustomValidity('');
      };
      refreshClassOptions(preferredClass);
      programSelect.addEventListener('change', () => refreshClassOptions(''));
    } catch (err) { toast(err.message, 'error'); }
  }; });
  el.querySelectorAll('[data-publish-roster]').forEach((button) => { button.onclick = async () => {
    if (!(await confirmDialog({ title: 'Publikasikan roster mingguan?', message: 'Roster draf akan dicek ulang untuk konflik guru, kelas, dan ruang. Setelah diterbitkan, versi baru menjadi acuan jadwal guru, siswa, absensi, dan rekap honor. Versi sebelumnya tetap tersimpan sebagai histori.' }))) return;
    withLoading(button, async () => { try { const r = await api(`/academics/rosters/${button.dataset.publishRoster}/publish`, { method: 'POST', body: {} }); toast(r.message); await academicSetupPage(el); } catch (err) { toast(err.message, 'error'); } });
  }; });
  el.querySelectorAll('[data-remove-schedule]').forEach((button) => { button.onclick = async () => {
    if (!(await confirmDialog({ title: 'Hapus slot dari draf?', message: 'Hanya slot pada draf yang dihapus. Roster aktif dan versi lama tidak berubah.', danger: true }))) return;
    withLoading(button, async () => { try { const r = await api(`/academics/schedules/${button.dataset.removeSchedule}`, { method: 'DELETE' }); toast(r.message); await academicSetupPage(el); } catch (err) { toast(err.message, 'error'); } });
  }; });
  el.querySelectorAll('[data-setup-form="enrollment"]').forEach((form) => {
    const studentSelect = form.elements.student_record_id;
    const programSelect = form.elements.program_id;
    const classSelect = form.elements.class_id;
    const syncClasses = (preferred = '') => {
      const pid = Number(programSelect.value || 0);
      const choices = [...classSelect.options].filter((opt) => opt.value && Number(opt.dataset.programId || 0) === pid);
      [...classSelect.options].forEach((opt) => { if (opt.value) { const show = Number(opt.dataset.programId || 0) === pid; opt.hidden = !show; opt.disabled = !show; } });
      const match = choices.find((opt) => opt.value === String(preferred));
      classSelect.value = match ? match.value : (choices[0]?.value || '');
    };
    studentSelect.addEventListener('change', () => {
      const opt = studentSelect.selectedOptions[0];
      const pid = Number(opt?.dataset.programId || 0);
      if (pid && [...programSelect.options].some((x) => Number(x.value) === pid)) programSelect.value = String(pid);
      else programSelect.value = '';
      syncClasses(opt?.dataset.classId || '');
    });
    programSelect.addEventListener('change', () => syncClasses(''));
    syncClasses('');
  });
  el.querySelectorAll('[data-setup-form]').forEach((form) => { form.onsubmit = (e) => { e.preventDefault(); withLoading(e.submitter, async () => {
    const type = form.dataset.setupForm; const get = (name) => form.elements[name]?.value || '';
    let path = ''; let body = {}; let method = 'POST';
    if (type === 'year') { path = '/academics/academic-years'; body = { name: get('name'), starts_on: get('starts_on'), ends_on: get('ends_on'), is_active: form.elements.is_active.checked }; }
    if (type === 'class') { path = '/academics/classes'; body = { academic_year_id: get('academic_year_id'), name: get('name'), grade_level: get('grade_level'), program_id: get('program_id') }; }
    if (type === 'subject') { path = '/academics/subjects'; body = { code: get('code'), name: get('name'), grade_level: get('grade_level'), program_id: get('program_id') }; }
    if (type === 'enrollment') { path = `/academics/students/${Number(get('student_record_id'))}/program-class`; method = 'PUT'; body = { program_id: get('program_id'), class_id: get('class_id'), effective_on: get('enrolled_on'), reason: get('reason') }; }
    if (type === 'assignment') { path = '/academics/assignments'; body = { class_id: get('class_id'), subject_id: get('subject_id'), teacher_record_id: get('teacher_record_id'), weekly_periods: get('weekly_periods') }; }
    if (type === 'schedule') { path = '/academics/schedules'; body = { teaching_assignment_id: get('teaching_assignment_id'), day_of_week: get('day_of_week'), starts_at: get('starts_at'), ends_at: get('ends_at'), room: get('room') }; }
    try { const result = await api(path, { method, body }); toast(result.message); await academicSetupPage(el); }
    catch (err) { toast(err.message, 'error'); }
  }); } });
}

async function homeroomPage(el) {
  const [optionsRes, historyRes] = await Promise.all([api('/academics/setup-options'), api('/academics/homeroom')]);
  const { classes, teachers, programs = [] } = optionsRes.data; const history = historyRes.data;
  const activeByClass = new Map();
  const todayJakarta = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  for (const h of history) if ((!h.ends_on || String(h.ends_on).startsWith('0000-00-00')) && String(h.starts_on).slice(0,10) <= todayJakarta) activeByClass.set(Number(h.class_id), h);
  const groups = new Map();
  for (const c of classes.filter((x) => Number(x.is_active))) {
    const key = c.program_id == null ? 'unassigned' : String(c.program_id);
    if (!groups.has(key)) groups.set(key, { program_id: c.program_id, code: c.program_code || 'Belum dipetakan', title: c.program_title || 'Jurusan belum dipetakan', classes: [] });
    groups.get(key).classes.push(c);
  }
  for (const p of programs) if (Number(p.is_active) && !groups.has(String(p.id))) groups.set(String(p.id), { program_id: p.id, code: p.code, title: p.title, classes: [] });
  const teacherOptions = (currentId) => `<option value="">Belum ditetapkan</option>${teachers.map((t) => `<option value="${Number(t.id)}" ${Number(t.id)===Number(currentId)?'selected':''}>${esc(t.teacher_code || '—')} · ${esc(t.full_name)}</option>`).join('')}`;
  const classCard = (c) => {
    const assignment = activeByClass.get(Number(c.id));
    const year = c.academic_year || 'Tahun ajaran belum ditentukan';
    return `<div class="homeroom-class-row" data-class-card="${Number(c.id)}"><div class="homeroom-class-info"><strong>${esc(c.name)}</strong><span class="subtle">Kelas ${esc(c.grade_level)} · ${esc(year)} · ${Number(c.active_student_count||0)} siswa aktif</span><span class="subtle">Wali kelas saat ini: ${esc(assignment?.teacher_name || c.homeroom_teacher || 'Belum ditetapkan')}</span></div><form class="homeroom-inline-form" data-homeroom-class="${Number(c.id)}"><div class="field"><label>Guru wali kelas</label><select class="input" name="teacher_record_id" required>${teacherOptions(assignment?.teacher_record_id)}</select></div><div class="field"><label>Berlaku mulai</label><input class="input" name="starts_on" type="date" required value="${new Date().toLocaleDateString('en-CA')}" /></div><button class="btn btn-primary btn-sm" ${!teachers.length?'disabled':''}>Simpan</button></form></div>`;
  };
  const cards = [...groups.values()].sort((a,b)=>a.title.localeCompare(b.title,'id')).map((g)=>`<details class="program-class-card" open><summary><span><strong>${esc(g.code)} · ${esc(g.title)}</strong><small>${g.classes.length} kelas · ${g.classes.reduce((n,c)=>n+Number(c.active_student_count||0),0)} siswa aktif</small></span><span class="subtle">Kelola kelas ${icon('chevron-down')}</span></summary><div class="program-class-body">${g.classes.length ? g.classes.sort((a,b)=>Number(a.grade_level)-Number(b.grade_level)||a.name.localeCompare(b.name,'id')).map(classCard).join('') : `<div class="empty-state">Belum ada kelas pada jurusan ini. Buat kelas di menu Data Akademik.</div>`}</div></details>`).join('');
  el.innerHTML = `${dashHead('Jurusan, Kelas & Wali Kelas', 'Buka jurusan untuk melihat kelas X, XI, dan XII. Pilih guru dari master yang dibuat Superadmin; penugasan berlaku pada kelas dan periode terkait, bukan sebagai role terpisah.')}
    ${cards ? `<div class="program-class-groups">${cards}</div>` : `<div class="card">${empty('Master jurusan belum tersedia. Minta Superadmin menambahkan jurusan terlebih dahulu.')}</div>`}
    <div class="card mt"><h3>Histori penugasan wali kelas</h3><p class="subtle">Pergantian wali kelas menyimpan rentang waktu dan pencatatnya. Histori lama tidak dihapus.</p>${history.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Jurusan / Kelas</th><th>Guru</th><th>Mulai</th><th>Sampai</th><th>Ditugaskan oleh</th></tr></thead><tbody>${history.map((h) => `<tr><td>${esc(h.class_name)}</td><td>${esc(h.teacher_name)}</td><td>${fmtDate(h.starts_on)}</td><td>${h.ends_on ? fmtDate(h.ends_on) : 'Aktif'}</td><td>${esc(h.assigned_by_name)}</td></tr>`).join('')}</tbody></table></div>` : empty('Riwayat wali kelas belum tersedia.')}</div>`;
  el.querySelectorAll('[data-homeroom-class]').forEach((form) => {
    form.onsubmit = (e) => { e.preventDefault(); withLoading(form.querySelector('button'), async () => {
      const values = new FormData(form);
      try {
        const result = await api('/academics/homeroom', { method: 'POST', body: { class_id: form.dataset.homeroomClass, teacher_record_id: values.get('teacher_record_id'), starts_on: values.get('starts_on') } });
        toast(result.message); await homeroomPage(el);
      } catch (err) { toast(err.message, 'error'); }
    }); };
  });
}

async function attendanceReviewPage(el) {
  const r=(await api('/academics/attendance/review-queue')).data;
  const statusLabel=(v)=>v==='returned'?'Dikembalikan':'Menunggu persetujuan';
  const actions=(type,id,oldNotes='')=>`<div class="row"><button class="btn btn-primary btn-sm" data-approve="${esc(type)}:${Number(id)}">Setujui</button><button class="btn btn-outline btn-sm" data-return="${esc(type)}:${Number(id)}">Kembalikan</button></div>${oldNotes?`<div class="subtle">Catatan sebelumnya: ${esc(oldNotes)}</div>`:''}`;
  const studentRows=r.studentSessions.map(x=>`<tr><td>${fmtDateTime(x.starts_at)}</td><td>${esc(x.class_name||'—')} · ${esc(x.subject_name||'—')}</td><td>${esc(x.teacher_name||'—')}</td><td>${x.marked_count}/${x.roster_count}</td><td>${badge('approval',x.review_status==='returned'?'rejected':'submitted')}</td><td>${actions('student-session',x.id,x.review_notes)}</td></tr>`).join('');
  const teacherRows=r.teacherSessions.map(x=>`<tr><td>${fmtDateTime(x.recorded_at)}</td><td>${esc(x.teacher_name)}</td><td>${esc(x.class_name||'—')} · ${esc(x.subject_name||'—')}</td><td>${esc(x.status)} · ${esc(x.source)}</td><td>${badge('approval',x.review_status==='returned'?'rejected':'submitted')}</td><td>${actions('teacher-session',x.id,x.review_notes||x.notes)}</td></tr>`).join('');
  const qrRows=r.dailyCheckins.map(x=>`<tr><td>${fmtDateTime(x.checked_in_at)}</td><td>${esc(x.teacher_code)} · ${esc(x.teacher_name)}</td><td>${Math.round(Number(x.distance_m))} m</td><td>akurasi ${Math.round(Number(x.accuracy_m))} m · ${esc(x.verification_status)}</td><td>${badge('approval',x.review_status==='returned'?'rejected':'submitted')}</td><td>${actions('daily-checkin',x.id,x.review_notes)}</td></tr>`).join('');
  el.innerHTML=`${dashHead('Persetujuan Absensi','Absensi yang dikirim guru belum menjadi catatan resmi sampai Admin memeriksa dan menyetujuinya. Pengembalian wajib menyertakan alasan.')}
    <div class="grid g-3 mb">${stat('users','Sesi absensi siswa',r.studentSessions.length,'review-student-count')}${stat('clipboard-check','Absensi mengajar',r.teacherSessions.length,'review-teacher-count')}${stat('map-pin-check','Check-in QR guru',r.dailyCheckins.length,'review-qr-count')}</div>
    <div class="card mb"><h3>Absensi Siswa per Sesi</h3><p class="subtle">Persetujuan dilakukan setelah guru mengirim seluruh roster. Sesi yang belum lengkap tidak muncul sebagai siap terbit.</p><div class="table-wrap"><table class="data"><thead><tr><th>Waktu</th><th>Kelas / Mapel</th><th>Guru</th><th>Roster</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${studentRows||`<tr><td colspan="6">${empty('Tidak ada absensi siswa yang menunggu review.')}</td></tr>`}</tbody></table></div></div>
    <div class="card mb"><h3>Absensi Mengajar per Sesi</h3><div class="table-wrap"><table class="data"><thead><tr><th>Waktu catat</th><th>Guru</th><th>Kelas / Mapel</th><th>Status & sumber</th><th>Review</th><th>Aksi</th></tr></thead><tbody>${teacherRows||`<tr><td colspan="6">${empty('Tidak ada catatan absensi mengajar yang menunggu review.')}</td></tr>`}</tbody></table></div></div>
    <div class="card"><h3>Check-in Kedatangan Guru (QR + lokasi)</h3><p class="subtle">Validasi teknis geofence bukan bukti mutlak kehadiran; Admin tetap meninjau catatan sebelum dipakai sebagai data resmi.</p><div class="table-wrap"><table class="data"><thead><tr><th>Waktu</th><th>Guru</th><th>Jarak</th><th>Validasi</th><th>Review</th><th>Aksi</th></tr></thead><tbody>${qrRows||`<tr><td colspan="6">${empty('Tidak ada check-in QR yang menunggu review.')}</td></tr>`}</tbody></table></div></div>`;
  el.querySelectorAll('[data-approve]').forEach(b=>b.onclick=()=>reviewAttendanceAction(el,b.dataset.approve,'approved'));
  el.querySelectorAll('[data-return]').forEach(b=>b.onclick=()=>reviewAttendanceAction(el,b.dataset.return,'returned'));
}
async function reviewAttendanceAction(el,key,decision){
  const [type,id]=key.split(':');
  const result=await confirmDialog({title:decision==='approved'?'Setujui absensi?':'Kembalikan absensi?',message:decision==='approved'?'Status ini menjadi catatan absensi resmi dan dapat ditampilkan pada dashboard siswa jika berupa absensi siswa.':'Catatan dikembalikan kepada proses terkait. Wajib berikan alasan agar petugas mengetahui yang harus diperbaiki.',confirmText:decision==='approved'?'Setujui':'Kembalikan',danger:decision==='returned',notes:decision==='returned'?'Alasan pengembalian':'Catatan (opsional)',notesRequired:decision==='returned'});
  if(!result)return;
  try{const response=await api(`/academics/attendance/review/${type}/${id}`,{method:'POST',body:{decision,notes:result.notes||''}});toast(response.message);await attendanceReviewPage(el);}catch(e){toast(e.message,'error');}
}

async function teacherAttendanceAdminPage(el) {
  const today = new Date().toLocaleDateString('en-CA');
  const [daily, summary] = await Promise.all([
    api(`/academics/teacher-attendance?date=${today}`),
    api(`/payroll/attendance-summary?from=${today.slice(0,8)}01&to=${today}`),
  ]);
  const rows = daily.data;
  const statusOptions = [['present','Hadir'],['absent','Tidak hadir'],['permission','Izin'],['sick','Sakit'],['pending','Belum dikonfirmasi']];
  const sourceOptions = [['physical_verification','Verifikasi fisik'],['manual_admin','Pencatatan manual petugas'],['assignment','Berdasarkan penugasan']];
  el.innerHTML = `${dashHead('Kehadiran Guru', 'Pencatatan terpisah dari konfirmasi absensi siswa. Login dan konfirmasi sesi tidak otomatis membuktikan kehadiran fisik guru.')}
    <div class="card mb"><div class="row between"><div><h3>Rekap Periode Bulan Ini</h3><p class="subtle">${fmtDate(summary.period.from)} – ${fmtDate(summary.period.to)}</p></div><span class="badge b-warn">Potongan gaji belum dikonfigurasi</span></div>
      ${summary.data.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Guru</th><th>Terjadwal</th><th>Hadir</th><th>Tidak hadir</th><th>Izin</th><th>Sakit</th><th>Belum tercatat</th></tr></thead><tbody>${summary.data.map((r) => `<tr><td>${esc(r.full_name)}</td><td>${r.scheduled_sessions}</td><td>${r.present_sessions}</td><td>${r.absent_sessions}</td><td>${r.permission_sessions}</td><td>${r.sick_sessions}</td><td>${r.unrecorded_sessions + r.pending_sessions}</td></tr>`).join('')}</tbody></table></div>` : empty('Belum ada sesi pembelajaran pada periode ini.')}
      <p class="subtle mt">Rekap ini bukan perhitungan gaji final. Kebijakan potongan, verifikasi, dan persetujuan resmi sekolah belum dikonfigurasi.</p></div>
    <div class="card"><h3>Sesi Pembelajaran Hari Ini</h3><p class="muted">${esc(daily.note)}</p>
      ${rows.length ? `<div class="grid g-2">${rows.map((r) => `<form class="card teacher-attendance-form" data-session="${Number(r.session_id || 0)}" data-schedule="${Number(r.schedule_id)}"><h4>${esc(r.teacher_name)}</h4><p>${esc(r.subject_name)} · ${esc(r.class_name)} · ${esc(String(r.starts_at).slice(11,16))}–${esc(String(r.ends_at).slice(11,16))}</p><p class="subtle">Absensi siswa: ${r.student_attendance_confirmed ? 'sudah dikonfirmasi' : 'belum dikonfirmasi'}; ini bukan bukti kehadiran fisik guru.</p>
        <div class="field"><label>Status guru</label><select class="input" name="status" required><option value="">— Pilih status —</option>${statusOptions.map(([v,l]) => `<option value="${v}" ${r.teacher_status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Sumber pencatatan</label><select class="input" name="source" required><option value="">— Pilih sumber —</option>${sourceOptions.map(([v,l]) => `<option value="${v}" ${r.attendance_source === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Catatan / alasan koreksi</label><input class="input" name="notes" maxlength="500" value="${esc(r.notes || '')}" placeholder="Keterangan verifikasi"></div>
        <button class="btn btn-primary mt">${r.teacher_status ? 'Simpan Koreksi' : 'Catat Kehadiran'}</button>${r.session_id && r.student_attendance_confirmed ? `<button type="button" class="btn btn-outline mt" data-correct-session="${Number(r.session_id)}">Koreksi Absensi Siswa</button>` : ''}</form>`).join('')}</div>` : empty('Belum ada sesi absensi yang dibuat untuk hari ini. Kehadiran guru tidak akan otomatis diisi.')}</div>`;
  el.querySelectorAll('.teacher-attendance-form').forEach((form) => { form.onsubmit = (e) => { e.preventDefault(); withLoading(e.submitter, async () => {
    const body = { status: form.elements.status.value, source: form.elements.source.value, notes: form.elements.notes.value };
    try {
      let sessionId = Number(form.dataset.session);
      if (!sessionId) sessionId = Number((await api('/academics/teacher-attendance/ensure-session', { method: 'POST', body: { schedule_id: Number(form.dataset.schedule), date: today } })).data.id);
      if (rows.find((r) => String(r.session_id) === String(sessionId))?.teacher_status) body.correction_reason = form.elements.notes.value;
      const r = await api(`/academics/teacher-attendance/${sessionId}`, { method: 'POST', body }); toast(r.message); await teacherAttendanceAdminPage(el);
    }
    catch (err) { toast(err.message, 'error'); }
  }); } });  el.querySelectorAll('[data-correct-session]').forEach((button) => { button.onclick = () => openStudentAttendanceCorrections(el, Number(button.dataset.correctSession)); });
}

async function openStudentAttendanceCorrections(el, sessionId) {
  const r = await api(`/academics/sessions/${sessionId}/roster`); const students = r.data.students;
  const opts = [['present','Hadir'],['late','Terlambat'],['permission','Izin'],['sick','Sakit'],['absent','Alpa']];
  el.innerHTML = `${dashHead('Koreksi Absensi Siswa', 'Koreksi hanya untuk petugas berwenang. Setiap perubahan memerlukan alasan dan tercatat dalam audit log.', '<a class="btn btn-outline" href="/dashboard/kehadiran-guru">Kembali</a>')}<div class="card"><div class="table-wrap"><table class="data"><thead><tr><th>Nama</th><th>Status saat ini</th><th>Status baru</th><th>Aksi</th></tr></thead><tbody>${students.map((st) => `<tr><td>${esc(st.full_name)}</td><td>${esc(({present:'Hadir',late:'Terlambat',permission:'Izin',sick:'Sakit',absent:'Alpa'})[st.status] || st.status || 'Belum ada')}</td><td><select class="input" data-correct-status="${Number(st.student_record_id)}">${opts.map(([v,l]) => `<option value="${v}" ${st.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td><td><button class="btn btn-outline btn-sm" data-save-correction="${Number(st.student_record_id)}" ${!st.status ? 'disabled' : ''}>Simpan Koreksi</button></td></tr>`).join('')}</tbody></table></div></div>`;
  el.querySelectorAll('[data-save-correction]').forEach((button) => { button.onclick = () => withLoading(button, async () => {
    const studentId = Number(button.dataset.saveCorrection); const status = el.querySelector(`[data-correct-status="${studentId}"]`).value;
    const confirmed = await confirmDialog({ title: 'Koreksi absensi', message: 'Pastikan koreksi sesuai bukti dan prosedur sekolah. Perubahan akan masuk audit log.', confirmText: 'Simpan Koreksi', notes: 'Alasan koreksi', notesRequired: true });
    if (!confirmed) return;
    try { const saved = await api(`/academics/sessions/${sessionId}/correction`, { method: 'PUT', body: { student_record_id: studentId, status, reason: confirmed.notes } }); toast(saved.message); await openStudentAttendanceCorrections(el, sessionId); }
    catch (err) { toast(err.message, 'error'); }
  }); });
}

async function pklPage(el) {
  const [optionsRes, listRes] = await Promise.all([api('/academics/pkl/options'), api('/academics/pkl')]);
  const { classes, teachers, own_teacher_id } = optionsRes.data; const activities = listRes.data;
  const classOptions = classes.map((c) => `<option value="${Number(c.id)}">${esc(c.name)} · Kelas ${esc(c.grade_level)}</option>`).join('');
  const supervisorOptions = teachers.map((t) => `<option value="${Number(t.id)}" ${Number(t.id) === Number(own_teacher_id) ? 'selected' : ''}>${esc(t.full_name)}</option>`).join('');
  const today = new Date().toLocaleDateString('en-CA');
  el.innerHTML = `${dashHead('Kegiatan PKL', 'Kelola kegiatan Praktik Kerja Lapangan dan catat kehadiran hanya pada tanggal yang disetujui.')}
    <form class="card mb" id="pkl-form"><h3>Buat Kegiatan PKL</h3><div class="form-grid">
      <div class="field"><label for="pkl-title">Nama kegiatan</label><input id="pkl-title" class="input" required minlength="3" maxlength="160" placeholder="Contoh: PKL Semester Ganjil"></div>
      <div class="field"><label for="pkl-class">Kelas</label><select id="pkl-class" class="input" required><option value="">Pilih kelas</option>${classOptions}</select></div>
      ${teachers.length ? `<div class="field"><label for="pkl-supervisor">Guru pembimbing</label><select id="pkl-supervisor" class="input">${supervisorOptions}</select></div>` : ''}
      <div class="field"><label for="pkl-start">Tanggal mulai</label><input id="pkl-start" class="input" type="date" required value="${today}"></div>
      <div class="field"><label for="pkl-end">Tanggal selesai</label><input id="pkl-end" class="input" type="date" required value="${today}"></div>
      <div class="field"><label for="pkl-location">Lokasi PKL</label><input id="pkl-location" class="input" maxlength="200" placeholder="Nama perusahaan/instansi"></div>
      <div class="field full"><label for="pkl-description">Keterangan</label><textarea id="pkl-description" class="input" rows="3" maxlength="1000"></textarea></div></div>
      <button class="btn btn-primary mt" ${!classes.length ? 'disabled' : ''}>Simpan sebagai Draf</button><p class="subtle mt">Kegiatan harus dikonfirmasi sebelum absensi PKL dapat dicatat. Tidak ada kebijakan atau status hadir yang dibuat otomatis.</p></form>
    <div class="grid g-2">${activities.length ? activities.map((a) => {
      const date = today < String(a.starts_on).slice(0,10) ? String(a.starts_on).slice(0,10) : today > String(a.ends_on).slice(0,10) ? String(a.ends_on).slice(0,10) : today;
      return `<div class="card" data-testid="pkl-activity"><div class="row between"><h3>${esc(a.title)}</h3><span class="badge ${a.status === 'confirmed' ? 'b-ok' : a.status === 'cancelled' ? 'b-bad' : 'b-warn'}">${esc(({draft:'Draf',confirmed:'Dikonfirmasi',cancelled:'Dibatalkan',completed:'Selesai'})[a.status] || a.status)}</span></div>
        <p>${esc(a.class_name)} · ${fmtDate(a.starts_on)} – ${fmtDate(a.ends_on)}</p><p class="muted">Pembimbing: ${esc(a.supervising_teacher)} · ${esc(a.location || 'Lokasi belum diisi')}</p><p class="subtle">${Number(a.attendance_count)} catatan kehadiran tersimpan</p>
        ${a.status === 'draft' && a.can_manage ? `<button class="btn btn-primary" data-confirm-pkl="${Number(a.id)}">Konfirmasi Kegiatan PKL</button>` : ''}
        ${a.status === 'confirmed' && a.can_manage ? `<div class="field mt"><label for="pkl-date-${Number(a.id)}">Tanggal kehadiran</label><input class="input" type="date" id="pkl-date-${Number(a.id)}" min="${String(a.starts_on).slice(0,10)}" max="${String(a.ends_on).slice(0,10)}" value="${date}"></div><button class="btn btn-outline" data-attend-pkl="${Number(a.id)}">Catat Kehadiran PKL</button>` : ''}</div>`;
    }).join('') : empty('Belum ada kegiatan PKL.')}</div>`;
  $('#pkl-form', el).onsubmit = (e) => { e.preventDefault(); withLoading(e.submitter, async () => {
    try { await api('/academics/pkl', { method: 'POST', body: { title: $('#pkl-title', el).value, class_id: $('#pkl-class', el).value, supervising_teacher_id: $('#pkl-supervisor', el)?.value || own_teacher_id, starts_on: $('#pkl-start', el).value, ends_on: $('#pkl-end', el).value, location: $('#pkl-location', el).value, description: $('#pkl-description', el).value } }); toast('Kegiatan PKL disimpan sebagai draf.'); await pklPage(el); }
    catch (err) { toast(err.message, 'error'); }
  }); };
  el.querySelectorAll('[data-confirm-pkl]').forEach((button) => { button.onclick = () => withLoading(button, async () => {
    const ok = await confirmDialog({ title: 'Konfirmasi kegiatan PKL', message: 'Pastikan kelas, periode, lokasi, dan pembimbing sudah benar. Absensi PKL hanya berlaku pada rentang tanggal ini.', confirmText: 'Konfirmasi PKL' });
    if (!ok) return; try { const r = await api(`/academics/pkl/${button.dataset.confirmPkl}/confirm`, { method: 'POST', body: {} }); toast(r.message); await pklPage(el); } catch (err) { toast(err.message, 'error'); }
  }); });
  el.querySelectorAll('[data-attend-pkl]').forEach((button) => { button.onclick = () => withLoading(button, async () => {
    const id = Number(button.dataset.attendPkl); const date = $(`#pkl-date-${id}`, el).value;
    try {
      const r = await api(`/academics/pkl/${id}/roster?date=${encodeURIComponent(date)}`); const students = r.data.students;
      if (!students.length) { toast('Tidak ada siswa aktif pada kelas ini.', 'error'); return; }
      const opts = [['present','Hadir PKL'],['permission','Izin'],['sick','Sakit'],['absent','Alpa']];
      el.innerHTML = `${dashHead('Absensi PKL', `Kegiatan: ${r.data.activity.title} · Tanggal: ${fmtDate(date)}`, '<a class="btn btn-outline" href="/dashboard/pkl">Kembali</a>')}<div class="card"><p class="notice">${icon('info')}<span>Data PKL disimpan terpisah dari absensi reguler. Jika tanggal berbenturan dengan sesi kelas yang sudah dibuat, sistem menolak pencatatan untuk mencegah duplikasi.</span></p><div class="table-wrap"><table class="data"><thead><tr><th>Nama</th><th>Status</th></tr></thead><tbody>${students.map((st) => `<tr><td>${esc(st.full_name)}</td><td><select class="input" data-pkl-student="${Number(st.student_record_id)}" ${st.status && !state.user.permissions.includes('academic.setup') ? 'disabled' : ''}><option value="">— Pilih status —</option>${opts.map(([v,l]) => `<option value="${v}" ${st.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select>${st.status ? `<small class="subtle">Sudah dicatat: ${esc(st.status)}</small>${state.user.permissions.includes('academic.setup') ? `<button type="button" class="btn btn-outline btn-sm mt" data-pkl-correct="${Number(st.student_record_id)}">Koreksi</button>` : ''}` : ''}</td></tr>`).join('')}</tbody></table></div><button class="btn btn-primary mt" id="save-pkl-attendance" ${students.some((st) => st.status) ? 'disabled' : ''}>Simpan Kehadiran PKL</button></div>`;
      el.querySelectorAll('[data-pkl-correct]').forEach((correctionButton) => { correctionButton.onclick = () => withLoading(correctionButton, async () => {
        const studentId = Number(correctionButton.dataset.pklCorrect); const status = el.querySelector(`[data-pkl-student="${studentId}"]`).value;
        const reason = await confirmDialog({ title: 'Koreksi kehadiran PKL', message: 'Perubahan hanya berlaku untuk siswa dan tanggal ini, dan akan tercatat dalam audit log.', confirmText: 'Simpan Koreksi', notes: 'Alasan koreksi', notesRequired: true });
        if (!reason) return;
        try { const corrected = await api(`/academics/pkl/${id}/attendance/${studentId}`, { method: 'PUT', body: { date, status, reason: reason.notes } }); toast(corrected.message); await pklPage(el); }
        catch (err) { toast(err.message, 'error'); }
      }); });
      $('#save-pkl-attendance', el).onclick = (ev) => withLoading(ev.currentTarget, async () => {
        const selects = [...el.querySelectorAll('[data-pkl-student]')]; if (selects.some((x) => !x.value)) { toast('Pilih status semua siswa.', 'error'); return; }
        try { const saved = await api(`/academics/pkl/${id}/attendance`, { method: 'POST', body: { date, records: selects.map((x) => ({ student_record_id: Number(x.dataset.pklStudent), status: x.value })) } }); toast(saved.message); await pklPage(el); }
        catch (err) { toast(err.message, 'error'); }
      });
    } catch (err) { toast(err.message, 'error'); }
  }); });
}

export const notifList = (rows) => (rows.length ? rows.map((n) => `<div class="mb" data-testid="notification-item"><strong>${n.is_read ? '' : '• '}${esc(n.title)}</strong><div class="muted">${esc(n.message)}</div><div class="subtle">${fmtDateTime(n.created_at)}</div></div>`).join('') : empty('Belum ada notifikasi.', 'bell-off'));

async function notificationsPage(el) {
  const r = await api('/notifications');
  el.innerHTML = `${dashHead('Notifikasi', 'Notifikasi in-app. Email belum dikonfigurasi; status pengiriman email ditampilkan per notifikasi.', `<button class="btn btn-outline" id="read-all" data-testid="notifications-read-all-btn">${icon('check-check')} Tandai semua dibaca</button>`)}
    <div class="table-wrap"><table class="data" data-testid="notifications-table"><thead><tr><th>Notifikasi</th><th>Waktu</th><th>Status</th><th>Email</th></tr></thead><tbody>
    ${r.data.length ? r.data.map((n) => `<tr><td><strong>${esc(n.title)}</strong><div class="muted">${esc(n.message)}</div>${n.link ? `<a href="${esc(n.link)}">Buka</a>` : ''}</td><td>${fmtDateTime(n.created_at)}</td>
      <td>${n.is_read ? '<span class="badge b-neutral">Dibaca</span>' : '<span class="badge b-info">Baru</span>'}</td><td><span class="badge b-neutral">${n.email_status === 'not_configured' ? 'Email belum dikonfigurasi' : esc(n.email_status)}</span></td></tr>`).join('')
    : `<tr><td colspan="4">${empty('Belum ada notifikasi.', 'bell-off')}</td></tr>`}</tbody></table></div>`;
  $('#read-all').onclick = (e) => withLoading(e.currentTarget, async () => { await api('/notifications/read-all', { method: 'POST' }); await refreshUnread(); toast('Semua notifikasi ditandai dibaca.'); rerender(); });
}

async function accountPage(el) {
  const u = state.user;
  const pf = [{ name: 'full_name', label: 'Nama lengkap', required: true }, { name: 'phone', label: 'Nomor telepon' }];
  const pw = [{ name: 'current_password', label: 'Kata sandi saat ini', type: 'password', required: true }, { name: 'new_password', label: 'Kata sandi baru', type: 'password', required: true, help: 'Minimal 8 karakter, huruf dan angka.' }];
  el.innerHTML = `${dashHead('Pengaturan Akun', u.must_change_password ? 'Sandi sementara wajib diganti sebelum fitur lain dapat digunakan.' : 'Role akun ditetapkan oleh sekolah dan tidak dapat diubah sendiri.')}
    ${u.must_change_password ? '<div class="notice warn mb">Akun ini baru dibuat oleh administrator. Tetapkan sandi pribadi sebelum melanjutkan.</div>' : ''}
    <div class="grid ${u.must_change_password ? 'g-1' : 'g-2'}">${u.must_change_password ? '' : `<form class="card" id="pf" novalidate data-testid="account-profile-form"><h3>Profil akun</h3><dl class="kv mb"><dt>Email</dt><dd>${esc(u.email)}</dd><dt>Role</dt><dd>${esc(u.role_name)}</dd></dl>${formFields(pf, u)}<div class="form-actions"><button class="btn btn-primary" data-testid="account-profile-save-btn">Simpan</button></div></form>`}
    <form class="card" id="pw" novalidate data-testid="account-password-form"><h3>Ganti kata sandi</h3>${formFields(pw)}<div class="form-actions"><button class="btn btn-primary" data-testid="account-password-save-btn">Ganti Kata Sandi</button></div></form></div>`;
  const bind = (id, fields, path, done) => {
    const f = $(id, el);
    f.onsubmit = (e) => { e.preventDefault(); withLoading(f.querySelector('button'), async () => { try { const r = await api(path, { method: 'PUT', body: readForm(f, fields) }); toast(r.message); await loadMe(); done(f); } catch (err) { showErrors(f, err); } }); };
  };
  if (!u.must_change_password) bind('#pf', pf, '/auth/profile', () => rerender());
  bind('#pw', pw, '/auth/password', (f) => { f.reset(); rerender(); });
}

export { stat };
