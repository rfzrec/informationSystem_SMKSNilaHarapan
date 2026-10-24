export const state = { user: null, csrf: null, unread: 0, branding: null, systemConfig: null };

export class ApiError extends Error {
  constructor(status, body) {
    const e = (body && body.error) || {};
    super(e.message || 'Terjadi kesalahan. Silakan coba lagi.');
    this.status = status;
    this.code = e.code;
    this.details = e.details;
  }
}

async function csrfToken(force) {
  if (!state.csrf || force) {
    const r = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
    state.csrf = (await r.json()).csrfToken;
  }
  return state.csrf;
}

export async function api(path, { method = 'GET', body, form, retry = true } = {}) {
  const headers = { Accept: 'application/json' };
  const opts = { method, headers, credentials: 'same-origin' };
  if (method !== 'GET') headers['X-CSRF-Token'] = await csrfToken();
  if (form) opts.body = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(`/api${path}`, opts); } catch { throw new ApiError(0, { error: { message: 'Tidak dapat terhubung ke server. Periksa koneksi Anda.' } }); }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 403 && data?.error?.code === 'CSRF_INVALID' && retry) {
      await csrfToken(true);
      return api(path, { method, body, form, retry: false });
    }
    throw new ApiError(res.status, data);
  }
  if (data && data.csrfToken) state.csrf = data.csrfToken;
  return data;
}

export async function loadMe() {
  try {
    state.user = (await api('/auth/me')).user;
  } catch {
    state.user = null;
  }
  return state.user;
}
