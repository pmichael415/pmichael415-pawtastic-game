// Player counter for PAWtastic's weekly numbers: says hello to the site's server once a day.
// It sends only a random id kept in this browser — no dog name, email, sign-in or progress — so the
// owner can see how many phones and computers play each day and week. It never holds up the game:
// it runs in the background, and any failure is ignored (it simply tries again on the next open).
export const DEVICE_KEY = 'pawtastic-gd-device-v1';
export const HELLO_PATH = '/api/public/game/hello';
const ID = /^[A-Za-z0-9_-]{16,64}$/;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export const localDay = t => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const randomBytes = () => globalThis.crypto.getRandomValues(new Uint8Array(16));
const newId = bytes => Array.from(bytes, b => ALPHABET[b & 63]).join('') + Array.from(bytes.slice(0, 6), b => ALPHABET[b >> 2]).join('');

/** This browser's random id, created and saved on first use (shared with the measurement in net/measure.js). */
export function deviceId(store, random = randomBytes) {
  let saved = null;
  try { saved = store?.load(); } catch { saved = null; }
  if (ID.test(saved?.id ?? '')) return saved.id;
  const id = newId(random());
  try { store?.save({ id, sent: null }); } catch { /* memory only */ }
  return id;
}

// Returns a promise of true when today's hello was sent, false when it wasn't needed or failed.
export function sayHello({ fetchImpl = globalThis.fetch?.bind(globalThis), store, now = Date.now, random = randomBytes, base = '', nav = globalThis.navigator } = {}) {
  try {
    if (nav?.webdriver === true) return Promise.resolve(false); // automated browsers are never counted as players
    if (typeof fetchImpl !== 'function' || !store) return Promise.resolve(false);
    let saved = null;
    try { saved = store.load(); } catch { saved = null; }
    const id = ID.test(saved?.id ?? '') ? saved.id : newId(random());
    const day = localDay(now());
    if (saved?.id === id && saved.sent === day) return Promise.resolve(false);
    const keep = sent => { try { store.save({ id, sent }); } catch { /* memory only */ } };
    keep(saved?.id === id ? saved.sent ?? null : null);
    return Promise.resolve(fetchImpl(base + HELLO_PATH, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device: id }),
      keepalive: true, credentials: 'omit',
    })).then(res => { if (res?.ok) { keep(day); return true; } return false; }, () => false);
  } catch {
    return Promise.resolve(false);
  }
}

// Says hello now, and again when a game left open comes back on a new day.
export function startPlayerCount({ doc = globalThis.document, ...options } = {}) {
  let busy = null;
  const run = () => { busy ??= sayHello(options).finally(() => { busy = null; }); return busy; };
  run();
  doc?.addEventListener?.('visibilitychange', () => { if (!doc.hidden) run(); });
  return run;
}
