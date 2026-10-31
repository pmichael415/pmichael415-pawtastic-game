// Saves game state in the browser, falling back to memory when storage is
// blocked (private browsing) or missing.

export const STORAGE_KEYS = { wallet: 'pawtastic-gd-wallet-v1', jar: 'pawtastic-gd-jar-v1' };

// Reading window.localStorage itself throws when the browser blocks storage
// (e.g. third-party iframes in private browsing), so the read is guarded too.
function browserStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

export function createLocalStorage(key, ls = browserStorage()) {
  let persistent = false;
  try {
    if (ls) {
      ls.setItem('__pawtastic_probe__', '1');
      ls.removeItem('__pawtastic_probe__');
      persistent = true;
    }
  } catch {
    persistent = false;
  }

  let memory = null;
  return {
    persistent,
    load() {
      if (!persistent) return memory;
      try {
        const raw = ls.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    save(obj) {
      if (!persistent) { memory = JSON.parse(JSON.stringify(obj)); return; }
      try { ls.setItem(key, JSON.stringify(obj)); } catch { memory = JSON.parse(JSON.stringify(obj)); }
    },
  };
}
