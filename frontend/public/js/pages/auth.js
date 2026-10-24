import { api, state, loadMe } from '../api.js';
import { esc, icon, formFields, readForm, showErrors, withLoading, toast } from '../ui.js';
import { navigate } from '../main.js';

const side = (title, items) => `<div class="auth-side"><div class="caption" style="color:var(--mint)">Portal SIAKAD</div><h2 style="color:#fff">${esc(title)}</h2>
  <ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
  <div class="mt" id="bantuan" data-testid="portal-help"><h3 style="color:#fff">${icon('life-buoy')} Bantuan akses</h3><p style="color:#d1fae5">Akun staf dibuat oleh Superadmin. Pendaftar dapat membuat akun sendiri melalui Registrasi. Jika lupa kata sandi, gunakan Pemulihan Kata Sandi atau hubungi Admin Sekolah.</p></div></div>`;

function mountForm(main, { title, sub, fields, submit, testid, onSubmit, footer, sideTitle, sideItems }) {
  main.innerHTML = `<div class="auth-wrap">${side(sideTitle, sideItems)}<div class="auth-main"><div class="auth-card">
    <h1 style="font-size:1.9rem" data-testid="page-title">${esc(title)}</h1><p class="muted">${sub}</p>
    <form novalidate data-testid="${testid}">${formFields(fields)}<button class="btn btn-primary mt" style="width:100%" type="submit" data-testid="${testid}-submit">${esc(submit)}</button></form>
    <div class="mt subtle">${footer}</div></div></div></div>`;
  const form = main.querySelector('form');
  // Tombol mata tidak mengubah nilai input, hanya tipe tampilannya.
  form.querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.name !== 'password') return;
    const toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'btn btn-outline btn-sm mt';
    toggle.setAttribute('aria-label', 'Tampilkan kata sandi');
    toggle.setAttribute('aria-pressed', 'false'); toggle.textContent = 'Tampilkan kata sandi';
    input.insertAdjacentElement('afterend', toggle);
    toggle.onclick = () => {
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      toggle.textContent = visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi';
      toggle.setAttribute('aria-label', visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
      toggle.setAttribute('aria-pressed', String(visible));
    };
  });
  form.onsubmit = (e) => {
    e.preventDefault();
    withLoading(form.querySelector('[type=submit]'), async () => {
      try { await onSubmit(readForm(form, fields), form); } catch (err) { showErrors(form, err); }
    });
  };
}

const PORTAL_INFO = ['Satu akun untuk PPDB dan layanan internal sekolah.', 'Dashboard menyesuaikan peran yang ditetapkan sekolah.', 'Data pribadi dilindungi dan hanya dapat diakses pihak berwenang.'];

export async function login(main, params, query) {
  if (state.user) { navigate('/dashboard', true); return; }
  const captcha = await api('/auth/captcha');
  mountForm(main, {
    title: query.get('from') === 'ppdb' ? 'Login Pendaftar' : 'Masuk Portal SIAKAD', sub: 'Gunakan email dan kata sandi akun Anda.', testid: 'login-form', submit: 'Masuk',
    sideTitle: 'Layanan internal sekolah', sideItems: PORTAL_INFO,
    fields: [{ name: 'email', label: 'Email', type: 'email', required: true, full: true, autocomplete: 'username' }, { name: 'password', label: 'Kata sandi', type: 'password', required: true, full: true, autocomplete: 'current-password' }, { name: 'captcha_answer', label: `Verifikasi matematika: ${captcha.question}`, required: true, full: true, help: 'Soal berlaku 5 menit dan hanya dapat digunakan sekali.' }],
    footer: `<a href="/portal/lupa-sandi" data-testid="forgot-password-link">Lupa kata sandi?</a> · Belum punya akun pendaftar? <a href="/portal/daftar" data-testid="register-link">Registrasi</a>`,
    onSubmit: async (v, form) => {
      try {
        await api('/auth/login', { method: 'POST', body: { email: v.email, password: v.password, captcha_id: captcha.challengeId, captcha_answer: v.captcha_answer } });
        await loadMe();
        toast(`Selamat datang, ${state.user.full_name}.`);
        navigate('/dashboard');
      } catch (err) {
        showErrors(form, err);
        // Tantangan selalu dikonsumsi pada percobaan login, termasuk saat kredensial salah.
        const next = await api('/auth/captcha');
        captcha.challengeId = next.challengeId;
        const label = form.querySelector('label[for="f-captcha_answer"]');
        if (label) label.textContent = `Verifikasi matematika: ${next.question} *`;
        const answer = form.querySelector('[name="captcha_answer"]');
        if (answer) answer.value = '';
      }
    },
  });
}

export async function register(main) {
  if (state.user) { navigate('/dashboard', true); return; }
  mountForm(main, {
    title: 'Registrasi Pendaftar', sub: 'Akun ini khusus untuk calon peserta didik. Akun staf dibuat oleh sekolah.', testid: 'register-form', submit: 'Buat Akun',
    sideTitle: 'PPDB Online', sideItems: ['Simpan formulir sebagai draf dan lanjutkan kapan saja.', 'Unggah dokumen dan pantau status verifikasi.', 'Lihat hasil seleksi resmi dan lakukan daftar ulang.'],
    fields: [{ name: 'full_name', label: 'Nama lengkap calon peserta didik', required: true, full: true }, { name: 'email', label: 'Email', type: 'email', required: true, full: true, autocomplete: 'email' },
      { name: 'password', label: 'Kata sandi', type: 'password', required: true, full: true, help: 'Minimal 8 karakter, mengandung huruf dan angka.', autocomplete: 'new-password' },
      { name: 'password2', label: 'Ulangi kata sandi', type: 'password', required: true, full: true, autocomplete: 'new-password' }],
    footer: 'Sudah punya akun? <a href="/portal?from=ppdb">Login Pendaftar</a>',
    onSubmit: async (v, form) => {
      if (v.password !== v.password2) { showErrors(form, { message: 'Konfirmasi kata sandi tidak sama.', details: [{ field: 'password2', message: 'Tidak sama dengan kata sandi.' }] }); return; }
      await api('/auth/register', { method: 'POST', body: { full_name: v.full_name, email: v.email, password: v.password } });
      await loadMe();
      toast('Registrasi berhasil. Silakan lengkapi formulir pendaftaran.');
      navigate('/dashboard/formulir');
    },
  });
}

export async function forgot(main) {
  mountForm(main, {
    title: 'Pemulihan Kata Sandi', sub: 'Masukkan email akun Anda. Bila terdaftar, instruksi pemulihan akan dikirim.', testid: 'forgot-form', submit: 'Kirim Instruksi',
    sideTitle: 'Pemulihan akun', sideItems: ['Tautan pemulihan berlaku 60 menit dan hanya dapat dipakai sekali.', 'Layanan email sekolah belum dikonfigurasi; hubungi Admin Sekolah bila tidak menerima tautan.'],
    fields: [{ name: 'email', label: 'Email', type: 'email', required: true, full: true }],
    footer: '<a href="/portal">Kembali ke login</a>',
    onSubmit: async (v, form) => {
      const r = await api('/auth/forgot-password', { method: 'POST', body: v });
      form.innerHTML = `<div class="notice" data-testid="forgot-success">${icon('mail-check')}<span>${esc(r.message)}</span></div>`;
      window.lucide.createIcons();
    },
  });
}

export async function reset(main, params, query) {
  mountForm(main, {
    title: 'Atur Kata Sandi Baru', sub: 'Buat kata sandi baru untuk akun Anda.', testid: 'reset-form', submit: 'Simpan Kata Sandi',
    sideTitle: 'Pemulihan akun', sideItems: ['Seluruh sesi login lama akan diakhiri setelah kata sandi diganti.'],
    fields: [{ name: 'password', label: 'Kata sandi baru', type: 'password', required: true, full: true, help: 'Minimal 8 karakter, huruf dan angka.' }],
    footer: '<a href="/portal">Kembali ke login</a>',
    onSubmit: async (v) => {
      await api('/auth/reset-password', { method: 'POST', body: { token: query.get('token') || '', password: v.password } });
      toast('Kata sandi diperbarui. Silakan login.');
      navigate('/portal');
    },
  });
}
