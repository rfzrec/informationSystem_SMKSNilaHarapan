# PRODUCT REQUIREMENTS DOCUMENT (PRD)
## Sistem Informasi Sekolah Terintegrasi — SMKS Nila Harapan TIK Sunggal

**Versi:** 1.0  
**Status:** Baseline spesifikasi untuk audit, perancangan, implementasi, dan pengujian  
**Pemilik proses bisnis:** SMKS Nila Harapan TIK Sunggal  
**Konteks pengembangan:** Tugas Akhir Program Studi Teknik Informatika, Universitas Mikroskil  
**Bahasa aplikasi:** Bahasa Indonesia  
**Jenis produk:** Satu aplikasi web terintegrasi dengan website publik, portal pengguna, dan CMS/admin  

> **Catatan penggunaan:** PRD ini menetapkan target perilaku sistem. PRD bukan bukti bahwa fitur telah tersedia pada repository yang sedang ada. Semua fitur wajib diperiksa terhadap kode, database, API, pengujian, dan deployment aktual. Ketentuan yang belum ditetapkan pihak sekolah harus diimplementasikan sebagai konfigurasi atau kebijakan yang dapat diubah, bukan ditanam secara permanen ke kode.

---

## Struktur Dokumen

1. Ringkasan Eksekutif
2. Latar Belakang dan Konteks
3. Tujuan Produk, Batasan, dan Definisi Sukses
4. Pemangku Kepentingan dan Persona
5. Model Produk dan Arsitektur Konseptual
6. Peran, Izin, dan Matriks Akses
7. Informasi Navigasi dan Dashboard per Peran
8. Siklus Data dan Sumber Kebenaran
9. Spesifikasi Fungsional per Modul
10. Model Data Logis dan Distribusi Database
11. State Machine dan Transisi Status
12. Aturan Bisnis Lintas Modul
13. Spesifikasi API dan Kontrak Integrasi
14. UI/UX, Aksesibilitas, dan Konten
15. Keamanan, Privasi, dan Tata Kelola Data
16. Kinerja, Reliabilitas, dan Kebutuhan Nonfungsional
17. Infrastruktur, Deployment, dan Operasional
18. Integrasi Eksternal
19. Strategi Migrasi dan Audit Repository yang Sudah Ada
20. Strategi Implementasi dan Distribusi Pekerjaan
21. Strategi Pengujian dan Kriteria Penerimaan
22. Risiko, Dependensi, dan Mitigasi
23. Asumsi dan Keputusan Default untuk Realisasi
24. Deliverable Proyek
25. Kriteria Go-Live
26. Traceability: Kebutuhan ke Modul dan Bukti Uji
27. Glossary
28. Penutup dan Aturan Eksekusi

---

# 1. Ringkasan Eksekutif

Produk yang dibangun adalah sistem informasi sekolah terintegrasi untuk SMKS Nila Harapan TIK Sunggal. Produk mencakup website publik untuk informasi dan branding sekolah, CMS untuk memperbarui konten, serta portal operasional untuk PPDB, data induk, tahun ajaran, rombongan belajar, jadwal, absensi guru, absensi siswa, nilai dan rapor, pemberitahuan biaya, pencatatan data honor/gaji guru, bantuan pendidikan, PKL, kelulusan, notifikasi, laporan, audit, dan administrasi sistem.

Seluruh modul harus menggunakan identitas data yang konsisten. Data guru tidak dibuat ulang sebagai data terpisah di modul jadwal, absensi, nilai, dan pencatatan honor. Data siswa yang diterima dari PPDB harus diaktifkan menjadi data siswa tanpa mengetik ulang identitasnya. Penempatan siswa ke kelas harus mengikuti riwayat tahun ajaran. Jadwal yang diterbitkan menjadi sumber jadwal untuk guru dan siswa serta menjadi konteks pembentukan sesi absensi dan input nilai.

Produk bukan ERP keuangan penuh, bukan sistem pembayaran, bukan LMS/e-learning, dan bukan sistem penggajian atau transfer dana. Modul biaya dan honor/gaji berfungsi sebagai pencatatan, status, pengingat, verifikasi, serta laporan internal. Integrasi resmi ke aplikasi pemerintah atau e-Rapor eksternal tidak boleh diklaim tersedia sebelum format, akses, dan mekanisme integrasinya benar-benar diverifikasi.

## 1.1 Hasil bisnis yang dituju

1. Informasi sekolah selalu tersedia dan bisa dikelola oleh petugas sekolah tanpa mengubah kode program.
2. Proses PPDB memiliki jejak dari pendaftaran sampai aktivasi siswa.
3. Data guru, siswa, program keahlian, mata pelajaran, kelas, dan tahun ajaran menjadi sumber data resmi lintas modul.
4. Jadwal, absensi, nilai, dan rapor terhubung ke kelas, periode akademik, guru, dan siswa yang benar.
5. Proses persetujuan dan koreksi tercatat; pengguna tidak dapat diam-diam mengubah data yang telah dikirim atau diterbitkan.
6. Siswa hanya dapat melihat data miliknya sendiri; guru hanya dapat menjalankan tugas yang ditugaskan; petugas sekolah mendapat akses sesuai kewenangannya.
7. Admin mendapat daftar pekerjaan yang belum selesai dan laporan yang dapat ditindaklanjuti.
8. Sistem dapat dipelihara, diuji, dicadangkan, dipulihkan, serta diserahkan kepada sekolah dengan dokumentasi yang memadai.

## 1.2 Prinsip nonnegosiasi

- **Satu sumber kebenaran:** satu entitas utama untuk setiap identitas, bukan duplikasi per modul.
- **Backend sebagai penjaga aturan:** semua otorisasi, validasi, perhitungan, dan transisi status diverifikasi server-side.
- **Tidak ada penghapusan diam-diam:** data transaksional penting diarsipkan atau dibatalkan dengan alasan dan audit trail.
- **Status eksplisit:** draft, diajukan, ditinjau, dikembalikan, disetujui, diterbitkan, dan status lain dibedakan dengan jelas.
- **Nilai kosong berbeda dari nol:** nilai belum diisi tidak boleh otomatis dianggap nilai 0.
- **Jadwal dan hasil diterbitkan berversi:** perubahan setelah publikasi harus mempertahankan versi dan riwayat sebelumnya.
- **Privasi secara default:** data pribadi siswa, keluarga, nilai, bantuan, biaya, serta data kepegawaian tidak masuk halaman publik.
- **Kegagalan terlihat:** sistem menunjukkan validasi gagal, data belum lengkap, konflik jadwal, atau proses belum selesai; tidak menampilkan pesan sukses palsu.

# 2. Latar Belakang dan Konteks

Sekolah belum memiliki website resmi yang berfungsi sebagai pusat informasi sekaligus kanal administrasi digital. Website publik perlu mendukung calon siswa, orang tua/wali, siswa aktif, guru, dan pihak sekolah. Di sisi operasional, kebutuhan sekolah berkembang melampaui website profil biasa dan mencakup proses akademik serta administrasi.

Implementasi awal sudah pernah dikembangkan dengan bantuan AI dan dapat dijalankan pada lingkungan pengembang sebelumnya melalui Docker. Kematangan antarmuka tidak otomatis berarti alur bisnis, struktur database, otorisasi, atau integrasi datanya benar. Karena itu repository saat ini harus diperlakukan sebagai aset yang diaudit. Keputusan mempertahankan, memperbaiki, membangun ulang, atau menghapus modul dibuat setelah pemeriksaan kode dan data, bukan berdasarkan tampilan saja.

## 2.1 Identitas dan konteks sekolah

- Nama resmi: **SMKS Nila Harapan TIK Sunggal**.
- Nama branding singkat: **SMK Nila Harapan**.
- Alamat yang digunakan untuk informasi kontak: Binjai Km 11,2 II, Kecamatan Sunggal, Kabupaten Deli Serdang, Sumatera Utara, kode pos 20352.
- Program keahlian: **TKJ — Teknik Komputer dan Jaringan; TSM — Teknik Sepeda Motor; TB — Tata Busana**.
- Kepala sekolah: Irdawati (nama dapat ditampilkan pada halaman publik sesuai persetujuan sekolah).
- Telepon sekolah: 0618457561.
- Email yang tersedia: smknilaharapan@yahoo.co.id.
- Media sosial yang diketahui: Instagram dan Facebook sekolah; tautan harus dapat diedit melalui CMS.
- Lokasi: tautan Google Maps yang dikonfirmasi sekolah dan dikelola melalui CMS.
- NPSN dan rincian legal internal **tidak ditampilkan pada website publik** berdasarkan keputusan yang telah disampaikan.

Informasi kontak, nama, dan tautan di atas harus tetap dapat diubah admin melalui pengaturan/CMS tanpa perubahan kode. Informasi sensitif atau tidak dimaksudkan bagi publik tidak boleh otomatis dipromosikan ke halaman publik hanya karena tersedia dalam database.

# 3. Tujuan Produk, Batasan, dan Definisi Sukses

## 3.1 Tujuan produk

- Menyediakan satu pusat informasi sekolah yang resmi, responsif, mudah dibaca, dan mudah diperbarui.
- Menyediakan portal operasional dengan proses yang terukur dan terdokumentasi.
- Mengurangi input ulang dan inkonsistensi data.
- Mendukung pemantauan pekerjaan melalui dashboard dan notifikasi berdasarkan peran.
- Menyediakan data historis yang dapat ditelusuri untuk perubahan akademik dan administrasi.
- Menyediakan akses data yang dibatasi berdasarkan identitas, peran, penugasan, dan periode.
- Menyiapkan sistem untuk pemeliharaan jangka panjang setelah serah terima.

## 3.2 Di luar cakupan versi baseline

Kecuali kelak disetujui sebagai pengembangan terpisah, sistem **tidak** mencakup:

- E-learning penuh, kelas video, LMS, ujian daring dengan pengawasan, atau repositori materi belajar lengkap.
- Sistem keuangan/akuntansi sekolah penuh, buku besar, rekonsiliasi bank, pajak, atau laporan akuntansi resmi.
- Payment gateway, transfer bank otomatis, virtual account, atau pemrosesan uang secara langsung.
- Perhitungan payroll resmi dan pengiriman gaji ke rekening; modul honor/gaji hanya pencatatan dan status.
- Sistem biometrik wajah/fingerprint untuk absensi.
- Aplikasi native Android/iOS terpisah; target awal adalah web responsif.
- Integrasi otomatis ke sistem pemerintah, Dapodik, atau e-Rapor eksternal sebelum spesifikasi teknis dan hak aksesnya diverifikasi.
- Sistem nilai/rapor menggantikan aplikasi resmi pemerintah jika sekolah wajib menggunakannya; aplikasi ini dapat menyimpan, menampilkan, mencetak, dan mengekspor data sesuai kemampuan yang telah diuji.
- Pengelolaan akademik universitas atau multi-sekolah pada versi awal.

## 3.3 Ukuran keberhasilan

Keberhasilan tidak diukur dari banyaknya halaman atau komponen UI, tetapi dari kriteria berikut:

- Alur utama dapat diselesaikan dari awal sampai akhir dengan data database persisten.
- Tidak ada data contoh yang menyamar sebagai data produksi.
- PPDB yang disetujui tidak menghasilkan dua profil siswa untuk orang yang sama.
- Jadwal yang dipublikasikan memiliki pemeriksaan bentrok kelas, guru, ruang, dan rentang waktu.
- Absensi memiliki kaitan ke sesi/periode dan pencatat yang jelas.
- Nilai siswa tidak dapat diakses oleh siswa lain dengan mengganti URL atau ID request.
- Rapor melewati pemeriksaan guru, wali kelas, dan Admin Sekolah sesuai alur persetujuan.
- Perubahan data penting dapat ditelusuri melalui audit log.
- Backup dapat dipulihkan pada lingkungan pengujian dan hasilnya diverifikasi.
- Sekolah dapat mengelola konten website melalui CMS tanpa bantuan developer harian.
- Dokumentasi penggunaan dan teknis tersedia saat serah terima.

# 4. Pemangku Kepentingan dan Persona

| Persona | Tujuan utama | Akses umum | Batas utama |
|---|---|---|---|
| Pengunjung publik | Mencari profil, program, fasilitas, kegiatan, berita, dan informasi PPDB | Konten terbit yang berstatus publik | Tidak ada akses ke data operasional atau pribadi |
| Calon siswa/pemohon PPDB | Mengisi pendaftaran, mengunggah dokumen, melihat status, memperbaiki kekurangan | Profil dan aplikasi PPDB miliknya | Tidak dapat melihat aplikasi pemohon lain |
| Siswa aktif | Melihat jadwal, absensi, nilai/rapor, dan pemberitahuan pribadi | Data dirinya pada periode yang sah | Tidak dapat melihat data siswa lain atau data rahasia administrasi |
| Guru mata pelajaran | Melihat penugasan, jadwal, sesi, absensi kelas sesuai penugasan, dan memasukkan nilai mata pelajaran | Data sesuai penugasan dan periode | Tidak dapat mengubah nilai final secara diam-diam atau melihat modul sensitif tanpa izin |
| Wali kelas | Memantau kelas perwaliannya dan mengelola rekap rapor kelas | Data siswa/rapor pada kelas dan periode penugasan | Tidak otomatis berhak mengubah nilai sumber mata pelajaran |
| Admin Sekolah | Mengelola operasional sekolah, memverifikasi proses, publikasi, koreksi, laporan dan konten | Hak administratif operasional sesuai matriks akses | Tidak boleh mengubah data tanpa audit atau mengambil alih akun pengguna |
| Superadmin | Pengaturan teknis, konfigurasi aplikasi, akun/role, master akses dan kode unik guru | Pengaturan teknis; akses bisnis sensitif dibatasi secara default | Bukan pengelola rutin PPDB, jadwal, nilai, biaya, bantuan, atau konten kecuali diberi izin khusus dan tercatat |
| Pengelola teknis/developer saat transisi | Memelihara, memperbaiki, mencadangkan, dan menyerahkan sistem | Akses minimum sesuai masa kerja | Tidak mempertahankan akses produksi permanen tanpa persetujuan sekolah |

# 5. Model Produk dan Arsitektur Konseptual

## 5.1 Satu aplikasi, beberapa area

Aplikasi menyediakan tiga area dalam satu produk:

1. **Website publik:** halaman sekolah yang dapat diakses tanpa login.
2. **Portal pengguna:** dashboard berbeda untuk calon siswa, siswa, guru, wali kelas, Admin Sekolah, dan Superadmin.
3. **CMS dan administrasi:** pengelolaan konten publik serta data operasional sesuai role.

Ketiga area mengakses layanan backend dan database yang sama. Halaman boleh memiliki layout atau navigasi terpisah, namun tidak boleh menyimpan salinan identitas yang saling bertentangan.

## 5.2 Rekomendasi rancangan teknis

- Audit teknologi proyek yang ada terlebih dahulu; jangan mengunci stack baru sebelum repository dipahami.
- Gunakan arsitektur modular yang jelas. Untuk tim kecil, **modular monolith** lebih realistis daripada memecah setiap modul menjadi microservice.
- Pisahkan lapisan tampilan, logika bisnis, akses data, dan integrasi/file storage.
- Gunakan relasi database dan constraint untuk integritas; validasi frontend hanya untuk kenyamanan, bukan keamanan.
- Kelola perubahan skema melalui migration yang dapat ditinjau dan dijalankan berulang dengan aman.
- Semua environment (development, testing/staging, production) memiliki konfigurasi dan kredensial yang terpisah.
- File dokumen, foto, dan bukti disimpan melalui layanan penyimpanan berizin; metadata file disimpan di database.
- Gunakan antrean atau mekanisme terjadwal hanya jika dibutuhkan untuk notifikasi, backup, atau pekerjaan lama; fitur harus memiliki status dan log kegagalan.
- Sediakan endpoint/API internal yang konsisten apabila frontend dan backend dipisahkan.

Arsitektur, framework, database engine, dan penyedia hosting final diputuskan berdasarkan audit repository, kompetensi tim, biaya sekolah, dukungan, dan kebutuhan operasional. Semua opsi harus mendukung backup, pemulihan, keamanan, dan pemeliharaan.

## 5.3 Batas kepercayaan

- Browser dan payload klien tidak dipercaya sebagai sumber identitas, role, waktu resmi, atau hak akses.
- Data identitas dan nilai dihitung/ditentukan oleh backend.
- Jam server menjadi acuan timestamp transaksi; waktu perangkat pengguna hanya metadata tambahan.
- Berkas unggahan dianggap tidak tepercaya sampai divalidasi.
- Superadmin tidak otomatis memiliki hak untuk membaca setiap data sensitif hanya karena dapat mengelola konfigurasi sistem.
- Tautan file privat harus melewati otorisasi, bukan menggunakan URL publik yang tidak kedaluwarsa.

# 6. Peran, Izin, dan Matriks Akses

## 6.1 Definisi peran

### Superadmin
Bertanggung jawab pada konfigurasi teknis dan tata kelola akses: role/permission, status akun, pengaturan sistem, kode unik guru, referensi teknis, kebijakan keamanan, job backup, dan diagnosis operasional. Superadmin tidak bertanggung jawab terhadap transaksi harian sekolah. Hak untuk melihat atau memproses data bisnis sensitif perlu diberikan eksplisit jika diperlukan, dengan alasan dan audit.

### Admin Sekolah
Bertanggung jawab atas operasional: PPDB, siswa, guru, tahun ajaran, program, rombongan belajar, wali kelas, jadwal, pengecualian absensi, review/publikasi rapor, pencatatan biaya dan honor/gaji sesuai kewenangan, bantuan, PKL, kelulusan, CMS, laporan, dan pengelolaan data operasional.

### Guru
Melihat jadwal dan kelas yang ditugaskan, menjalankan absensi guru, mengisi absensi siswa pada sesi pelajaran yang sah, memasukkan nilai untuk mata pelajaran/kelas yang ditugaskan, mengirim nilai untuk ditinjau, melihat riwayat pengajuan, dan menerima notifikasi terkait. Guru yang ditunjuk sebagai wali kelas mendapat tambahan hak wali kelas sesuai penugasan dan periode.

### Siswa
Melihat jadwal dan data miliknya sendiri, status kehadiran, nilai dan rapor yang sudah diterbitkan, pemberitahuan biaya, status/berkas bantuan yang diizinkan, informasi PKL miliknya, serta notifikasi. Siswa tidak mengubah data akademik resmi.

### Calon siswa/pemohon PPDB
Membuat dan mengelola aplikasi PPDB miliknya, mengunggah berkas, menerima permintaan koreksi, mengirim ulang, serta melihat keputusan dan instruksi daftar ulang. Setelah aktivasi menjadi siswa, akses portal siswa ditautkan ke identitas yang sama.

## 6.2 Matriks akses berdasarkan peran

Hak akses dibangun dari kombinasi **role + izin tindakan + cakupan objek**. Ringkasan berikut menjelaskan akses standar; sistem tetap harus memeriksa kepemilikan, penugasan, periode, serta status objek pada setiap request.

### Pengunjung publik
- Dapat membaca hanya halaman, berita, pengumuman, event, profil, foto, dan dokumen yang diterbitkan sebagai konten publik.
- Dapat melihat info PPDB, syarat, program, kontak resmi, lokasi, dan tautan media sosial.
- Tidak dapat membaca draft CMS, daftar pemohon, data pribadi guru/siswa yang tidak diizinkan, dokumen privat, jadwal internal draft, nilai, absensi, biaya, bantuan, honor, atau audit.

### Calon siswa/pemohon PPDB
- Dapat membuat dan mengelola akun serta aplikasi PPDB miliknya; mengisi formulir, mengunggah dokumen, melihat kelengkapan, memperbaiki aplikasi yang dikembalikan, melihat keputusan, dan instruksi daftar ulang.
- Tidak dapat melihat atau mengubah aplikasi calon siswa lain, mengubah hasil verifikasi, menyetujui daftar ulang sendiri, atau mengaktifkan identitas siswa.

### Siswa aktif
- Dapat membaca profilnya, enrollment/kelas, jadwal dirinya, absensi dirinya, nilai dan rapor yang telah diterbitkan, kewajiban biaya dirinya, serta status bantuan/PKL/kelulusan yang diizinkan sekolah.
- Tidak dapat mengubah nilai atau absensi resmi, melihat siswa lain, melihat data honor guru, memverifikasi pembayaran, membaca dokumen bantuan milik siswa lain, atau membuka rapor yang belum diterbitkan.

### Guru mata pelajaran
- Dapat membaca jadwal, kelas, daftar enrollment, mapel, dan sesi yang ditugaskan pada periode yang berlaku.
- Dapat mencatat absensi siswa untuk sesi yang ditugaskan, melihat absensi dirinya sendiri, mengisi nilai asesmen untuk kelas/mapel yang ditugaskan, preview, submit, membaca alasan pengembalian, dan memperbaiki versi yang dikembalikan.
- Tidak dapat memanipulasi penugasan sendiri, memasukkan nilai untuk mapel/kelas lain, menerbitkan rapor final, mengubah nilai terkirim tanpa workflow, atau membuka modul biaya/honor/bantuan tanpa izin khusus.

### Wali kelas
- Mendapat seluruh hak guru yang relevan ditambah akses ke kelas yang secara resmi ditugaskan kepadanya dalam periode tersebut.
- Dapat melihat status pengumpulan nilai per mapel, kelengkapan semua siswa dalam kelas, menyusun rekap bulanan/UTS/UAS sesuai konfigurasi, preview rapor kelas, mengembalikan data kepada guru dengan alasan, finalisasi rekap, dan mengirim paket ke Admin Sekolah.
- Tidak dapat mengubah nilai sumber guru secara diam-diam, menerbitkan rapor final atas nama Admin, atau mengakses kelas/periode yang bukan penugasannya.

### Admin Sekolah
- Dapat mengelola operasional PPDB, data siswa dan guru, tahun ajaran, program, mapel, kelas, enrollment, wali kelas, penugasan, roster, exception absensi, workflow nilai/rapor, CMS, notifikasi, laporan, data biaya, data honor, bantuan, PKL, dan kelulusan sesuai hak akses operasional.
- Dapat mengembalikan atau menyetujui proses, mempublikasikan roster/rapor/konten, mengoreksi data yang diizinkan, mengelola status siswa, dan mengonfirmasi transaksi yang harus ditinjau Admin.
- Setiap koreksi pada data final wajib mempunyai alasan dan jejak sebelum/sesudah. Admin tidak boleh menyamar sebagai guru atau menghapus histori.

### Superadmin
- Dapat mengelola konfigurasi teknis, role/permission, status akun, kode unik guru, konfigurasi aplikasi, job backup, log teknis, dan dukungan deployment.
- Tidak otomatis mendapat akses default ke nilai, rapor, biaya, bantuan, honor/gaji, atau dokumen pribadi hanya karena berstatus Superadmin.
- Akses support/break-glass diberikan secara eksplisit untuk tujuan tertentu, dibatasi waktunya jika memungkinkan, dan dicatat dalam audit log.

### Developer/teknisi selama masa pengembangan
- Menggunakan environment development/staging dan data dummy/sanitized.
- Akses produksi hanya diberikan bila diperlukan, dibatasi, dicatat, dan dicabut atau ditinjau pada serah terima.
- Tidak menjadi pemilik tunggal domain, hosting, database, backup, email, atau kredensial admin setelah proyek diserahkan.

## 6.3 Aturan otorisasi wajib

1. Terapkan **Role-Based Access Control (RBAC)** dan pemeriksaan kepemilikan/penugasan pada setiap request.
2. Gunakan pemeriksaan tingkat objek: bukan hanya “pengguna berperan siswa”, tetapi “objek ini milik siswa yang sedang login”.
3. Untuk guru, validasi keterkaitan guru dengan jadwal, mata pelajaran, kelas, periode, dan sesi.
4. Untuk wali kelas, validasi penugasan wali kelas yang aktif pada kelas dan periode terkait.
5. Untuk Admin Sekolah, batasi akses ke data sensitif sesuai kebutuhan tugas dan catat perubahan.
6. Semua akses support/break-glass ke data pribadi harus dibatasi, memiliki alasan, masa berlaku jika memungkinkan, serta audit.
7. Menonaktifkan akun menghentikan akses tetapi tidak menghapus riwayat akademik/transaksi.
8. Jangan memakai ID numerik berurutan sebagai satu-satunya mekanisme keamanan.

# 7. Informasi Navigasi dan Dashboard per Peran

## 7.1 Website publik

Navigasi yang direncanakan: Beranda, Profil, Visi & Misi, Kepala Sekolah, Guru/Staff, Struktur Organisasi, Program Keahlian, Fasilitas, Ekstrakurikuler, Prestasi, Berita, Pengumuman, Kegiatan/Event, Galeri, PPDB, Kontak, dan tautan login bila diperlukan.

Beranda minimal memuat identitas singkat sekolah, hero/banner, pengenalan sekolah, program keahlian, ringkasan fasilitas/kegiatan/prestasi, berita atau pengumuman terbaru, ajakan/informasi PPDB, alamat/kontak, tautan media sosial, peta, dan footer. Statistik angka hanya ditampilkan jika sumber, tanggal pembaruan, dan izin publiknya jelas; jangan mengisi angka rekaan sebagai konten produksi.

## 7.2 Dashboard Admin Sekolah

Prioritaskan kartu/daftar tindakan: aplikasi PPDB menunggu verifikasi, berkas perlu koreksi, siswa siap aktivasi, data master belum lengkap, jadwal draft/konflik, sesi absensi belum selesai, anomali absensi guru, nilai belum dikirim, rapor menunggu pemeriksaan, biaya jatuh tempo/menunggu konfirmasi, status bantuan menunggu tinjauan, penempatan PKL belum lengkap, konten draft, serta backup atau proses yang gagal bila hak akses tersedia.

Setiap item dashboard harus mengarah ke halaman tindakan yang relevan. Angka ringkasan harus dihitung dari data database dan filter yang tepat, bukan angka hardcode.

## 7.3 Dashboard Guru

Menampilkan jadwal hari ini/minggu ini, tombol absensi guru, kelas/sesi yang perlu absensi siswa, kelas dan mapel yang diajar, nilai yang masih draft/belum lengkap, pengajuan nilai yang dikembalikan, notifikasi penugasan, dan status kehadiran pribadi. Guru tidak melihat daftar seluruh data sekolah kecuali terkait penugasan.

## 7.4 Dashboard Wali Kelas

Menampilkan kelas perwalian dan periode aktif, kelengkapan absensi, status nilai per mapel, siswa dengan data belum lengkap, rekap bulanan, UTS/UAS bila digunakan, paket rapor yang sedang dalam proses, pengajuan yang dikembalikan, dan tenggat yang dikonfigurasi.

## 7.5 Dashboard Siswa

Menampilkan jadwal siswa, ringkasan absensi, nilai/rapor yang sudah diterbitkan, notifikasi penting, informasi biaya pribadi, dan status PKL/bantuan yang memang boleh ditampilkan. Data yang belum dipublikasikan tidak ditampilkan seolah-olah final.

## 7.6 Dashboard Calon Siswa

Menampilkan progres formulir, kelengkapan berkas, permintaan perbaikan, status pemeriksaan, keputusan seleksi, dan instruksi daftar ulang. Setiap status memiliki penjelasan tindakan berikutnya.

## 7.7 Dashboard Superadmin

Menampilkan status layanan, kesehatan database/penyimpanan, akun dan role, kode unik guru, konfigurasi, job backup, log error, serta status environment. Dashboard teknis tidak membuka data nilai, biaya, bantuan, atau honor secara otomatis.

# 8. Siklus Data dan Sumber Kebenaran

## 8.1 Aliran data utama

1. **Identitas sekolah dan konten** → CMS menyimpan draft → preview → persetujuan/publikasi → website publik membaca hanya konten yang diterbitkan.
2. **PPDB** → pemohon membuat aplikasi → verifikasi dokumen → keputusan → daftar ulang → aktivasi satu identitas siswa → enrollment ke tahun ajaran/program/kelas.
3. **Data guru** → Superadmin membuat kode/akun atau petugas mengelola profil sesuai kewenangan → penugasan menghubungkan guru dengan mapel, kelas, periode, dan jadwal.
4. **Data akademik** → Admin menetapkan tahun ajaran, semester, program, kelas, mapel, ruang, dan wali kelas → jadwal dibuat sebagai draft → validasi konflik → jadwal dipublikasikan.
5. **Jadwal terbit** → menjadi sumber jadwal guru/siswa, dasar pembentukan sesi pelajaran, absensi, dan konteks periode input nilai.
6. **Absensi guru** → record check-in/check-out sesuai kebijakan → validasi/anomali → finalisasi atau koreksi Admin dengan audit → laporan absensi.
7. **Absensi siswa** → sesi pelajaran → guru mencatat status tiap siswa → submit/finalisasi sesi → wali kelas/Admin melihat ringkasan → laporan siswa.
8. **Nilai** → komponen asesmen → guru input → cek/pratinjau → kirim → wali kelas rekap → Admin validasi/publikasi → siswa membaca rapor yang diizinkan.
9. **Biaya** → Admin membuat kewajiban/periode → siswa menerima pemberitahuan → pembayaran dilakukan di luar sistem → siswa mengirim konfirmasi/bukti bila kebijakan mengizinkan → Admin memverifikasi → status disimpan sebagai histori.
10. **Honor/gaji** → data kehadiran dan komponen pencatatan → Admin memeriksa pengecualian → pencatatan disetujui sesuai kebijakan → laporan internal; bukan transfer dana otomatis.
11. **Bantuan** → program dan persyaratan → aplikasi/daftar kandidat → verifikasi → usulan/hasil resmi → pemberitahuan terbatas.
12. **PKL** → penempatan siswa → supervisor/periode → jurnal/monitoring jika digunakan → evaluasi → hasil masuk ke ringkasan akademik sesuai aturan.
13. **Kelulusan** → mengumpulkan sinyal kelengkapan nilai, absensi, PKL, dan administrasi → menandai kekurangan → keputusan final dicatat oleh pihak berwenang → pemberitahuan sesuai izin.

## 8.2 Prinsip sumber kebenaran lintas modul

- **Profil sekolah dan kontak:** sumbernya pengaturan sekolah/CMS; dipakai oleh website, formulir, footer, dan notifikasi. Jangan menyalin sebagai konstanta di tiap halaman.
- **Guru:** master guru menjadi sumber untuk akun, jadwal, mapel, wali kelas, absensi, honor, dan PKL. Jangan membuat entri guru terpisah di setiap modul.
- **Siswa:** master siswa yang berasal dari aktivasi PPDB atau registrasi resmi menjadi sumber untuk kelas, jadwal, absensi, nilai, rapor, biaya, bantuan, PKL, dan kelulusan. Jangan membuat profil baru saat siswa naik kelas atau berganti periode.
- **Pemohon PPDB:** aplikasi PPDB menjadi sumber verifikasi, seleksi, dan daftar ulang; setelah aktivasi, aplikasi tertaut ke `student_id` yang dibuat satu kali.
- **Tahun ajaran/semester:** master kalender akademik menjadi sumber untuk semua transaksi akademik. Jangan menggunakan string periode bebas tanpa relasi.
- **Program keahlian:** master program menjadi sumber PPDB, siswa, kelas, statistik publik, dan laporan; singkatan program harus konsisten.
- **Kelas/rombongan belajar:** master kelas per periode menjadi sumber jadwal, wali kelas, absensi, dan nilai. Kelas tahun lalu tidak boleh ditimpa.
- **Jadwal terbit:** versi roster yang diterbitkan menjadi sumber jadwal guru/siswa serta konteks pembentukan sesi absensi dan penugasan akademik. Perubahan jadwal lampau harus berversi dan terlacak.
- **Kehadiran guru:** transaksi absensi guru menjadi sumber dashboard/laporan dan input pendukung pencatatan honor. Jangan menyimpulkan kecurangan atau potongan gaji otomatis tanpa review.
- **Kehadiran siswa:** record absensi per sesi menjadi sumber ringkasan kehadiran. Sesi kosong tidak otomatis berarti seluruh siswa absen.
- **Nilai:** data asesmen dan submission resmi menjadi sumber rekap dan rapor. Jangan menimpa nilai final tanpa versi/riwayat.
- **Rapor:** paket laporan per siswa/kelas/periode/versi menjadi sumber tampilan, print, dan export. Jangan mengambil nilai dari periode yang salah atau menampilkan draft sebagai final.
- **Kewajiban biaya dan konfirmasi pembayaran:** ledger biaya internal menjadi sumber status siswa terkait. Status lunas tidak menghapus riwayat.
- **Bantuan:** program, aplikasi, verifikasi, dan hasil menjadi sumber informasi bantuan; jangan memublikasikan berkas atau detail sensitif tanpa izin.
- **PKL:** penempatan dan evaluasi menjadi sumber status PKL; siswa dari kelas yang sama dapat memiliki tempat PKL berbeda.
- **Kelulusan:** catatan keputusan resmi menjadi sumber status kelulusan. Sistem boleh menandai data kurang, tetapi tidak memutuskan lulus otomatis hanya dari satu indikator.
- **Konten website:** CMS hanya mengirim konten dengan status publikasi sah ke website publik. File draft/privat tidak boleh tersedia melalui URL publik.

# 9. Spesifikasi Fungsional per Modul

## 9.1 Autentikasi, akun, dan sesi

### Kebutuhan
- Login dan logout yang aman.
- Pemulihan kata sandi melalui mekanisme yang dikonfigurasi dan dapat diverifikasi.
- Akun dapat berstatus aktif, ditangguhkan, dinonaktifkan, atau menunggu aktivasi.
- Role diberikan melalui relasi akun-role/permission; jangan menanam satu role tunggal yang tidak bisa berkembang jika kebutuhan bertambah.
- Satu akun dapat mempunyai lebih dari satu penugasan/fungsi (contoh guru sekaligus wali kelas) tanpa menggandakan akun guru.
- Admin dapat memaksa reset kata sandi atau mencabut sesi dengan log alasan sesuai hak akses.
- Superadmin dapat membuat dan mengatur akun sistem. Pembuatan identitas guru/siswa tetap harus merujuk entitas orang/guru/siswa agar akun tidak menjadi master data kedua.
- Akun publik calon siswa hanya dapat mengelola aplikasi miliknya.
- Login, logout, gagal login, reset, perubahan role, lockout, dan perubahan status akun dicatat secukupnya.

### Aturan
- Kata sandi tidak pernah disimpan dalam bentuk plaintext.
- Terapkan rate limit pada login, reset password, unggahan, dan endpoint sensitif.
- Pesan pemulihan akun tidak membocorkan apakah alamat tertentu terdaftar.
- Session/token disimpan dengan praktik keamanan sesuai arsitektur; invalidasi saat logout, reset, atau penonaktifan akun.
- Bila akun guru/siswa ditautkan ke entitas, keterkaitan tersebut harus unik sesuai kebijakan dan tidak boleh dialihkan hanya dengan mengubah request.
- Akun teknis awal dan kredensial awal harus diganti saat serah terima produksi.

## 9.2 Master data sekolah dan konfigurasi akademik

### Entitas yang dikelola
- Identitas dan pengaturan sekolah.
- Tahun ajaran dan semester/periode.
- Kalender pendidikan, hari belajar, hari libur, dan aturan periode.
- Program keahlian.
- Mata pelajaran dan kategori mapel.
- Guru/staff dan status keaktifan.
- Ruang/lokasi.
- Tingkat/kelas/rombongan belajar per tahun ajaran.
- Komponen penilaian dan skala nilai.
- Status dan alasan ketidakhadiran.
- Kategori biaya, bantuan, kegiatan, dan status PKL.

### Aturan
- Master dengan transaksi terkait tidak boleh dihapus secara fisik; nonaktifkan atau arsipkan.
- Kode program, mapel, ruang, dan guru harus unik sesuai ruang lingkup yang ditentukan.
- Perubahan master tidak boleh mengubah histori transaksi lama secara tidak terduga.
- Periode akademik memiliki tanggal mulai/akhir serta penanda aktif; sistem mencegah transaksi pada periode yang tidak sah kecuali Admin memiliki override dengan alasan.
- Program awal harus menyediakan TKJ, TSM, dan TB; tambahan program di masa depan melalui master data.
- NPSN/legal data yang disepakati tidak publik tidak boleh ditampilkan melalui template website atau metadata publik.

## 9.3 Pengelolaan guru dan kode unik

### Fitur
- Pembuatan profil guru dengan kode unik yang dibuat/dikelola Superadmin.
- Informasi minimum: kode internal, nama lengkap, jenis status, status aktif/nonaktif, data kontak internal seperlunya, foto/profil publik opsional, pendidikan, bidang/mapel, tanggal mulai/akhir bila diperlukan, dan akun terkait.
- Penugasan guru terhadap mata pelajaran, kelas, periode, dan posisi wali kelas dikelola terpisah dari profil pokok.
- Riwayat perubahan data guru dan penugasan dipertahankan.
- Guru nonaktif tidak dapat ditugaskan ke jadwal baru, tetapi histori jadwal/absensi/nilai tetap tersimpan.

### Aturan kode
- Kode guru dihasilkan berdasarkan pola yang dikonfigurasi atau dimasukkan Superadmin dengan pemeriksaan uniqueness server-side.
- Kode tidak boleh berubah hanya karena guru pindah kelas, semester, mapel, atau role.
- Kode yang sudah digunakan tidak boleh dipakai ulang untuk guru lain walaupun akun lama dinonaktifkan.
- Kode internal tidak otomatis ditampilkan di website publik.

## 9.4 Website publik dan CMS

### Tipe konten
- Beranda/hero/banner dan pengaturan section.
- Profil sekolah, visi dan misi, sambutan kepala sekolah.
- Kepala sekolah dan guru/staff publik.
- Struktur organisasi.
- Program keahlian: TKJ, TSM, TB.
- Fasilitas.
- Ekstrakurikuler.
- Prestasi.
- Berita.
- Pengumuman.
- Kegiatan/event.
- Album dan galeri multi-foto.
- Informasi PPDB.
- Kontak, alamat, telepon/email, Google Maps, media sosial.
- Statistik beranda bila disetujui dan bersumber dari data valid.

### Kapabilitas CMS
- CRUD untuk konten yang berhak dikelola.
- Draft → Preview → Publish; dukung unpublish/archive bila diperlukan.
- Slug unik, judul, ringkasan, isi, gambar unggulan, kategori/tag, penulis internal, waktu terbit, status, dan metadata publik yang relevan.
- Upload banyak gambar ke satu album; caption dan urutan foto dapat diatur.
- Preview harus menyerupai tampilan publik, tetapi tidak boleh membuat draft dapat diakses publik tanpa autentikasi.
- Riwayat perubahan konten penting, penulis, dan waktu publikasi.
- SEO dasar: title, description, URL canonical jika sesuai, Open Graph image, sitemap, robots policy, dan alt text gambar.
- Pengelolaan tautan sosial dan kontak melalui pengaturan, bukan hardcode.
- Konten tanpa gambar tidak boleh merusak layout; tampilkan fallback yang layak.
- Admin dapat memeriksa tautan, status publikasi, dan tanggal konten yang perlu diperbarui.

### Aturan publikasi
- Halaman publik hanya membaca konten dengan status published dan waktu publikasi valid.
- Perubahan pada konten published dilakukan melalui revisi yang dapat dipreview; publikasi revisi dicatat.
- NPSN dan rincian legal yang tidak diizinkan tidak muncul di metadata HTML, schema markup, sitemap, file publik, atau API publik.
- Foto siswa hanya dipublikasikan sesuai persetujuan/kebijakan yang dimiliki sekolah; sistem setidaknya memberi peringatan/editorial checklist dan tidak menggunakan foto contoh sebagai aset produksi.
- Kontak pribadi staf tidak ditampilkan kecuali eksplisit disetujui sebagai kontak publik.

## 9.5 PPDB online

### Tahap proses
1. Admin membuat periode PPDB, jalur/program yang dibuka, kuota jika berlaku, jadwal, syarat, daftar dokumen, instruksi, kontak, dan status publikasi.
2. Calon siswa/pemohon membuat akun atau memulai formulir melalui mekanisme yang dirancang; sistem memberi nomor aplikasi yang unik.
3. Pemohon mengisi biodata dan data wali sesuai kebutuhan, pilihan program, asal sekolah, alamat, kontak, dan dokumen yang diminta.
4. Sistem menyimpan draft dan menandai field/berkas belum lengkap.
5. Pemohon mengirim aplikasi; setelah submit, snapshot data dan timestamp pengajuan tercatat.
6. Admin memeriksa formulir dan berkas; aplikasi menjadi menunggu verifikasi.
7. Admin dapat menyetujui kelengkapan, menolak dengan alasan, atau mengembalikan untuk koreksi. Permintaan koreksi mencantumkan field/berkas dan tenggat jika dipakai.
8. Pemohon memperbarui informasi yang diminta dan mengirim ulang; riwayat versi/pengajuan tetap tersedia.
9. Panitia/Admin mencatat keputusan seleksi: accepted, rejected, waiting list, atau status tambahan yang diaktifkan sekolah.
10. Pemohon diterima menerima instruksi daftar ulang. Penerimaan tidak otomatis mengaktifkan siswa.
11. Admin memverifikasi daftar ulang sesuai checklist; baru setelah lengkap, sistem mengaktifkan/membuat satu profil siswa dan menautkan akun pemohon ke identitas siswa tersebut.
12. Admin menempatkan siswa pada program, tahun ajaran, dan kelas sesuai kebijakan. Penempatan kelas dapat dilakukan kemudian tanpa kehilangan status aktivasi.
13. Sistem memberi notifikasi status sesuai kanal yang tersedia dan mencatat hasil pengiriman.

### Data aplikasi
Nomor aplikasi, periode PPDB, jalur, pilihan program, nama, tanggal lahir, jenis kelamin bila dibutuhkan, alamat, kontak, data wali seperlunya, sekolah asal, dokumen, status per tahap, hasil verifikasi, catatan koreksi, keputusan seleksi, status daftar ulang, serta tautan ke student_id jika sudah aktif.

### Aturan PPDB
- Aplikasi tidak dianggap lengkap sampai semua syarat wajib terpenuhi.
- Nomor aplikasi unik per sistem/periode; nomor tidak dipakai ulang.
- Dokumen punya metadata tipe, ukuran, status verifikasi, pengunggah, waktu, dan alasan ditolak.
- File berisi data pribadi hanya terlihat oleh pemohon yang berhak dan petugas yang berwenang.
- Setiap keputusan ditautkan ke aktor, waktu, alasan, dan status sebelum/sesudah.
- Sistem perlu mendeteksi kemungkinan duplikasi berdasarkan kriteria yang dapat dikonfigurasi; temuan duplikasi menjadi antrean tinjau manual, bukan penggabungan otomatis yang berisiko.
- Aktivasi siswa harus idempotent: proses yang dijalankan ulang tidak membuat siswa kedua.
- Setelah aktivasi, perubahan identitas utama memerlukan audit; histori PPDB tetap tertaut.
- Kuota/jalur/aturan penerimaan dapat diaktifkan sesuai keputusan sekolah; jangan hardcode satu jalur atau kuota.
- Pengumuman hasil publik tidak boleh membocorkan biodata lengkap atau dokumen pribadi. Akses status detail dilakukan melalui akun pemohon.
- Tidak ada gateway pembayaran sebagai bagian baseline. Jika ada biaya pendaftaran, sistem hanya mencatat instruksi/status sesuai kebijakan dan cara pembayaran di luar sistem.

## 9.6 Manajemen siswa, enrollment, kelas, dan riwayat

### Fitur
- Profil siswa dengan internal student_id yang unik dan permanen.
- Data identitas dasar, kontak, data wali seperlunya, foto jika diizinkan, asal PPDB/sumber registrasi, status aktif, tanggal masuk, program, dan referensi dokumen dengan akses terbatas.
- Pengelolaan enrollment per tahun ajaran, semester, program, tingkat, rombongan belajar, dan status enrollment.
- Riwayat kenaikan kelas, perpindahan kelas, mutasi, cuti/nonaktif, mengundurkan diri, dan lulus bila dipakai.
- Pengelolaan wali kelas berdasarkan kelas dan periode.
- Pencarian/filter siswa dengan pembatasan per role.
- Impor data massal hanya melalui template tervalidasi, pratinjau, dan laporan baris gagal; jangan langsung memasukkan file tanpa validasi.

### Aturan
- Student ID internal bersifat permanen; format contoh `STU-000123` hanya ilustrasi dan dapat dikonfigurasi.
- Bedakan internal student_id, NIS sekolah jika ada, account_id/login, applicant_id, enrollment_id, dan report_id.
- Login student tidak boleh ditautkan ke profil yang dipilih sendiri lewat payload tanpa verifikasi Admin.
- Riwayat kelas tidak ditimpa: setiap penempatan mempunyai periode dan tanggal berlaku.
- Siswa yang naik kelas tidak dibuat sebagai siswa baru.
- Kelulusan/nonaktif tidak menghapus nilai, absensi, atau laporan lama.
- Data wali/orang tua dikumpulkan sebatas kebutuhan, akses dibatasi, dan tidak ditampilkan publik.

## 9.7 Kelas, wali kelas, dan penugasan guru

### Fitur
- Membuat rombongan belajar untuk satu periode akademik dan program/tingkat yang sesuai.
- Menghubungkan siswa melalui enrollment aktif.
- Menetapkan wali kelas menggunakan guru yang sudah ada.
- Menetapkan guru mapel terhadap kelas, mapel, dan periode.
- Memeriksa penugasan ganda atau ketidakcocokan periode.
- Melihat riwayat wali kelas dan pengampu tanpa menghapus histori.

### Aturan
- Satu kelas hanya memiliki satu wali kelas aktif pada periode yang sama, kecuali model co-homeroom sengaja diaktifkan.
- Seorang guru tidak boleh memiliki penugasan bertentangan dalam waktu yang sama bila jadwalnya bentrok.
- Wali kelas bukan salinan profil guru; itu adalah penugasan.
- Guru yang tidak aktif tidak dapat diberi jadwal/penugasan baru tanpa override beralasan.
- Enrollment siswa harus aktif untuk ikut roster kelas, absensi, dan rapor pada periode terkait.

## 9.8 Jadwal pelajaran / roster mingguan

### Kebutuhan
- Editor jadwal mingguan berbasis grid hari dan slot waktu.
- Pengaturan jam mulai/selesai, durasi per jam pelajaran, jeda/istirahat, jam masuk/pulang, hari belajar, dan kalender khusus.
- Nilai default dapat disediakan sebagai konfigurasi awal (misalnya durasi 45 menit dan istirahat 30 menit), tetapi tidak menjadi konstanta permanen.
- Entitas jadwal memuat kelas, mapel, guru, ruang, hari, jam mulai, jam selesai, tahun ajaran, semester/periode, dan versi roster.
- Pembuatan roster harian sepanjang minggu, validasi, penyimpanan draft, pratinjau, penerbitan seluruh roster, revisi, arsip, dan ekspor/cetak PDF.
- Filter jadwal per kelas, guru, ruang, dan siswa.
- Tampilkan jadwal bentrok dan slot kosong secara jelas.

### Validasi konflik wajib
- Guru tidak boleh dijadwalkan di dua kelas pada interval waktu yang bertumpang tindih.
- Kelas tidak boleh mempunyai dua pelajaran pada interval yang sama.
- Ruang tidak boleh dipakai dua jadwal yang tumpang tindih jika ruang didefinisikan sebagai sumber daya eksklusif.
- Waktu selesai harus setelah waktu mulai.
- Slot harus berada pada hari dan periode yang diizinkan kalender sekolah.
- Jadwal tidak dapat diterbitkan bila konflik kritis belum diselesaikan atau diberi pengecualian administratif yang tercatat.
- Penugasan guru/mapel/kelas harus valid untuk periode jadwal.

### Publikasi dan revisi
- Status jadwal: draft → validation_failed/ready_for_review → published → superseded/archived.
- Roster terbit menyimpan nomor versi, penerbit, waktu, dan snapshot/perubahan yang cukup untuk menjelaskan versi sebelumnya.
- Perubahan roster setelah publikasi menghasilkan revisi versi baru; sesi lama tetap menunjuk ke versi dan jadwal yang berlaku saat itu kecuali Admin memutuskan migrasi yang tercatat.
- Pemberitahuan revisi diberikan kepada guru/siswa yang terdampak.
- Sediakan ekspor PDF yang konsisten dengan versi yang dipilih.

## 9.9 Absensi guru

### Alur dasar
1. Guru login dan memilih tindakan check-in atau check-out bila kebijakan sekolah menggunakannya.
2. Backend memastikan akun aktif dan guru yang ditautkan benar.
3. Sistem menampilkan QR dinamis yang berlaku singkat atau memindai QR yang disediakan sekolah, sesuai mode yang dipilih.
4. Sistem memvalidasi token/QR terhadap waktu server, masa berlaku, nonce/one-time use, dan kebijakan sekolah.
5. Jika GPS digunakan, browser meminta izin; backend menerima koordinat dan accuracy sebagai bukti tambahan, menghitung jarak terhadap koordinat resmi sekolah, dan menyimpan hasil evaluasi. Koordinat perangkat bukan bukti mutlak karena dapat dimanipulasi.
6. Sistem mengevaluasi waktu, status perangkat/sesi, jarak, accuracy, token, duplikasi, dan aturan keterlambatan.
7. Record normal dicatat; record berindikasi masalah diberi status perlu tinjauan, bukan otomatis dianggap kecurangan.
8. Guru dapat melihat status kehadiran pribadi dan mengajukan koreksi sesuai kebijakan.
9. Admin meninjau anomali/koreksi, menetapkan hasil dengan alasan, dan menyimpan audit trail.
10. Record difinalisasi sesuai cutoff yang dapat dikonfigurasi dan tersedia dalam laporan.

### Data record
ID, teacher_id, tanggal/periode, jenis event (check-in/check-out), timestamp server, koordinat jika dikumpulkan, accuracy, jarak hasil perhitungan, versi konfigurasi geofence, referensi QR/token yang tidak menyimpan rahasia mentah, device/browser metadata minimum yang relevan, status awal, flag anomali, status akhir, reviewer, alasan koreksi, serta audit.

### Aturan penting
- QR harus dinamis atau berbasis token satu kali; QR statis permanen tidak boleh diperlakukan sebagai pengaman yang kuat.
- Timestamp server adalah waktu utama.
- Token harus kedaluwarsa, ditandatangani/diverifikasi backend, dan tidak dapat digunakan ulang.
- Batas geofence dan toleransi GPS dapat dikonfigurasi. Simpan akurasi lokasi; lokasi yang kurang akurat tidak boleh diputuskan hanya dari jarak tanpa kebijakan.
- Sistem tidak boleh mengklaim anti-spoofing GPS 100%; GPS, jaringan, dan metadata hanya sinyal risiko.
- Gangguan internet, perangkat, izin lokasi, atau QR harus memiliki prosedur exception/manual yang dicatat.
- Terlambat, izin, sakit, tugas luar, dan ketidakhadiran perlu dibedakan sesuai kode status sekolah.
- Data absensi tidak otomatis memotong gaji. Dampak terhadap honor harus melalui review dan persetujuan menurut kebijakan sekolah.

## 9.10 Absensi siswa per sesi pelajaran

### Alur
1. Sistem membentuk/menampilkan sesi dari jadwal yang telah dipublikasikan.
2. Guru hanya dapat membuka sesi yang diampu dan waktunya sesuai aturan.
3. Sistem menampilkan daftar enrollment aktif di kelas untuk periode tersebut.
4. Guru memberi status per siswa: hadir, terlambat, sakit, izin, alpa/tanpa keterangan, dispensasi/tugas resmi, atau status sekolah lain yang diaktifkan.
5. Guru dapat mengisi catatan yang wajar; bukti sakit/izin hanya jika kebijakan sekolah memerlukannya.
6. Sebelum submit, guru melihat jumlah tiap status dan siswa belum ditandai.
7. Submit menyimpan record detail per siswa serta siapa pencatat dan waktu server.
8. Sesi memiliki status draft/open → submitted → finalized/locked, dengan koreksi terbatas melalui permohonan atau izin Admin.
9. Admin/wali kelas melihat ringkasan dan pengecualian sesuai akses.

### Aturan
- Tidak adanya record tidak sama dengan alpa.
- Sistem tidak otomatis menandai semua siswa alpa hanya karena guru belum mengisi absensi.
- Satu siswa maksimal satu status final untuk satu sesi, kecuali sistem secara eksplisit memodelkan event status terpisah.
- Perubahan setelah submit menyimpan nilai lama/baru, aktor, waktu, dan alasan.
- Siswa hanya melihat absensinya sendiri; wali kelas melihat kelas dan periode perwaliannya; guru hanya melihat sesi yang ditugaskan; Admin memiliki akses sesuai kewenangan.
- Absensi harian sekolah dan absensi per sesi pelajaran adalah konsep berbeda. Jika sekolah meminta keduanya, buat entitas/proses berbeda agar tidak saling menyamar.
- Tidak hadir pada satu sesi tidak boleh langsung berarti bolos seharian.

## 9.11 Nilai, asesmen, dan rapor

### Struktur nilai
- Nilai dihubungkan ke student_id/enrollment_id, kelas, mapel, guru pengampu, tahun ajaran, semester, periode penilaian, dan komponen asesmen.
- Jenis yang direncanakan: tugas bulanan, ujian bulanan, UTS, UAS, dan komponen lain yang dikonfigurasi.
- Satu asesmen memiliki judul, tipe, tanggal, bobot atau aturan perhitungan, nilai maksimum, status, dan penugasan mapel/kelas.
- Guru dapat mengisi nilai per asesmen/per siswa atau memakai metode input total bulanan bila kebijakan sekolah mengizinkan. Metode perhitungan harus eksplisit dan konsisten.
- Bobot nilai dan aturan pembulatan dikonfigurasi Admin berdasarkan kebijakan sekolah; tidak ditetapkan permanen oleh developer.
- Nilai belum diisi, tidak mengikuti asesmen, dan nilai nol adalah kondisi berbeda.
- Dukung remedial/perbaikan jika dibutuhkan dengan riwayat nilai awal dan nilai setelah perbaikan.

### Alur nilai mata pelajaran
1. Guru membuka kelas/mapel/periode yang ditugaskan.
2. Sistem menampilkan peserta didik aktif dan asesmen yang benar.
3. Guru mengisi draft nilai dan catatan relevan.
4. Backend memvalidasi rentang, peserta, status enrollment, duplikasi, periode, dan penugasan.
5. Guru melihat pratinjau rekap, kelengkapan, dan perhitungan.
6. Guru menekan konfirmasi kirim secara eksplisit.
7. Paket nilai berstatus terkirim/menunggu wali kelas; record yang sudah dikirim tidak dapat diedit langsung tanpa proses tarik kembali/koreksi yang tercatat.
8. Wali kelas melihat kelengkapan seluruh mapel untuk kelas perwaliannya, termasuk mapel/guru yang belum mengirim.
9. Wali kelas dapat mengembalikan ke guru dengan alasan yang terstruktur; guru memperbaiki dan mengirim ulang versi baru.

### Menu Pengelolaan Rapor Kelas untuk wali kelas
- Memilih kelas dan periode yang menjadi tugas wali kelas.
- Melihat tabel semua siswa dalam kelas dan seluruh mapel yang relevan.
- Melihat status paket setiap guru/mapel: belum mulai, draft, dikirim, dikembalikan, lengkap, atau masalah.
- Melihat nilai kosong, asesmen belum selesai, data enrollment bermasalah, dan peringatan perhitungan.
- Menyusun rekap bulanan serta rekap UTS/UAS bila berlaku.
- Preview per siswa dan seluruh kelas; ekspor/print sesuai kebutuhan.
- Mengembalikan data ke guru dengan alasan; wali kelas tidak mengubah sumber nilai guru secara diam-diam.
- Setelah lengkap, wali kelas melakukan finalisasi dengan konfirmasi eksplisit dan mengirim paket kelas/periode ke Admin Sekolah.

### Proses Admin Sekolah
1. Admin membuka paket yang dikirim wali kelas.
2. Sistem menampilkan kelengkapan siswa/mapel/komponen, peringatan, dan riwayat review.
3. Admin menyetujui untuk publikasi atau mengembalikan dengan alasan dan penerima tindakan.
4. Setelah persetujuan, Admin menerbitkan paket untuk kelas dan periode terkait.
5. Siswa dapat melihat rapornya masing-masing hanya setelah status published.
6. Ekspor/cetak menampilkan periode, identitas siswa yang sesuai, nilai yang final, tanggal terbit, dan identitas penerbit sesuai template yang disetujui.

### Status paket nilai/rapor
`draft` → `teacher_submitted` → `homeroom_review` → `returned_to_teacher` (opsional) → `homeroom_finalized` → `admin_review` → `returned_to_homeroom`/`returned_to_teacher` (opsional) → `published` → `revised`/`archived`.

Status dapat menggunakan label UI Bahasa Indonesia; kode internal dibuat konsisten dan tidak bergantung pada teks label.

### Aturan nilai/rapor
- Nilai yang sudah dikirim atau diterbitkan tidak boleh ditimpa tanpa versi/riwayat.
- Perubahan setelah publikasi wajib memiliki alasan, aktor, waktu, nilai lama, nilai baru, dan persetujuan sesuai kebijakan.
- Rapor diterbitkan per paket kelas/periode; sistem tetap menerapkan izin per siswa ketika membaca detail.
- Tidak boleh memublikasikan paket bila ada nilai wajib belum lengkap, kecuali Admin menggunakan pengecualian eksplisit dengan alasan dan peringatan tercatat.
- Rumus dan bobot ditampilkan kepada guru/wali kelas agar hasil dapat diperiksa.
- Pembulatan, rentang skor, remedial, predikat, deskripsi, dan format rapor harus berbasis konfigurasi sekolah dan template yang disepakati.
- Periode semester/bulanan tidak boleh tercampur.
- Nilai yang belum dimasukkan tidak boleh dikonversi menjadi 0 kecuali kebijakan akademik memang menentukan demikian dan tindakan itu tercatat.
- Admin menerbitkan paket; akses Superadmin teknis saja tidak memberinya hak untuk memublikasikan atau mengganti nilai.

## 9.12 Pemberitahuan biaya siswa

### Tujuan dan batasan
Modul ini adalah ledger kewajiban dan pengingat, bukan payment gateway atau sistem akuntansi lengkap.

### Fitur
- Admin membuat jenis/kategori biaya, periode, nominal, tanggal jatuh tempo, aturan cicilan jika dipakai, keterangan, dan kelompok siswa yang menjadi target.
- Kewajiban dapat dibuat per siswa atau melalui penugasan massal dengan preview sebelum penyimpanan.
- Siswa melihat kewajiban miliknya, nominal, tanggal, status, instruksi, dan kontak yang relevan.
- Siswa dapat mengirim konfirmasi pembayaran dan bukti jika kebijakan sekolah mengizinkan.
- Admin memverifikasi pembayaran yang dilaporkan dan memberi status paid, partial, rejected/needs correction, overdue, cancelled, atau status lain yang dikonfigurasi.
- Sistem membuat pengingat jatuh tempo dan memperbarui status/timeline setelah verifikasi.
- Bukti pembayaran hanya dapat dilihat pihak berwenang dan siswa terkait.

### Aturan
- Status lunas tidak menghapus kewajiban atau riwayat; kewajiban masuk histori selesai.
- Status siswa A dan B diproses terpisah, meskipun berasal dari jenis biaya yang sama.
- Siswa tidak dapat menyatakan pembayaran final secara mandiri tanpa mekanisme verifikasi sekolah.
- Admin tidak boleh menandai lunas tanpa mencatat sumber/tanggal/nominal yang diverifikasi sesuai SOP sekolah.
- Jika ada pembayaran parsial, sisa kewajiban dihitung melalui ledger, bukan dengan menimpa nominal tagihan asli.
- Perubahan nominal/jatuh tempo setelah diterbitkan harus memiliki versi atau log perubahan dan memicu notifikasi jika berdampak pada siswa.
- Guru tidak dapat mengakses data biaya secara default.
- Pengingat dihentikan untuk kewajiban yang sudah terkonfirmasi lunas/dibatalkan; histori pengingat dan transaksi tetap disimpan.
- Tidak ada klaim bahwa aplikasi memproses uang secara online.

## 9.13 Pencatatan honor/gaji guru

### Tujuan dan batasan
Modul ini mendukung pencatatan internal dan notifikasi terkait data kehadiran/honor. Bukan payroll penuh, bukan dasar potongan otomatis, dan bukan transfer uang.

### Fitur
- Menetapkan periode pencatatan honor dan komponen yang relevan sesuai kebijakan.
- Menggabungkan data absensi guru yang sudah diverifikasi dengan catatan koreksi/izin/tugas luar.
- Menandai record yang memerlukan review sebelum masuk ke rekap.
- Admin membuat/memeriksa rekap dengan status draft, ditinjau, disetujui internal, atau dikunci sesuai kebijakan.
- Riwayat perubahan nominal/komponen dan alasan disimpan.
- Jika diaktifkan, guru hanya melihat ringkasan yang berkaitan dengan dirinya sendiri; detail guru lain tetap privat.
- Ekspor internal dibatasi untuk pengguna berwenang.

### Aturan
- Ketidakhadiran tidak otomatis menghasilkan potongan. Status sakit, izin, tugas resmi, kesalahan perangkat, atau absensi yang sedang disengketakan harus melalui kebijakan/review.
- Rumus honor, komponen, nilai nominal, dan periode adalah konfigurasi/persetujuan sekolah, bukan angka yang diasumsikan developer.
- Data honor/gaji tergolong sensitif dan tidak boleh tampil pada dashboard publik atau role tanpa izin.
- Catatan bersifat administratif dan harus menyatakan apakah sudah diverifikasi atau hanya perkiraan.

## 9.14 Bantuan pendidikan

### Fitur
- Admin mendefinisikan program bantuan, periode, sumber, kriteria, dokumen wajib, batas pengajuan, status, dan kuota bila relevan.
- Siswa mengajukan atau Admin mencatat kandidat sesuai kebijakan program.
- Sistem memeriksa kelengkapan dokumen dan memberi status pending, incomplete, verified, proposed, approved/selected, rejected, disbursed/received, atau status sesuai kebutuhan.
- Admin memverifikasi bukti, merekam hasil resmi, dan mengirim notifikasi yang sesuai.
- Riwayat penerima per tahun/periode tersedia bagi pengguna yang berwenang.

### Aturan
- Kelayakan tidak boleh disimpulkan otomatis hanya dari nilai atau absensi kecuali regulasi program secara eksplisit memerintahkannya dan aturan telah divalidasi.
- Data ekonomi, identitas keluarga, dan dokumen bantuan hanya untuk role yang membutuhkan.
- Status kandidat, diusulkan, disetujui, dan sudah diterima/dicairkan adalah status berbeda.
- Pengumuman publik hanya boleh memuat informasi yang disetujui sekolah; jangan mengekspos dokumen atau detail sensitif.

## 9.15 PKL / praktik kerja lapangan

### Fitur
- Master tempat/perusahaan PKL, alamat dan kontak resmi seperlunya.
- Penempatan per siswa dengan periode, program, kelas asal saat penempatan, pembimbing sekolah, pembimbing industri jika ada, status, dan dokumen.
- Siswa dapat memiliki penempatan individual; pengelompokan kelas hanya kemudahan input dan tidak memaksa satu kelas berada pada satu tempat.
- Monitoring kegiatan/jurnal harian atau berkala dapat diaktifkan dengan status review.
- Catatan kunjungan, evaluasi pembimbing, penilaian, dokumen akhir, dan hasil PKL.
- Perubahan lokasi/periode/pembimbing menyimpan histori.
- Ringkasan PKL tersedia untuk siswa terkait, pembimbing yang ditugaskan, wali kelas bila diizinkan, dan Admin.

### Aturan
- Satu placement mengacu ke student_id dan periode yang jelas.
- Pembimbing hanya dapat melihat siswa yang ditugaskan kepadanya.
- Status dan nilai PKL tidak dapat diubah oleh siswa setelah diserahkan tanpa workflow koreksi.
- Hasil PKL yang menjadi syarat kelulusan harus memiliki sumber dan status resmi.

## 9.16 Kelulusan dan pengecekan kelengkapan

### Fitur
- Admin membuat periode kelulusan dan kriteria sesuai aturan sekolah.
- Sistem menyusun checklist kelengkapan untuk setiap siswa: nilai/rapor periode yang diwajibkan, absensi/ringkasan kehadiran, PKL bila relevan, dokumen/administrasi, dan kriteria tambahan yang dikonfigurasi.
- Dashboard menunjukkan lengkap, belum lengkap, perlu verifikasi, atau ada pengecualian.
- Admin merekam keputusan resmi, pihak yang menetapkan, tanggal, alasan/catatan, dan status pemberitahuan.
- Siswa dapat melihat status individual setelah waktu dan izin publikasi yang diatur sekolah.

### Aturan
- Sistem memberikan dukungan keputusan; bukan penentu otomatis kelulusan.
- Absensi saja tidak pernah cukup untuk memutuskan kelulusan.
- Ketiadaan data tidak otomatis berarti gagal; status yang benar adalah belum lengkap/perlu verifikasi.
- Setiap override checklist/keputusan memiliki aktor, alasan, waktu, dan audit.
- Pengumuman publik tidak memuat data pribadi berlebihan.

## 9.17 Notifikasi dan pusat pemberitahuan

### Peristiwa minimum
- PPDB: aplikasi terkirim, butuh koreksi, koreksi diterima, keputusan, instruksi daftar ulang, aktivasi siswa.
- Akademik: penugasan guru, wali kelas, jadwal diterbitkan/revisi, sesi absensi belum lengkap.
- Absensi: record guru perlu tinjauan, hasil koreksi, absensi siswa dikoreksi bila kebijakan mengizinkan pemberitahuan.
- Nilai/rapor: nilai dikirim, dikembalikan, rekap wali kelas siap, paket dikirim ke Admin, rapor terbit/revisi.
- Biaya: tagihan/pemberitahuan dibuat, jatuh tempo mendekat, konfirmasi pembayaran diterima, status lunas/ditolak/diperbaiki.
- Bantuan: aplikasi lengkap/perlu koreksi, status berubah, hasil diterbitkan.
- PKL: penempatan/pembimbing berubah, jadwal pemantauan, evaluasi tertunda jika fitur diaktifkan.
- Kelulusan: data belum lengkap, keputusan diterbitkan sesuai izin.
- Akun/keamanan: reset password, akun dinonaktifkan, perubahan role, aktivitas penting.

### Ketentuan
- Notifikasi dibuat berdasarkan peristiwa state change, bukan teks hardcode per halaman.
- Minimal tersedia pusat notifikasi dalam aplikasi; email atau kanal lain dipakai bila disetujui dan dikonfigurasi.
- Setiap notifikasi mencatat penerima, kategori, referensi objek, waktu, status baca, kanal, dan hasil pengiriman jika eksternal.
- Kegagalan kanal eksternal tidak boleh membatalkan transaksi utama yang sudah tersimpan; kegagalan dicatat dan dapat dicoba ulang.
- Pesan yang memuat data sensitif harus minimal dan mengarahkan pengguna login untuk melihat detail.
- Pengiriman berulang akibat retry harus idempotent atau diberi tanda duplikat agar tidak membanjiri pengguna.

## 9.18 Laporan, pencarian, dan ekspor

Laporan minimum:
- Statistik website/berita jika sumbernya tersedia dan penggunaannya sah.
- Rekap PPDB per periode/program/status.
- Daftar siswa per tahun ajaran/program/kelas/status.
- Daftar guru dan penugasan.
- Jadwal per kelas/guru/ruang dan PDF roster terbit.
- Absensi guru per periode dengan status normal/terlambat/perlu tinjauan/koreksi.
- Absensi siswa per sesi, siswa, kelas, dan periode.
- Kelengkapan pengisian absensi.
- Rekap nilai per mapel/kelas/periode dan status pengiriman guru.
- Rapor individual/rekap kelas sesuai izin.
- Rekap kewajiban biaya, status pembayaran yang diverifikasi, dan jatuh tempo.
- Rekap honor internal dengan akses sensitif.
- Daftar bantuan per status/periode.
- Penempatan dan hasil PKL.
- Checklist dan keputusan kelulusan.
- Audit log untuk pemilik kewenangan.

Aturan ekspor:
- Terapkan permission yang sama dengan tampilan layar.
- Filter periode/kelas/program harus tercetak pada metadata laporan agar konteks jelas.
- Ekspor file dicatat untuk laporan/data sensitif.
- Jangan membuat tautan ekspor publik yang dapat dibuka tanpa login.
- Hindari memasukkan data pribadi yang tidak diperlukan ke laporan.

## 9.19 Audit trail dan histori

Aktivitas yang wajib diaudit mencakup pembuatan/perubahan/nonaktif master penting, perubahan role/permission, aktivasi siswa, keputusan PPDB, penempatan kelas, perubahan/publikasi jadwal, absensi dan koreksinya, pengisian/pengiriman/revisi nilai, finalisasi/publikasi rapor, pengubahan biaya dan status pembayaran, perubahan honor, review bantuan, perubahan penempatan PKL, keputusan kelulusan, publikasi konten, akses support ke data sensitif, dan ekspor data sensitif.

Audit log minimal menyimpan: event ID, actor_id, action, entity type/id, timestamp server, nilai sebelum/sesudah untuk perubahan yang relevan, alasan, request/correlation ID, hasil, dan metadata teknis minimum yang diperlukan. Jangan simpan kata sandi, token rahasia, isi dokumen pribadi, atau data sensitif berlebihan dalam log. Audit log harus sulit diubah oleh pengguna operasional dan memiliki kebijakan retensi.

# 10. Model Data Logis dan Distribusi Database

Bagian ini merupakan rancangan logis minimum, bukan DDL final. Nama tabel bisa menyesuaikan konvensi repository selama relasi, constraint, dan makna bisnisnya tetap terjaga.

## 10.1 Prinsip pemodelan

- Gunakan primary key teknis stabil (misalnya UUID atau bigint) dan business code terpisah bila manusia perlu membaca kode.
- Semua foreign key merujuk ke identitas master; hindari menyimpan nama sebagai satu-satunya relasi.
- Simpan created_at, updated_at, created_by/updated_by jika relevan, status, dan archived_at/deleted_at untuk master yang perlu diarsipkan.
- Transaksi penting memakai audit event dan/atau tabel riwayat khusus; kolom updated_at saja tidak cukup.
- Tanggal akademik menggunakan periode eksplisit; hindari hanya menyimpan teks "semester ganjil" tanpa tahun ajaran.
- Nominal uang menggunakan tipe desimal tepat, bukan floating point.
- Nilai akademik memakai presisi dan rentang terdefinisi serta memisahkan score dari status kosong.
- File disimpan sebagai objek/file storage; database menyimpan metadata, pemilik, kategori, visibility, checksum bila perlu, dan lokasi privat.
- Data historis tidak boleh mengandalkan data master saat ini untuk merekonstruksi masa lampau tanpa snapshot bila nilai master dapat berubah.

## 10.2 Domain data dan entitas inti

Nama tabel berikut bersifat logis. Jika repository memiliki entitas setara, nama boleh disesuaikan selama makna, relasi, constraint, izin, dan histori tetap terjaga.

- **Sekolah:** `school_settings`, `school_contacts`, `school_locations` — menjadi sumber profil, kontak, dan konfigurasi lokasi.
- **Akun dan keamanan:** `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `user_sessions`, `password_reset_tokens`, `login_events` — mendukung autentikasi, RBAC, sesi, reset, dan audit aktivitas login.
- **Audit dan histori:** `audit_logs`, `entity_revisions` — menyimpan siapa melakukan apa, pada data mana, kapan, alasan, dan ringkasan sebelum/sesudah.
- **Kalender akademik:** `academic_years`, `academic_terms`, `school_calendar_days`, `school_policies` — menjadi sumber tahun ajaran, semester, kalender, dan aturan terkonfigurasi.
- **Program dan kelas:** `study_programs`, `subjects`, `grade_levels`, `class_groups`, `class_enrollments` — mendefinisikan program keahlian, mapel, tingkat, rombongan belajar, dan keanggotaan siswa.
- **Guru:** `teachers`, `teacher_profiles`, `teacher_assignments`, `homeroom_assignments` — memisahkan profil guru dari penugasan mapel/kelas/periode dan peran wali kelas.
- **Ruang:** `rooms` — sumber daya fisik yang dipakai dalam validasi bentrok roster.
- **Siswa:** `students`, `student_guardians`, `student_status_history`, `student_enrollments` — identitas permanen siswa, kontak wali, status, dan riwayat enrollment.
- **PPDB:** `admission_periods`, `admission_tracks`, `applications`, `application_documents`, `application_reviews`, `admission_decisions`, `reenrollment_checklists` — alur pendaftaran, berkas, review, keputusan, daftar ulang, dan aktivasi.
- **File dan media:** `media_assets`, `file_access_events` — menyimpan metadata file, pemilik, kategori, visibilitas, checksum bila perlu, dan histori akses.
- **CMS:** `pages`, `content_entries`, `content_categories`, `content_tags`, `content_revisions`, `albums`, `album_items`, `public_profiles` — halaman, artikel, kategori, revisi, album, serta konten profil publik.
- **Jadwal:** `timetable_versions`, `timetable_entries`, `lesson_sessions`, `schedule_change_events` — versi roster, slot jadwal, sesi bertanggal, dan revisi.
- **Absensi guru:** `teacher_attendance_events`, `teacher_attendance_reviews`, `teacher_attendance_policies` — check-in/out, flag anomali, review, dan kebijakan.
- **Absensi siswa:** `student_attendance_sessions`, `student_attendance_records`, `student_attendance_revisions`, `attendance_status_types` — sesi, status per siswa, tipe status, dan revisi.
- **Nilai:** `assessment_periods`, `assessment_components`, `assessments`, `assessment_scores`, `grade_submissions`, `grade_submission_revisions` — asesmen, komponen, nilai per siswa, pengajuan guru, dan histori koreksi.
- **Rapor:** `report_packages`, `report_package_students`, `report_snapshots`, `report_approvals`, `report_revisions`, `report_templates` — paket kelas/periode, relasi siswa, snapshot, persetujuan, revisi, dan template.
- **Biaya:** `fee_types`, `student_fee_obligations`, `fee_installments`, `payment_claims`, `payment_confirmations`, `fee_adjustment_events` — jenis biaya, kewajiban per siswa, cicilan, klaim, verifikasi, dan penyesuaian.
- **Honor/gaji:** `compensation_periods`, `compensation_components`, `teacher_compensation_records`, `compensation_reviews` — periode, komponen, catatan per guru, dan review internal.
- **Bantuan:** `aid_programs`, `aid_requirements`, `aid_applications`, `aid_documents`, `aid_reviews`, `aid_results` — program, persyaratan, pengajuan, dokumen, review, dan hasil.
- **PKL:** `industry_partners`, `internship_placements`, `internship_supervisors`, `internship_logs`, `internship_visits`, `internship_evaluations`, `internship_documents` — mitra industri, penempatan individual, pembimbing, jurnal, monitoring, evaluasi, dan dokumen.
- **Kelulusan:** `graduation_periods`, `graduation_criteria`, `graduation_check_items`, `graduation_reviews`, `graduation_decisions` — periode, kriteria, checklist, review, dan keputusan resmi.
- **Notifikasi:** `notification_templates`, `notifications`, `notification_deliveries`, `notification_preferences` — template, penerima, referensi objek, status baca, kanal dan hasil pengiriman.
- **Operasional:** `system_settings`, `backup_jobs`, `job_runs`, `integration_configs`, `error_events` — konfigurasi, backup, proses terjadwal, integrasi, dan error teknis.

## 10.3 Entitas inti dan field minimum

### `users`
`id`, `username/email/identifier` sesuai strategi login, `password_hash`, `status`, `last_login_at`, `created_at`, `updated_at`, `disabled_at`. Tidak boleh menyimpan plaintext password. Email/username unik sesuai kebijakan. Identitas login bukan pengganti teacher_id atau student_id.

### `roles`, `permissions`, `user_roles`
Role berisi kode dan nama; permission berisi resource/action/scope; relasi mendukung lebih dari satu role bila diperlukan. Perubahan permission diaudit. Hindari pemeriksaan izin hanya menggunakan label role yang ditanam di banyak file.

### `teachers`
`id`, `teacher_code` unik dan tidak didaur ulang, `full_name`, `employment_status`, `public_profile_enabled`, `created_at`, `updated_at`. Field kepegawaian rinci dipisahkan/diatur sesuai kebutuhan dan aksesnya.

### `students`
`id`, `student_code` unik internal, `full_name`, identitas dasar yang dibutuhkan, `status`, `admission_application_id` nullable/unique bila model memungkinkan, tanggal masuk, timestamps. Nomor NIS (jika dipakai sekolah) dipisahkan dari student_code dan tidak otomatis menjadi username.

### `student_enrollments`
`id`, `student_id`, `academic_year_id`, `term_id` bila diperlukan, `study_program_id`, `class_group_id`, `grade_level_id`, status, tanggal berlaku. Constraint mencegah enrollment aktif ganda yang konflik pada periode yang sama.

### `academic_years` dan `academic_terms`
Kode/nama, start_date, end_date, status, penanda default/aktif dengan constraint sehingga tidak ada lebih dari satu default pada scope yang sama. Semester berelasi ke tahun ajaran.

### `applications`
`id`, `application_number` unik, `admission_period_id`, `applicant_user_id`, data formulir terstruktur atau versi form, `selected_program_id`, `status`, `submitted_at`, `decision_at`, `activated_student_id`, timestamps. Relasi aktivasi harus idempotent dan dibatasi unik.

### `timetable_versions` dan `timetable_entries`
Versi menyimpan year/term, label versi, status, dibuat oleh, dipublikasikan oleh/waktu, dan `supersedes_version_id`. Entri menyimpan class, teacher assignment, subject, room, day/date pattern, start/end, dan pengecualian kalender. Constraint konflik membutuhkan validasi transaksi server-side.

### `lesson_sessions`
`id`, `timetable_entry_id`, `timetable_version_id`, tanggal, rentang waktu aktual yang dijadwalkan, status, kelas/mapel/guru sesuai snapshot jika diperlukan, dan metadata pembatalan/perubahan. Sesi memiliki identitas tetap agar absensi tidak bergantung pada perubahan jadwal terbaru saja.

### `student_attendance_records`
`id`, `session_id`, `student_id`, `enrollment_id`, `status_type_id`, catatan terbatas, recorded_by, recorded_at, finalized_at, source, status, revision reference. Constraint unik per `session_id + student_id` untuk status final utama, kecuali desain mendukung beberapa event eksplisit.

### `assessment_scores`
`id`, `assessment_id`, `student_id` atau `enrollment_id`, `score` nullable, `score_status`, catatan, entered_by, entered_at, revision/version. Score nullable membedakan nilai belum diisi; status menjelaskan exempt/absent/remedial bila diperlukan.

### `grade_submissions`
`id`, assignment/class/subject/period, submitted_by, version, status, submitted_at, reviewed_by, reviewed_at, return_reason. Nilai per siswa/komponen berelasi ke submission/version yang benar.

### `report_packages` dan `report_snapshots`
Package mengikat kelas, tahun, term/periode, versi, status workflow, wali kelas, pengirim, approver, published_at. Snapshot menyimpan representasi data rapor saat diterbitkan agar laporan lama dapat direproduksi walau master/template berubah. Setiap siswa dalam paket memiliki relasi sendiri untuk izin akses.

### `student_fee_obligations` dan `payment_confirmations`
Kewajiban menyimpan siswa, jenis biaya, nominal awal, periode, jatuh tempo, status, dan versi. Payment/confirmation menyimpan nominal yang diajukan/diverifikasi, tanggal, referensi, bukti privat, reviewer, dan status. Pembayaran parsial dicatat sebagai transaksi terpisah, bukan menimpa nominal asli.

### `audit_logs`
`id`, actor, action, entity type/id, occurred_at, reason, before/after summary yang aman, correlation/request id, outcome. Jangan masukkan password, reset token, atau seluruh dokumen sensitif.

## 10.4 Constraint dan indeks minimum

- Unique: teacher_code, student_code, application_number, slug per namespace, kode program/mapel sesuai scope, username/email login sesuai kebijakan, serta satu keputusan/relasi yang secara bisnis harus unik.
- Foreign key: transaksi akademik ke siswa/enrollment/periode/penugasan terkait.
- Check constraint: nilai dalam rentang, nominal tidak negatif jika sesuai, jam selesai > jam mulai, tanggal akhir tidak sebelum tanggal mulai.
- Index: FK yang sering dicari; tahun ajaran/semester/kelas/status; teacher_id + tanggal; student_id + periode; application_number/status/periode; published status/tanggal CMS; notification recipient + read status; report package + class/term/version.
- Gunakan transaksi database untuk aktivasi PPDB, publikasi paket rapor, pencatatan pembayaran yang diverifikasi, dan publikasi roster agar operasi terkait berhasil/gagal secara konsisten.
- Validasi konflik jadwal dilakukan dalam transaksi dan tidak hanya pada frontend untuk mencegah dua pengguna menerbitkan jadwal konflik secara bersamaan.

## 10.5 Retensi, arsip, dan penghapusan

- Master yang telah dirujuk oleh transaksi diarsipkan/dinonaktifkan; jangan menghapus fisik data historis.
- Berkas PPDB, bantuan, bukti pembayaran, dan data sensitif mempunyai aturan akses dan retensi yang ditentukan sekolah; sistem mendukung penghapusan/anonimisasi aman jika diwajibkan kebijakan yang sah.
- Data backup memiliki masa retensi terpisah dan akses terbatas.
- Permintaan koreksi data pribadi harus memiliki proses yang terdokumentasi.
- Jangan mempertahankan data sensitif tanpa tujuan; kumpulkan data minimum yang diperlukan.

# 11. State Machine dan Transisi Status

Setiap status berikut harus diwujudkan sebagai enum/lookup terkontrol, bukan string bebas dari browser. Nama internal dapat berbeda, tetapi makna, aktor, kondisi masuk/keluar, dan audit tetap harus dipenuhi.

## 11.1 Aplikasi PPDB

`draft` → `submitted` → `under_review` → `needs_correction` → `resubmitted` → `verified` → `accepted` / `rejected` / `waitlisted` (sesuai kebijakan) → `awaiting_reenrollment` → `reenrollment_review` → `active_student`.

Transisi `accepted` ke `active_student` wajib melalui syarat daftar ulang. `rejected` tidak boleh berpindah ke active tanpa keputusan baru yang sah. Pemohon dapat memiliki permintaan koreksi berulang, semuanya tercatat.

## 11.2 Konten publik

`draft` → `ready_for_preview` → `published` → `unpublished` atau `archived`. Perubahan konten published menghasilkan revision. Aset yang terkait mewarisi kontrol akses konten; draft tidak boleh bocor melalui endpoint/file publik.

## 11.3 Jadwal

`draft` → `validation_failed` atau `ready_to_publish` → `published` → `superseded`/`archived`. Jadwal dengan konflik kritis tidak dipublikasikan tanpa override yang sah dan beralasan.

## 11.4 Absensi

Absensi guru: `recorded` → `flagged_for_review` bila ada sinyal → `reviewed` → `finalized` atau `corrected` dengan revision. Absensi siswa: `open/draft` → `submitted` → `finalized`; koreksi sesudah submit membuat revisi. Belum diisi bukan status absen.

## 11.5 Nilai dan rapor

Nilai guru: `draft` → `submitted` → `returned_for_correction` → `resubmitted` → `accepted_for_recap`. Rapor: `homeroom_recap` → `homeroom_finalized` → `admin_review` → `returned` atau `approved` → `published` → `revised/archived`. Aksi terminal/rollback selalu mencatat actor dan alasan.

## 11.6 Biaya

Kewajiban: `draft` → `issued` → `not_due`/`due_soon`/`due`/`overdue` berdasarkan tanggal, dengan status pembayaran yang terpisah. Konfirmasi: `submitted` → `under_review` → `verified` atau `rejected/needs_correction`. Status paid dihitung dari transaksi terverifikasi dan aturan nominal, bukan dari tombol siswa.

## 11.7 Bantuan

`draft` → `open` → `submitted` → `under_review` → `needs_correction`/`verified` → `proposed` → `approved`/`rejected` → `received/disbursed` bila ada konfirmasi resmi. Status bergantung program, dan tidak semua program harus menggunakan semua tahap.

## 11.8 PKL

`planned` → `placed` → `active` → `monitoring` → `evaluation_pending` → `completed` atau `cancelled/changed`. Perubahan penempatan menyimpan historinya.

## 11.9 Kelulusan

`not_started` → `checking` → `incomplete`/`ready_for_review` → `reviewed` → `decision_recorded` → `announced` sesuai kebijakan. Checklist tidak menggantikan keputusan resmi.

# 12. Aturan Bisnis Lintas Modul

1. Identitas orang tidak dibuat ulang ketika role atau penugasan berubah.
2. Setiap transaksi akademik mengacu pada tahun ajaran/periode yang tepat.
3. Data yang sudah diterbitkan mempunyai versi/snapshot yang dapat direproduksi.
4. Perubahan status harus melewati transisi yang diizinkan; frontend tidak boleh menentukan status akhir sesukanya.
5. Perubahan penting memerlukan aktor terautentikasi dan alasan bila berpengaruh pada data final.
6. Pengguna tidak dapat mengakses data hanya dengan mengetahui ID-nya.
7. Proses batch harus menyediakan preview, ringkasan jumlah, validasi, dan error report.
8. Operasi kritis harus idempotent agar retry tidak membuat duplikasi.
9. Setiap penghitungan (rata-rata, bobot, sisa tagihan, jarak GPS, status jatuh tempo, checklist) harus memiliki sumber, aturan, unit, dan cara diuji.
10. Data master yang dinonaktifkan tidak boleh merusak tampilan transaksi lama.
11. Notifikasi mengikuti perubahan state yang berhasil disimpan; bukan sebaliknya.
12. Gagal mengirim email/notifikasi eksternal tidak membatalkan transaksi bisnis yang valid.
13. Kesalahan teknis tidak boleh diubah menjadi keputusan bisnis secara diam-diam.
14. Data contoh/demo selalu dilabeli dan dipisahkan dari data produksi.
15. Tidak ada shortcut di UI yang melewati aturan backend.
16. Eksport tidak lebih longgar daripada akses layar.
17. Tanggal/jam disimpan secara konsisten, ditampilkan menurut zona waktu Indonesia yang dikonfigurasi, dan dihitung server-side.
18. Status pembayaran, hasil bantuan, nilai, dan kelulusan harus membedakan draft, klaim, hasil tinjauan, dan keputusan final.
19. Perubahan terhadap penugasan guru/wali kelas atau enrollment harus mempunyai tanggal efektif agar transaksi lama tetap dapat ditafsirkan.
20. Data yang dipakai dalam laporan harus memiliki filter/periode eksplisit; jangan menyatukan periode berbeda hanya karena query sederhana.

# 13. Spesifikasi API dan Kontrak Integrasi

Detail route disesuaikan dengan stack hasil audit. Namun semua endpoint harus mengikuti prinsip berikut:

- API terstruktur per domain (auth, users, CMS, PPDB, master akademik, timetable, attendance, grades, reports, fees, aid, internship, graduation, notifications, administration).
- Gunakan metode operasi secara konsisten; jangan menggunakan GET untuk mengubah data.
- Validasi schema request, tipe, batas ukuran, format, enum, serta relasi.
- Gunakan pagination/filter/sort untuk daftar besar.
- Respons error konsisten dan tidak memuat stack trace/rahasia pada produksi.
- Operasi kritis menerima idempotency key atau strategi pencegahan duplikasi yang sesuai.
- API yang mengubah status mencatat actor, status asal, status tujuan, dan alasan sesuai kebutuhan.
- Konflik konkurensi ditangani melalui version field/optimistic locking atau transaksi database.
- Endpoint file privat memeriksa authorization setiap akses/download.
- Endpoint publik hanya mengeluarkan field yang diizinkan; jangan serialize seluruh model database ke halaman publik.

Contoh kontrak logis (nama endpoint bersifat ilustratif):

| Kebutuhan | Contoh operasi | Validasi server-side utama |
|---|---|---|
| Melihat jadwal guru | `GET /api/teacher/me/timetable?period_id=...` | Guru dari sesi login; filter periode valid |
| Submit absensi siswa | `POST /api/lesson-sessions/{id}/attendance` | Guru ditugaskan; sesi valid; daftar siswa berasal dari enrollment server |
| Submit nilai | `POST /api/grade-submissions/{id}/submit` | Hak guru, paket benar, nilai lengkap sesuai aturan |
| Review wali kelas | `POST /api/grade-submissions/{id}/return` | Penugasan wali kelas dan alasan koreksi |
| Publikasi rapor | `POST /api/report-packages/{id}/publish` | Admin berwenang, paket lengkap/override sah, transaksi atomik |
| Aktifkan siswa dari PPDB | `POST /api/applications/{id}/activate-student` | Daftar ulang sah, tidak ada aktivasi duplikat, transaksi atomik |
| Konfirmasi pembayaran | `POST /api/payment-claims/{id}/verify` | Admin berizin, nominal/status tervalidasi, bukti/audit |

Daftar ini bukan spesifikasi endpoint lengkap; ini contoh standar implementasi. Endpoint yang benar-benar dibuat harus terdokumentasi di API reference repository.

# 14. UI/UX, Aksesibilitas, dan Konten

## 14.1 Bahasa dan gaya

- Bahasa antarmuka utama adalah Bahasa Indonesia.
- Desain modern, minimalis, formal, dan cocok untuk sekolah; gunakan logo dan warna resmi dari sekolah.
- Hindari animasi berat; utamakan performa, keterbacaan, konsistensi, dan kemudahan penggunaan admin nonteknis.
- Gunakan label status dan pesan kesalahan yang menjelaskan masalah serta tindakan berikutnya.
- Istilah yang sama harus konsisten di seluruh modul, misalnya “Tahun Ajaran”, “Semester”, “Kelas”, “Wali Kelas”, “Dikirim”, “Dikembalikan”, dan “Diterbitkan”.

## 14.2 Formulir dan tabel

- Label field tidak hanya placeholder.
- Tandai field wajib, rentang/format, dan alasan penolakan validasi.
- Pertahankan input yang valid ketika error terjadi.
- Tampilkan confirmation dialog sebelum publish, finalisasi, penolakan, atau tindakan massal.
- Tabel besar mendukung pencarian, filter, pagination, sort, empty state, error state, dan loading state.
- Input nilai harus efisien untuk jumlah siswa yang banyak, mendukung keyboard/tab navigation, autosave draft bila aman, dan menampilkan validasi sebelum submit.
- Editor roster menampilkan konflik secara langsung serta menawarkan petunjuk letak konflik.
- Upload berkas menampilkan tipe, ukuran, progres, dan hasil validasi; jangan menganggap file berhasil diunggah sebelum server mengonfirmasi.

## 14.3 Responsif dan aksesibilitas

- Layout berjalan pada desktop, tablet, dan ponsel modern.
- Navigasi admin yang kompleks disederhanakan pada layar kecil; tabel dapat digulir atau memiliki tampilan alternatif tanpa menyembunyikan data penting.
- Kontras teks, fokus keyboard, nama kontrol, alt text, pesan error yang dapat dibaca screen reader, dan semantik heading harus dipertimbangkan.
- Interaksi tidak boleh bergantung hanya pada warna.
- Status penting tidak disampaikan hanya lewat animasi/toast yang langsung hilang.

## 14.4 Konten kosong dan dummy

- Konten placeholder untuk pengembangan diberi label dan tidak dipakai di produksi.
- Angka statistik, nama guru, prestasi, dokumentasi, dan fasilitas harus berasal dari data sekolah atau ditandai sebagai belum tersedia.
- Tidak menggunakan foto orang/identitas rekaan seolah-olah warga sekolah nyata.
- Ketika belum ada konten, tampilkan empty state yang rapi, bukan broken image atau lorem ipsum.

# 15. Keamanan, Privasi, dan Tata Kelola Data

## 15.1 Kontrol minimum

- Hash password dengan algoritma yang sesuai dan parameter aman.
- HTTPS wajib pada produksi.
- Proteksi terhadap SQL injection, XSS, CSRF bila relevan dengan pola session, broken access control/IDOR, brute force, insecure direct file access, SSRF bila ada fitur fetch URL, serta upload berbahaya.
- Validasi MIME/type dan ukuran file di server; nama file acak/terkontrol; jangan menjalankan file upload.
- Rahasia aplikasi dan kredensial database disimpan di environment secret manager atau mekanisme rahasia server, bukan repository.
- Security headers, cookie yang aman, proteksi sesi, dan pengaturan CORS sesuai kebutuhan.
- Error produksi tidak menunjukkan query, stack trace, secret, atau data pribadi.
- Dependency dipindai/diperbarui, lockfile digunakan, dan perubahan dependency diuji.
- Backup terenkripsi/terlindungi; akses restore dibatasi.
- Hak akses minimum untuk database, storage, job, dan akun deployment.

## 15.2 Klasifikasi data

| Kelas data | Contoh | Akses |
|---|---|---|
| Publik | Konten website yang diterbitkan, kontak resmi, program keahlian | Semua orang |
| Internal | Draft konten, jadwal draft, laporan agregat non-sensitif | Staf sesuai tugas |
| Pribadi | Biodata siswa/guru, absensi, kontak wali | Pengguna terkait dan staf berwenang |
| Sensitif tinggi | Nilai/rapor, dokumen PPDB, bantuan, bukti pembayaran, honor/gaji, catatan disiplin jika digunakan | Hak akses sangat terbatas, audit dan retensi jelas |
| Rahasia teknis | Password hash, token, API key, kredensial database, private key | Layanan/administrator yang benar-benar memerlukan; tidak ditampilkan pada UI/log umum |

## 15.3 Privasi siswa dan foto

- Kumpulkan hanya data yang dibutuhkan untuk tujuan proses.
- Pisahkan aset publik dan berkas privat.
- Terapkan akses khusus untuk dokumen PPDB, bantuan, bukti pembayaran, dan data keluarga.
- Sekolah harus menentukan dasar izin/persetujuan dan prosedur permintaan koreksi/penghapusan yang berlaku; sistem menyediakan kontrol status dan histori sesuai kebutuhan.
- Foto kegiatan siswa dapat dipublikasikan sesuai keputusan sekolah, tetapi editorial CMS harus mencegah publikasi tidak sengaja terhadap berkas privat.
- Jangan menyimpan koordinat absensi lebih lama dari yang diperlukan tanpa kebijakan yang jelas.
- Jangan memasukkan data personal ke analytics publik atau log debug.

## 15.4 Pemisahan produksi dan development

- Gunakan data dummy/sanitized untuk development; jangan menyalin data siswa asli ke laptop pribadi tanpa izin dan proteksi.
- Production secrets tidak dibagikan melalui chat, commit, atau file dokumentasi.
- Akses developer ke production dibatasi selama pengerjaan dan dicabut/ditinjau saat serah terima.
- Perubahan database produksi dilakukan dengan migration teruji dan backup sebelum perubahan berisiko.

# 16. Kinerja, Reliabilitas, dan Kebutuhan Nonfungsional

Angka berikut merupakan target awal penerimaan yang realistis untuk aplikasi sekolah skala kecil-menengah dan harus diuji pada lingkungan yang representatif. Target dapat disesuaikan berdasarkan hasil pengukuran, tetapi tidak boleh diabaikan tanpa alasan.

| Kategori | Target minimum |
|---|---|
| Respons UI umum | Mayoritas halaman operasional terbuka dalam waktu yang wajar pada koneksi normal; target awal p95 API baca sederhana ≤ 1 detik di staging dengan data uji representatif |
| Operasi berat | Import, ekspor, pembuatan laporan, dan pengiriman massal menggunakan status/progress dan batas waktu yang sesuai; tidak menggantung UI tanpa umpan balik |
| Availability | Target awal 99,5% per bulan di luar pemeliharaan terjadwal bila infrastruktur dan biaya mendukung; jika tidak, catat target/SLA aktual secara jujur |
| Backup database | Backup otomatis harian minimum; frekuensi lebih tinggi jika toleransi kehilangan data mengharuskan |
| Restore | Prosedur restore diuji berkala; target awal RPO ≤ 24 jam untuk backup harian dan RTO awal ≤ 8 jam, lalu diperketat berdasarkan kebutuhan sekolah |
| Data integrity | Constraint FK/unique/check, transaksi atomik untuk proses kritis, dan pengujian kasus duplikasi |
| Responsif | Web berfungsi pada ponsel, tablet, dan desktop modern |
| Browser | Versi terbaru browser utama yang masih didukung: Chrome/Edge/Firefox/Safari sejauh kompatibel |
| Skalabilitas | Desain mendukung kenaikan jumlah siswa, transaksi per periode, foto, dan laporan tanpa mengganti model bisnis |
| Pemeliharaan | Migration, lint/test, dokumentasi setup, environment example tanpa secret, log, serta prosedur rollback tersedia |
| Observability | Error server, job gagal, backup gagal, dan penggunaan kapasitas bisa ditinjau oleh operator berwenang |
| Localizaton waktu | Waktu disimpan konsisten dan ditampilkan dalam zona Asia/Jakarta untuk sekolah kecuali konfigurasi eksplisit menentukan lain |
| Aksesibilitas | Formulir, navigasi, pesan status, dan kontras memenuhi praktik aksesibilitas web dasar |

## 16.1 Ketahanan dan pemulihan

- Backup database dan file penting dikelola sebagai dua komponen yang konsisten.
- Backup disimpan terpisah dari server utama; jika hanya ada di server yang sama, backup tidak cukup melindungi dari kerusakan server.
- Enkripsi dan akses backup dibatasi.
- Uji restore minimal dilakukan sebelum serah terima dan setelah perubahan besar.
- Dokumentasikan siapa yang menerima notifikasi backup gagal dan cara pemulihan.
- Deploy harus punya langkah rollback yang sesuai; migration destruktif memerlukan rencana pemulihan.

# 17. Infrastruktur, Deployment, dan Operasional

## 17.1 Environment

- **Local development:** berjalan di laptop developer, misalnya melalui Docker bila repository menggunakan Docker.
- **Test/staging:** data dummy/sanitized, menguji konfigurasi yang mendekati produksi.
- **Production:** domain resmi sekolah, HTTPS, database dan storage persisten, backup, monitoring, dan akun yang dikuasai sekolah.

Tidak boleh berbagi database atau kredensial antar environment.

## 17.2 Persyaratan deployment

- Setup terdokumentasi dari mesin bersih menggunakan README/compose/script yang tersedia.
- Environment variable dijelaskan dalam `.env.example` tanpa rahasia asli.
- Migration dapat dijalankan secara terkendali dan dilaporkan hasilnya.
- Seed data terpisah untuk referensi awal dan akun bootstrap; tidak menanam akun/password produksi tetap ke repository.
- HTTPS, domain, DNS, sertifikat, pembatasan port, firewall, database privat, serta storage privat dikonfigurasi.
- File upload disimpan di lokasi persisten dan termasuk dalam rencana backup.
- Logging tidak menyertakan kata sandi, token, dokumen, atau payload pribadi penuh.
- Health check untuk aplikasi dan dependency penting tersedia bila sesuai stack.
- Ada dokumentasi update aplikasi, restart, restore, dan rollback.

## 17.3 Kepemilikan pasca-serah terima

Domain, hosting/VPS, akun penyedia layanan, database backup, email/domain bila dipakai, dan kredensial admin produksi harus berada di bawah kendali sekolah. Developer memperoleh akses delegasi seperlunya, bukan kepemilikan tunggal. Data dan file tidak boleh terkunci pada akun pribadi developer setelah proyek selesai.

## 17.4 SOP operasional

- Pembuatan/nonaktif akun.
- Perubahan tahun ajaran dan semester.
- PPDB dibuka/ditutup dan aktivasi siswa.
- Publikasi/revisi jadwal.
- Pengisian/koreksi absensi.
- Pembukaan, pengumpulan, review, dan publikasi nilai/rapor.
- Pencatatan/konfirmasi kewajiban biaya.
- Proses bantuan, PKL, dan kelulusan.
- Publikasi konten dan pengelolaan media.
- Backup/restore, pembaruan sistem, dan respons insiden.

# 18. Integrasi Eksternal

Integrasi tidak diasumsikan tersedia hanya karena ada tombol/menu. Setiap integrasi perlu kontrak, autentikasi, pemetaan field, penanganan error, idempotency, log, dan pengujian.

Kandidat integrasi:
- Email untuk reset password, PPDB, notifikasi dan pemberitahuan resmi.
- WhatsApp melalui proses/manual link atau provider resmi bila sekolah memilih dan menyediakan akses; jangan mengklaim pengiriman otomatis tanpa integrasi aktif.
- Google Maps melalui tautan/embed yang sah dan dapat diedit.
- Penyimpanan file privat.
- Ekspor nilai/rapor ke format yang sesuai kebutuhan sekolah.
- Sistem pendidikan eksternal hanya setelah API/format/kebijakan resmi diperiksa.

Setiap modul harus tetap berfungsi pada inti transaksinya ketika kanal notifikasi eksternal sedang tidak tersedia.

# 19. Strategi Migrasi dan Audit Repository yang Sudah Ada

## 19.1 Prinsip audit

Repository lama adalah titik awal, bukan sumber kebenaran untuk requirements baru. Jangan langsung mengganti seluruh kode tanpa memahami dependensi; jangan pula mempertahankan desain yang salah hanya karena sudah dibuat.

## 19.2 Inventaris wajib

1. Daftar file/folder, bahasa/framework, versi runtime, package manager, Dockerfile/Compose, dan cara menjalankan.
2. Frontend routes/pages/components, backend routes/controllers/services, serta job background.
3. Database engine, schema/migration, relasi, constraint, seed, sample data, dan status migrasi.
4. Autentikasi, mekanisme sesi/token, middleware/guards, role dan permission yang benar-benar berjalan.
5. Seluruh API/endpoints, validasi, upload file, ekspor, notifikasi, dan integrasi eksternal.
6. Fitur yang tampak sudah ada tetapi sebenarnya dummy/static/mock.
7. Test unit/integration/e2e, lint, build, log error, dan known issue.
8. Deployment, environment variables, secret handling, backup, persistent storage, dan konfigurasi produksi.
9. Data duplikat, field tak terpakai, relasi yang hilang, dan status yang tidak konsisten.
10. Dokumentasi setup, keputusan desain, dan risiko lisensi/dependency.

## 19.3 Klasifikasi setiap bagian

Setiap modul/komponen diberi salah satu keputusan:

- **KEEP:** benar, teruji, aman, dan selaras dengan PRD.
- **REFACTOR:** fungsinya relevan tetapi logika, struktur, akses, UX, atau test perlu diperbaiki.
- **REBUILD:** model/flow fundamental tidak selaras atau terlalu rapuh untuk diperbaiki secara aman.
- **REMOVE/DEPRECATE:** duplikasi, dead code, fitur di luar scope, data palsu, atau pola yang berbahaya.
- **INVESTIGATE:** belum cukup bukti; perlu tracing/test lebih lanjut sebelum keputusan.

Setiap keputusan harus memiliki alasan, file/entitas yang terdampak, risiko, test pembuktian, dan jalur migrasi data jika perlu.

## 19.4 Pengamanan sebelum perubahan besar

- Simpan ZIP/repository asli sebagai baseline yang tidak dimodifikasi.
- Buat branch atau salinan kerja terpisah.
- Backup database dan file upload jika ada data yang perlu dipertahankan.
- Jalankan baseline build/test serta catat fitur yang sudah berjalan.
- Jangan menghapus tabel/data produksi sampai dependensi dan migrasi tervalidasi.
- Perubahan schema dibuat dalam migration dan diuji dari database kosong serta skenario upgrade.
- Refactor tidak boleh membuat ulang fitur/halaman sebagai proyek kedua yang terputus dari aplikasi lama.

# 20. Strategi Implementasi dan Distribusi Pekerjaan

Pengerjaan bertahap berdasarkan dependensi data. Fitur yang bergantung pada identitas, periode, dan penugasan tidak boleh dibangun terlebih dahulu sebagai form terpisah tanpa fondasi tersebut.

## Fase 0 — Audit dan baseline
**Keluaran:** peta repository, cara run, inventaris fitur, data model aktual, pemeriksaan keamanan awal, backlog KEEP/REFACTOR/REBUILD/REMOVE, serta baseline build/test.

**Exit gate:** developer lain dapat menjalankan aplikasi dari instruksi yang bersih; ada daftar komponen yang valid dan rusak; backup baseline tersedia.

## Fase 1 — Fondasi aplikasi dan keamanan
**Pekerjaan:** konfigurasi environment, database/migrations, autentikasi, role/permission, session management, audit log, file storage, error handling, backup, seed untuk master referensi.

**Exit gate:** semua role diuji; akses lintas pengguna ditolak; migration dari database kosong berjalan; backup dapat dipulihkan.

## Fase 2 — Master data dan CMS publik
**Pekerjaan:** pengaturan sekolah, program TKJ/TSM/TB, guru, halaman publik, berita/pengumuman/event/galeri, media upload, draft-preview-publish, responsif dan SEO dasar.

**Exit gate:** admin sekolah mengubah dan menerbitkan konten tanpa menyentuh kode; draft tidak bocor ke publik; tidak ada NPSN/legal detail yang dilarang.

## Fase 3 — PPDB dan aktivasi siswa
**Pekerjaan:** periode/jalur, formulir, dokumen, verifikasi, koreksi, keputusan, daftar ulang, aktivasi siswa, penautan akun, import/validasi.

**Exit gate:** test dari aplikasi baru hingga siswa aktif lolos; aplikasi ganda tidak membuat siswa ganda; file privat tidak terbuka publik.

## Fase 4 — Tahun ajaran, enrollment, kelas, penugasan, roster
**Pekerjaan:** periode akademik, siswa per kelas, wali kelas, guru mapel, ruang, editor jadwal, konflik, versi, publikasi, PDF.

**Exit gate:** tidak dapat menerbitkan konflik kritis; pergantian tahun tidak menimpa histori; jadwal guru dan siswa mengambil sumber versi terbit.

## Fase 5 — Absensi guru dan siswa
**Pekerjaan:** sesi absensi, QR dinamis/GPS sesuai kebijakan, status anomali, pencatatan absensi siswa per sesi, correction workflow, laporan.

**Exit gate:** sesi belum diisi tidak berubah menjadi alpa; QR kedaluwarsa/replay ditolak; koreksi memiliki audit; akses lintas guru/siswa ditolak.

## Fase 6 — Nilai dan rapor
**Pekerjaan:** asesmen/komponen, input nilai, bobot konfigurabel, submit guru, rekap wali kelas, review Admin, snapshot/publikasi, portal siswa, export.

**Exit gate:** workflow berjenjang tidak dapat dilewati; nilai kosong tidak dikonversi diam-diam; siswa hanya dapat membaca rapornya; revisi menghasilkan histori.

## Fase 7 — Biaya, honor, bantuan, PKL, kelulusan
**Pekerjaan:** satu modul per domain dengan role dan statusnya; notifikasi; laporan; audit.

**Exit gate:** transaksi/status terpisah benar; modul sensitif memiliki pembatasan akses; tidak ada klaim transfer/potongan otomatis; checklist kelulusan tidak menetapkan keputusan sendiri.

## Fase 8 — Integrasi, hardening, dan serah terima
**Pekerjaan:** pengujian regresi, keamanan, beban, backup/restore, data migration final, dokumentasi, SOP, pelatihan, deployment produksi, pencabutan kredensial sementara.

**Exit gate:** checklist penerimaan selesai; akun dan layanan dimiliki sekolah; restore diuji; tidak ada blocker keamanan kritis terbuka.

## 20.1 Pembagian peran tim yang disarankan

| Area kerja | Pemilik utama | Reviewer/pendamping |
|---|---|---|
| Audit dan arsitektur | Lead developer/anggota yang memahami repository | Seluruh tim |
| Model data/migration | Backend/data owner | Reviewer yang memeriksa relasi dan constraint |
| Auth/RBAC/security | Backend owner | Lead reviewer; uji akses silang |
| CMS dan website publik | Frontend/content owner | Admin Sekolah sebagai reviewer konten |
| PPDB dan master siswa | Backend + frontend domain owner | QA dan pemilik proses sekolah |
| Jadwal/absensi | Domain owner akademik | QA dengan kasus bentrok dan koreksi |
| Nilai/rapor | Domain owner akademik | Reviewer akademik; semua rumus/divisi status diuji |
| Biaya/honor/bantuan | Domain owner administrasi | Reviewer akses data sensitif |
| PKL/kelulusan | Domain owner akademik | Admin dan QA |
| DevOps/backup/deployment | Owner teknis/DevOps | Lead developer dan wakil sekolah |
| Dokumentasi/acceptance | QA/documentation owner | Seluruh pemilik modul |

Pembagian dapat dilakukan ulang berdasarkan ukuran tim, tetapi satu orang harus ditunjuk sebagai pemilik akhir per modul agar keputusan tidak saling bertentangan. Setiap perubahan lintas domain perlu code review dari pemilik data/aturan yang terdampak.

# 21. Strategi Pengujian dan Kriteria Penerimaan

## 21.1 Jenis pengujian wajib

- Unit test untuk kalkulasi, transisi status, validasi jadwal, perhitungan nilai, sisa tagihan, dan aturan kelayakan/checklist.
- Integration test untuk relasi database, aktivasi PPDB, pengiriman nilai, publikasi rapor, attendance session, notifikasi, serta file storage.
- API/authorization test untuk seluruh role dan akses objek lintas user.
- End-to-end test untuk perjalanan lengkap setiap workflow.
- Regression test untuk alur yang telah lulus sebelumnya.
- Security test untuk IDOR, eskalasi role, upload file, reset password, session, XSS/CSRF/SQL injection yang relevan, dan data leak di API/log/export.
- Responsive/usability check pada desktop dan ponsel.
- Backup/restore drill pada environment uji.
- Performance smoke test pada dataset representatif.

## 21.2 Skenario penerimaan lintas modul

### PPDB ke siswa
1. Pemohon membuat aplikasi dan mengunggah semua berkas.
2. Admin mengembalikan satu berkas untuk koreksi.
3. Pemohon memperbaiki dan mengirim ulang.
4. Admin menyetujui dan merekam hasil seleksi.
5. Daftar ulang diperiksa.
6. Aktivasi dijalankan dua kali akibat retry; hasilnya tetap satu student_id.
7. Siswa menerima akses portal yang menaut ke student_id tersebut.
8. Pemohon lain tidak dapat membuka aplikasi/berkas ini.

### Jadwal ke absensi
1. Admin menyusun roster yang memiliki satu bentrok guru dan satu bentrok ruang.
2. Sistem menolak publikasi dan menunjukkan konflik.
3. Admin memperbaiki jadwal dan menerbitkan versi 1.
4. Dashboard guru/siswa menampilkan versi 1 yang sama.
5. Admin membuat revisi versi 2; histori versi 1 tetap tersedia dan pengguna terdampak menerima pemberitahuan.
6. Sesi absensi menunjuk ke jadwal/periode yang benar.

### Absensi siswa
1. Guru membuka sesi yang ditugaskan.
2. Sistem menampilkan enrollment aktif.
3. Sebagian siswa ditandai; sesi belum lengkap.
4. Sistem tidak mengubah siswa yang belum ditandai menjadi alpa.
5. Setelah semua status sesuai dan submit, sesi tercatat.
6. Koreksi satu record membutuhkan hak dan alasan.
7. Siswa hanya melihat record miliknya.

### Nilai/rapor
1. Guru A mengisi nilai dan melakukan submit.
2. Guru B belum mengirim; wali kelas melihat status belum lengkap.
3. Wali kelas tidak bisa finalisasi normal ketika ada komponen wajib kosong.
4. Guru memperbaiki nilai yang dikembalikan dengan histori.
5. Wali kelas melakukan rekap finalisasi dan mengirim ke Admin.
6. Admin mengembalikan paket dengan alasan, atau menyetujui dan memublikasikan.
7. Siswa A melihat rapor A; mengganti ID request ke siswa B ditolak.
8. Perubahan setelah publikasi menjadi revisi baru, bukan menghapus versi sebelumnya.

### Biaya dan konfirmasi pembayaran
1. Admin membuat kewajiban untuk siswa A dan B.
2. Siswa A mengirim konfirmasi; status berubah menjadi menunggu verifikasi.
3. Siswa B tidak terkena perubahan status.
4. Admin memverifikasi nominal dan menandai lunas.
5. Pengingat aktif dihentikan; histori tetap tersedia.
6. Siswa tidak dapat memanggil endpoint verifikasi Admin.

### Absensi guru dan honor
1. Guru melakukan check-in dengan token valid.
2. Token yang sama digunakan ulang dan ditolak/ditandai sesuai kebijakan.
3. Lokasi dengan akurasi buruk diberi status untuk tinjauan, bukan tuduhan otomatis.
4. Admin mengoreksi record dengan alasan.
5. Rekap honor hanya menggunakan data yang telah ditinjau sesuai aturan dan tidak melakukan potongan otomatis.

### Bantuan, PKL, kelulusan
1. Aplikasi bantuan dengan dokumen kurang ditandai belum lengkap.
2. Kandidat tidak otomatis dianggap penerima sampai hasil resmi dicatat.
3. Dua siswa satu kelas dapat ditempatkan di lokasi PKL berbeda.
4. Pembimbing hanya melihat penempatan yang ditugaskan.
5. Checklist kelulusan mengidentifikasi data kosong, bukan langsung menetapkan gagal.
6. Keputusan kelulusan hanya dicatat oleh role yang sah dan memiliki jejak audit.

## 21.3 Kriteria Done per fitur

Sebuah fitur hanya berstatus **Done** bila:

- UI berfungsi pada peran yang benar.
- Data disimpan dan dibaca dari backend/database, bukan mock/static.
- Validasi frontend dan backend tersedia.
- Otorisasi diuji untuk akses sah dan akses terlarang.
- Status serta transisi yang relevan dijalankan.
- Loading, empty, success, dan error state dikelola.
- Audit/history tersedia bila fitur mengubah data penting.
- Test otomatis yang relevan lulus.
- Dokumen pengguna/teknis diperbarui jika alur berubah.
- Tidak ada blocker keamanan atau data loss yang diketahui.

# 22. Risiko, Dependensi, dan Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Repository awal memakai model data tidak konsisten | Data ganda, refactor mahal | Audit schema dan alur sebelum fitur baru; mapping sumber kebenaran |
| Scope terlalu besar untuk satu rilis | Fitur setengah jadi | Implementasi berfase dan gate penerimaan; core flows lebih dulu |
| Kebijakan nilai/rapor belum terperinci | Rumus/format tidak sesuai | Buat konfigurasi; simpan rumus/versi; gunakan contoh uji yang dikonfirmasi sekolah |
| GPS/QR dianggap anti-kecurangan absolut | False positive dan celah | Kombinasi token server, waktu, geofence, audit, exception review; klaim batasan jelas |
| Data pribadi siswa bocor | Risiko privasi dan reputasi | RBAC + object authorization + file privat + audit + security test |
| Admin sekolah belum terbiasa memakai sistem | Kesalahan operasional | UX sederhana, SOP, preview/konfirmasi, pelatihan, dokumentasi |
| Data historis hilang saat pergantian tahun | Rapor/laporan lama salah | Enrollment per periode, snapshot rapor, versi jadwal, archive |
| Backup tidak bisa direstore | Kehilangan data permanen | Backup off-server dan restore drill berkala |
| Kredensial produksi hanya dimiliki developer | Ketergantungan pasca-serah terima | Akun dan domain dimiliki sekolah; dokumentasi dan serah terima |
| Notifikasi eksternal gagal | Proses dianggap gagal/tidak diketahui | Outbox/status delivery, retry, pusat notifikasi internal |
| Sistem lambat pada laporan/upload | Pengguna mengulang tindakan | Pagination, limit, background job untuk tugas berat, idempotency |
| Migrasi database merusak data | Downtime/data loss | Backup, migration teruji, rencana rollback, staging |
| Fitur placeholder dikira selesai | Risiko TA dan operasional | Definition of Done, acceptance tests, label demo/mock |
| Ketergantungan sistem eksternal belum jelas | Janji integrasi tidak realistis | Verifikasi API/format/izin; ekspor manual terstruktur sementara |

# 23. Asumsi dan Keputusan Default untuk Realisasi

Ketentuan berikut ditetapkan sebagai default kerja agar development dapat dimulai tanpa terus menunggu jawaban. Nilainya dapat diubah melalui konfigurasi atau keputusan sekolah, tetapi perubahan harus didokumentasikan.

1. Produk adalah satu aplikasi web modular; bukan kumpulan aplikasi independen.
2. Bahasa antarmuka Bahasa Indonesia; timezone operasional Asia/Jakarta.
3. Website publik hanya menampilkan informasi yang diterbitkan dan disetujui.
4. NPSN/legal data yang sudah dinyatakan tidak publik tetap tidak ditampilkan.
5. Program awal: TKJ, TSM, TB.
6. Satu Admin Sekolah utama serta Superadmin teknis; jumlah akun/role dapat ditambah bila dibutuhkan.
7. Calon siswa dapat mengelola aplikasi sendiri; siswa aktif mengakses data sendiri.
8. Penerimaan PPDB tidak sama dengan aktivasi siswa; daftar ulang harus diverifikasi.
9. Durasi 45 menit dan istirahat 30 menit dapat menjadi konfigurasi awal, bukan asumsi permanen.
10. Perhitungan nilai, bobot, predikat, remedial, dan format rapor harus dikonfigurasi sesuai kebijakan; tidak ada bobot final yang di-hardcode oleh developer.
11. QR dan GPS merupakan kontrol pendukung absensi, bukan bukti anti-fraud absolut.
12. Kewajiban biaya dan pembayaran dicatat; pembayaran tidak diproses melalui gateway dalam baseline.
13. Modul honor/gaji adalah pencatatan dan laporan internal, bukan payroll otomatis.
14. Bantuan dan kelulusan mengikuti aturan resmi program/sekolah; sistem memberi dukungan dan checklist.
15. Website publik tidak menampilkan data pribadi siswa atau detail keuangan.
16. Setiap modul yang melibatkan data pribadi memiliki permission dan audit sesuai risiko.
17. API/format integrasi eksternal belum dianggap tersedia sampai diuji.
18. Data dummy tidak dibawa sebagai data produksi.
19. Infrastruktur produksi, domain, backup, dan akun layanan dikendalikan sekolah.
20. Jika suatu kebijakan belum jelas, developer memilih implementasi yang konservatif, konfigurabel, bisa diaudit, dan tidak menghapus data.

# 24. Deliverable Proyek

## 24.1 Produk perangkat lunak
- Repository aplikasi terintegrasi yang dapat dibangun dan dijalankan dari instruksi bersih.
- Website publik responsif dan CMS.
- Portal calon siswa, siswa, guru/wali kelas, Admin Sekolah, dan Superadmin.
- Backend/API dan database dengan migration, constraint, seed referensi yang aman, serta audit trail.
- Pengelolaan file/media privat dan publik.
- Laporan/ekspor yang menjadi scope.
- Konfigurasi environment dan deployment.
- Backup otomatis dan prosedur restore.

## 24.2 Dokumentasi
- PRD ini dan catatan perubahan.
- Diagram arsitektur dan ERD aktual setelah schema final.
- Matriks role/permission aktual.
- Diagram status/workflow untuk PPDB, jadwal, absensi, nilai/rapor, biaya, bantuan, PKL, dan kelulusan.
- README developer untuk setup, migration, run, test, build, dan deployment.
- `.env.example` tanpa credential asli.
- API reference.
- Manual Admin Sekolah dan manual guru/siswa sesuai kebutuhan.
- SOP backup/restore dan incident response dasar.
- Catatan keputusan teknis dan batasan integrasi.
- Checklist serah terima aset dan akses produksi.

## 24.3 Pelatihan dan serah terima
- Pelatihan operator/Admin Sekolah menggunakan data uji.
- Demonstrasi alur utama dari awal sampai akhir.
- Serah terima akun/layanan yang dimiliki sekolah.
- Uji login role tiap kategori.
- Uji backup restore.
- Konfirmasi bahwa developer sementara tidak lagi menjadi satu-satunya pemilik akses produksi.

# 25. Kriteria Go-Live

Aplikasi tidak dinyatakan siap produksi sebelum semua item blocker berikut terpenuhi:

- [ ] Setup production berjalan dari dokumentasi.
- [ ] HTTPS aktif; rahasia tidak berada di repository.
- [ ] Database dan storage persisten sudah dikonfigurasi.
- [ ] Migration dan seed production telah diverifikasi.
- [ ] Akun bootstrap aman, password awal diganti, dan role diuji.
- [ ] Akses lintas siswa/guru/kelas telah diuji dan ditolak bila tidak sah.
- [ ] Upload file memvalidasi type/size dan file privat tidak dapat diakses publik.
- [ ] Semua alur kritis memiliki handling error dan audit yang diperlukan.
- [ ] Tidak ada data dummy, lorem ipsum, statistik rekaan, atau identitas contoh pada konten produksi.
- [ ] Backup otomatis berjalan dan backup dapat dipulihkan pada lingkungan uji.
- [ ] Jadwal, absensi, nilai, PPDB, biaya, dan semua modul yang diaktifkan lulus acceptance test.
- [ ] Halaman publik tidak memunculkan NPSN/legal data yang dilarang atau detail pribadi internal.
- [ ] Informasi kontak, tautan sosial, Maps, logo, foto, dan konten disetujui sekolah.
- [ ] Error logs, monitoring dasar, dan kontak penanggung jawab teknis tersedia.
- [ ] Manual pengguna, SOP, dan dokumentasi deployment diserahkan.
- [ ] Domain/hosting/akun utama dan recovery access berada dalam kendali sekolah.
- [ ] Tidak ada blocker keamanan/data loss yang terbuka; risiko residual dicatat.

# 26. Traceability: Kebutuhan ke Modul dan Bukti Uji

| ID kebutuhan | Kebutuhan | Modul sumber | Konsumen utama | Bukti penerimaan |
|---|---|---|---|---|
| PRD-001 | Konten publik hanya yang diterbitkan | CMS | Website publik | Draft tidak dapat diakses anonim |
| PRD-002 | Program keahlian terpusat | Master data | PPDB, website, enrollment, laporan | Perubahan master konsisten lintas modul |
| PRD-003 | Kode guru unik dan tetap | Guru/Superadmin | Jadwal, absensi, nilai, honor | Duplikasi ditolak; histori tetap tertaut |
| PRD-004 | PPDB sampai aktivasi tanpa siswa ganda | PPDB/siswa | Kelas, jadwal, nilai | E2E activation idempotent |
| PRD-005 | Histori enrollment per tahun ajaran | Akademik | Absensi, nilai, rapor | Pergantian tahun tidak menimpa histori |
| PRD-006 | Penugasan wali kelas per periode | Akademik | Rapor, dashboard | Akses wali kelas sesuai periode |
| PRD-007 | Roster tervalidasi dan berversi | Jadwal | Guru, siswa, sesi | Konflik ditolak; versi lama tersedia |
| PRD-008 | Absensi guru punya kontrol QR/GPS dan review | Absensi guru | Laporan, honor | Token replay/expiry dan correction test |
| PRD-009 | Absensi siswa per sesi | Absensi siswa | Siswa, wali kelas, Admin | Sesi kosong tidak berubah menjadi alpa |
| PRD-010 | Nilai dikirim guru dan direkap wali kelas | Nilai/rapor | Admin, siswa | Workflow tidak dapat dilewati |
| PRD-011 | Admin menerbitkan paket rapor | Rapor | Siswa | Hanya rapor published yang dapat dibaca |
| PRD-012 | Siswa tidak dapat melihat data siswa lain | Auth/RBAC | Semua modul pribadi | IDOR test lulus |
| PRD-013 | Biaya punya verifikasi dan histori | Biaya | Siswa, Admin | Pembayaran satu siswa tidak mengubah siswa lain |
| PRD-014 | Honor tidak memotong otomatis | Honor | Admin | Absensi perlu review sebelum digunakan |
| PRD-015 | Bantuan melalui status verifikasi | Bantuan | Admin, siswa | Kandidat ≠ penerima resmi |
| PRD-016 | PKL individual dan terlacak | PKL | Siswa, pembimbing, Admin | Penempatan dapat berbeda per siswa |
| PRD-017 | Kelulusan memerlukan keputusan resmi | Kelulusan | Admin, siswa | Kelengkapan tidak otomatis memutuskan lulus |
| PRD-018 | Peristiwa penting memicu notifikasi | Notifikasi | Pengguna terkait | Event log dan delivery status tersedia |
| PRD-019 | Backup dapat dipulihkan | Operasional | Pemilik sistem | Restore drill berhasil |
| PRD-020 | Domain/data produksi dikendalikan sekolah | Deployment | Sekolah | Serah terima akun dan recovery berhasil |

# 27. Glossary

- **Admin Sekolah:** operator yang menjalankan proses bisnis sekolah.
- **Superadmin:** pengelola konfigurasi sistem dan keamanan teknis; bukan otomatis pemilik semua hak bisnis.
- **RBAC:** Role-Based Access Control, pembatasan akses berdasarkan role dan permission.
- **IDOR:** Insecure Direct Object Reference; celah saat pengguna dapat membuka objek milik pihak lain dengan mengganti ID.
- **Source of truth:** data sumber utama yang dijadikan acuan semua modul.
- **Enrollment:** keanggotaan seorang siswa pada kelas/program/periode tertentu.
- **Roster/timetable:** jadwal pelajaran yang berlaku untuk kelas, guru, mata pelajaran, ruang, dan periode.
- **Lesson session:** sesi pelajaran bertanggal yang menjadi konteks absensi.
- **Snapshot:** salinan representasi data pada saat diterbitkan agar hasil lama tetap dapat direproduksi.
- **Audit trail:** catatan aktivitas yang menjelaskan siapa melakukan apa, kapan, terhadap data mana, dan apa perubahannya.
- **Idempotent:** operasi yang jika terulang tidak membuat efek duplikat yang tidak diinginkan.
- **RPO:** batas maksimum kehilangan data yang dapat diterima, diukur dalam waktu.
- **RTO:** target waktu pemulihan layanan setelah gangguan.
- **Dummy/mock data:** data contoh untuk pengembangan/pengujian, bukan data produksi.
- **e-Rapor:** aplikasi/format rapor eksternal yang penggunaannya dan integrasinya perlu diverifikasi secara spesifik.

# 28. Penutup dan Aturan Eksekusi

PRD ini menjadi baseline untuk menilai proyek yang ada dan mengarahkan realisasi sistem. Implementasi tidak dimulai dengan menambahkan semua halaman sekaligus. Urutannya adalah memahami repository, mengunci model data dan aturan akses, membangun fondasi yang konsisten, lalu merealisasikan workflow yang memiliki sumber data dan kriteria penerimaan jelas.

Ketika kebutuhan baru ditemukan, kebutuhan tersebut dicatat sebagai perubahan PRD/backlog dengan dampak terhadap data, role, status, UI, API, test, dan migrasi. Jangan menerima perubahan hanya sebagai permintaan UI tanpa menilai efeknya pada alur data.

**Prinsip akhir:** tidak ada fitur yang dinyatakan selesai sebelum alur datanya benar, aksesnya aman, statusnya dapat ditelusuri, serta skenario penerimaan utamanya berhasil diuji.

---

# Addendum Keputusan Produk v1.1 — Prioritas terhadap Bagian Sebelumnya

Addendum ini menetapkan keputusan produk yang lebih baru dan menggantikan bagian PRD sebelumnya yang menggambarkan portal wali/orang tua atau model role sebelum migrasi 021.

## A. Enam role autentikasi setelah perluasan V3

Role internal: `superadmin`, `admin`, `guru`, `siswa`, `applicant`, dan `school_leader`. Perubahan ini menggantikan keputusan empat role untuk implementasi V3 setelah migrasi 021.

- Pengunjung website publik tidak membutuhkan akun atau role.
- Calon Murid memakai role `applicant` dan `account_stage='applicant'`. Setelah lolos penerimaan resmi, menyelesaikan daftar ulang, serta integrasi valid, akun yang sama tetap role `applicant` dan berubah menjadi `account_stage='student'`; permission akademik pribadi ditambahkan berdasarkan tahap akun tanpa mengubah role.
- Orang tua/wali adalah data formulir PPDB saja; tidak ada akun/portal orang tua.
- Wali kelas bukan role: penugasan guru ke kelas dan periode menjadi sumber permission tambahan.
- Guru mapel tetap role `guru`; aksesnya didasarkan pada teaching assignment aktif.
- Admin merangkap seluruh pekerjaan Admin PPDB dan Admin Sekolah, termasuk CMS, PPDB, master kesiswaan operasional, penempatan kelas, penugasan, roster, approval absensi, approval/publikasi rapor dan administrasi.
- `school_leader` mencakup Kepala Sekolah dan Kepala Yayasan, menggunakan dashboard agregat baca-saja; izin akses detail atau persetujuan tambahan harus ditetapkan eksplisit, tidak diwarisi dari Admin.
- Superadmin membuat master jurusan, record guru, kode unik guru, akun login role guru, serta mengelola akun Admin/Superadmin dan fungsi teknis. Superadmin bukan pengganti Admin pada operasional harian.

## B. Master data dan identitas

- `school_programs` menjadi satu-satunya master jurusan. Pendaftar memilih dari jurusan aktif; Admin menggunakan jurusan yang sama saat membuat kelas dan menempatkan siswa.
- Superadmin membuat setiap guru dengan satu transaksi yang menciptakan teacher record, user login, role `guru`, dan `teacher_code` permanen. Kode guru merupakan identitas referensi dan bukan password.
- Admin memilih guru dari master Superadmin untuk pengajaran, mata pelajaran, roster dan assignment wali kelas. Tidak membuat duplikat guru karena penugasannya berbeda.
- Data kelas harus mencatat jurusan dan tingkat (X/XI/XII). Enrollment dipelihara per periode/tahun ajaran agar histori kelas tidak hilang.

## C. Roster dan workflow

- Admin merakit roster mingguan sebagai versi draf berdasarkan teacher assignment. Sistem harus mendeteksi benturan kelas, guru dan ruangan.
- Versi roster yang sudah terbit tidak diedit diam-diam. Perubahan dibuat di draf versi berikutnya; versi baru dipublikasikan setelah tervalidasi; versi terbit lama menjadi histori.
- Guru melakukan presensi mengajar dan absensi siswa untuk sesi yang ditugaskan. Pengajuan absensi masuk ke antrean review Admin dan memerlukan approval/return eksplisit.
- Guru memasukkan dan mengirim nilai. Guru yang ditugaskan wali kelas mengompilasi nilai siswa dan mapel dalam kelasnya, memeriksa kekurangan, lalu mengirim paket rapor ke Admin. Admin menerbitkan atau mengembalikan paket.
- Siswa hanya dapat membaca rapor dan data akademik yang sudah tersedia menurut kebijakan dan terkait ke student record miliknya.
- Alur honor menggunakan review/persetujuan operasional tunggal oleh Admin; tidak memerlukan role terpisah Kepala Yayasan atau persetujuan dual-role di aplikasi.

## D. UI/CMS dan implementasi

CMS Admin mengelola logo sekolah yang bertindak sebagai tautan beranda, favicon, warna, nama tampilan, kontak, lokasi, media sosial, semua halaman profil, kepala sekolah/guru/staf, program, fasilitas, ekstrakurikuler, prestasi, berita, pengumuman, event dan galeri. Konten publik hanya memperlihatkan versi yang diterbitkan.

Arsitektur menggunakan backend Node/Express, MySQL dan gateway dengan proses layanan domain yang terpisah di Docker Compose. Selama fase transisi, layanan memakai skema database bersama; hal ini tidak boleh diklaim sebagai database-per-service. Keamanan mengutamakan otorisasi server-side berdasarkan user, cakupan objek, penugasan dan status workflow, bukan bergantung pada kerahasiaan ID.
