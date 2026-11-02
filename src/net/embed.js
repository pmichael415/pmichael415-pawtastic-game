// Graduation Day inside the PAWtastic Games hub. The hub serves a copy of this page from its own address and adds
// <meta name="pawtastic-api" content="https://pawtastic-graduation.lovable.app">, so sign-in, the Weekly Challenge,
// the leaderboard and the Shop talk to Graduation Day's own server (only an allowlisted address is accepted).

export const API_BASES = ['https://pawtastic-graduation.lovable.app'];

/** The server to talk to: an allowlisted address from the page, or '' (this page's own site). */
export function apiBase(doc = globalThis.document) {
  const value = doc?.querySelector?.('meta[name="pawtastic-api"]')?.content ?? '';
  return API_BASES.includes(value) ? value : '';
}

/** True when this page runs inside another page's frame (or can't tell). */
export function embedded(win = globalThis) {
  try {
    return win.top !== win.self;
  } catch {
    return true;
  }
}

/**
 * Opens a page that can't run inside a frame (Stripe checkout and billing). Not framed: this tab. Framed by the
 * hub (same site): the whole hub tab. Framed by another site: a new tab.
 */
export function openOutside(url, win = globalThis) {
  if (!embedded(win)) return void win.location.assign(url);
  try {
    win.top.location.assign(url);
  } catch {
    win.open(url, '_blank');
  }
}
