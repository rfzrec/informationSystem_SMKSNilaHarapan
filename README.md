# SMKS Nila Harapan — Sistem Informasi Sekolah Terintegrasi

Repository ini merupakan perombakan berdasarkan PRD dan aturan operasi terbaru. Proyek lama digunakan sebagai basis teknis, tetapi alur, permission, dan tampilan yang bertentangan dengan kebutuhan diganti. Jangan menyamakan adanya kode/tabel dengan fitur yang sudah lulus uji end-to-end.

## 1. Menjalankan secara lokal

### Persyaratan

- Docker Desktop aktif dengan Docker Compose v2.
- Koneksi internet untuk build image pada penggunaan pertama.
- Browser modern. Fitur QR presensi membutuhkan akses kamera dan lokasi; produksi harus menggunakan HTTPS.

### Konfigurasi pertama kali (Windows PowerShell)

Ekstrak ZIP, buka terminal di folder `smksnilaharapanV1`, lalu:

```powershell
Copy-Item .env.example .env
```

Buka `.env` dan ganti minimal `DB_PASSWORD`, `DB_ROOT_PASSWORD`, `SESSION_SECRET`, `INTERNAL_SERVICE_TOKEN`, serta `SEED_DEMO_PASSWORD`. Nilai contoh di `.env.example` hanya placeholder pengembangan, bukan kredensial untuk dipakai di produksi. Untuk development lokal pertama kali, simpan `SEED_DEMO=true`; akun demo dibuat dari `SEED_SYSADMIN_EMAIL` dan `SEED_ADMIN_EMAIL`.

Kemudian jalankan:

```powershell
docker compose -f docker-compose.yml config
docker compose -f docker-compose.yml up --build -d
docker compose -f docker-compose.yml ps
```

Akses website melalui <http://localhost:3000> dan health check melalui <http://localhost:3000/api/health>.

Periksa log bila container belum sehat:

```powershell
docker compose -f docker-compose.yml logs --tail=150
```

Berhenti tanpa menghapus data:

```powershell
docker compose -f docker-compose.yml down
```

`docker compose down -v` menghapus volume database dan storage lokal. Gunakan hanya ketika memang ingin mereset data pengembangan.

### Akun demo

Jika `SEED_DEMO=true`, akun demo menggunakan email dari `.env`:

- `SEED_SYSADMIN_EMAIL` (default `superadmin@demo.nilaharapan.test`)
- `SEED_ADMIN_EMAIL` (default `admin@demo.nilaharapan.test`)

Keduanya memakai password awal `SEED_DEMO_PASSWORD` hanya ketika akun belum ada. Jika password diubah pada `.env` setelah akun dibuat, database tidak otomatis mengubah password lama. Reset melalui prosedur reset password yang tersedia. Jangan gunakan akun/password demo di produksi.

## 2. Model role: enam role internal

| Role | Tugas utama |
|---|---|
| `superadmin` | Mengelola master jurusan, daftar guru, kode guru unik, akun login guru, akun Admin/Superadmin, pengaturan teknis, audit, dan monitoring sistem. |
| `admin` | Satu-satunya role operasional sekolah: PPDB, CMS, data siswa, kelas, penugasan guru, roster, penentuan wali kelas, persetujuan absensi, persetujuan/publikasi rapor, biaya, honor, bantuan, PKL, dan kelulusan. |
| `guru` | Melihat jadwal/kelas/mapel yang ditugaskan, check-in pribadi, mengisi absensi sesi miliknya, mengisi nilai, mengirim nilai untuk review, melihat honor pribadi, dan mengelola rapor kelas hanya jika mendapat penugasan wali kelas. |
| `siswa` | Role untuk akun siswa aktif yang sudah dikelola melalui alur siswa. |
| `applicant` | Calon Murid yang mengelola pengajuan PPDB sendiri. Role tetap dipertahankan setelah aktivasi; `account_stage` berubah dari `applicant` menjadi `student`. |
| `school_leader` | Pimpinan Sekolah untuk Kepala Sekolah dan Kepala Yayasan; akses ringkasan agregat baca-saja secara default. |

Pimpinan Sekolah dibuat oleh Superadmin melalui menu Akun Pengguna dengan role `school_leader`. Pengunjung website publik tidak memerlukan role/login. Orang tua/wali bukan role dan tidak memiliki dashboard terpisah; data mereka tetap menjadi bagian formulir PPDB. Wali kelas bukan role, melainkan penugasan guru untuk kelas dan periode tertentu. Guru mapel tetap ber-role `guru`; haknya ditentukan oleh penugasan aktual, bukan role tambahan.

## 3. Pembagian service

| Service/container | Tanggung jawab |
|---|---|
| `gateway` | Menyajikan frontend, routing API, header keamanan, dan batas unggah. |
| `identity-service` | Autentikasi, sesi, role/permission, pengaturan teknis, user administration, audit. |
| `cms-service` | Website publik, branding, profil, konten dan media CMS. |
| `admissions-service` | Periode PPDB, aplikasi, dokumen, verifikasi, seleksi, daftar ulang dan integrasi calon siswa. |
| `academic-service` | Master akademik, kelas, penugasan, roster, wali kelas, absensi siswa, QR check-in guru dan PKL. |
| `assessment-service` | Periode asesmen, input nilai, review wali kelas, paket rapor, publikasi/revisi. |
| `payroll-service` | Pencatatan realisasi dan honor guru. |
| `administration-service` | Bantuan pendidikan, review kelengkapan/keputusan kelulusan, dan fungsi administrasi yang dirutekan di sana. |
| `notification-worker` | Pekerja terjadwal untuk notifikasi. |
| `qr-renderer` | Service internal untuk merender QR SVG; tidak dibuka ke host. |
| `db` / `migrate` | MySQL 8.4 dan proses migrasi/seed satu kali. |

**Batas microservice saat ini:** service sudah dipisahkan sebagai proses/container dan dirutekan melalui gateway, tetapi masih memakai skema MySQL warisan yang sama. Itu tahap transisi, bukan isolasi database penuh per service. Migrasi ke database-per-service dan broker event perlu perencanaan migrasi data dan uji integrasi tersendiri.

## 4. Alur inti

1. Superadmin menambahkan master jurusan dan guru. Pembuatan guru menghasilkan record guru, kode permanen seperti `GURU-000123`, akun login dan role `guru` dalam satu transaksi. Kode unik adalah referensi, bukan password.
2. Admin melihat data master tersebut dan memilih jurusan ketika membuat kelas, menempatkan siswa aktif, menetapkan guru mapel, dan menentukan wali kelas.
3. Pilihan jurusan pada formulir PPDB berasal dari master jurusan yang aktif. Calon Murid memakai role `applicant` dengan `account_stage=applicant`.
4. Admin menangani seluruh proses PPDB. Setelah keputusan diterima dan daftar ulang terverifikasi, integrasi menghubungkan akun pendaftar yang sama ke data induk siswa; role tetap `applicant`, sedangkan `account_stage` menjadi `student`; permission akademik pribadi diberikan berdasarkan tahap akun.
5. Admin membuat roster mingguan sebagai draf. Roster yang sudah valid diterbitkan sebagai versi baru; versi yang terbit sebelumnya tetap digunakan sampai versi baru dipublikasikan.
6. Guru melakukan check-in dan mengisi absensi siswa hanya pada sesi/kelas yang menjadi penugasannya. Pengajuan absensi masuk ke antrean review Admin; koreksi harus punya alasan dan audit.
7. Guru mengirim nilai. Jika guru juga ditugaskan sebagai wali kelas, ia dapat meninjau kelengkapan seluruh mapel/siswa pada kelas itu, merekap dan mengirim paket rapor. Admin menyetujui atau mengembalikan paket sebelum publikasi. Siswa hanya melihat rapor terbit miliknya.
8. Modul biaya, honor, bantuan, PKL dan kelulusan menggunakan identitas master siswa/guru dan mencatat status serta riwayatnya.

## 5. CMS dan tampilan

CMS Admin menyimpan branding terpusat: nama/identitas tampilan sekolah, logo (logo header menuju beranda), favicon, warna, kontak, tautan sosial, lokasi, dan konten halaman. CMS juga mencakup profil/sejarah, visi-misi, kepala sekolah, guru/staf, struktur organisasi, program, fasilitas, ekstrakurikuler, prestasi, berita, pengumuman, event, galeri, kontak serta informasi PPDB. Konten publik hanya tampil setelah dipublikasikan. Identitas hukum/NPSN yang tidak diizinkan tampil tidak boleh ditambahkan ke konten publik.

## 6. Keamanan minimum

- Backend memeriksa role, permission, hubungan pengguna dengan record dan status proses pada setiap endpoint sensitif; menu tersembunyi bukan kontrol akses.
- Primary key internal, kode guru, nomor siswa, nomor PPDB, user ID dan ID paket rapor memiliki fungsi berbeda. Mengetahui ID tidak memberi izin.
- Dokumen PPDB/bantuan bersifat privat. Logo dan foto yang disetujui dapat menjadi media publik. File privat hanya diunduh melalui endpoint terotorisasi.
- Nilai, absensi, pembayaran, PPDB, dan kelulusan mempunyai state transition dan audit trail; tidak boleh dihapus permanen lewat tombol aplikasi.
- Backup dan restore perlu diuji. Rotasi semua secret dan gunakan HTTPS/secure cookies sebelum deployment produksi.

## 7. Pengujian

Pada host dengan Node.js 20+ dan Yarn/Corepack:

```powershell
corepack yarn install --frozen-lockfile
corepack yarn test
```

Pemeriksaan sintaks JavaScript:

```powershell
Get-ChildItem backend/src -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
Get-ChildItem frontend/public/js -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
```

Sebelum dipakai nyata, lakukan UAT enam role, PPDB hingga aktivasi, pembuatan guru/master, roster draf hingga terbit, antrean approval absensi, nilai hingga rapor terbit, akses silang siswa, dokumen privat, backup dan restore. Jangan uji migrasi awal langsung pada database produksi.

## 8. Status dan batas verifikasi

Source telah diperiksa secara statis dan konfigurasi Compose dapat divalidasi, tetapi lingkungan pembentukan ZIP tidak menjalankan Docker Engine dan database MySQL nyata. Maka belum ada klaim bahwa `docker compose up`, seluruh migrasi, login browser, kamera/GPS, atau semua workflow end-to-end sudah lulus. Lihat `docs/KNOWN_LIMITATIONS.md` dan `docs/ROLE_AND_WORKFLOW_MODEL.md`.
