// The demo's saved game, kept in two places: this browser (instant, and it works offline)
// and, when the page runs inside claude.ai, the player's own private corner of the artifact's
// database, so an app that forgets its storage (the Claude phone app) can't lose progress.
// The newer save wins, except that a fresh start made while the account couldn't be reached
// is "provisional" and never replaces progress already on the account.

export const SAVE_DOC = userId => `data/users/${userId}/save`;
const REACH_ACCOUNT_MS = 4000;
const PUSH_AFTER_MS = 1500;

// The player's save document, or null when this view has no account storage.
async function reachAccount(claude, timeoutMs) {
  if (typeof claude?.use !== 'function') return null;
  const reach = (async () => {
    const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
    const id = db && user ? await user.id() : null;
    return id ? db.doc(SAVE_DOC(id)) : null;
  })().catch(() => null);
  let timer;
  const late = new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); });
  const doc = await Promise.race([reach, late]);
  clearTimeout(timer);
  return doc;
}

const read = store => { try { return store.load(); } catch { return null; } };
const write = (store, value) => { try { store.save(value); } catch { /* memory only */ } };

/**
 * stores: { wallet, jar } — this browser's storages ({ load, save, persistent }).
 * stamp:  a storage holding { at, provisional } for this browser's last save.
 * Resolves { stores, linked, flush }: `stores` save here and, when linked, to the account
 * (coalesced, one write at a time); `flush()` sends any pending save now.
 */
export async function openSavedGame({
  claude, stores, stamp, now = () => Date.now(), timeoutMs = REACH_ACCOUNT_MS,
  setTimer = setTimeout, clearTimer = clearTimeout,
}) {
  const remote = await reachAccount(claude, timeoutMs);
  const mine = read(stamp);
  const hadLocal = read(stores.wallet) !== null;
  let provisional = !remote && !hadLocal ? true : !!mine?.provisional;
  let at = mine?.at ?? 0;

  let linked = false;
  if (remote) {
    try {
      const snap = await remote.get();
      const theirs = snap.exists ? snap.data() : null;
      linked = true;
      // Built page: Lovable's owner hook (tools/owner-hooks.mjs) adds snap.forceAccount (an explicit "Use account save").
      const accountWins = theirs?.wallet && (provisional || !hadLocal || (theirs.at ?? 0) > at);
      if (accountWins) {
        write(stores.wallet, theirs.wallet);
        if (theirs.jar) write(stores.jar, theirs.jar);
        at = theirs.at ?? now();
        provisional = false;
        write(stamp, { at, provisional });
      } else if (hadLocal) {
        provisional = false;
        if (!at) at = now();
        write(stamp, { at, provisional });
        await remote.set({ wallet: read(stores.wallet), jar: read(stores.jar), at }).catch(() => {});
      }
    } catch {
      linked = false; // couldn't read the account: this visit stays on this device only
    }
  }

  // This visit's own copy of the save. Pages read and send it rather than re-reading the
  // browser, so storage wiped while the page is open can't reach the account as a blank game.
  const copy = { wallet: read(stores.wallet), jar: read(stores.jar) };

  // Account writes: one at a time, after a pause, always with the latest state.
  let pending = null;
  let timer = null;
  let dirty = false;
  async function push() {
    timer = null;
    if (!linked || !dirty || copy.wallet === null) return;
    dirty = false;
    await remote.set({ wallet: copy.wallet, jar: copy.jar, at }).catch(() => { dirty = true; });
  }
  function flush() {
    if (timer !== null) { clearTimer(timer); timer = null; }
    pending = (pending ?? Promise.resolve()).then(push);
    return pending;
  }
  function changed() {
    at = now();
    write(stamp, { at, provisional });
    if (!linked) return;
    dirty = true;
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => flush(), PUSH_AFTER_MS);
  }
  const mirror = key => ({
    load: () => structuredClone(copy[key]),
    save: value => { copy[key] = JSON.parse(JSON.stringify(value)); write(stores[key], copy[key]); changed(); },
    get persistent() { return linked || !!stores[key].persistent; },
  });

  return { stores: { wallet: mirror('wallet'), jar: mirror('jar') }, linked, flush };
}
