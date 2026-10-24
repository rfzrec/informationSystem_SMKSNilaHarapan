const env = require('../config/env');
const { pool, query, one, withTransaction } = require('../config/db');
const { createUserWithRole, hashPassword } = require('../services/authService');

const ROLES = [
  ['superadmin', 'Superadmin', 'Mengelola master jurusan, guru dan akun guru, konfigurasi teknis, audit, serta pemulihan sistem'],
  ['admin', 'Admin Sekolah', 'Mengelola PPDB, CMS, kesiswaan, kelas, roster, persetujuan absensi, rapor dan administrasi sekolah'],
  ['guru', 'Guru', 'Mengelola jadwal dan sesi yang ditugaskan, absensi, nilai, serta tugas tambahan berdasarkan penugasan'],
  ['siswa', 'Siswa', 'Akun siswa aktif untuk akses portal akademik pribadi'],
  ['applicant', 'Calon Murid', 'Mengelola pengajuan PPDB milik sendiri; identitas role dipertahankan setelah aktivasi'],
  ['school_leader', 'Pimpinan Sekolah', 'Kepala Sekolah dan Kepala Yayasan; akses ringkasan dan laporan sesuai kewenangan'],
];

const PERMISSIONS = {
  'applicant.self': 'Mengelola pengajuan PPDB milik sendiri sebelum aktivasi siswa',
  'applications.view': 'Melihat pengajuan PPDB sesuai kewenangan',
  'applications.view_all': 'Melihat seluruh pengajuan PPDB',
  'applications.verify': 'Memverifikasi dokumen dan pengajuan PPDB',
  'applications.assist_edit': 'Membantu koreksi administratif pengajuan',
  're_registration.verify': 'Memverifikasi daftar ulang',
  'admission.config': 'Mengelola periode, jadwal, jalur, kuota dan persyaratan PPDB',
  'selection.manage': 'Menyiapkan hasil seleksi',
  'selection.approve': 'Menyetujui dan mempublikasikan hasil seleksi',
  'announcements.manage': 'Mengelola pengumuman sekolah dan PPDB',
  'cms.manage': 'Mengelola Company Profile dan konten website',
  'reports.view': 'Melihat laporan operasional',
  'admissions.summary.view': 'Melihat ringkasan agregat PPDB tanpa mengelola pengajuan individual',
  'reports.export': 'Mengekspor laporan yang diizinkan',
  'integration.process': 'Memproses integrasi data pendaftar ke data induk siswa',
  'audit.view': 'Melihat audit log',
  'users.manage': 'Mengelola akun pengguna staf',
  'masters.manage': 'Mengelola master jurusan dan membuat akun guru beserta kode uniknya',
  'system.monitor': 'Memantau layanan, health check dan log teknis',
  'system.settings': 'Mengelola pengaturan teknis sistem',
  'academic.setup': 'Mengelola tahun ajaran, kelas, mata pelajaran, penugasan, roster dan penempatan siswa',
  'students.manage': 'Mengelola data induk dan penempatan siswa',
  'academic.reports.view': 'Melihat laporan akademik sesuai kewenangan',
  'academic.self': 'Melihat data akademik milik sendiri',
  'grades.manage': 'Mengisi nilai pada kelas dan mata pelajaran yang ditugaskan',
  'grades.self': 'Melihat nilai dan rapor milik sendiri yang sudah diizinkan',
  'attendance.teacher': 'Mengelola absensi siswa untuk sesi mengajar yang ditugaskan',
  'attendance.student.manage': 'Mencatat dan mengirim absensi siswa pada kelas yang ditugaskan',
  'attendance.self': 'Melihat catatan absensi sendiri',
  'attendance.view': 'Memeriksa, menyetujui dan memperbaiki catatan absensi sekolah',
  'attendance.homeroom.manage': 'Membaca/menyiapkan rekap kelas berdasarkan penugasan wali kelas, bukan role tersendiri',
  'pkl.manage': 'Mengelola kegiatan PKL sesuai penugasan atau kewenangan administrasi',
  'finance.manage': 'Mengelola tagihan dan pencatatan pembayaran',
  'finance.view': 'Melihat laporan pembayaran sesuai kewenangan',
  'honor.view': 'Melihat rincian honor sesuai kewenangan',
  'honor.approve': 'Menyetujui perhitungan honor sesuai kebijakan',
  'honor.manage': 'Mengelola tarif, periode dan pencatatan pembayaran honor',
  'honor.self': 'Melihat realisasi dan slip honor pribadi',
  'honor.realization.verify': 'Memverifikasi realisasi jam mengajar',
  'aid.manage': 'Mengelola program dan permohonan bantuan pendidikan',
  'aid.view': 'Melihat status bantuan milik sendiri atau data sesuai kewenangan',
  'graduation.manage': 'Memeriksa kelengkapan dan mencatat keputusan kelulusan',
  'reports.publish': 'Menerbitkan atau mengembalikan paket rapor resmi',
  'attendance.qr.manage': 'Mengatur dan menerbitkan QR presensi guru serta meninjau check-in',
  'attendance.qr.self': 'Melakukan check-in kedatangan pribadi dengan QR dinamis',
};

const ADMIN_PERMS = [
  'applications.view', 'applications.view_all', 'applications.verify', 'applications.assist_edit',
  're_registration.verify', 'admission.config', 'selection.manage', 'selection.approve',
  'announcements.manage', 'cms.manage', 'reports.view', 'reports.export', 'integration.process', 'audit.view',
  'students.manage', 'academic.setup', 'academic.reports.view', 'attendance.view',
  'pkl.manage', 'finance.manage', 'finance.view', 'honor.view', 'honor.manage', 'honor.realization.verify',
  'honor.approve', 'aid.manage', 'aid.view',
  'graduation.manage', 'reports.publish', 'attendance.qr.manage',
];
const ROLE_PERMS = {
  superadmin: ['users.manage', 'masters.manage', 'system.monitor', 'system.settings', 'audit.view'],
  admin: ADMIN_PERMS,
  guru: ['grades.manage', 'attendance.teacher', 'attendance.student.manage', 'attendance.self', 'attendance.homeroom.manage', 'honor.self', 'pkl.manage', 'attendance.qr.self'],
  siswa: ['academic.self', 'grades.self', 'attendance.self', 'aid.view'],
  applicant: ['applicant.self'],
  school_leader: ['admissions.summary.view'],
};

const PLACEHOLDER = '[Belum dilengkapi] Konten ini menunggu pengisian resmi oleh pihak sekolah melalui CMS.';
const SECTIONS = [
  ['beranda', 'Selamat Datang di SMKS Nila Harapan TIK Sunggal', 'Sekolah Menengah Kejuruan di bawah naungan Yayasan Perguruan Nila Harapan, berdiri sejak 21 Mei 2002 di Sunggal, Deli Serdang.', 'published'],
  ['profil', 'Profil Sekolah', `SMKS Nila Harapan TIK Sunggal adalah sekolah menengah kejuruan swasta yang dikelola oleh Yayasan Perguruan Nila Harapan dan berdiri pada 21 Mei 2002.\n\n${PLACEHOLDER}`, 'published'],
  ['sejarah', 'Sejarah Sekolah', `Sekolah berdiri pada 21 Mei 2002 di bawah Yayasan Perguruan Nila Harapan.\n\n${PLACEHOLDER}`, 'published'],
  ['visi_misi', 'Visi dan Misi', PLACEHOLDER, 'published'],
  ['identitas', 'Identitas Sekolah', 'Nama: SMKS Nila Harapan TIK Sunggal\nYayasan: Yayasan Perguruan Nila Harapan\nTanggal berdiri: 21 Mei 2002\nAlamat: Jl. Binjai Km 11,2, Mulyorejo, Sunggal, Deli Serdang, Sumatera Utara, Indonesia', 'published'],
  ['yayasan', 'Yayasan Perguruan Nila Harapan', `SMKS Nila Harapan TIK Sunggal berada di bawah Yayasan Perguruan Nila Harapan.\n\n${PLACEHOLDER}`, 'published'],
  ['kontak', 'Kontak Sekolah', 'Alamat: Jl. Binjai Km 11,2, Mulyorejo, Sunggal, Deli Serdang, Sumatera Utara\nTelepon: [belum dilengkapi]\nEmail: [belum dilengkapi]', 'published'],
  ['lokasi', 'Lokasi Sekolah', 'Jl. Binjai Km 11,2, Mulyorejo, Sunggal, Deli Serdang, Sumatera Utara, Indonesia', 'published'],
  ['kontak_panitia', 'Kontak PPDB', 'Informasi pendaftaran dan kontak administrasi PPDB: [lengkapi melalui CMS]\nAlamat: Jl. Binjai Km 11,2, Mulyorejo, Sunggal, Deli Serdang\nTelepon/WhatsApp: [belum dilengkapi]\nJam layanan: [belum dilengkapi]', 'published'],
];

async function seedReference() {
  await withTransaction(async (conn) => {
    for (const [code, name, desc] of ROLES) {
      await query('INSERT INTO roles (code, name, description) VALUES (?,?,?) ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description)', [code, name, desc], conn);
    }
    for (const [code, desc] of Object.entries(PERMISSIONS)) {
      await query('INSERT INTO permissions (code, description) VALUES (?,?) ON DUPLICATE KEY UPDATE description = VALUES(description)', [code, desc], conn);
    }
    // Role permissions are reset to this explicit policy on each seed. The applicant role is
    // distinct and stable; school_leader is read-only by default and has no operational permissions.
    for (const [roleCode, perms] of Object.entries(ROLE_PERMS)) {
      const role = await one('SELECT id FROM roles WHERE code = ?', [roleCode], conn);
      await query('DELETE FROM role_permissions WHERE role_id = ?', [role.id], conn);
      for (const p of perms) await query('INSERT IGNORE INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions WHERE code = ?', [role.id, p], conn);
    }
    for (const [key, title, content, status] of SECTIONS) {
      await query('INSERT IGNORE INTO school_profiles (section_key, title, content, status) VALUES (?,?,?,?)', [key, title, content, status], conn);
    }
    // Program master records for the school's currently known study programs. They remain editable by Superadmin;
    // their public descriptive pages remain drafts until Admin publishes them in CMS.
    const programs = [
      ['TKJ', 'Teknik Komputer dan Jaringan', 'teknik-komputer-jaringan'],
      ['TSM', 'Teknik Sepeda Motor', 'teknik-sepeda-motor'],
      ['TB', 'Tata Busana', 'tata-busana'],
    ];
    for (const [code, title, slug] of programs) {
      await query(`INSERT INTO school_programs (title, slug, summary, body, status, code, is_active)
        VALUES (?,?,?,?,'draft',?,1) ON DUPLICATE KEY UPDATE code=IF(code IS NULL OR code='' OR code LIKE 'PRG-%', VALUES(code), code)`,
      [title, slug, `Program Keahlian ${code}`, 'Deskripsi resmi program keahlian dilengkapi oleh Admin Sekolah melalui CMS.', code], conn);
    }

  });
}

async function ensureUser(email, fullName, roleCode, password) {
  const existing = await one('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) {
    // Reassert the configured demo role and credentials on each local seed run.
    const role = await one('SELECT id FROM roles WHERE code = ?', [roleCode]);
    if (!role) throw new Error(`Role demo tidak ditemukan: ${roleCode}`);
    await withTransaction(async (conn) => {
      await query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE role_id = VALUES(role_id)', [existing.id, role.id], conn);
      await query("UPDATE users SET password_hash=?, is_active=1, deleted_at=NULL, account_stage='staff', must_change_password=0 WHERE id=?", [await hashPassword(password), existing.id], conn);
    });
    return existing.id;
  }
  return withTransaction((conn) => createUserWithRole(conn, { email, password, fullName, roleCode, mustChange: true }));
}


async function seedDemo() {
  const pwd = process.env.SEED_DEMO_PASSWORD;
  if (!pwd || pwd.length < 10) throw new Error('SEED_DEMO_PASSWORD wajib diisi (min. 10 karakter) untuk seed demo');
  const sysadminEmail = process.env.SEED_SYSADMIN_EMAIL || 'superadmin@demo.nilaharapan.test';
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@demo.nilaharapan.test';
  await ensureUser(sysadminEmail, 'Superadmin (Demo)', 'superadmin', pwd);
  await ensureUser(adminEmail, 'Admin Sekolah (Demo)', 'admin', pwd);

  const periodName = 'Periode Demo PPDB 2027/2028';
  let period = await one('SELECT id FROM admission_periods WHERE name = ?', [periodName]);
  if (!period) {
    await withTransaction(async (conn) => {
      const p = await query(`INSERT INTO admission_periods (name, academic_year, level, start_date, end_date, status, description, form_config_json)
        VALUES (?, '2027/2028', 'SMK Kelas X', '2026-10-01', '2027-07-31', 'active', ?, ?)`,
      [periodName, 'DATA DEMO untuk lingkungan lokal. Jadwal, jalur, kuota, dan persyaratan resmi ditetapkan Admin melalui menu PPDB.', JSON.stringify({ required_fields: [] })], conn);
      const pid = p.insertId;
      const stages = [['registration', '2026-10-01 00:00:00', '2027-05-31 23:59:00'], ['verification', '2026-10-01 00:00:00', '2027-06-15 23:59:00'],
        ['selection', '2027-06-01 00:00:00', '2027-06-20 23:59:00'], ['announcement', '2027-06-25 08:00:00', '2027-06-30 23:59:00'],
        ['re_registration', '2027-07-01 00:00:00', '2027-07-31 23:59:00']];
      for (const [t, s, e] of stages) await query('INSERT INTO admission_stages (period_id, stage_type, start_at, end_at) VALUES (?,?,?,?)', [pid, t, s, e], conn);
      const path = await query(`INSERT INTO admission_paths (period_id, name, description) VALUES (?, '[Contoh] Jalur Umum', 'Jalur contoh untuk demo. Ganti sesuai kebijakan resmi sekolah.')`, [pid], conn);
      await query('INSERT INTO admission_quotas (path_id, quota) VALUES (?, NULL)', [path.insertId], conn);
      await query(`INSERT INTO document_requirements (period_id, stage, name, description, is_required, allowed_types, max_size_kb) VALUES
        (?, 'application', '[Contoh] Kartu Keluarga', 'Pindaian dokumen asli', 1, 'pdf,jpg,png', 2048),
        (?, 'application', '[Contoh] Pas Foto', 'Foto terbaru', 0, 'jpg,png', 1024),
        (?, 're_registration', '[Contoh] Surat Pernyataan Daftar Ulang', 'Ditandatangani orang tua/wali', 1, 'pdf,jpg,png', 2048)`, [pid, pid, pid], conn);
      await query(`INSERT INTO selection_rules (period_id, criteria_json, ranking_notes) VALUES (?, ?, 'Contoh kriteria demo. Rumus, bobot, dan pemeringkatan ditetapkan sekolah.')`,
        [pid, JSON.stringify([{ key: 'tes_tertulis', label: '[Contoh] Nilai Tes', max_score: 100 }])], conn);
    });
    period = await one('SELECT id FROM admission_periods WHERE name = ?', [periodName]);
  }
  await query(`INSERT IGNORE INTO ppdb_faqs (id, question, answer, sort_order, status) VALUES (1, 'Bagaimana cara mendaftar?', 'Buat akun melalui menu Registrasi Pendaftar, lengkapi formulir, unggah dokumen, lalu kirim pengajuan. Ketentuan resmi mengikuti informasi PPDB yang diterbitkan Admin Sekolah.', 1, 'published')`);
}

async function seed() {
  await seedReference();
  if (process.env.SEED_DEMO === 'true') {
    if (env.isProduction) throw new Error('Seed demo tidak diizinkan pada NODE_ENV=production');
    await seedDemo();
    console.log('[seed] data referensi & akun demo siap');
  } else {
    console.log('[seed] data referensi siap (akun demo dilewati, SEED_DEMO != true)');
  }
}

if (require.main === module) {
  seed().then(() => pool.end()).then(() => process.exit(0)).catch((e) => { console.error('[seed] gagal:', e.message); process.exit(1); });
}

module.exports = { seed, seedReference, ROLE_PERMS };
