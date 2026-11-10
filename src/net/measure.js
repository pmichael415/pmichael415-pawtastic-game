// Measurement: tells the site's server what the player did (opened the game, first level, shop viewed,
// checkout started, a share…), so the owner can see real usage and purchase conversion. It sends the same
// random browser id as the player counter and the event name — no dog name, email, progress or scores.
// Everything runs in the background; a failure is dropped and never slows or interrupts the game.
// The server keeps the same list (pawtastic-graduation: src/lib/game/measure.ts).
export const MEASURE_KEY = 'pawtastic-gd-measure-v1';
export const EVENT_PATH = '/api/public/game/event';
export const EVENT_NAMES = [
  'opened', 'first_play_started', 'first_play_completed', 'replay', 'shop_viewed', 'product_previewed',
  'checkout_started', 'checkout_failed', 'purchase_arrived', 'purchase_waiting', 'share', 'challenge_link_visit', 'challenge_run',
  'booking_tap', 'board_joined', 'invite_joined', 'daily_gift',
];
// Events that carry where the device first came from (flat src_* props; the server takes flat values only).
const SRC_EVENTS = new Set(['opened', 'challenge_link_visit', 'board_joined', 'invite_joined', 'booking_tap']);

/** A browser driven by automation (test runs, bots that say so): it sends nothing, so it never counts as a player. */
export const automated = (nav = globalThis.navigator) => nav?.webdriver === true;

// The device's first source for this page (set once at startup by main.js, before the game opens).
let pageSource = null;
export function setMeasureSource(source) { pageSource = source && typeof source === 'object' ? source : null; }

/**
 * Where this device first came from, kept from the first open that says: the link tags (utm_*), the hub's forwarded
 * src=<source>.<medium>.<campaign>.<content>, an invite or challenge link, or another site (its host name only).
 * A plain visit decides nothing, so a later tagged visit can still be the first source.
 */
export const FIRST_TOUCH_KEY = 'pawtastic-gd-first-touch-v1';
const tag = v => String(v ?? '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40);
export function firstTouch({ search = '', referrer = '', origin = '', store = null } = {}) {
  try { const kept = store?.load(); if (kept && typeof kept === 'object' && Object.keys(kept).length) return kept; } catch { /* fresh */ }
  const p = new URLSearchParams(search);
  let found = {};
  const utm = { src_s: tag(p.get('utm_source')), src_m: tag(p.get('utm_medium')), src_c: tag(p.get('utm_campaign')), src_t: tag(p.get('utm_content')) };
  if (utm.src_s || utm.src_m || utm.src_c || utm.src_t) found = utm;
  else if (p.get('src')) { const [s, m, c, t] = String(p.get('src')).split('.'); found = { src_s: tag(s), src_m: tag(m), src_c: tag(c), src_t: tag(t) }; }
  else if (linkKind(search)) found = { src_ref: linkKind(search) };
  else if (referrer) {
    try { const host = new URL(referrer).host; if (host && host !== new URL(origin).host) found = { src_host: tag(host) }; } catch { /* not a URL */ }
  }
  found = Object.fromEntries(Object.entries(found).filter(([, v]) => v));
  if (Object.keys(found).length) { try { store?.save(found); } catch { /* memory only */ } }
  return found;
}
// Sent once per device, ever / once per device per New York day. The server drops repeats too.
const ONCE_EVER = new Set(['first_play_started', 'first_play_completed']);
const ONCE_A_DAY = new Set(['opened', 'shop_viewed', 'challenge_link_visit']);
const BATCH = 20;
const DELAY_MS = 800;

export const nyDay = t => {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t)); } catch { return ''; }
};

const cleanProps = props => {
  const out = {};
  for (const [k, v] of Object.entries(props ?? {})) {
    if (!/^[a-z_]{1,24}$/.test(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 120);
  }
  return out;
};

/**
 * `send(body)` posts a batch (the payments client's `event`, which carries the sign-in when there is one);
 * `beacon(body)` is the page-closing fallback (navigator.sendBeacon). `device` is the browser's random id.
 * Returns { track(name, props), flush(), stop() }.
 */
export function createMeasure({ send, beacon = null, device, store = null, now = Date.now, schedule = (fn, ms) => setTimeout(fn, ms), cancel = id => clearTimeout(id), embed = false, isAutomated = automated(), source = null } = {}) {
  const off = { track: () => false, flush: async () => false, stop() {}, pending: 0 };
  if (isAutomated || typeof send !== 'function' || !/^[A-Za-z0-9_-]{16,64}$/.test(device ?? '')) return off;
  let memo = { once: {}, daily: {} };
  try { const saved = store?.load(); if (saved && typeof saved === 'object') memo = { once: saved.once ?? {}, daily: saved.daily ?? {} }; } catch { /* fresh */ }
  const keep = () => { try { store?.save(memo); } catch { /* memory only */ } };
  let queue = [];
  let timer = null;
  let sending = null;

  async function flush() {
    if (timer) { cancel(timer); timer = null; }
    if (!queue.length) return false;
    const events = queue.splice(0, BATCH);
    sending = Promise.resolve(send({ device, events })).catch(() => ({ ok: false })).finally(() => { sending = null; });
    const res = await sending;
    if (queue.length) timer = schedule(flush, DELAY_MS);
    return !!res?.ok;
  }

  function track(name, props = {}) {
    try {
      if (!EVENT_NAMES.includes(name)) return false;
      const day = nyDay(now());
      if (ONCE_EVER.has(name)) { if (memo.once[name]) return false; memo.once[name] = true; keep(); }
      if (ONCE_A_DAY.has(name)) { if (memo.daily[name] === day) return false; memo.daily[name] = day; keep(); }
      const src = source ?? pageSource;
      const clean = cleanProps({ ...props, ...(SRC_EVENTS.has(name) && src ? src : {}), where: embed ? 'hub' : 'site' });
      queue.push({ name, props: clean });
      if (queue.length >= BATCH) { flush(); return true; }
      if (!timer) timer = schedule(flush, DELAY_MS);
      return true;
    } catch { return false; }
  }

  // The page is closing: hand what's left to the browser, which sends it after the page is gone.
  function stop() {
    if (timer) { cancel(timer); timer = null; }
    if (!queue.length) return;
    const events = queue.splice(0, BATCH);
    try { if (beacon && beacon({ device, events })) return; } catch { /* fall back */ }
    Promise.resolve(send({ device, events })).catch(() => null);
  }

  return { track, flush, stop, get pending() { return queue.length; } };
}

/** The kind of link the game was opened from, or null: an invite (?ref=), a challenge or a "Beat my pup" card. */
export function linkKind(search) {
  const p = new URLSearchParams(search ?? '');
  if (p.has('beat')) return 'beat-my-pup';
  if (p.has('challenge')) return 'challenge';
  if (p.has('ref')) return 'invite';
  return null;
}
