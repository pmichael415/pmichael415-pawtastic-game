// A stand-in for the public site's server, for testing the game's real-purchase flow on this
// computer: the /api/public/game/* endpoints (same contract as the Lovable server), a fake email-code
// sign-in (the code is always 123456), and fake Stripe Checkout and customer-portal pages.
//
//   node tools/mock-pay-server.mjs <folder with the built page> [port]
//   Serves the folder at /play/. Env: MOCK_PAYMENTS=0 turns payments off; MOCK_LOSE_PAYMENTS=1
//   makes "Pay" succeed without recording the purchase (to test "Purchase not delivered").
//   MOCK_HUB_ORIGINS=http://127.0.0.1:5173 acts like the server with docs/graduation-hub/ applied: that address
//   (the PAWtastic Games hub) may call the game API from the browser, and its buyers return to its /graduation.
//   Test helpers: GET /mock/state, POST /mock/refund { email, product }.

import { weekKey, weekEndsAt, replayChallenge } from '../src/engine/challenge.js';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { randomUUID } from 'node:crypto';

const [dir = 'dist', port = '8790'] = process.argv.slice(2);
const PAYMENTS = process.env.MOCK_PAYMENTS !== '0';
const LOSE = process.env.MOCK_LOSE_PAYMENTS === '1';
const CODE = '123456';
const HUB_ORIGINS = (process.env.MOCK_HUB_ORIGINS || '').split(',').filter(Boolean);
const PUBLISHABLE = 'sb_publishable_mock_key';
const CATALOG = {
  pack55: { cents: 299, name: '55 Treats' }, pack100: { cents: 499, name: '100 Treats' },
  pack220: { cents: 999, name: '220 Treats' }, pack480: { cents: 1999, name: '480 Treats' },
  starter: { cents: 199, name: 'Starter Pack' }, pass: { cents: 499, name: 'Pup Pass', monthly: true },
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

const db = { users: new Map(), tokens: new Map(), refresh: new Map(), saves: new Map(), purchases: [], subs: new Map(), sessions: new Map(), reports: [], codesSent: [], codes: new Map(), referrals: [] };
// Invite a friend, as the real server does it (src/lib/game/referrals.server.ts in the Lovable project).
const STAFF = new Set(['info@pawtasticacademy.com']);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codeOf = user => {
  if (!db.codes.has(user.id)) db.codes.set(user.id, { code: Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * 32)]).join(''), email: user.email, since: new Date().toISOString() });
  return db.codes.get(user.id).code;
};
// Competing (src/lib/game/compete.server.ts in the Lovable project): profiles, weekly scores, prizes.
const players = new Map(); // userId → { dogName, location, stars, levels, bestTotal, hidden }
const weekly = []; // { week, userId, location, score, moves, at }
const prizes = []; // { id, week, location, rank, userId, dogName, email, score, reward, code, status, expiresAt }
const rankWeek = week => weekly.filter(w => w.week === week && !players.get(w.userId)?.hidden).sort((a, b) => b.score - a.score || a.at - b.at);
// Weekly prize lineups, as game_week_prizes: used only once approved; otherwise the standard prizes.
const STANDARD_PRIZES = [{ rank: 1, reward: 'daycare-day', label: 'A free day of daycare' }, { rank: 2, reward: 'bath', label: 'A free bath' }, { rank: 3, reward: 'bath', label: 'A free bath' }];
const weekLineups = new Map(); // week → { labels: [3], approved }
const approvedLineup = week => { const l = weekLineups.get(week); return l?.approved ? l.labels.map((label, i) => ({ rank: i + 1, reward: 'custom', label })) : null; };
const prizesFor = week => approvedLineup(week) ?? STANDARD_PRIZES;
const shown = list => list.map(p => ({ rank: p.rank, label: p.label }));
function awardWeek(week) {
  const lineup = prizesFor(week);
  for (const location of ['hawthorne', 'hillsdale']) {
    rankWeek(week).filter(w => w.location === location).slice(0, 3).forEach((w, i) => {
      if (prizes.some(p => p.week === week && p.location === location && p.rank === i + 1)) return;
      const user = [...db.users.values()].find(u => u.id === w.userId);
      prizes.push({ id: randomUUID(), week, location, rank: i + 1, userId: w.userId, dogName: players.get(w.userId)?.dogName ?? 'PAWtastic Pup', email: user?.email ?? '',
        score: w.score, reward: lineup[i].reward, label: lineup[i].reward === 'custom' ? lineup[i].label : null, code: Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * 32)]).join(''), status: 'won', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
    });
  }
}
const prizeOut = p => ({ id: p.id, week: p.week, location: p.location, rank: p.rank, reward: p.reward, label: p.label ?? null, code: p.code, status: p.status, expiresAt: p.expiresAt, score: p.score });

// Home Screen app sign-in codes (src/lib/game/signin.server.ts in the Lovable project).
const appCodes = [];
const ownerOf = code => [...db.codes.entries()].find(([, v]) => v.code === code);
const summary = rows => { const live = rows.filter(r => r.status !== 'void'); const waiting = live.filter(r => r.status === 'earned').length; return { friends: live.length, bathsWaiting: waiting, bathsGiven: live.length - waiting }; };
const lookupCode = code => { const o = ownerOf(code); if (!o) return null; const referrals = db.referrals.filter(r => r.code === code).reverse(); return { code, email: o[1].email, since: o[1].since, referrals, ...summary(referrals) }; };
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
const devices = []; // player counter hellos
const portalBack = new Map(); // user id → where the portal's "Return" goes

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const origin = `http://${req.headers.host}`;
    const path = url.pathname;
    // The hub (docs/graduation-hub/hub.ts): CORS for the game API, never for staff. Real Lovable Cloud auth
    // answers any address, so /auth/v1/ does too.
    const from = req.headers.origin;
    const hub = from && from !== origin && HUB_ORIGINS.includes(from) ? from : null;
    const gameApi = path.startsWith('/api/public/game/') && !/^\/api\/public\/game\/staff(\/|$)/.test(path);
    const corsFor = hub && gameApi ? hub : from && path.startsWith('/auth/v1/') ? from : null;
    if (corsFor) {
      res.setHeader('access-control-allow-origin', corsFor);
      res.setHeader('vary', 'Origin');
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS', 'access-control-allow-headers': 'accept, authorization, content-type, apikey, x-client-info', 'access-control-max-age': '600' });
        return res.end();
      }
    }
    const back = hub ? `${hub}/graduation` : `${origin}/play/index.html`;

    if (path === '/api/public/game/config') {
      // MOCK_CONFIG_DELAY_MS: a slow server (the real one checks Stripe first), for tools/e2e-slow-config.cjs.
      const delay = Number(process.env.MOCK_CONFIG_DELAY_MS || 0);
      if (delay) await new Promise(r => setTimeout(r, delay));
      return send(res, 200, { payments: PAYMENTS, mode: 'test', authUrl: origin, authKey: PUBLISHABLE });
    }

    // Fake GoTrue (Lovable Cloud auth). Like the real one, it needs the publishable key as `apikey` and
    // refuses a publishable (non-JWT) key in the Authorization header.
    if (path.startsWith('/auth/v1/')) {
      if (req.headers.apikey !== PUBLISHABLE) return send(res, 401, { message: 'Invalid API key' });
      if (/^Bearer sb_/i.test(req.headers.authorization || '')) return send(res, 401, { message: 'Invalid JWT' });
    }
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

    // Player counter: one row per device per day. MOCK_HELLO_FAIL=1 makes it fail, to show the game doesn't care.
    if (path === '/api/public/game/hello' && req.method === 'POST') {
      if (process.env.MOCK_HELLO_FAIL === '1') return send(res, 500, { error: 'server-error' });
      const b = await bodyOf(req);
      if (!b || Object.keys(b).join() !== 'device' || !/^[A-Za-z0-9_-]{16,64}$/.test(b.device ?? '')) return send(res, 400, { error: 'invalid-request' });
      const day = new Date().toISOString().slice(0, 10);
      if (!devices.some(d => d.day === day && d.device === b.device)) devices.push({ day, device: b.device, auth: req.headers.authorization ?? null, cookie: req.headers.cookie ?? null });
      return send(res, 200, { ok: true });
    }
    if (path === '/api/public/game/report' && req.method === 'POST') {
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

    if (path === '/api/public/game/referral/check') {
      const code = String(url.searchParams.get('code') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const owner = ownerOf(code);
      const user = authed(req);
      return send(res, 200, owner ? { valid: true, code, own: !!user && owner[0] === user.id } : { valid: false });
    }

    if (path === '/api/public/game/challenge' && req.method === 'GET') {
      const week = weekKey(Date.now());
      const next = weekKey(weekEndsAt(week) + 3600000);
      const upcoming = approvedLineup(next);
      return send(res, 200, { week, endsAt: new Date(weekEndsAt(week)).toISOString(), moves: 25, prizes: shown(prizesFor(week)), next: upcoming ? { week: next, prizes: shown(upcoming) } : null });
    }
    if (path === '/api/public/game/leaderboard') {
      const user = authed(req);
      const board = url.searchParams.get('board') === 'alltime' ? 'alltime' : 'weekly';
      const loc = url.searchParams.get('location');
      const location = ['hawthorne', 'hillsdale'].includes(loc) ? loc : 'all';
      if (board === 'weekly') {
        const rows = rankWeek(weekKey(Date.now()));
        const shown = location === 'all' ? rows : rows.filter(r => r.location === location);
        const entries = shown.map((r, i) => ({ rank: i + 1, dogName: players.get(r.userId)?.dogName ?? 'PAWtastic Pup', location: r.location, score: r.score, me: !!user && r.userId === user.id }));
        const me = entries.find(e => e.me);
        const teams = Object.fromEntries(['hawthorne', 'hillsdale'].map(l => [l, { total: rows.filter(r => r.location === l).reduce((t, r) => t + r.score, 0), players: rows.filter(r => r.location === l).length }]));
        return send(res, 200, { board, location, entries: entries.slice(0, 50), me: me ? { rank: me.rank, score: me.score } : null, teams });
      }
      const all = [...players.entries()].filter(([, p]) => !p.hidden).sort((a, b) => b[1].stars - a[1].stars || b[1].bestTotal - a[1].bestTotal);
      const shown = location === 'all' ? all : all.filter(([, p]) => p.location === location);
      const entries = shown.map(([id, p], i) => ({ rank: i + 1, dogName: p.dogName, location: p.location, stars: p.stars, levels: p.levels, bestTotal: p.bestTotal, me: !!user && id === user.id }));
      const me = entries.find(e => e.me);
      const teams = Object.fromEntries(['hawthorne', 'hillsdale'].map(l => [l, { total: all.filter(([, p]) => p.location === l).reduce((t, [, p]) => t + p.stars, 0), players: all.filter(([, p]) => p.location === l).length }]));
      return send(res, 200, { board, location, entries: entries.slice(0, 50), me: me ? { rank: me.rank, stars: me.stars } : null, teams });
    }

    if (path === '/api/public/game/signin-code/claim' && req.method === 'POST') {
      const b = await bodyOf(req);
      const email = String(b.email ?? '').trim().toLowerCase();
      const active = appCodes.filter(c => c.email === email && !c.used && c.expires > Date.now());
      if (!active.length || !/^\d{6}$/.test(String(b.code ?? ''))) return send(res, 400, { error: 'wrong-code' });
      if (active.some(c => c.failed >= 5)) return send(res, 429, { error: 'rate-limited' });
      const hit = active.find(c => c.code === b.code);
      if (!hit) { active.forEach(c => { c.failed += 1; }); return send(res, 400, { error: 'wrong-code' }); }
      hit.used = true;
      const t = issue(userFor(email));
      return send(res, 200, { ...t, user: { id: userFor(email).id, email } });
    }

    if (path.startsWith('/api/public/game/') && path !== '/api/public/game/config') {
      const user = authed(req);
      if (!user) return send(res, 401, { error: 'signed-out' });
      if (path === '/api/public/game/profile' && req.method === 'POST') {
        const b = await bodyOf(req);
        if (!['hawthorne', 'hillsdale'].includes(b.location) || typeof b.dogName !== 'string') return send(res, 400, { error: 'invalid-request' });
        players.set(user.id, { ...(players.get(user.id) ?? {}), dogName: b.dogName.trim().slice(0, 20), location: b.location, stars: Math.min(b.stars, b.levels * 3), levels: b.levels, bestTotal: b.bestTotal, hidden: players.get(user.id)?.hidden ?? false });
        return send(res, 200, { ok: true });
      }
      if (path === '/api/public/game/challenge' && req.method === 'POST') {
        const b = await bodyOf(req);
        if (b.week !== weekKey(Date.now())) return send(res, 400, { error: 'week-over' });
        const replay = replayChallenge(b.week, b.moves);
        if (!replay.ok) return send(res, 400, { error: 'bad-run' });
        const p = players.get(user.id);
        if (!p?.location) return send(res, 400, { error: 'no-home' });
        let row = weekly.find(w => w.week === b.week && w.userId === user.id);
        if (!row) { row = { week: b.week, userId: user.id, location: p.location, score: replay.score, moves: b.moves, at: Date.now() }; weekly.push(row); }
        else if (replay.score > row.score) Object.assign(row, { score: replay.score, moves: b.moves, at: Date.now() });
        const team = rankWeek(b.week).filter(w => w.location === row.location);
        return send(res, 200, { score: replay.score, best: row.score, rank: team.findIndex(w => w.userId === user.id) + 1, players: team.length, location: row.location, week: b.week });
      }
      if (path === '/api/public/game/prizes' && req.method === 'GET') {
        return send(res, 200, { prizes: prizes.filter(p => p.userId === user.id).reverse().map(prizeOut) });
      }
      if (path === '/api/public/game/staff/prizes') {
        if (!STAFF.has(user.email)) return send(res, 403, { error: 'not-staff' });
        const staffOut = p => ({ ...prizeOut(p), dogName: p.dogName, email: p.email, redeemedAt: p.redeemedAt ?? null, redeemedBy: p.redeemedBy ?? null });
        if (req.method === 'GET') {
          const rows = weekly.filter(w => w.week === weekKey(Date.now())).sort((a, b) => b.score - a.score);
          return send(res, 200, { prizes: [...prizes].reverse().map(staffOut), board: rows.map(r => ({ userId: r.userId, dogName: players.get(r.userId)?.dogName ?? '', location: r.location, score: r.score, hidden: !!players.get(r.userId)?.hidden })) });
        }
        const b = await bodyOf(req);
        if (b.action === 'lookup') {
          const p = prizes.find(x => x.code === String(b.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
          return p ? send(res, 200, { prize: staffOut(p) }) : send(res, 404, { error: 'unknown-code' });
        }
        if (b.action === 'hide') { const p = players.get(b.userId); if (!p) return send(res, 404, { error: 'unknown-player' }); p.hidden = !!b.hidden; return send(res, 200, { ok: true }); }
        const p = prizes.find(x => x.id === b.id);
        if (b.action === 'redeem') { if (!p || p.status !== 'won') return send(res, 409, { error: 'not-redeemable' }); Object.assign(p, { status: 'redeemed', redeemedAt: new Date().toISOString(), redeemedBy: user.email }); return send(res, 200, { prize: staffOut(p) }); }
        if (b.action === 'void') { if (!p || p.status === 'void') return send(res, 409, { error: 'already-void' }); p.status = 'void'; return send(res, 200, { prize: staffOut(p) }); }
        return send(res, 400, { error: 'invalid-request' });
      }
      if (path === '/api/public/game/signin-code' && req.method === 'POST') {
        const code = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
        appCodes.push({ code, email: user.email, expires: Date.now() + 600000, used: false, failed: 0 });
        return send(res, 200, { code, minutes: 10 });
      }
      if (path === '/api/public/game/referral' && req.method === 'GET') {
        const code = codeOf(user);
        return send(res, 200, { code, ...summary(db.referrals.filter(r => r.code === code)) });
      }
      if (path === '/api/public/game/staff') {
        const staff = STAFF.has(user.email);
        if (req.method === 'GET') {
          if (!staff) return send(res, 200, { staff: false, email: user.email });
          return send(res, 200, { staff: true, email: user.email, recent: [...db.referrals].reverse().slice(0, 50).map(r => ({ ...r, referrer: ownerOf(r.code)?.[1].email ?? '' })) });
        }
        if (!staff) return send(res, 403, { error: 'not-staff' });
        const b = await bodyOf(req);
        if (b.action === 'lookup' || b.action === 'record') {
          const code = String(b.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          const found = lookupCode(code);
          if (!found) return send(res, 404, { error: 'unknown-code' });
          if (b.action === 'lookup') return send(res, 200, found);
          if (typeof b.friendName !== 'string' || !b.friendName.trim()) return send(res, 400, { error: 'invalid-request' });
          const key = (n, d) => `${n.trim().toLowerCase()}|${(d ?? '').trim().toLowerCase()}`;
          if (!b.allowDuplicate && found.referrals.some(r => r.status !== 'void' && key(r.friend_name, r.friend_dog) === key(b.friendName, b.friendDog))) return send(res, 409, { error: 'duplicate' });
          db.referrals.push({ id: randomUUID(), code, friend_name: b.friendName.trim(), friend_dog: b.friendDog ?? null, location: b.location ?? null, note: b.note ?? null, status: 'earned', recorded_by: user.email, created_at: new Date().toISOString(), bath_given_at: null });
          return send(res, 200, lookupCode(code));
        }
        const r = db.referrals.find(x => x.id === b.id);
        if (b.action === 'bath') { if (!r || r.status !== 'earned') return send(res, 409, { error: 'no-bath-waiting' }); r.status = 'bath-given'; r.bath_given_at = new Date().toISOString(); return send(res, 200, lookupCode(r.code)); }
        if (b.action === 'void') { if (!r || r.status === 'void') return send(res, 409, { error: 'already-undone' }); r.status = 'void'; return send(res, 200, lookupCode(r.code)); }
        return send(res, 400, { error: 'invalid-request' });
      }
      if (path === '/api/public/game/save' && req.method === 'GET') {
        const s = db.saves.get(user.id);
        return send(res, 200, { exists: !!s, data: s ?? null });
      }
      if (path === '/api/public/game/save' && req.method === 'PUT') { db.saves.set(user.id, (await bodyOf(req)).data); return send(res, 200, { ok: true }); }
      if (!PAYMENTS) return send(res, 503, { error: 'payments-off' });
      if (path === '/api/public/game/checkout' && req.method === 'POST') {
        const { product } = await bodyOf(req);
        if (!CATALOG[product]) return send(res, 400, { error: 'unknown-product' });
        const mine = db.purchases.filter(p => p.userId === user.id);
        if (product === 'starter' && mine.some(p => p.product === 'starter' && p.status === 'paid')) return send(res, 400, { error: 'starter-owned' });
        if (product === 'pass' && passOf(user).active) return send(res, 400, { error: 'pass-active' });
        const month = new Date().toISOString().slice(0, 7);
        const spent = mine.filter(p => new Date(p.at).toISOString().slice(0, 7) === month).reduce((n, p) => n + p.cents, 0);
        if (spent + CATALOG[product].cents > 10000) return send(res, 400, { error: 'monthly-cap' });
        const id = `cs_test_${randomUUID().slice(0, 8)}`;
        db.sessions.set(id, { id, userId: user.id, product, success: `${back}?checkout=success&session_id=${id}`, cancel: `${back}?checkout=cancel` });
        return send(res, 200, { url: `${origin}/mock-stripe/checkout/${id}` });
      }
      if (path === '/api/public/game/account' && req.method === 'GET') {
        const purchases = db.purchases.filter(p => p.userId === user.id && ((p.status === 'paid' && !p.claimed) || (p.status === 'refunded' && !p.refundAcked)))
          .map(p => ({ id: p.id, product: p.product, status: p.status }));
        const owned = db.purchases.filter(p => p.userId === user.id && (p.status === 'paid' || p.status === 'refunded')).map(p => ({ id: p.id, product: p.product, status: p.status }));
        return send(res, 200, { email: user.email, purchases, owned, pass: passOf(user) });
      }
      if (path === '/api/public/game/account/ack' && req.method === 'POST') {
        const { claimed = [], refunds = [] } = await bodyOf(req);
        for (const p of db.purchases) if (p.userId === user.id) { if (claimed.includes(p.id)) p.claimed = true; if (refunds.includes(p.id)) p.refundAcked = true; }
        return send(res, 200, { ok: true });
      }
      if (path === '/api/public/game/portal' && req.method === 'POST') { portalBack.set(user.id, back); return send(res, 200, { url: `${origin}/mock-stripe/portal/${encodeURIComponent(user.id)}` }); }
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
        return redirect(res, portalBack.get(userId) || `${origin}/play/index.html`);
      }
      return html(res, `<h1>Stripe (mock) customer portal</h1><form method="post"><button id="cancel-sub">Cancel subscription</button></form><a id="return" href="${portalBack.get(userId) || '/play/index.html'}">Return</a>`);
    }

    // Test helpers.
    // What the sign-in link in a real email does: land on the game with the session in the URL fragment.
    if (path === '/mock/magic-link') {
      const t = issue(userFor(url.searchParams.get('email') || 'buyer@example.com'));
      return send(res, 200, { url: `${origin}/play/index.html#access_token=${t.access_token}&expires_at=${t.expires_at}&expires_in=3600&refresh_token=${t.refresh_token}&token_type=bearer&type=magiclink` });
    }
    // Ends the week early for tests: this week's top 3 at each location win their prizes.
    // Sets a week's prize lineup (this week unless { next: true }), approved or still a draft.
    if (path === '/mock/week-prizes' && req.method === 'POST') {
      const b = await bodyOf(req);
      const week = b.next ? weekKey(weekEndsAt(weekKey(Date.now())) + 3600000) : weekKey(Date.now());
      weekLineups.set(week, { labels: b.labels, approved: !!b.approved });
      return send(res, 200, { week });
    }
    if (path === '/mock/award-week' && req.method === 'POST') { awardWeek(weekKey(Date.now())); return send(res, 200, { prizes }); }
    if (path === '/mock/state') return send(res, 200, { devices, players: Object.fromEntries(players), weekly, prizes, purchases: db.purchases, reports: db.reports, saves: Object.fromEntries(db.saves), subs: Object.fromEntries(db.subs), codesSent: db.codesSent, codes: Object.fromEntries(db.codes), referrals: db.referrals, appCodes });
    if (path === '/mock/refund' && req.method === 'POST') {
      const { email, product } = await bodyOf(req);
      const user = userFor(email);
      const p = [...db.purchases].reverse().find(x => x.userId === user.id && x.product === product && x.status === 'paid');
      if (!p) return send(res, 404, { error: 'none' });
      p.status = 'refunded';
      return send(res, 200, { ok: true, id: p.id });
    }

    // Site files that live at the root of the Lovable project (icons, the web app manifest).
    if (/^\/(manifest\.webmanifest|icon-[\w-]+\.png|apple-touch-icon[\w-]*\.png|favicon\.ico|og-image\.png)$/.test(path)) {
      try {
        const data = await readFile(join('lovable/public', path.slice(1)));
        res.writeHead(200, { 'content-type': path.endsWith('.webmanifest') ? 'application/manifest+json' : TYPES[extname(path)] ?? 'application/octet-stream' });
        return res.end(data);
      } catch { return send(res, 404, { error: 'not-found' }); }
    }

    // The front desk's referral page.
    if (path === '/staff/index.html' || path === '/staff/') {
      let page;
      try { page = await readFile(join(dir, 'staff.html')); } catch { return send(res, 404, { error: 'not-found' }); }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(page);
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
