# Model Keamanan

## Enam role dan batas akses

- `superadmin`: akun Admin/Superadmin, master jurusan, master guru dan akun guru, setting teknis, monitoring dan audit.
- `admin`: operasional sekolah, termasuk PPDB dan CMS, kesiswaan, kelas, penugasan/roster, review absensi, approval/publikasi rapor, honor, pembayaran, bantuan, PKL dan review kelulusan sesuai menu.
- `guru`: jadwal dan sesi yang benar-benar ditugaskan, check-in pribadi, nilai, absensi siswa dalam sesi yang sah, serta rapor kelas hanya saat ada assignment wali kelas.
- `applicant`: mengelola pengajuan PPDB sendiri saat `account_stage=applicant`; setelah aktivasi, role tetap sama dan middleware memberi permission akademik pribadi berdasarkan `account_stage=student`.
- `siswa`: akun siswa aktif yang dibuat/dikelola melalui alur siswa yang sudah ada.
- `school_leader`: Kepala Sekolah dan Kepala Yayasan; hanya ringkasan agregat PPDB baca-saja secara default.

Tidak ada role orang tua, Admin PPDB terpisah, wali kelas, maupun guru mata pelajaran. Kepala Sekolah dan Kepala Yayasan menggunakan role bersama `school_leader`. Public visitor tidak memerlukan akun. Field orang tua/wali pada PPDB adalah data yang melekat pada pemohon, bukan akun akses.

## Otorisasi setiap request

Backend memeriksa user/session aktif, permission dari database, relasi ke objek, dan status workflow. User tidak dapat membaca data lain hanya karena mengetahui `student_id`, `application_id`, `teacher_id`, `invoice_id` atau ID paket. Guru dibatasi oleh assignment; wali kelas dibatasi kelas/periode; siswa diselesaikan dari `student_accounts` milik session login, bukan dari ID di request body.

## Kredensial dan session

Password di-hash bcrypt. Login meregenerasi session; session server-side berada pada MySQL. Request berstatus sandi sementara dibatasi ke endpoint untuk membaca identitas, logout dan mengganti sandi. Token reset harus acak, one-use, kedaluwarsa dan disimpan sebagai hash. CSRF aktif untuk request yang mengubah keadaan. Di produksi, gunakan HTTPS, cookie Secure, SameSite/HttpOnly, konfigurasi reverse proxy yang tepat, rate limit, serta respons reset-password yang tidak mengungkap eksistensi email.

## Primary key, kode guru dan idempotensi

Primary key internal/foreign key tetap digunakan untuk integritas. Kode guru adalah reference business key unik, tidak rahasia dan bukan kredensial login. Student number, nomor daftar PPDB, user ID dan report package ID berbeda fungsi. Integrasi pendaftar ke siswa dan operasi pembayaran/publikasi harus transaksional serta idempoten; duplikasi NIK atau relasi akun ditahan untuk pemeriksaan manual.

## File dan privasi

Logo, favicon, dan media yang disetujui untuk publik dapat disajikan sebagai public assets. Berkas NIK/KK dan dokumen pendaftar/bantuan tetap privat serta disajikan lewat endpoint terotorisasi. Gunakan nama penyimpanan yang dibuat server, validasi signature/tipe/ukuran, tolak traversal dan berkas executable, batasi log berisi isi request, dan tetapkan retensi.

## Presensi QR

Token QR harus tidak tertebak, punya waktu kedaluwarsa singkat, disimpan sebagai hash dan tidak dapat dipakai berulang. Renderer hanya tersedia dalam jaringan internal dengan token service-to-service. GPS browser dapat dipalsukan; koordinat/akurasi adalah indikator verifikasi, bukan jaminan anti-fraud. Anomali masuk antrean review Admin dan tidak otomatis memicu potongan honor.

## Data dan operasional

Perubahan nilai, absensi, status PPDB/aktivasi, tagihan/pembayaran, honor, bantuan dan kelulusan harus menyimpan actor/time/reason serta nilai sebelum-sesudah bila relevan. Hindari hard-delete data operasional; gunakan nonaktif/arsip dan kebijakan retensi. Backup DB dan private/public storage harus diuji melalui restore pada lingkungan terisolasi.

## Catatan microservices

Layanan punya proses/container dan rute berbeda, tetapi menggunakan satu skema MySQL bersama dalam tahap transisi. Ini bukan isolasi database penuh. Jangan menganggap gateway saja cukup untuk otorisasi; setiap layanan harus menegakkan perlindungan data yang ditanganinya. Sebelum produksi, rotasi semua secret, matikan seed demo, atur DB user least-privilege, aktifkan TLS dan jalankan tes akses negatif lintas-role.


## Role Calon Murid dan Pimpinan Sekolah

Role `applicant` hanya memperoleh akses PPDB milik sendiri selama `account_stage=applicant`. Setelah aktivasi, middleware memberikan permission self-service akademik sesuai tahap akun tanpa mengganti role. Role `school_leader` hanya menerima permission laporan baca-saja; setiap endpoint laporan tetap harus memverifikasi permission dan cakupan data. Lihat `docs/ROLE_EXPANSION_APPLICANT_SCHOOL_LEADER.md`.
