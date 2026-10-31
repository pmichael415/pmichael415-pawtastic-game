// A stand-in for the public site's server, for testing the game's real-purchase flow on this
// computer: the /api/game/* endpoints (same contract as the Lovable server), a fake email-code
// sign-in (the code is always 123456), and fake Stripe Checkout and customer-portal pages.
//
//   node tools/mock-pay-server.mjs <folder with the built page> [port]
//   Serves the folder at /play/. Env: MOCK_PAYMENTS=0 turns payments off; MOCK_LOSE_PAYMENTS=1
//   makes "Pay" succeed without recording the purchase (to test "Purchase not delivered").
//   Test helpers: GET /mock/state, POST /mock/refund { email, product }.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { randomUUID } from 'node:crypto';

const [dir = 'dist', port = '8790'] = process.argv.slice(2);
const PAYMENTS = process.env.MOCK_PAYMENTS !== '0';
const LOSE = process.env.MOCK_LOSE_PAYMENTS === '1';
const CODE = '123456';
const CATALOG = {
  pack55: { cents: 299, name: '55 Treats' }, pack100: { cents: 499, name: '100 Treats' },
  pack220: { cents: 999, name: '220 Treats' }, pack480: { cents: 1999, name: '480 Treats' },
  starter: { cents: 199, name: 'Starter Pack' }, pass: { cents: 499, name: 'Pup Pass', monthly: true },
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

const db = { users: new Map(), tokens: new Map(), refresh: new Map(), saves: new Map(), purchases: [], subs: new Map(), sessions: new Map(), reports: [], codesSent: [] };
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);

function userFor(email) {
  const key = email.toLowerCase();
  if (!db.users.has(key)) db.users.set(key, { id: randomUUID(), email: key });
  return db.users.get(key);
}
function issue(user) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access = `${b64({ alg: 'none' })}.${b64({ sub: user.id, email: user.email, exp })}.mock`;
  const refresh = randomUUID();
  db.tokens.set(access, user); db.refresh.set(refresh, user);
  return { access_token: access, refresh_token: refresh, token_type: 'bearer', expires_in: 3600, expires_at: exp, user: { id: user.id, email: user.email } };
}
const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
};
const html = (res, body) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(`<!doctype html><meta name=viewport content="width=device-width"><body style="font:16px system-ui;padding:24px">${body}</body>`); };
const redirect = (res, to) => { res.writeHead(303, { location: to }); res.end(); };
async function bodyOf(req) {
  const chunks = []; for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString();
  if (!text) return {};
  if ((req.headers['content-type'] || '').includes('json')) return JSON.parse(text);
  return Object.fromEntries(new URLSearchParams(text));
}
const authed = req => db.tokens.get((req.headers.authorization || '').replace(/^Bearer /, '')) ?? null;
const passOf = user => {
  const s = db.subs.get(user.id);
  const active = !!s && s.status === 'active' && s.periodEnd >= today();
  return { active, renewsOn: s ? s.periodEnd : null, autoRenew: !!s && !s.cancelAtPeriodEnd };
};
function record(session) {
  const p = { id: randomUUID(), userId: session.userId, product: session.product, cents: CATALOG[session.product].cents, status: 'paid', claimed: false, refundAcked: false, at: Date.now() };
  db.purchases.push(p);
  if (session.product === 'pass') db.subs.set(session.userId, { status: 'active', periodEnd: addDays(today(), 30), cancelAtPeriodEnd: false });
}
const reportsBy = new Map();

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const origin = `http://${req.headers.host}`;
    const path = url.pathname;

    if (path === '/api/game/config') return send(res, 200, { payments: PAYMENTS, mode: 'test', authUrl: origin, authKey: 'mock-anon-key' });

    // Fake GoTrue (Lovable Cloud auth).
    if (path === '/auth/v1/otp' && req.method === 'POST') {
      const { email } = await bodyOf(req);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) return send(res, 400, { msg: 'invalid email' });
      db.codesSent.push({ email, redirectTo: url.searchParams.get('redirect_to') });
      return send(res, 200, {});
    }
    if (path === '/auth/v1/verify' && req.method === 'POST') {
      const { email, token, type } = await bodyOf(req);
      if (type !== 'email' || token !== CODE) return send(res, 403, { error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
      return send(res, 200, issue(userFor(email)));
    }
    if (path === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
      const { refresh_token } = await bodyOf(req);
      const user = db.refresh.get(refresh_token);
      if (!user) return send(res, 400, { error: 'invalid_grant' });
      db.refresh.delete(refresh_token);
      return send(res, 200, issue(user));
    }
    if (path === '/auth/v1/logout') { db.tokens.delete((req.headers.authorization || '').replace(/^Bearer /, '')); res.writeHead(204); return res.end(); }

    if (path === '/api/game/report' && req.method === 'POST') {
      const user = authed(req);
      const key = user?.id ?? req.socket.remoteAddress;
      const recent = (reportsBy.get(key) ?? []).filter(t => Date.now() - t < 3600000);
      if (recent.length >= 5) return send(res, 429, { error: 'rate-limited' });
      reportsBy.set(key, [...recent, Date.now()]);
      const b = await bodyOf(req);
      if (!['problem', 'refund', 'not-delivered'].includes(b.kind) || typeof b.message !== 'string' || !b.message) return send(res, 400, { error: 'invalid' });
      db.reports.push({ ...b, user: user?.email ?? null, at: Date.now() });
      return send(res, 200, { ok: true });
    }

    if (path.startsWith('/api/game/') && path !== '/api/game/config') {
      const user = authed(req);
      if (!user) return send(res, 401, { error: 'signed-out' });
      if (path === '/api/game/save' && req.method === 'GET') {
        const s = db.saves.get(user.id);
        return send(res, 200, { exists: !!s, data: s ?? null });
      }
      if (path === '/api/game/save' && req.method === 'PUT') { db.saves.set(user.id, (await bodyOf(req)).data); return send(res, 200, { ok: true }); }
      if (!PAYMENTS) return send(res, 503, { error: 'payments-off' });
      if (path === '/api/game/checkout' && req.method === 'POST') {
        const { product } = await bodyOf(req);
        if (!CATALOG[product]) return send(res, 400, { error: 'unknown-product' });
        const mine = db.purchases.filter(p => p.userId === user.id);
        if (product === 'starter' && mine.some(p => p.product === 'starter' && p.status === 'paid')) return send(res, 400, { error: 'starter-owned' });
        if (product === 'pass' && passOf(user).active) return send(res, 400, { error: 'pass-active' });
        const month = new Date().toISOString().slice(0, 7);
        const spent = mine.filter(p => new Date(p.at).toISOString().slice(0, 7) === month).reduce((n, p) => n + p.cents, 0);
        if (spent + CATALOG[product].cents > 10000) return send(res, 400, { error: 'monthly-cap' });
        const id = `cs_test_${randomUUID().slice(0, 8)}`;
        db.sessions.set(id, { id, userId: user.id, product, success: `${origin}/play/index.html?checkout=success&session_id=${id}`, cancel: `${origin}/play/index.html?checkout=cancel` });
        return send(res, 200, { url: `${origin}/mock-stripe/checkout/${id}` });
      }
      if (path === '/api/game/account' && req.method === 'GET') {
        const purchases = db.purchases.filter(p => p.userId === user.id && ((p.status === 'paid' && !p.claimed) || (p.status === 'refunded' && !p.refundAcked)))
          .map(p => ({ id: p.id, product: p.product, status: p.status }));
        return send(res, 200, { email: user.email, purchases, pass: passOf(user) });
      }
      if (path === '/api/game/account/ack' && req.method === 'POST') {
        const { claimed = [], refunds = [] } = await bodyOf(req);
        for (const p of db.purchases) if (p.userId === user.id) { if (claimed.includes(p.id)) p.claimed = true; if (refunds.includes(p.id)) p.refundAcked = true; }
        return send(res, 200, { ok: true });
      }
      if (path === '/api/game/portal' && req.method === 'POST') return send(res, 200, { url: `${origin}/mock-stripe/portal/${encodeURIComponent(user.id)}` });
      return send(res, 404, { error: 'not-found' });
    }

    // Fake Stripe pages.
    let m;
    if ((m = path.match(/^\/mock-stripe\/checkout\/([\w-]+)$/))) {
      const s = db.sessions.get(m[1]);
      if (!s) return html(res, 'Unknown session');
      return html(res, `<h1>Stripe (mock) checkout</h1><p id="item">${CATALOG[s.product].name} — $${(CATALOG[s.product].cents / 100).toFixed(2)}${CATALOG[s.product].monthly ? '/month' : ''}</p>
        <form method="post" action="/mock-stripe/pay/${s.id}"><button id="pay">Pay</button></form>
        <form method="post" action="/mock-stripe/cancel/${s.id}"><button id="back">Back</button></form>`);
    }
    if ((m = path.match(/^\/mock-stripe\/(pay|cancel)\/([\w-]+)$/)) && req.method === 'POST') {
      const s = db.sessions.get(m[2]);
      if (!s) return html(res, 'Unknown session');
      if (m[1] === 'pay') { if (!LOSE) record(s); return redirect(res, s.success); }
      return redirect(res, s.cancel);
    }
    if ((m = path.match(/^\/mock-stripe\/portal\/([\w-]+)$/))) {
      const userId = decodeURIComponent(m[1]);
      if (req.method === 'POST') {
        const s = db.subs.get(userId);
        if (s) s.cancelAtPeriodEnd = true;
        return redirect(res, `${origin}/play/index.html`);
      }
      return html(res, `<h1>Stripe (mock) customer portal</h1><form method="post"><button id="cancel-sub">Cancel subscription</button></form><a id="return" href="/play/index.html">Return</a>`);
    }

    // Test helpers.
    if (path === '/mock/state') return send(res, 200, { purchases: db.purchases, reports: db.reports, saves: Object.fromEntries(db.saves), subs: Object.fromEntries(db.subs), codesSent: db.codesSent });
    if (path === '/mock/refund' && req.method === 'POST') {
      const { email, product } = await bodyOf(req);
      const user = userFor(email);
      const p = [...db.purchases].reverse().find(x => x.userId === user.id && x.product === product && x.status === 'paid');
      if (!p) return send(res, 404, { error: 'none' });
      p.status = 'refunded';
      return send(res, 200, { ok: true, id: p.id });
    }

    // The built page at /play/.
    if (path === '/' ) return redirect(res, '/play/index.html');
    if (path.startsWith('/play/')) {
      const rel = normalize(decodeURIComponent(path.slice('/play/'.length)) || 'index.html');
      if (rel.startsWith('..')) return send(res, 403, { error: 'forbidden' });
      try {
        const data = await readFile(join(dir, rel));
        res.writeHead(200, { 'content-type': TYPES[extname(rel)] ?? 'application/octet-stream' });
        return res.end(data);
      } catch { return send(res, 404, { error: 'not-found' }); }
    }
    return send(res, 404, { error: 'not-found' });
  } catch (e) {
    send(res, 500, { error: 'server', detail: String(e) });
  }
}).listen(Number(port), '127.0.0.1', () => console.log(`mock pay server on http://127.0.0.1:${port}/play/index.html (payments ${PAYMENTS ? 'on' : 'off'})`));
