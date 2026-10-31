// Real purchases on the public PAWtastic site. The site's own server (/api/public/game/*) sells Treat
// packs, the Starter Pack and the Pup Pass through Stripe, keeps buyers' saved games and emails
// PAWtastic about problems. Buyers sign in with a one-time code sent by email (Lovable Cloud).
//
// All of it is optional: when the server can't be reached (claude.ai, a file on disk) the game
// stays free-play; when payments are off on the server, sign-in (cloud saves) and reports still work.
//
// Results are { ok: true, ... } or { ok: false, error } with error one of
// 'offline' | 'signed-out' | 'rate-limited' | 'server' | a server error code (e.g. 'monthly-cap').

import { createLocalStorage } from '../economy/storage-local.js';

export const SESSION_KEY = 'pawtastic-gd-session-v1';
export const PENDING_KEY = 'pawtastic-gd-pending-checkout-v1';
const CONFIG_PATH = '/api/public/game/config';
const REFRESH_EARLY_S = 60;

function decodeJwt(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '='));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
  } catch {
    return null;
  }
}

// A session from GoTrue's token response (or a magic-link URL fragment).
function toSession(t, nowS) {
  if (!t?.access_token || !t?.refresh_token) return null;
  const claims = decodeJwt(t.access_token) ?? {};
  const expiresAt = Number(t.expires_at) || (Number(t.expires_in) ? nowS + Number(t.expires_in) : Number(claims.exp) || nowS + 3600);
  return {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: expiresAt,
    user_id: t.user?.id ?? claims.sub ?? null,
    email: t.user?.email ?? claims.email ?? null,
  };
}

export const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s ?? '').trim());

/**
 * Resolves the payments client, or null when the site's server can't be reached.
 * loc/hist: for reading and cleaning a magic-link sign-in (#access_token=...).
 */
export async function openPayments({
  fetchImpl = globalThis.fetch?.bind(globalThis), base = '', loc = globalThis.location, hist = globalThis.history,
  store = createLocalStorage(SESSION_KEY), now = () => Date.now(), timeoutMs = 3500,
} = {}) {
  if (typeof fetchImpl !== 'function') return null;
  const nowS = () => Math.floor(now() / 1000);

  async function request(method, url, { body, token, apikey } = {}) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs * 3) : null;
    try {
      const headers = { accept: 'application/json' };
      if (body !== undefined) headers['content-type'] = 'application/json';
      if (apikey) headers.apikey = apikey;
      if (token) headers.authorization = `Bearer ${token}`;
      const res = await fetchImpl(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl?.signal, credentials: 'same-origin' });
      let data = null;
      try { data = await res.json(); } catch { data = null; }
      return { status: res.status, data };
    } catch {
      return { status: 0, data: null };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // The site's settings. Anything but a well-formed answer means "no server here".
  let config = null;
  {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      const res = await fetchImpl(base + CONFIG_PATH, { headers: { accept: 'application/json' }, signal: ctrl?.signal, credentials: 'same-origin' });
      const data = res.ok ? await res.json() : null;
      if (data && typeof data.payments === 'boolean') config = data;
    } catch { config = null; } finally { if (timer) clearTimeout(timer); }
  }
  if (!config) return null;
  // Accounts (sign-in and cloud saves) work whenever the server offers sign-in; payments only add buying.
  const accounts = typeof config.authUrl === 'string' && !!config.authUrl && typeof config.authKey === 'string' && !!config.authKey;
  const payments = config.payments === true && accounts;
  const authUrl = accounts ? config.authUrl.replace(/\/+$/, '') : '';

  let session = (() => { try { return store.load(); } catch { return null; } })();
  if (!session?.access_token) session = null;
  const keep = s => { session = s; try { store.save(s); } catch { /* memory only */ } };
  const forget = () => { session = null; try { store.save(null); } catch { /* ignore */ } };

  // A sign-in link from the email lands here with the session in the URL fragment.
  if (accounts && loc?.hash && /access_token=/.test(loc.hash)) {
    const params = new URLSearchParams(loc.hash.slice(1));
    const landed = toSession(Object.fromEntries(params), nowS());
    if (landed) keep(landed);
    try { hist?.replaceState(null, '', loc.pathname + loc.search); } catch { /* ignore */ }
  }

  // Sign-in calls carry the publishable key as `apikey`. Only an old-style key (a JWT) may also go in the
  // Authorization header; the newer sb_publishable_ keys are refused there.
  const keyIsJwt = accounts && config.authKey.split('.').length === 3;
  const auth = (path, body, token) => request('POST', `${authUrl}/auth/v1/${path}`, { body, apikey: config.authKey, token: token ?? (keyIsJwt ? config.authKey : undefined) });

  let refreshing = null;
  async function refresh() {
    if (!session?.refresh_token) return null;
    refreshing ??= (async () => {
      const res = await auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
      if (res.status === 200) { const s = toSession(res.data, nowS()); if (s) { keep({ ...s, email: s.email ?? session?.email }); return session; } }
      if (res.status >= 400 && res.status < 500) forget(); // refresh token revoked or used up
      return null;
    })().finally(() => { refreshing = null; });
    return refreshing;
  }

  async function freshToken() {
    if (!session) return null;
    if (session.expires_at - REFRESH_EARLY_S > nowS()) return session.access_token;
    const s = await refresh();
    return s?.access_token ?? null;
  }

  function errorOf(res) {
    if (res.status === 0) return 'offline';
    if (res.status === 401) return 'signed-out';
    if (res.status === 429) return 'rate-limited';
    if (res.status >= 500) return 'server';
    return typeof res.data?.error === 'string' ? res.data.error : 'server';
  }

  async function call(method, path, body, { signedIn = true } = {}) {
    let token = await freshToken();
    if (signedIn && !token) return { ok: false, error: 'signed-out' };
    let res = await request(method, base + path, { body, token });
    if (res.status === 401 && token) {
      const s = await refresh();
      if (s) res = await request(method, base + path, { body, token: s.access_token });
      if (res.status === 401) { forget(); if (signedIn) return { ok: false, error: 'signed-out' }; res = await request(method, base + path, { body }); }
    }
    if (res.status >= 200 && res.status < 300) return { ok: true, ...(res.data && typeof res.data === 'object' ? res.data : {}) };
    return { ok: false, error: errorOf(res) };
  }

  const redirectTo = () => { try { return `${loc.origin}/play/index.html`; } catch { return undefined; } };

  return {
    accounts,
    payments,
    mode: config.mode === 'live' ? 'live' : 'test',
    get signedIn() { return !!session; },
    get email() { return session?.email ?? null; },

    async sendCode(email) {
      if (!accounts) return { ok: false, error: 'server' };
      if (!isEmail(email)) return { ok: false, error: 'invalid-email' };
      const to = redirectTo();
      const res = await auth(`otp${to ? `?redirect_to=${encodeURIComponent(to)}` : ''}`, { email: email.trim(), create_user: true, data: {}, gotrue_meta_security: {} });
      if (res.status >= 200 && res.status < 300) return { ok: true };
      return { ok: false, error: res.status === 400 || res.status === 422 ? 'invalid-email' : errorOf(res) };
    },

    async verifyCode(email, code) {
      if (!accounts) return { ok: false, error: 'server' };
      const token = String(code ?? '').replace(/\s+/g, '');
      if (!/^\d{6,10}$/.test(token)) return { ok: false, error: 'wrong-code' };
      const res = await auth('verify', { type: 'email', email: email.trim(), token });
      if (res.status === 200) {
        const s = toSession(res.data, nowS());
        if (s) { keep({ ...s, email: s.email ?? email.trim() }); return { ok: true }; }
      }
      if (res.status === 0 || res.status === 429 || res.status >= 500) return { ok: false, error: errorOf(res) };
      return { ok: false, error: 'wrong-code' };
    },

    async signOut() {
      const token = session?.access_token;
      forget();
      if (token && accounts) await auth('logout', {}, token).catch(() => {});
      return { ok: true };
    },

    checkout: product => call('POST', '/api/public/game/checkout', { product }),
    account: () => call('GET', '/api/public/game/account'),
    ack: ({ claimed = [], refunds = [] }) => call('POST', '/api/public/game/account/ack', { claimed, refunds }),
    portal: () => call('POST', '/api/public/game/portal', {}),
    report: ({ kind, message, email, details }) => call('POST', '/api/public/game/report', {
      kind, message: String(message ?? '').slice(0, 2000), ...(email ? { email } : {}), ...(details ? { details } : {}),
    }, { signedIn: false }),

    // The saved game on the buyer's account, in the shape src/backend/saved-game.js reads
    // (the same one claude.ai provides), so it syncs exactly like the claude.ai demo does.
    accountStore() {
      const doc = {
        async get() {
          const r = await call('GET', '/api/public/game/save');
          if (!r.ok) throw new Error(r.error);
          return { exists: !!r.exists && r.data != null, data: () => r.data };
        },
        async set(value) {
          const r = await call('PUT', '/api/public/game/save', { data: value });
          if (!r.ok) throw new Error(r.error);
        },
      };
      return {
        async use(name) {
          if (name === 'db') return { doc: () => doc };
          if (name === 'user') return { id: async () => session?.user_id ?? session?.email ?? null };
          return null;
        },
      };
    },
  };
}

// A checkout to resume after the page reloads to link the account (kept for this tab only).
export function pendingCheckout(store = globalThis.sessionStorage, now = Date.now()) {
  const api = {
    set(product) { try { store?.setItem(PENDING_KEY, JSON.stringify({ product, at: now })); } catch { /* ignore */ } },
    take() {
      try {
        const raw = store?.getItem(PENDING_KEY);
        store?.removeItem(PENDING_KEY);
        const v = raw ? JSON.parse(raw) : null;
        return v && typeof v.product === 'string' && now - v.at < 10 * 60 * 1000 ? v.product : null;
      } catch { return null; }
    },
  };
  return api;
}
