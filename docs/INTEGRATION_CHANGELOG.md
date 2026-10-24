# Catatan Integrasi — PRD Aligned v3

Ini merupakan iterasi perombakan dari kode lama. Dokumen ini mencatat arah dan perubahan pada source; bukan sertifikat production-ready.

## Perubahan utama

- Menyatukan role internal ke `superadmin`, `admin`, `guru`, dan `siswa`. Calon siswa ditentukan oleh `users.account_stage='applicant'`; siswa aktif ditentukan oleh stage `student`. Public visitor bukan role.
- Menghapus alur login orang tua/wali dari model target. Informasi orang tua/wali tetap tersimpan sebagai bagian formulir pemohon.
- Memusatkan operasional PPDB serta CMS pada Admin. Role Admin PPDB tidak lagi digunakan.
- Menambahkan master jurusan yang dipelihara Superadmin dan dipakai bersama sebagai pilihan PPDB, program siswa, kelas, mapel, dan konten publik.
- Menambahkan workflow master guru yang membuat data guru, kode `GURU-xxxxxx`, akun login role `guru`, dan sandi sementara secara transaksional. Admin menggunakan daftar guru yang sama untuk penugasan.
- Menegaskan wali kelas sebagai penugasan guru per kelas/tanggal, bukan role baru. Hak review rapor diperiksa pada backend untuk kelas/periode yang diampu.
- Menambahkan antrean review Admin untuk absensi siswa, sesi pengajaran, dan presensi kedatangan QR guru.
- Menambahkan versioning roster mingguan: draf, validasi konflik, publikasi, dan histori roster sebelumnya.
- Menyatukan persetujuan honor pada Admin; approval kepala yayasan terpisah tidak lagi menjadi alur aktif. Kolom lama dipertahankan sebagai histori/kompatibilitas.
- Menegakkan wajib-ganti-sandi untuk akun yang diberikan kredensial sementara; API bisnis dibatasi sampai sandi diperbarui.
- Memperbarui CMS branding, navigasi, ringkasan Admin, pembatasan tahap pemohon, dokumentasi role/data ownership, dan petunjuk menjalankan proyek tanpa membagikan `.env` nyata.
- Memperjelas microservice deployment lewat container/domain terpisah; database-per-service belum dilakukan dan didokumentasikan sebagai pekerjaan lanjutan.

## Pemeriksaan yang dilakukan

- Pemeriksaan sintaks JavaScript backend/frontend, setelah final patch.
- Pemeriksaan syntax/compile untuk QR renderer Python.
- Parsing Docker Compose YAML dan pemeriksaan konfigurasi routing service.
- Pemeriksaan pola migrasi SQL untuk syntax yang tidak didukung seperti `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- Pemeriksaan paket ZIP untuk memastikan `.env` dan file rahasia lokal tidak ikut dibagikan.

## Batas verifikasi

Docker Engine/Compose dan MySQL runtime tidak tersedia pada lingkungan pembentukan arsip ini. Oleh sebab itu seluruh migrasi, startup container, UI browser, dan workflow lintas-role perlu diuji di workstation. Service saat ini masih mengakses satu skema MySQL bersama; database-per-service belum selesai.

- Perluasan migrasi 021: role `applicant` dipisahkan dan dipertahankan sepanjang lifecycle akun; role `school_leader` ditambahkan dengan akses ringkasan agregat baca-saja untuk Kepala Sekolah/Kepala Yayasan.
