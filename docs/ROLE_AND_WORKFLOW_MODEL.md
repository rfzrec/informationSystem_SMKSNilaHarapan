# Model Role dan Workflow Target

Dokumen ini mengikuti keputusan terbaru: **enam role internal** (`superadmin`, `admin`, `guru`, `siswa`, `applicant`, `school_leader`). Calon Murid memakai role `applicant` tersendiri; Pimpinan Sekolah mencakup Kepala Sekolah dan Kepala Yayasan. Website publik tidak memerlukan akun. Orang tua/wali merupakan data pada formulir PPDB dan tidak diberi portal login. Wali kelas merupakan penugasan guru per kelas/periode, bukan role.

## 1. Matriks kewenangan

| Domain | Superadmin | Admin | Guru | Siswa |
|---|---|---|---|---|
| User akun admin/superadmin | Kelola | Tidak mengelola akun teknis | — | — |
| Master jurusan | Buat/ubah/aktifkan | Baca/pilih | — | Baca info publik |
| Master guru dan kode unik | Buat guru + akun dalam satu transaksi | Baca/pilih untuk tugas | Kelola data pribadi terbatas sesuai fitur yang tersedia | — |
| Website/CMS | Teknis saja | Kelola draf, preview, publish | — | — |
| PPDB | Tidak mengerjakan operasional rutin | Semua operasi PPDB | — | Tahap `applicant`: mengelola pengajuan sendiri |
| Data induk dan penempatan siswa | Teknis saja | Kelola | — | Baca milik sendiri |
| Kelas dan mata pelajaran | Mengelola master jurusan saja | Kelola | Baca sesuai penugasan | Baca jadwal terbit |
| Penugasan guru dan roster | — | Membuat draf dan publish | Baca jadwal yang ditugaskan | Baca roster kelas yang terhubung |
| Penugasan wali kelas | — | Menetapkan/menutup penugasan | Mendapat kemampuan review hanya selama assignment berlaku | Data wali kelas aktif dapat dilihat |
| Absensi guru/siswa | Tidak melakukan review rutin | Meninjau, menyetujui, atau mengembalikan | Check-in dan mencatat sesi yang ditugaskan | Melihat absensi pribadi yang telah disetujui |
| Nilai/rapor | Tidak mengubah nilai operasional | Review paket dan publish/return | Isi nilai; wali kelas berdasarkan penugasan merekap kelasnya | Hanya melihat rapor diri yang diterbitkan |
| Biaya/honor/bantuan/PKL/kelulusan | Teknis, kecuali izin eksplisit yang diaudit | Operasional sesuai batas domain | Data honor pribadi dan PKL jika ditugaskan | Status pribadi yang diizinkan |
| Audit dan monitoring | Audit teknis menyeluruh | Aktivitas operasional sesuai akses | Riwayat milik/penugasan sendiri bila disediakan | Status/riwayat pribadi yang ditampilkan |

## 2. Master jurusan

- `school_programs` adalah sumber kebenaran jurusan; tabel ini digunakan PPDB, data induk siswa, kelas, mata pelajaran, dan halaman program pada CMS.
- Superadmin membuat/ubah kode, nama, ringkasan, dan status aktif. Kode seperti `TKJ`, `TSM`, dan `TB` adalah kode bisnis stabil. Menonaktifkan jurusan yang masih dipakai siswa/kelas aktif ditolak.
- Admin membaca master tersebut dan tidak mengetik ulang jurusan sebagai free-text ketika membuat kelas atau menempatkan siswa.
- Pilihan PPDB hanya menampilkan jurusan aktif. Deskripsi publik tetap harus diterbitkan Admin melalui CMS; keaktifan internal bukan berarti konten publik otomatis terbit.
- Pilihan pertama calon siswa digunakan sebagai program utama awal untuk integrasi data induk; perubahan jurusan berikutnya harus menjadi perubahan administratif yang tercatat, bukan rewrite diam-diam atas riwayat pendaftaran.

## 3. Master guru dan kode unik

- Superadmin membuat data guru dan akun login bersama dalam satu transaksi database.
- Record guru terhubung satu-ke-satu dengan user role `guru`.
- `teacher_code` dibuat setelah record dibuat, bersifat unik/permanen, contoh format `GURU-000123`. Kode digunakan untuk referensi, bukan autentikasi dan bukan pengganti hak akses.
- Kata sandi sementara bersifat acak, tampil hanya sekali pada hasil pembuatan, wajib diganti saat login pertama, dan harus dikirim lewat kanal aman.
- Admin melihat kode dan daftar guru dari master yang sama; untuk roster, mapel, kelas dan wali kelas Admin memilih record yang sudah ada. Tidak boleh membuat duplikat guru karena kebutuhan penugasan.
- Ketika guru keluar, nonaktifkan akun dan record; jangan hapus histori pengajaran/absensi/nilai.

## 4. Calon siswa hingga siswa aktif

1. Registrasi membuat user role `applicant`, `account_stage='applicant'`, dan satu record applicant.
2. Pemohon melengkapi profil, orang tua/wali (data saja), pendidikan asal, pilihan PPDB, dan dokumen.
3. Saat dikirim, data dikunci sampai dikembalikan untuk koreksi.
4. Admin memverifikasi dokumen, menangani koreksi, mengelola keputusan seleksi, mengumumkan hasil resmi, dan memverifikasi daftar ulang.
5. Integrasi hanya berjalan untuk hasil diterima resmi dengan daftar ulang selesai.
6. Integrasi membuat/menautkan `student_records`, `student_accounts`, serta enrollment berikutnya tanpa membuat user baru. Akun yang sama tetap role `applicant`, tetapi `account_stage` berubah ke `student`; permission akademik pribadi diberikan berdasarkan tahap akun tanpa mengganti identitas role.
7. Jika NIK telah terhubung ke siswa lain atau relasi akun bentrok, hentikan proses dan tandai perlu pemeriksaan manusia. Jangan menduplikasi siswa otomatis.
8. Admin menempatkan siswa aktif ke kelas/program. Histori enrollment tetap tersimpan saat kenaikan/perpindahan kelas.

## 5. Guru dan wali kelas

- Semua guru memakai role `guru`; tidak ada role terpisah untuk wali kelas atau guru mapel.
- Admin membuat `teaching_assignments` dari kelas, mata pelajaran, guru, dan periode yang sah.
- Admin memilih roster mingguan berdasarkan penugasan tersebut. Slot jadwal memeriksa benturan guru, kelas, ruang, dan waktu.
- Perubahan roster selalu dilakukan melalui versi draf. Versi yang sudah terbit tidak diedit/hapus; versi baru harus divalidasi lalu diterbitkan. Versi lama menjadi `superseded` dan tetap tersimpan.
- Admin menetapkan wali kelas lewat relasi `class_homeroom_assignments` per kelas dan tanggal. Backend mengecek assignment pada setiap endpoint review rapor; menu saja tidak memberikan akses.

## 6. Approval absensi dan rapor

### Absensi
- Guru mencatat absensi hanya dari sesi yang terkait jadwal/penugasan miliknya.
- Setelah sesi lengkap dan ditutup, status masuk antrean `pending`.
- Admin dapat `approved` atau `returned`. Pengembalian wajib disertai alasan. Perbaikan dicatat beserta aktor, waktu, alasan, dan nilai sebelumnya/baru.
- Check-in QR kedatangan guru berbeda dari presensi mengajar per sesi. QR yang valid adalah sinyal, bukan jaminan anti-spoof GPS.
- Dashboard siswa hanya menampilkan catatan dengan status yang telah disetujui.

### Nilai dan rapor
- Guru memasukkan nilai per penugasan dan periode; data kosong berbeda dari nol.
- Guru mengirim nilai secara eksplisit; status bukan publik sampai proses review selesai.
- Bila guru ditugaskan sebagai wali kelas untuk kelas/periode tersebut, ia memeriksa kelengkapan seluruh siswa dan mapel, meminta koreksi, menyusun paket, dan mengirimkannya ke Admin.
- Admin menerbitkan atau mengembalikan paket. Nilai sumber tidak diedit diam-diam oleh Admin; revisi harus berversi/audited.
- Siswa hanya memperoleh paket yang dipublikasikan dan hanya baris yang terhubung ke student record dirinya.

## 7. Aturan keamanan lintas layanan

Setiap operasi sensitif memvalidasi identitas user, role/permission, hubungan terhadap objek, dan status workflow. ID angka/UUID/kode bisnis tidak dianggap sebagai izin. Backend tidak memercayai `student_id`, `teacher_id`, role, atau akun yang dikirim dari browser tanpa memeriksa hubungannya ke sesi login.

Dokumen PPDB dan bantuan adalah berkas privat. Logo/foto yang sudah disetujui untuk publik adalah media publik. Perubahan keputusan, nilai, absensi, pembayaran, relasi, role dan status aktivasi harus memiliki transaksi serta jejak audit. Penghapusan record akademik permanen bukan tindakan sehari-hari; gunakan penonaktifan dan retensi historis.

## 8. Batas implementasi yang harus diuji

Pemisahan container bukan isolasi database penuh. Service saat ini masih memakai satu skema MySQL sebagai tahap migrasi. Sebelum go-live, uji migrasi clean-install/upgrade, seluruh alur lintas-role, pembatasan object-level, konflik roster, duplikasi aktivasi, private file access, outbox/retry notifikasi, serta backup/restore.


## Perluasan role V3 (migrasi 021)

Role `applicant` dipisahkan dari `siswa` dan identitas role calon murid dipertahankan ketika `account_stage` menjadi `student`. Role `school_leader` dipakai bersama oleh Kepala Sekolah dan Kepala Yayasan dengan permission baca-saja secara default. Detail penerapan dan pengujian ada di `docs/ROLE_EXPANSION_APPLICANT_SCHOOL_LEADER.md`.
