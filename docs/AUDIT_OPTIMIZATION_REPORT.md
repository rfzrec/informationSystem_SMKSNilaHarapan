# Laporan Audit dan Optimalisasi — SMKS Nila Harapan TIK Sunggal

## Ruang lingkup perubahan
Berdasarkan audit ZIP `smksnilaharapanv3_.zip`, halaman Pengaturan Sistem sebelumnya hanya menampilkan tiga kunci konfigurasi, sementara Super Admin belum memiliki halaman monitoring role lintas-role dan pencatatan temuan bug/pengujian yang terstruktur.

## Perubahan yang diterapkan
- Pengaturan Sistem: deskripsi dan batasan setiap parameter, input URL untuk endpoint SIAKAD, tombol Batal, Reset ke Default dengan konfirmasi, validasi URL di UI, serta penjelasan konfigurasi yang memang tidak dapat diubah dari UI. Pengaturan tetap menggunakan tabel `system_settings` dan audit log yang sudah ada.
- Monitoring Pengguna & Role: mengambil daftar role dan statistik akun dari tabel `roles`, `user_roles`, dan `users`; menyediakan pencarian, filter role/status, status aktif/nonaktif, login terakhir, dan tanggal pembuatan. Halaman ini hanya membaca data dan tidak memberi hak operasional tambahan.
- Monitoring Bug & Pengujian: temuan dapat dicatat dan diperbarui; status penanganan dipisahkan dari status tes; tes default `BELUM DIUJI`; temuan tidak dapat ditutup kecuali tes berstatus `LULUS`; aktivitas dicatat ke audit log.
- Ringkasan Sistem: menampilkan jumlah temuan berdasarkan status penanganan dan tautan menuju monitoring bug.
- Migrasi tambahan `020_system_bug_monitoring.sql` membuat tabel baru secara aditif. Tidak ada tabel operasional lama yang dihapus atau di-reset.

## File diubah/ditambahkan
- `backend/src/routes/admin.routes.js` — endpoint monitoring role dan bug, validasi dan audit.
- `frontend/public/js/pages/sysadmin.js` — UI Pengaturan Sistem, Monitoring Pengguna & Role, Monitoring Bug & Pengujian, dan integrasi ringkasan.
- `frontend/public/js/pages/dashboard.js` — menu dan routing baru untuk halaman monitoring Super Admin.
- `database/migrations/020_system_bug_monitoring.sql` — tabel temuan bug baru.
- `docs/AUDIT_OPTIMIZATION_REPORT.md` — laporan ini.
- `CHANGELOG_OPTIMASI.md` — catatan perubahan.

## Endpoint baru
- `GET /api/system/role-monitoring` — daftar role, statistik, dan daftar akun dengan filter `q`, `role`, `status`.
- `GET /api/system/bug-findings` — daftar temuan dan agregasi status; filter `status`, `severity`, `module`, `q`.
- `POST /api/system/bug-findings` — mencatat temuan.
- `PUT /api/system/bug-findings/:id` — memperbarui temuan dan hasil pengujian.
Semua endpoint baru dilindungi `system.monitor`; backend tetap menjadi sumber otorisasi.

## Pengujian
- `node --check backend/src/routes/admin.routes.js` — LULUS.
- `node --check frontend/public/js/pages/sysadmin.js` — LULUS.
- `node --check frontend/public/js/pages/dashboard.js` — LULUS.
- `npm test` — BELUM DAPAT DIJALANKAN: dependensi proyek belum terpasang di lingkungan pemeriksaan (`supertest` dan `resend` tidak ditemukan). Tes API/database, migrasi terhadap database nyata, alur browser, dan pemeriksaan RBAC live belum diverifikasi.
- Build frontend terpisah tidak didefinisikan dalam `package.json`; frontend berupa JavaScript native.
- `.env` tidak diubah. Hash SHA-256 diverifikasi terhadap file hasil ekstraksi sebelum dan sesudah perubahan (lihat laporan serah-terima di percakapan; hash tidak memuat isi file).

## Migrasi dan menjalankan
1. Backup database terlebih dahulu sebelum menerapkan perubahan skema.
2. Pastikan dependensi terpasang sesuai lockfile/konfigurasi proyek dan Docker Compose menggunakan konfigurasi lingkungan yang sudah ada.
3. Jalankan migrasi standar proyek: `docker compose exec app node backend/src/scripts/migrate.js`.
4. Jalankan aplikasi dengan prosedur Docker Compose yang sudah digunakan proyek.
5. Login sebagai Super Admin yang memiliki permission `system.monitor`; verifikasi menu `Monitoring Role`, `Monitoring Bug & Tes`, dan `Pengaturan Sistem`.
6. Jalankan `npm test` setelah dependensi tersedia. Jangan menyimpulkan tes lulus hanya dari pemeriksaan sintaks.

## Batasan yang masih ada
- Pengaturan tahun ajaran/semester global, maintenance mode yang benar-benar memblokir akses, tema warna dinamis, dan upload logo tidak ditambahkan karena perlu audit integrasi yang lebih luas dan tidak boleh dipalsukan sebagai fitur aktif.
- Status pengujian yang dicatat pada monitoring adalah catatan administratif; belum otomatis terhubung ke runner CI/test.
- Monitoring pengguna dibatasi sampai 500 akun pada satu permintaan; pagination belum ditambahkan.
- Pengujian database dan browser belum dapat dilakukan di lingkungan ini.
