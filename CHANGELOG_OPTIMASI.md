# Riwayat Perubahan Proyek — PRD Aligned v3

Dokumen ini menggantikan ringkasan optimasi dari versi proyek sebelumnya. Untuk status arsitektur dan perubahan terbaru, rujuk:

- `docs/INTEGRATION_CHANGELOG.md` — perubahan integrasi versi ini.
- `docs/ROLE_AND_WORKFLOW_MODEL.md` — aturan role dan alur kerja utama.
- `docs/ARCHITECTURE.md` — pembagian domain/service dan batas microservice.
- `docs/SECURITY_MODEL.md` — keputusan keamanan.
- `docs/KNOWN_LIMITATIONS.md` — bagian yang belum dapat diverifikasi runtime.
- `docs/PRD_Sistem_Terintegrasi_SMK_Nila_Harapan_v1.0.md` — PRD induk, termasuk addendum keputusan produk terbaru.

## Prinsip versi ini

Proyek lama dipakai sebagai basis teknis, bukan sebagai spesifikasi produk. Aturan implementasi setelah migrasi 021 menetapkan enam role internal: `superadmin`, `admin`, `guru`, `siswa`, `applicant`, dan `school_leader`. Calon Murid menggunakan role `applicant` tersendiri; wali kelas merupakan penugasan guru, bukan role; pengunjung publik tidak perlu login; orang tua/wali hanya menjadi data pada formulir PPDB.

ZIP distribusi menyertakan `.env.example` dan tidak menyertakan `.env` yang berisi rahasia lingkungan kerja.


## Optimalisasi Super Admin (2026-10-21)
- Menambahkan monitoring role berbasis data database dengan filter pencarian/status.
- Menambahkan monitoring temuan bug dan status pengujian terpisah melalui migrasi aditif 020.
- Memperluas Pengaturan Sistem dengan deskripsi, validasi, batal, reset aman, dan dokumentasi batasan konfigurasi.
- Menghubungkan ringkasan sistem ke jumlah temuan bug.
- Pemeriksaan sintaks JavaScript lulus; tes otomatis memerlukan dependensi yang belum tersedia di lingkungan pemeriksaan.

## Perluasan Role (2026-10-22)
- Migrasi 021 menambahkan role `applicant` dan `school_leader`.
- Role Calon Murid dipertahankan setelah tahap akun menjadi `student`; permission akademik pribadi dipilih berdasarkan tahap akun.
- Superadmin dapat membuat/mengelola akun `school_leader` dari UI Akun Pengguna. Hak default hanya ringkasan PPDB agregat.
- Syntax check file JavaScript yang berubah lulus. Tes end-to-end belum dapat dijalankan karena dependensi `supertest` dan `resend` tidak tersedia di lingkungan pemeriksaan.
