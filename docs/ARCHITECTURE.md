# Arsitektur Layanan dan Kepemilikan Data

## 1. Bentuk deployment

Satu origin browser disajikan oleh Nginx gateway yang meneruskan route API ke proses backend sesuai domain. Layanan dapat dikelola/restart terpisah di Docker Compose, namun saat ini seluruh layanan masih mengakses satu skema MySQL warisan untuk menjaga konsistensi data selama refactor.

- **Identity**: autentikasi, sesi, user, enam role, permission yang disetujui, system settings, audit teknis.
- **CMS**: branding tunggal, konten publik, draft/preview/publish dan metadata media.
- **Admissions**: periode, pendaftar, berkas, verifikasi, seleksi resmi, daftar ulang dan integrasi identitas siswa.
- **Academic**: master referensi akademik, kelas, enrollment, teaching assignments, versi roster, wali kelas sebagai assignment, absensi, QR arrival dan PKL.
- **Assessment**: nilai, status submission, review guru/wali kelas, paket rapor, approval Admin, versi publikasi.
- **Payroll**: realisasi mengajar, tarif, periode honor, satu approval operasional oleh Admin, pencatatan pembayaran.
- **Administration**: bantuan pendidikan, kelengkapan dan keputusan kelulusan, operasi administrasi yang telah dirutekan di sana.
- **Notification worker**: pengiriman notifikasi terjadwal/latar belakang.
- **QR renderer**: merender SVG melalui jaringan internal dengan token service-to-service; tidak dipublikasikan ke host.
- **MySQL + migration job**: satu pemilik deployment menjalankan migrasi/seed sebelum API menerima trafik.

## 2. Sumber kebenaran

- `school_programs` adalah master jurusan yang dipakai pilihan PPDB, program siswa, kelas, mapel, dan CMS.
- `teacher_records` adalah master data guru; `teacher_code` unik dan permanen menghubungkan referensi operasional. Satu record guru dibuat bersama user role `guru` dalam transaksi.
- `users` adalah identitas autentikasi. Role internal adalah `superadmin`, `admin`, `guru`, `siswa`, `applicant`, dan `school_leader`. Calon Murid memakai role `applicant`; `account_stage` (`applicant`/`student`) menunjukkan tahap proses tanpa mengganti identitas role calon murid.
- `student_records` adalah data induk peserta didik; `student_accounts` menautkannya ke akun login yang sama setelah PPDB selesai. Tidak membuat akun baru saat siswa diaktifkan.
- `classes` + `student_class_enrollments` menyimpan kelompok kelas dan histori keanggotaan per tahun ajaran.
- `teaching_assignments` menyimpan penempatan guru ke kelas dan mapel. `class_schedules` menyimpan slot waktu yang selalu terkait ke roster-version.
- `class_homeroom_assignments` mencatat guru yang ditunjuk wali kelas untuk suatu kelas/periode. Itu bukan role.
- `report_card_packages` adalah paket penerbitan rapor. Nilai sumber dan status paket tidak digabung menjadi satu flag yang tidak terlacak.

## 3. Alur antar-domain

1. Superadmin membuat jurusan/guru; Admin mengambil master tersebut melalui pilihan, bukan membuat salinan manual.
2. Calon Murid (role `applicant`, stage `applicant`) memilih master jurusan aktif, mengirim PPDB, mengikuti verifikasi/seleksi/daftar ulang.
3. Admissions memanggil proses integrasi transaksional untuk menautkan record siswa dan akun yang sama, setelah hasil diterima resmi dan daftar ulang selesai.
4. Admin menempatkan siswa ke kelas/program, menetapkan teaching assignment, menentukan wali kelas, lalu mengelola roster mingguan versi draf.
5. Roster hanya menjadi sumber jadwal aktif setelah validasi konflik dan publikasi; roster sebelumnya disimpan sebagai `superseded`.
6. Guru mengisi absensi/nilai pada assignment miliknya; Admin mengkaji absensi. Guru wali kelas hanya mempunyai akses laporan pada kelas/periode yang benar-benar ditugaskan.
7. Nilai melewati submission guru, review/rekap wali kelas, review Admin dan publikasi paket. Siswa hanya menerima laporan yang diterbitkan untuk identitasnya.
8. Event/notifikasi lintas-domain perlu idempotensi dan retry. Pada fase ini beberapa domain masih memanggil database yang sama; ekstraksi penuh perlu kontrak API/event yang dibekukan terlebih dulu.

## 4. Rekomendasi tahap berikutnya

Microservices tidak mensyaratkan satu server atau satu DB server untuk setiap modul di tahap awal, tetapi tiap layanan perlu memiliki kontrak dan ownership yang eksplisit. Sebelum mengekstrak database masing-masing:

- selesaikan inventaris tabel/endpoint yang ditulis oleh lebih dari satu service;
- tentukan service pemilik dan API pengganti untuk semua cross-domain writes;
- tambahkan event outbox/idempotency untuk efek samping lintas domain;
- migrasikan data tanpa downtime yang tidak terkontrol, lalu jalankan uji konsistensi;
- atur kredensial database least-privilege per service setelah tidak ada query lintas domain langsung.
