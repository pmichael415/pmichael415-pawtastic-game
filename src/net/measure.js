// Measurement: tells the site's server what the player did (opened the game, first level, shop viewed,
// checkout started, a share…), so the owner can see real usage and purchase conversion. It sends the same
// random browser id as the player counter and the event name — no dog name, email, progress or scores.
// Everything runs in the background; a failure is dropped and never slows or interrupts the game.
// The server keeps the same list (pawtastic-graduation: src/lib/game/measure.ts).
export const MEASURE_KEY = 'pawtastic-gd-measure-v1';
export const EVENT_PATH = '/api/public/game/event';
export const EVENT_NAMES = [
  'opened', 'first_play_started', 'first_play_completed', 'replay', 'shop_viewed', 'product_previewed',
  'checkout_started', 'checkout_failed', 'purchase_arrived', 'purchase_waiting', 'share', 'challenge_link_visit',
];
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
export function createMeasure({ send, beacon = null, device, store = null, now = Date.now, schedule = (fn, ms) => setTimeout(fn, ms), cancel = id => clearTimeout(id), embed = false } = {}) {
  const off = { track: () => false, flush: async () => false, stop() {}, pending: 0 };
  if (typeof send !== 'function' || !/^[A-Za-z0-9_-]{16,64}$/.test(device ?? '')) return off;
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
      const clean = cleanProps({ ...props, where: embed ? 'hub' : 'site' });
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
