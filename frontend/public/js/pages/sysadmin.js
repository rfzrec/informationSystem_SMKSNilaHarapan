import { api, state } from "../api.js";
import {
  esc,
  icon,
  icons,
  $,
  $$,
  badge,
  fmtDateTime,
  empty,
  stat,
  dataTable,
  formDialog,
  confirmDialog,
  withLoading,
  toast,
  openModal,
} from "../ui.js";
import { dashHead, rerender } from "./dashboard.js";

const ROLE_OPTS = [
  ["superadmin", "Superadmin"],
  ["admin", "Admin Sekolah"],
].map(([value, label]) => ({ value, label }));
const okBadge = (s) =>
  s === "ok" || s === "configured"
    ? `<span class="badge b-ok">${icon("check-circle")} ${s === "ok" ? "Normal" : "Terkonfigurasi"}</span>`
    : s === "not_configured"
      ? `<span class="badge b-neutral">${icon("circle-dashed")} Belum dikonfigurasi</span>`
      : `<span class="badge b-bad">${icon("x-circle")} Gangguan</span>`;
const EMAIL_LABEL = {
  queued: "Dalam antrean",
  sent: "Terkirim",
  failed: "Gagal",
  not_configured: "Belum dikonfigurasi",
};
const kv = (rows) =>
  rows.length
    ? `<table class="data"><tbody>${rows.map((r) => `<tr><td>${esc(r.k)}</td><td class="mono" style="text-align:right">${esc(r.n)}</td></tr>`).join("")}</tbody></table>`
    : empty("Tidak ada data.");

export async function overview(el) {
  const d = (await api("/system/overview")).data;
  el.innerHTML = `${dashHead("Ringkasan Sistem", "Status layanan, keamanan, dan operasional teknis. Hak teknis tidak mencakup keputusan seleksi.")}
    <div class="grid g-4 mb"><div class="stat" data-testid="sys-app-status"><div class="k">${icon("server")} Aplikasi</div><div class="mt">${okBadge(d.app.status)}</div><div class="subtle mt">Node ${esc(d.app.node)} · uptime ${Math.round(d.app.uptime_seconds / 60)} mnt</div></div>
      <div class="stat" data-testid="sys-db-status"><div class="k">${icon("database")} Database</div><div class="mt">${okBadge(d.database.status)}</div><div class="subtle mt">Latensi ${d.database.latency_ms} ms</div></div>
      <div class="stat" data-testid="sys-email-status"><div class="k">${icon("mail")} Email</div><div class="mt">${okBadge(d.email.status)}</div><div class="subtle mt" data-testid="sys-email-sender">${d.email.provider ? `Resend · ${esc(d.email.from)}${d.email.test_sender ? " (pengirim uji)" : ""}` : "Notifikasi in-app aktif"}</div></div>
      <div class="stat" data-testid="sys-siakad-status"><div class="k">${icon("plug")} SIAKAD eksternal</div><div class="mt">${okBadge(d.external_siakad.status)}</div><div class="subtle mt">Integrasi ke data induk lokal</div></div></div>
    <div class="grid g-3 mb">${stat("users", "Sesi aktif", d.active_sessions, "sys-sessions")}${stat("archive", "Backup terakhir", d.backup ? fmtDateTime(d.backup.created_at) : "Belum tercatat", "sys-backup")}${stat("bug", "Error teknis (10 terakhir)", d.errors.length, "sys-errors")}${stat("bug", "Status temuan bug", (d.bugSummary || []).reduce((n, x) => n + Number(x.n), 0), "sys-bug-summary")}</div>
    <div class="card mb"><h3>Monitoring bug</h3><p class="subtle">Jumlah temuan tercatat berdasarkan status penanganan. Hasil tes dibedakan pada halaman monitoring.</p>${kv((d.bugSummary || []).map(x => ({k:x.k,n:x.n})))}<a class="btn btn-outline btn-sm mt" href="/dashboard/monitor-bug">Buka monitoring bug & pengujian</a></div>
    <div class="grid g-3"><div class="card"><h3>Akun per role</h3>${kv(d.byRole)}</div><div class="card"><h3>Aktivitas autentikasi (7 hari)</h3>${kv(d.authActivity)}</div><div class="card"><h3>Ringkasan audit keamanan (30 hari)</h3>${kv(d.auditSummary)}</div>
    <div class="card" data-testid="sys-email-queue"><h3>Email notifikasi</h3><p class="subtle">Dikirim otomatis saat dokumen/pengajuan perlu diperbaiki dan saat hasil seleksi diumumkan.</p>${kv(d.email.counts.map((c) => ({ k: EMAIL_LABEL[c.k] || c.k, n: c.n })))}
      ${d.email.recent.length ? `<div class="mt">${d.email.recent.map((e) => `<div class="subtle mb" data-testid="sys-email-row-${e.id}"><span class="mono">${esc(e.email)}</span> · ${esc(e.type)} · <strong>${esc(EMAIL_LABEL[e.email_status] || e.email_status)}</strong>${e.email_error ? `<br>${esc(e.email_error)}` : ""}</div>`).join("")}</div>` : ""}</div>
    <div class="card"><h3>Status integrasi antarmodul</h3>${kv(d.integration)}<p class="subtle mt">${esc(d.external_siakad.note)}</p></div>
    <div class="card"><h3>Health check container</h3><p class="muted">Endpoint <span class="mono">/api/health</span> dipakai oleh Docker healthcheck. Status saat ini: ${okBadge(d.database.status)}</p><p class="subtle">Backup dicatat oleh skrip <span class="mono">scripts/backup.sh</span>.</p></div>
    <div class="card"><h3>Log kesalahan terbaru</h3>${d.errors.length ? d.errors.map((e) => `<div class="subtle mb"><span class="mono">${esc(e.method)} ${esc(e.path)}</span><br>${esc(e.message)} · ${fmtDateTime(e.created_at)}</div>`).join("") : empty("Tidak ada error tercatat.")}</div></div>`;
}

export async function programs(el) {
  const reload = async () => {
    const rows = (await api("/masters/programs")).data;
    el.innerHTML = `${dashHead("Master Jurusan", "Superadmin mengatur daftar jurusan yang menjadi sumber data PPDB, kesiswaan, kelas, dan roster. Deskripsi publik dikelola Admin melalui CMS.", `<button class="btn btn-primary" id="new-program">${icon("plus")} Tambah Jurusan</button>`)}
      <div class="table-wrap"><table class="data program-table"><colgroup><col class="col-program-code"><col class="col-program-name"><col class="col-program-count"><col class="col-program-count"><col class="col-program-count"><col class="col-program-status"><col class="col-program-actions"></colgroup><thead><tr><th>Kode</th><th>Jurusan</th><th>Pendaftar</th><th>Siswa Aktif</th><th>Kelas Aktif</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${rows.length ? rows.map((r) => `<tr><td class="mono program-code-cell"><strong>${esc(r.code)}</strong></td><td class="program-name-cell"><strong>${esc(r.title)}</strong><div class="subtle">${esc(r.slug)}</div>${r.summary ? `<div class="program-summary">${esc(r.summary)}</div>` : ""}</td><td class="program-count-cell"><span class="metric-chip">${icon("users")} ${r.applicant_count}</span></td><td class="program-count-cell"><span class="metric-chip">${icon("graduation-cap")} ${r.student_count}</span></td><td class="program-count-cell"><span class="metric-chip">${icon("school")} ${r.class_count}</span></td><td class="program-status-cell">${badge("active", Number(r.is_active))}</td><td><div class="program-actions"><button class="btn btn-outline btn-sm program-edit-btn" data-edit-program="${Number(r.id)}" aria-label="Ubah jurusan" title="Ubah jurusan">${icon("pencil")}</button><button class="btn btn-outline btn-sm ${Number(r.is_active) ? "program-deactivate-btn" : ""}" data-program-active="${Number(r.id)}" data-active="${Number(r.is_active)}" ${Number(r.student_count) || Number(r.class_count) ? "disabled" : ""}>${Number(r.is_active) ? "Nonaktifkan" : "Aktifkan"}</button></div></td></tr>`).join("") : `<tr><td colspan="7">${empty("Belum ada jurusan.")}</td></tr>`}</tbody></table></div>
      <p class="subtle mt">Menonaktifkan jurusan tidak menghapus histori. Jurusan yang masih dipakai siswa atau kelas aktif tidak dapat dinonaktifkan.</p>`;
    icons();
    $("#new-program", el).onclick = () =>
      formDialog({
        title: "Tambah jurusan",
        fields: [
          {
            name: "code",
            label: "Kode unik",
            required: true,
            help: "Contoh: TKJ, TSM, TB.",
          },
          { name: "title", label: "Nama resmi jurusan", required: true },
          { name: "summary", label: "Ringkasan", type: "textarea" },
        ],
        onSubmit: async (v) => {
          const r = await api("/masters/programs", { method: "POST", body: v });
          toast(r.message);
          await reload();
        },
      });
    el.querySelectorAll("[data-edit-program]").forEach(
      (b) =>
        (b.onclick = () => {
          const row = rows.find(
            (x) => Number(x.id) === Number(b.dataset.editProgram),
          );
          formDialog({
            title: "Ubah master jurusan",
            values: row,
            fields: [
              { name: "code", label: "Kode unik", required: true },
              { name: "title", label: "Nama resmi jurusan", required: true },
              { name: "summary", label: "Ringkasan", type: "textarea" },
              {
                name: "is_active",
                label: "Jurusan aktif untuk PPDB/akademik",
                type: "checkbox",
              },
            ],
            onSubmit: async (v) => {
              v.is_active = !!v.is_active;
              const r = await api(`/masters/programs/${row.id}`, {
                method: "PUT",
                body: v,
              });
              toast(r.message);
              await reload();
            },
          });
        }),
    );
    el.querySelectorAll("[data-program-active]").forEach(
      (b) =>
        (b.onclick = async () => {
          const row = rows.find(
            (x) => Number(x.id) === Number(b.dataset.programActive),
          );
          const active = !Number(b.dataset.active);
          if (
            !(await confirmDialog({
              title: active ? "Aktifkan jurusan?" : "Nonaktifkan jurusan?",
              message: active
                ? "Jurusan tersedia untuk konfigurasi PPDB dan kelas."
                : "Jurusan hanya dapat dinonaktifkan jika belum dipakai siswa/kelas aktif.",
              danger: !active,
            }))
          )
            return;
          try {
            const r = await api(`/masters/programs/${row.id}`, {
              method: "PUT",
              body: {
                code: row.code,
                title: row.title,
                summary: row.summary || "",
                is_active: active,
              },
            });
            toast(r.message);
            await reload();
          } catch (e) {
            toast(e.message, "error");
          }
        }),
    );
  };
  await reload();
}

const POSITION_OPTS = [
  { value: "guru", label: "Guru" },
  { value: "kepala_sekolah", label: "Kepala Sekolah" },
  { value: "kepala_yayasan", label: "Kepala Yayasan" },
  { value: "staf", label: "Staf" },
];
const POSITION_LABELS = Object.fromEntries(POSITION_OPTS.map((x) => [x.value, x.label]));

const teacherFields = [
  { name: "full_name", label: "Nama lengkap", required: true },
  { name: "email", label: "Email login", type: "email", required: true },
  { name: "phone", label: "Nomor telepon" },
  { name: "position_code", label: "Jabatan", type: "select", required: true, options: POSITION_OPTS, help: "Kepala Sekolah dan Kepala Yayasan memakai role Pimpinan Sekolah dengan akses ringkasan baca-saja." },
  { name: "position_name", label: "Nama jabatan tambahan" },
  { name: "employee_number", label: "Nomor pegawai" },
  { name: "nip", label: "NIP" },
  { name: "nuptk", label: "NUPTK" },
  {
    name: "gender",
    label: "Jenis kelamin",
    type: "select",
    required: true,
    options: [
      { value: "unspecified", label: "Belum ditentukan" },
      { value: "male", label: "Laki-laki" },
      { value: "female", label: "Perempuan" },
    ],
  },
  { name: "birth_date", label: "Tanggal lahir", type: "date" },
  { name: "address", label: "Alamat", type: "textarea" },
  { name: "education_level", label: "Pendidikan terakhir" },
  { name: "subject_specialization", label: "Bidang keahlian" },
  {
    name: "employment_type",
    label: "Status kepegawaian",
    type: "select",
    required: true,
    options: [
      { value: "permanent", label: "Tetap" },
      { value: "contract", label: "Kontrak" },
      { value: "honorary", label: "Honorer" },
      { value: "other", label: "Lainnya" },
    ],
  },
  { name: "hired_on", label: "Tanggal mulai bekerja", type: "date" },
];
export async function teachers(el) {
  const temporaryPasswords = new Map();
  const showTeacherPassword = (data, title = "Akun pegawai berhasil dibuat") =>
    openModal(
      title,
      `<p>Simpan dan sampaikan kredensial melalui kanal aman. Sandi ini hanya ditampilkan selama halaman Master Akun Pegawai terbuka.</p><dl class="kv"><dt>Kode pegawai</dt><dd class="mono">${esc(data.employeeCode || data.employee_code || data.teacherCode || data.teacher_code || '—')}</dd><dt>Nama pegawai</dt><dd>${esc(data.full_name)}</dd><dt>Email login</dt><dd>${esc(data.email)}</dd><dt>Password</dt><dd class="mono" data-testid="teacher-reset-password">${esc(data.temporary_password)}</dd></dl>`,
    );

  const reload = async () => {
    const rows = (await api("/masters/teachers")).data;
    el.innerHTML = `${dashHead("Master Akun Pegawai", "Superadmin mengelola data pegawai, akun login, jabatan, dan role. Kepala Sekolah serta Kepala Yayasan otomatis menjadi Pimpinan Sekolah dengan akses ringkasan baca-saja.", `<button class="btn btn-primary" id="new-teacher">${icon("user-plus")} Tambah Pegawai</button>`)}
      <div class="table-wrap"><table class="data teacher-table"><colgroup><col class="col-code"><col class="col-teacher"><col class="col-identity"><col class="col-login"><col class="col-assignment"><col class="col-status"><col class="col-actions"></colgroup><thead><tr><th>Kode Pegawai</th><th>Nama Pegawai</th><th>Jabatan</th><th>Login</th><th>Penugasan</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${rows.length ? rows.map((r) => `<tr><td class="mono"><strong>${esc(r.employee_code || r.teacher_code || "—")}</strong></td><td><strong>${esc(r.full_name)}</strong><div class="subtle">${esc(r.role_name || "Pegawai")}</div></td><td>${esc(r.position_name || POSITION_LABELS[r.position_code] || "—")}</td><td>${esc(r.email)}${temporaryPasswords.has(Number(r.id)) ? `<div class="teacher-secret"><span class="teacher-secret-label">Sandi</span><span class="mono teacher-secret-value" data-secret-hidden="true" data-secret-value="${esc(temporaryPasswords.get(Number(r.id)))}">••••••••</span><button type="button" class="icon-btn icon-btn-sm" data-toggle-secret="${Number(r.id)}" aria-label="Tampilkan sandi">${icon("eye")}</button></div>` : ""}</td><td class="assignment-cell"><div class="assignment-summary"><span class="assignment-chip">${icon("briefcase-business")} ${r.assignment_count} penugasan</span><span class="assignment-chip">${icon("school")} ${r.active_homeroom_count} wali kelas</span></div></td><td>${badge("active", Number(r.is_active))}</td><td><div class="teacher-actions"><button class="btn btn-outline btn-sm teacher-edit-btn" data-edit-teacher="${Number(r.id)}" aria-label="Ubah data pegawai" title="Ubah data pegawai">${icon("pencil")}</button><button class="btn btn-outline btn-sm" data-reset-teacher="${Number(r.id)}" ${!Number(r.is_active) ? "disabled" : ""}>Reset sandi</button><button class="btn btn-outline btn-sm ${Number(r.is_active) ? "teacher-deactivate-btn" : ""}" data-toggle-teacher="${Number(r.id)}" data-active="${Number(r.is_active)}">${Number(r.is_active) ? "Nonaktifkan" : "Aktifkan"}</button></div></td></tr>`).join("") : `<tr><td colspan="7">${empty("Data pegawai belum tersedia.")}</td></tr>`}</tbody></table></div>
      <p class="subtle mt">Kode pegawai mengidentifikasi akun secara unik: KASEK- untuk Kepala Sekolah, KAYAS- untuk Kepala Yayasan, GURU- untuk Guru, dan STAF- untuk Staf.</p>`;
    icons();
    $("#new-teacher", el).onclick = () =>
      formDialog({
        title: "Tambah pegawai dan akun",
        intro:
          "<p>Data pegawai, akun login, jabatan, dan role dibuat sesuai kewenangan Superadmin. Kepala Sekolah dan Kepala Yayasan menggunakan role <strong>Pimpinan Sekolah</strong> dengan akses ringkasan baca-saja.</p>",
        fields: teacherFields,
        onSubmit: async (v) => {
          const r = await api("/masters/teachers", { method: "POST", body: v });
            temporaryPasswords.set(
            Number(r.data.userId || r.data.teacherId || 0),
            r.data.temporary_password,
          );
          await reload();
          showTeacherPassword(r.data);
        },
      });
    el.querySelectorAll("[data-edit-teacher]").forEach(
      (b) =>
        (b.onclick = () => {
          const row = rows.find(
            (x) => Number(x.id) === Number(b.dataset.editTeacher),
          );
          const values = {
            ...row,
            birth_date: row.birth_date
              ? String(row.birth_date).slice(0, 10)
              : "",
            hired_on: row.hired_on ? String(row.hired_on).slice(0, 10) : "",
          };
          formDialog({
            title: `Ubah data pegawai · ${row.employee_code || row.teacher_code || "—"}`,
            values,
            fields: teacherFields,
            onSubmit: async (v) => {
              const r = await api(`/masters/teachers/${row.id}`, {
                method: "PUT",
                body: v,
              });
              toast(r.message);
              await reload();
            },
          });
        }),
    );
    el.querySelectorAll("[data-toggle-secret]").forEach((b) => b.onclick = () => { const row = b.closest(".teacher-secret"); const value = row?.querySelector(".teacher-secret-value"); if (!value) return; const hidden = value.dataset.secretHidden === "true"; value.dataset.secretHidden = String(!hidden); value.textContent = hidden ? value.dataset.secretValue : "••••••••"; b.innerHTML = hidden ? icon("eye-off") : icon("eye"); b.setAttribute("aria-label", hidden ? "Sembunyikan sandi" : "Tampilkan sandi"); icons(); });
    el.querySelectorAll("[data-reset-teacher]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (
            !(await confirmDialog({
              title: "Reset sandi pegawai?",
              message:
                "Sandi lama akan dihapus, sesi login pegawai diakhiri, lalu sandi sementara baru dibuat. Pegawai wajib menggantinya saat login berikutnya.",
            }))
          )
            return;
          try {
            const r = await api(
              `/masters/teachers/${b.dataset.resetTeacher}/reset-password`,
              { method: "POST", body: {} },
            );
            temporaryPasswords.set(
              Number(b.dataset.resetTeacher),
              r.data.temporary_password,
            );
            await reload();
            showTeacherPassword(r.data, "Password sementara pegawai berhasil dibuat");
          } catch (e) {
            toast(e.message, "error");
          }
        }),
    );
    el.querySelectorAll("[data-toggle-teacher]").forEach(
      (b) =>
        (b.onclick = async () => {
          const active = !Number(b.dataset.active);
          if (
            !(await confirmDialog({
              title: active ? "Aktifkan akun pegawai?" : "Nonaktifkan akun pegawai?",
              message: active
                ? "Pegawai dapat login kembali."
                : "Akses login dicabut; data dan penugasan historis tetap tersimpan.",
              danger: !active,
            }))
          )
            return;
          try {
            const r = await api(
              `/masters/teachers/${b.dataset.toggleTeacher}/status`,
              { method: "POST", body: { is_active: active } },
            );
            toast(r.message);
            await reload();
          } catch (e) {
            toast(e.message, "error");
          }
        }),
    );
  };
  await reload();
}

export async function users(el) {
  el.innerHTML = `${dashHead("Akun Admin", "Subfitur ini hanya untuk akun Superadmin dan Admin Sekolah. Akun Guru serta Pimpinan Sekolah dikelola melalui Master Akun Pegawai.", `<button class="btn btn-primary" id="new-user" data-testid="user-create-btn">${icon("user-plus")} Tambah Akun Admin</button>`)}<div id="tbl"></div>`;
  const showPwd = (title, pwd) =>
    openModal(
      title,
      `<p>Sampaikan kata sandi sementara ini secara aman. Kata sandi hanya ditampilkan sekali.</p><p class="mono" style="font-size:1.2rem" data-testid="temp-password">${esc(pwd)}</p>`,
    );
  const t = dataTable({
    el: $("#tbl", el),
    endpoint: "/users",
    testid: "users-table",
    filters: [{ name: "role", label: "Role", options: ROLE_OPTS }],
    columns: [
      {
        label: "Nama",
        render: (r) =>
          `<strong>${esc(r.full_name)}</strong><div class="subtle">${esc(r.email)}</div>`,
      },
      { label: "Jabatan", render: (r) => esc(r.position_name || POSITION_LABELS[r.position_code] || "—") },
      { label: "Role", key: "role_name" },
      { label: "Status", render: (r) => badge("active", Number(r.is_active)) },
      { label: "Login terakhir", render: (r) => fmtDateTime(r.last_login_at) },
      {
        label: "",
        render: (r) =>
          `<div class="row"><button class="btn btn-outline btn-sm" data-edit='${esc(JSON.stringify(r))}' data-testid="user-edit-${r.id}">${icon("pencil")}</button>${r.id !== state.user.id ? `<button class="btn btn-outline btn-sm" data-toggle="${r.id}" data-active="${r.is_active}" data-testid="user-toggle-${r.id}">${Number(r.is_active) ? "Nonaktifkan" : "Aktifkan"}</button>` : ""}<button class="btn btn-ghost btn-sm" data-reset="${r.id}" data-testid="user-reset-${r.id}">Reset sandi</button></div>`,
      },
    ],
  });
  $("#new-user", el).onclick = () =>
    formDialog({
      title: "Tambah akun admin",
      fields: [
        { name: "full_name", label: "Nama lengkap", required: true },
        { name: "email", label: "Email", type: "email", required: true },
        { name: "phone", label: "Telepon" },
        { name: "position_code", label: "Jabatan", type: "select", required: true, options: [{ value: "superadmin", label: "Superadmin" }, { value: "admin_sekolah", label: "Admin Sekolah" }] },
        { name: "position_name", label: "Nama jabatan tambahan" },
        { name: "role", label: "Role", type: "select", required: true, options: ROLE_OPTS },
      ],
      onSubmit: async (v) => {
        const r = await api("/users", { method: "POST", body: v });
        toast(r.message);
        t.reload();
        setTimeout(() => showPwd("Akun dibuat", r.data.temporary_password), 50);
      },
    });
  el.addEventListener("click", async (e) => {
    const b = e.target.closest(
      "[data-edit],[data-toggle],[data-reset],[data-delete]",
    );
    if (!b) return;
    if (b.dataset.edit) {
      const r = JSON.parse(b.dataset.edit);
      formDialog({
        title: "Ubah akun",
        values: r,
        fields: [
          { name: "full_name", label: "Nama lengkap", required: true },
          { name: "phone", label: "Telepon" },
        { name: "position_code", label: "Jabatan", type: "select", required: true, options: [{ value: "superadmin", label: "Superadmin" }, { value: "admin_sekolah", label: "Admin Sekolah" }, ...POSITION_OPTS] },
        { name: "position_name", label: "Nama jabatan tambahan" },
        { name: "role", label: "Role", type: "select", required: true, options: ROLE_OPTS },
        ],
        onSubmit: async (v) => {
          toast(
            (await api(`/users/${r.id}`, { method: "PUT", body: v })).message,
          );
          t.reload();
        },
      });
      return;
    }
    if (b.dataset.toggle) {
      const act = !Number(b.dataset.active);
      if (
        await confirmDialog({
          title: act ? "Aktifkan akun?" : "Nonaktifkan akun?",
          message: act
            ? "Pengguna dapat login kembali."
            : "Seluruh sesi aktif pengguna akan diakhiri.",
          danger: !act,
        })
      )
        withLoading(b, async () => {
          try {
            toast(
              (
                await api(`/users/${b.dataset.toggle}/status`, {
                  method: "POST",
                  body: { is_active: act },
                })
              ).message,
            );
            t.reload();
          } catch (er) {
            toast(er.message, "error");
          }
        });
      return;
    }
    if (b.dataset.delete) {
      if (
        await confirmDialog({
          title: "Hapus paksa akses akun?",
          message:
            "Akun tidak bisa login lagi dan disembunyikan dari daftar. Data/riwayat PPDB dan akademik tetap disimpan agar relasi sekolah tidak rusak. Tindakan ini tidak dapat dibatalkan.",
          danger: true,
        })
      ) {
        withLoading(b, async () => {
          try {
            toast(
              (await api(`/users/${b.dataset.delete}`, { method: "DELETE" }))
                .message,
            );
            t.reload();
          } catch (er) {
            toast(er.message, "error");
          }
        });
      }
      return;
    }
    if (
      await confirmDialog({
        title: "Reset kata sandi?",
        message: "Kata sandi sementara baru akan dibuat.",
      })
    )
      withLoading(b, async () => {
        try {
          const r = await api(`/users/${b.dataset.reset}/reset-password`, {
            method: "POST",
          });
          showPwd("Kata sandi sementara", r.data.temporary_password);
        } catch (er) {
          toast(er.message, "error");
        }
      });
  });
}

const SETTING_LABEL = {
  maintenance_notice: "Pemberitahuan pemeliharaan",
  external_siakad_endpoint: "Endpoint SIAKAD eksternal",
  support_contact_note: "Catatan kontak bantuan teknis",
};
const SETTING_HELP = {
  maintenance_notice: "Teks pemberitahuan yang tampil pada area publik. Ini bukan maintenance mode yang memblokir akses.",
  external_siakad_endpoint: "URL endpoint pemeriksaan integrasi eksternal. Kosongkan jika tidak digunakan. URL ini akan dipanggil saat monitoring sistem.",
  support_contact_note: "Informasi bantuan yang ditampilkan pada bagian antarmuka yang mendukungnya.",
};
const SETTING_DEFAULTS = { maintenance_notice: "", external_siakad_endpoint: "", support_contact_note: "" };

export async function settings(el) {
  const rows = (await api("/system/settings")).data;
  const values = Object.fromEntries(rows.map(r => [r.setting_key, r.setting_value || ""]));
  const fields = rows.map(r => ({ name: r.setting_key, label: SETTING_LABEL[r.setting_key] || r.setting_key, value: values[r.setting_key] }));
  el.innerHTML = `${dashHead("Pengaturan Sistem", "Konfigurasi yang tersedia di bawah ini benar-benar didukung aplikasi. Rahasia deployment dan kredensial tetap dikelola di environment, bukan melalui halaman ini.")}
    <div class="grid g-2 mb"><section class="card"><h3>Informasi & operasional</h3><p class="subtle">Atur pemberitahuan publik dan informasi bantuan. Perubahan disimpan ke database dan digunakan oleh komponen yang terintegrasi.</p></section><section class="card"><h3>Integrasi eksternal</h3><p class="subtle">Endpoint hanya diperiksa dari monitoring teknis. Jangan memasukkan URL yang memuat token atau kredensial.</p></section></div>
    <form class="card" id="st" novalidate data-testid="settings-form">
    ${fields.map(f => `<div class="field mb"><label for="s-${f.name}">${esc(f.label)}</label><input class="input" id="s-${f.name}" name="${f.name}" type="${f.name === 'external_siakad_endpoint' ? 'url' : 'text'}" maxlength="${f.name === 'maintenance_notice' || f.name === 'support_contact_note' ? 500 : 500}" value="${esc(f.value)}" aria-describedby="help-${f.name}" data-testid="setting-${f.name.replace(/_/g, "-")}"><small id="help-${f.name}" class="subtle">${esc(SETTING_HELP[f.name] || "Pengaturan aplikasi.")}</small></div>`).join("")}
    <details class="mt mb"><summary>Pengaturan lanjutan dan batasan</summary><p class="subtle mt">Koneksi database, session secret, kredensial email, port, dan konfigurasi deployment tidak dapat diubah di sini. Tahun ajaran/semester aktif belum ditambahkan sebagai pengaturan global karena modul akademik harus lebih dahulu memiliki satu sumber kebenaran yang konsisten.</p><p class="subtle">Nilai default untuk pengaturan yang tersedia adalah kosong. Reset hanya mengembalikan ketiga nilai ini ke default; tidak mengubah data akademik.</p></details>
    <div class="form-actions"><button class="btn btn-primary" type="submit" data-testid="settings-save-btn">Simpan perubahan</button><button class="btn btn-outline" type="button" id="settings-cancel">Batal</button><button class="btn btn-ghost" type="button" id="settings-reset">Reset ke default</button></div></form>`;
  const f = $("#st", el);
  const setValues = v => fields.forEach(x => { const input=f.querySelector(`[name="${x.name}"]`); if(input) input.value=v[x.name] || ""; });
  $("#settings-cancel",el).onclick=()=>setValues(values);
  $("#settings-reset",el).onclick=async()=>{
    if(!(await confirmDialog({title:"Reset pengaturan ke default?",message:"Hanya tiga pengaturan yang ditampilkan akan dikosongkan. Perubahan belum tersimpan sampai tombol Simpan ditekan."}))) return;
    setValues(SETTING_DEFAULTS);
  };
  f.onsubmit = async e => {
    e.preventDefault();
    const payload = Object.fromEntries(fields.map(x => [x.name, f.querySelector(`[name="${x.name}"]`).value.trim()]));
    if(payload.external_siakad_endpoint && !/^https?:\/\/.+/i.test(payload.external_siakad_endpoint)) { toast("Endpoint harus menggunakan URL HTTP atau HTTPS yang valid.","error"); return; }
    await withLoading(f.querySelector('[type="submit"]'), async () => {
      try {
        toast((await api("/system/settings",{method:"PUT",body:{settings:payload}})).message);
        Object.assign(values,payload);
      } catch(er) { toast(er.message,"error"); }
    });
  };
}

export async function roleMonitoring(el) {
  el.innerHTML = `${dashHead("Monitoring Pengguna & Role", "Daftar role dan statistik akun diambil langsung dari database. Monitoring tidak memberikan kewenangan operasional tambahan.")}<div id="role-summary" class="grid g-3 mb"></div>
    <div class="card mb"><div class="grid g-3"><div class="field"><label for="role-q">Cari pengguna</label><input class="input" id="role-q" placeholder="Nama atau email"></div><div class="field"><label for="role-filter">Role</label><select class="input" id="role-filter"><option value="">Semua role</option></select></div><div class="field"><label for="role-status">Status akun</label><select class="input" id="role-status"><option value="">Semua status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></div></div><button class="btn btn-outline mt" id="role-refresh">Perbarui data</button></div><div id="role-users" class="card"></div>`;
  const load = async () => {
    try {
      const qs=new URLSearchParams({q:$("#role-q",el).value,role:$("#role-filter",el).value,status:$("#role-status",el).value});
      const d=(await api(`/system/role-monitoring?${qs}`)).data;
      $("#role-summary",el).innerHTML=d.roles.map(r=>`<div class="stat"><div class="k">${icon("users")} ${esc(r.name)}</div><h2>${r.total_accounts}</h2><div class="subtle">${r.active_accounts} aktif · ${r.inactive_accounts} nonaktif</div></div>`).join("");
      const sel=$("#role-filter",el), chosen=sel.value;
      sel.innerHTML='<option value="">Semua role</option>'+d.roles.map(r=>`<option value="${esc(r.code)}">${esc(r.name)}</option>`).join("");
      sel.value=chosen;
      $("#role-users",el).innerHTML=d.users.length?`<div class="table-wrap"><table class="data"><thead><tr><th>Pengguna</th><th>Role</th><th>Status</th><th>Login terakhir</th><th>Dibuat</th></tr></thead><tbody>${d.users.map(u=>`<tr><td><strong>${esc(u.full_name)}</strong><div class="subtle">${esc(u.email)}</div></td><td>${esc(u.role_name)}</td><td>${badge("active",Number(u.is_active))}</td><td>${fmtDateTime(u.last_login_at)}</td><td>${fmtDateTime(u.created_at)}</td></tr>`).join("")}</tbody></table></div>`:empty("Tidak ada pengguna yang cocok dengan filter.");
      icons();
    } catch(e) { $("#role-summary",el).innerHTML=empty("Data role gagal diambil. Periksa izin dan koneksi backend."); $("#role-users",el).innerHTML=`<p class="subtle">${esc(e.message)}</p>`; }
  };
  ["role-q","role-filter","role-status"].forEach(id=>$("#"+id,el).addEventListener(id==="role-q"?"change":"change",load));
  $("#role-refresh",el).onclick=load;
  await load();
}

export async function bugMonitoring(el) {
  const statusLabels={new:"Baru ditemukan",analyzing:"Sedang dianalisis",fixing:"Sedang diperbaiki",ready_for_test:"Menunggu pengujian",closed:"Selesai",reopened:"Dibuka kembali"};
  const testLabels={not_tested:"BELUM DIUJI",passed:"LULUS",failed:"GAGAL"};
  el.innerHTML=`${dashHead("Monitoring Bug & Pengujian","Catatan ini merupakan monitoring internal. Hasil tes hanya dicatat setelah benar-benar dijalankan; aplikasi tidak mengklaim mendeteksi seluruh bug otomatis.",'<button class="btn btn-primary" id="bug-new">Catat temuan</button>')}
    <div class="grid g-3 mb" id="bug-stats"></div><div class="card mb"><div class="grid g-3"><div class="field"><label>Status penanganan</label><select class="input" id="bug-status"><option value="">Semua</option>${Object.entries(statusLabels).map(([v,l])=>`<option value="${v}">${l}</option>`).join("")}</select></div><div class="field"><label>Prioritas</label><select class="input" id="bug-severity"><option value="">Semua</option>${["critical","high","medium","low"].map(v=>`<option value="${v}">${v}</option>`).join("")}</select></div><div class="field"><label>Modul</label><input class="input" id="bug-module" placeholder="Nama modul"></div></div><button class="btn btn-outline mt" id="bug-refresh">Perbarui</button></div><div id="bug-list" class="card"></div>`;
  const load=async()=>{
    try {
      const q=new URLSearchParams({status:$("#bug-status",el).value,severity:$("#bug-severity",el).value,module:$("#bug-module",el).value});
      const r=await api(`/system/bug-findings?${q}`), rows=r.data;
      const total=rows.length, open=rows.filter(x=>x.implementation_status!=="closed").length, passed=rows.filter(x=>x.test_status==="passed").length, failed=rows.filter(x=>x.test_status==="failed").length, critical=rows.filter(x=>x.severity==="critical"&&x.implementation_status!=="closed").length;
      $("#bug-stats",el).innerHTML=[["Total temuan",total],["Masih terbuka",open],["Pengujian lulus",passed],["Pengujian gagal",failed],["Kritis terbuka",critical]].map(([l,n])=>`<div class="stat"><div class="k">${esc(l)}</div><h2>${n}</h2></div>`).join("");
      $("#bug-list",el).innerHTML=rows.length?`<div class="table-wrap"><table class="data"><thead><tr><th>Temuan</th><th>Modul / role</th><th>Prioritas</th><th>Penanganan</th><th>Pengujian</th><th>Aksi</th></tr></thead><tbody>${rows.map(x=>`<tr><td><strong>${esc(x.title)}</strong><div class="subtle">${esc(x.description)}</div><small>${fmtDateTime(x.updated_at)}</small></td><td>${esc(x.module_name)}<div class="subtle">${esc(x.affected_role||"Semua/Belum ditentukan")}</div></td><td>${esc(x.severity)}</td><td>${esc(statusLabels[x.implementation_status]||x.implementation_status)}</td><td><strong>${esc(testLabels[x.test_status]||x.test_status)}</strong><div class="subtle">${esc(x.test_notes||"Belum ada catatan tes")}</div></td><td><button class="btn btn-outline btn-sm" data-edit-bug="${x.id}">Perbarui</button></td></tr>`).join("")}</tbody></table></div>`:empty("Belum ada temuan untuk filter ini.");
      el.querySelectorAll("[data-edit-bug]").forEach(b=>b.onclick=()=>edit(rows.find(x=>Number(x.id)===Number(b.dataset.editBug))));
    } catch(e) { $("#bug-list",el).innerHTML=`${empty("Data monitoring gagal diambil.")}<p class="subtle">${esc(e.message)}</p>`; }
  };
  const edit=async(row)=>{
    const fields=[{name:"title",label:"Judul",required:true},{name:"description",label:"Deskripsi",type:"textarea",required:true},{name:"module_name",label:"Modul terdampak",required:true},{name:"affected_role",label:"Role terdampak"},{name:"severity",label:"Prioritas",type:"select",required:true,options:["low","medium","high","critical"].map(v=>({value:v,label:v}))},{name:"reproduction_steps",label:"Langkah reproduksi",type:"textarea"},{name:"implementation_status",label:"Status penanganan",type:"select",required:true,options:Object.entries(statusLabels).map(([value,label])=>({value,label}))},{name:"test_status",label:"Status pengujian",type:"select",required:true,options:Object.entries(testLabels).map(([value,label])=>({value,label}))},{name:"fix_summary",label:"Ringkasan perbaikan",type:"textarea"},{name:"test_notes",label:"Bukti/catatan pengujian",type:"textarea"}];
    formDialog({title:row?"Perbarui temuan":"Catat temuan baru",values:row||{severity:"medium",implementation_status:"new",test_status:"not_tested"},fields,onSubmit:async v=>{const result=await api(row?`/system/bug-findings/${row.id}`:"/system/bug-findings",{method:row?"PUT":"POST",body:v});toast(result.message);await load();}});
  };
  $("#bug-new",el).onclick=()=>edit(null);
  $("#bug-refresh",el).onclick=load;
  ["bug-status","bug-severity","bug-module"].forEach(id=>$("#"+id,el).addEventListener("change",load));
  await load();
}

export async function audit(el) {
  el.innerHTML = `${dashHead("Log Perubahan", "Catatan hanya-baca; tidak dapat diubah atau dihapus melalui aplikasi.")}<div id="tbl"></div>`;
  dataTable({
    el: $("#tbl", el),
    endpoint: "/audit-logs",
    testid: "audit-table",
    search: false,
    pageSize: 20,
    filters: [
      {
        name: "action",
        label: "Tindakan",
        options: [
          "auth",
          "user",
          "role",
          "config",
          "application",
          "verification",
          "selection",
          "re_registration",
          "integration",
          "report",
          "cms",
          "document",
        ].map((v) => ({ value: v, label: v })),
      },
    ],
    columns: [
      { label: "Waktu", render: (r) => fmtDateTime(r.created_at) },
      { label: "Pengguna", render: (r) => esc(r.actor || "Sistem/Anonim") },
      {
        label: "Tindakan",
        render: (r) => `<span class="mono">${esc(r.action)}</span>`,
      },
      {
        label: "Entitas",
        render: (r) =>
          `${esc(r.entity_type || "—")} <span class="mono">${esc(r.entity_id || "")}</span>`,
      },
      {
        label: "Rincian",
        render: (r) =>
          `<span class="subtle mono" style="word-break:break-all">${esc((r.details_json || "").slice(0, 160))}</span>`,
      },
      {
        label: "IP",
        render: (r) =>
          `<span class="mono subtle">${esc(r.ip_address || "")}</span>`,
      },
    ],
  });
}

export async function errors(el) {
  const rows = (await api("/system/error-logs")).data;
  el.innerHTML = `${dashHead("Log Kesalahan Teknis", "Pesan kesalahan server (tanpa stack trace/data rahasia).")}<div class="table-wrap"><table class="data" data-testid="error-logs-table"><thead><tr><th>Waktu</th><th>Request</th><th>Pesan</th></tr></thead><tbody>
    ${rows.length ? rows.map((r) => `<tr><td>${fmtDateTime(r.created_at)}</td><td class="mono">${esc(r.method)} ${esc(r.path)}</td><td>${esc(r.message)}</td></tr>`).join("") : `<tr><td colspan="3">${empty("Tidak ada error tercatat.", "check-circle")}</td></tr>`}</tbody></table></div>`;
}
