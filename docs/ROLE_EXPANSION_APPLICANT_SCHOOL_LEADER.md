# Perluasan Role: Calon Murid dan Pimpinan Sekolah

## Keputusan desain

- `applicant` adalah role database tersendiri dan identitas role dipertahankan ketika `account_stage` berubah dari `applicant` menjadi `student` setelah integrasi PPDB berhasil.
- `school_leader` adalah satu role bersama untuk Kepala Sekolah dan Kepala Yayasan. Perbedaan jabatan/cakupan laporan harus ditentukan melalui atribut atau kebijakan akses terpisah jika memang diperlukan; jangan membuat dua role baru tanpa kebutuhan.
- Role yang ada (`superadmin`, `admin`, `guru`, `siswa`) tetap tersedia. Akun siswa lama yang telah aktif tidak diubah otomatis oleh migrasi ini.
- `school_leader` tidak diberikan kepada akun mana pun secara otomatis. Migrasi 019 telah menggabungkan role legacy `principal` dan `foundation_head` ke `admin`, sehingga penetapan pimpinan harus dilakukan manual berdasarkan akun yang diverifikasi sekolah.

## Perubahan

1. `database/migrations/021_applicant_and_school_leader_roles.sql` menambahkan role dan permission secara idempotent, memulihkan role `applicant` untuk akun yang masih berada pada tahap PPDB, dan memberikan permission ringkasan PPDB agregat baca-saja kepada `school_leader`.
2. Registrasi baru membuat role `applicant`.
3. Middleware menambahkan permission self-service akademik milik role `siswa` untuk akun `applicant` hanya ketika `account_stage='student'`. Role akun tidak berubah.
4. Integrasi PPDB mengubah `account_stage` menjadi `student` tetapi tidak mengubah role akun.
5. Dashboard pimpinan hanya menampilkan angka agregat; tidak ada izin mengubah data operasional yang diberikan secara default.

## Penerapan aman

1. Buat backup database dan uji pada salinan database terlebih dahulu.
2. Jalankan migrasi dengan mekanisme migrator proyek (`npm run migrate`) setelah memeriksa bahwa migrasi 020 telah tercatat sebagai selesai.
3. Jalankan `npm run seed` untuk menyelaraskan definisi role dan permission. Seed tidak akan menetapkan akun pimpinan.
4. Tetapkan akun pimpinan secara manual setelah identitasnya diverifikasi. Contoh SQL berikut menggunakan email placeholder dan harus dijalankan hanya setelah menggantinya dengan email akun yang benar:

```sql
-- Verifikasi akun sebelum melakukan perubahan:
SELECT id, email, full_name, is_active, account_stage
FROM users WHERE email IN ('kepala.sekolah@example.sch.id', 'kepala.yayasan@example.sch.id');

-- Setelah hasil verifikasi benar, tetapkan akun yang dipilih sebagai school_leader.
UPDATE user_roles ur
JOIN users u ON u.id = ur.user_id
JOIN roles r ON r.code = 'school_leader'
SET ur.role_id = r.id
WHERE u.email = 'kepala.sekolah@example.sch.id';
```

Ulangi perintah penetapan untuk akun Kepala Yayasan yang sudah diverifikasi. Jangan mengubah akun admin secara massal.

## Uji regresi wajib

- Registrasi baru menghasilkan `role=applicant`, `account_stage=applicant`, dan permission `applicant.self`.
- Calon Murid hanya dapat membaca/mengubah pengajuannya sendiri; endpoint PPDB ditolak setelah tahap akun berubah menjadi `student`.
- Integrasi pendaftar diterima dan daftar ulang selesai mengubah `account_stage` menjadi `student`, tetapi mempertahankan `role=applicant`.
- Akun `applicant` pada tahap `student` memperoleh permission self-service akademik yang sama dengan role `siswa`, tanpa mendapatkan permission operasional Admin.
- Akun siswa lama, guru, admin, dan superadmin tetap dapat login dan menggunakan dashboard sesuai izin sebelumnya.
- `school_leader` dapat membuka dashboard ringkasan agregat, tetapi tidak memiliki permission perubahan data PPDB, nilai, absensi, pengguna, atau konfigurasi.
- Migrasi dan seed dapat dijalankan ulang tanpa menggandakan role/permission atau mengubah akun pimpinan menjadi admin.
