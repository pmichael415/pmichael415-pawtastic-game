import { dogSVG } from './art.js';
// How the player's dog looks right now (owner, 10 Nov 2026): the dog from the wallet, its costume and its worn season
// skin. Every place that draws "your dog" uses this, so a skin shows everywhere.
export function dogLook(state) {
  const dog = state?.dog ?? null;
  return { ...(dog ?? {}), costume: state?.inventory?.equipped ?? null, skin: state?.inventory?.skin ?? null, label: dog?.name ?? 'Your dog' };
}

/** The hub (same site) shows "your pup" from this record. Read by the hub's lib/myPup.ts, which checks it again. */
export const MY_PUP_KEY = 'pawtastic-my-pup-v1';
export function publishMyPup(state, store = globalThis.localStorage, now = Date.now()) {
  if (!state?.dog) return;
  // A fixed label: the dog's name travels as data, never inside the picture.
  const svg = dogSVG({ ...dogLook(state), label: 'Your pup' });
  try { store?.setItem(MY_PUP_KEY, JSON.stringify({ v: 1, name: String(state.dog.name ?? '').slice(0, 24), skin: state.inventory?.skin ?? null, svg, at: now })); } catch { /* storage full or blocked */ }
}
