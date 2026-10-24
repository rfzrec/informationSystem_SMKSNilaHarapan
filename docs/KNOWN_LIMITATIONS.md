# Status Verifikasi dan Pekerjaan yang Wajib Diuji

ZIP ini adalah hasil implementasi/refactor statis yang diarahkan oleh PRD, bukan bukti bahwa seluruh fitur sudah siap produksi. Lingkungan pembuatan arsip tidak menyediakan Docker runtime dan database MySQL aktif.

## Sudah diubah/ditambahkan pada source

- Model role enam bagian: `superadmin`, `admin`, `guru`, `siswa`, `applicant`, `school_leader`. Role pimpinan harus ditetapkan manual pada akun yang diverifikasi; migrasi tidak menebak akun pimpinan dari akun admin.
- Admin menangani PPDB dan CMS; tidak ada portal login wali/orang tua.
- Superadmin membuat jurusan dan guru; guru dibuat bersama record guru, akun login, role guru, serta kode unik permanen.
- Penugasan wali kelas bukan role; assignment menjadi sumber backend untuk menu/akses review rapor.
- Versi roster mingguan dengan draf, pemeriksaan konflik, publikasi serta histori.
- Queue persetujuan Admin untuk absensi siswa, absensi sesi guru dan QR daily check-in.
- Flow nilai → wali kelas yang ditugaskan → Admin → rapor terbit, dan pembatasan siswa pada data yang dipublikasikan miliknya.
- Approval honor dipadatkan menjadi satu approval Admin, dengan migrasi yang mempertahankan data persetujuan lama.
- Perubahan kata sandi diwajibkan sebelum akun berkredensial sementara memanggil API bisnis.
- ZIP tidak menyertakan `.env` kerja; `.env.example` menjadi template lokal.

## Belum dapat dibuktikan di lingkungan ini

- `docker compose up --build`, health check container, migrasi MySQL 8.4, dan seed pada database bersih maupun database upgrade.
- Seluruh interaksi browser untuk enam role dan semua state transitions lintas-service.
- Tes penetrasi akses silang siswa/guru/admin; skenario IDOR untuk semua endpoint.
- Presensi kamera/GPS di perangkat nyata, HTTPS/cookie behavior, email provider dan retry produksi.
- Validitas data resmi sekolah, bobot nilai/rapor, persyaratan PPDB, kebijakan biaya/honor/bantuan/PKL/kelulusan yang masih perlu ditetapkan sekolah.
- Isolasi database penuh per microservice dan message broker/outbox lintas domain.
- Per-task gradebook yang lengkap serta integrasi formal dengan e-Rapor resmi bila diwajibkan.

## Checklist workstation sebelum digunakan

1. Salin `.env.example` menjadi `.env`, ganti nilai pengembangan dan jangan bagikan `.env`.
2. Jalankan `docker compose -f docker-compose.yml config`, lalu build/start container dan periksa health/log.
3. Migrasikan database uji bersih; uji juga upgrade salinan database lama dan pastikan backup dapat dipulihkan.
4. Buat guru melalui Superadmin; pastikan record guru, teacher code dan user login terbentuk satu kali dan wajib ganti sandi berlaku.
5. Buat jurusan dan pastikan muncul pada pilihan PPDB serta dashboard Admin. Uji jurusan yang dinonaktifkan tidak muncul untuk pendaftar baru.
6. Jalankan PPDB lengkap hingga aktivasi siswa; uji duplicate submit, duplikat NIK, akun yang sudah terhubung, koreksi berkas dan daftar ulang.
7. Buat kelas, assign siswa dari jurusan yang benar, guru/mapel, wali kelas dan roster draf. Coba konflik guru/kelas/ruang; publikasi harus gagal jika konflik belum diperbaiki.
8. Catat absensi, kirim sesi untuk review, uji approve/return dan pastikan siswa hanya melihat status yang diizinkan.
9. Isi nilai guru, submit, rekap wali kelas, publish/return oleh Admin, dan pastikan akun siswa A tidak bisa membuka rapor siswa B.
10. Uji fee confirmation, honor approval, bantuan, PKL, graduation, file privat, session revocation, dan audit trail.
11. Uji backup/restore serta lakukan UAT bersama Admin Sekolah dan guru sebelum go-live.
