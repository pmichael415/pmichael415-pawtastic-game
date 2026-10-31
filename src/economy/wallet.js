// The player's wallet: Treats, purchases, lives, costumes and saved progress.
// Pure JavaScript with injected storage and clock, so it runs in Node.

import { dayKey, monthKey } from './time.js';
import {
  applyLevelResult, applyDailyOpen, claimMilestones, passActive, startPass, cancelPass, claimTier, tierReached, reportCard,
} from './progression.js';
import {
  PACKS, ITEMS, BOOSTERS, COSTUMES, SETS, STARTER_PACK, EVENT, LIVES, COINS, SPENDING_LIMIT, PASS,
} from './catalog.js';

export function defaultState() {
  return {
    version: 1,
    dog: null,
    demoCoins: COINS.demoStart,
    treats: { free: 0, converted: 0, paid: 0 },
    lives: { count: LIVES.max, lastRegenAt: 0, unlimitedUntil: 0 },
    activeLevel: null,
    inventory: { boosters: { shuffle: 0, bomb: 0, blaster: 0 }, costumes: [], equipped: null },
    progress: { unlocked: 1, levels: {}, badges: [] },
    pass: {
      active: false, autoRenew: false, startedOn: null, renewsOn: null,
      month: null, points: 0, claimedFree: [], claimedPremium: [], countedDay: null, countedToday: 0,
    },
    streak: { day: 0, lastOpenDay: null },
    starterPack: { bought: false, offerShown: false },
    // Real purchases (public site): server purchase ids already added to, or refunded from, this save.
    purchases: { applied: [], refunded: [] },
    spending: [],
    spendingLimit: SPENDING_LIMIT.default,
    seenIntros: [],
    milestones: { claimed: [] },
  };
}

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

function mergeInto(base, loaded) {
  for (const key of Object.keys(base)) {
    if (!(key in loaded)) continue;
    if (isPlainObject(base[key]) && isPlainObject(loaded[key])) mergeInto(base[key], loaded[key]);
    else if (base[key] === null || typeof base[key] === typeof loaded[key]) base[key] = loaded[key];
  }
  return base;
}

function loadState(storage) {
  let loaded = null;
  try { loaded = storage.load(); } catch { loaded = null; }
  if (!isPlainObject(loaded) || loaded.version !== 1) return defaultState();
  const state = mergeInto(defaultState(), loaded);
  state.progress.levels = loadLevels(loaded.progress?.levels);
  cleanLists(state);
  return state;
}

// mergeInto only checks typeof, so a list saved as null or {} (or with junk rows)
// would load as-is and break purchases later. Keep only well-formed entries.
const list = (v, ok) => (Array.isArray(v) ? v.filter(ok) : []);
const isText = v => typeof v === 'string';
const isTier = v => Number.isInteger(v) && v >= 1;
function cleanLists(state) {
  const costumeIds = new Set(COSTUMES.map(c => c.id));
  state.inventory.costumes = list(state.inventory.costumes, id => costumeIds.has(id));
  if (!state.inventory.costumes.includes(state.inventory.equipped)) state.inventory.equipped = null;
  state.progress.badges = list(state.progress.badges, isText);
  state.pass.claimedFree = list(state.pass.claimedFree, isTier);
  state.pass.claimedPremium = list(state.pass.claimedPremium, isTier);
  state.seenIntros = list(state.seenIntros, isText);
  state.milestones.claimed = list(state.milestones.claimed, isText);
  if (!Number.isFinite(state.lives.unlimitedUntil)) state.lives.unlimitedUntil = 0;
  state.purchases.applied = list(state.purchases.applied, isText);
  state.purchases.refunded = list(state.purchases.refunded, isText);
  state.spending = list(state.spending, s => isPlainObject(s) && Number.isFinite(s.at) && Number.isFinite(s.usd) && isText(s.what));
}

// progress.levels is keyed by level id, so mergeInto (which walks the default keys) never sees it.
function loadLevels(levels) {
  const out = {};
  if (!isPlainObject(levels)) return out;
  for (const [id, v] of Object.entries(levels)) {
    if (/^\d+$/.test(id) && isPlainObject(v) && Number.isFinite(v.stars) && Number.isFinite(v.score)) out[id] = { stars: v.stars, score: v.score };
  }
  return out;
}

const fail = error => ({ ok: false, error });

export function createWallet({ storage, now }) {
  const state = loadState(storage);
  const save = () => storage.save(state);
  // Unlimited lives: with the Pup Pass, or for a while after a milestone reward.
  const timedLivesMs = () => Math.max(0, (state.lives.unlimitedUntil || 0) - now());
  const unlimitedLives = () => passActive(state, now()) || timedLivesMs() > 0;

  function regenLives() {
    const lives = state.lives;
    const t = now();
    if (t < lives.lastRegenAt) { lives.lastRegenAt = t; return; }
    if (lives.count >= LIVES.max) return;
    const gained = Math.floor((t - lives.lastRegenAt) / LIVES.regenMs);
    if (gained > 0) {
      lives.count = Math.min(LIVES.max, lives.count + gained);
      lives.lastRegenAt += gained * LIVES.regenMs;
    }
  }

  function spendTreats(amount) {
    const t = state.treats;
    if (t.free + t.converted + t.paid < amount) return false;
    let left = amount;
    for (const ledger of ['free', 'converted', 'paid']) {
      const take = Math.min(t[ledger], left);
      t[ledger] -= take;
      left -= take;
    }
    return true;
  }

  function logSpend(usd, what) {
    state.spending.push({ at: now(), usd, what });
  }

  function grantCostume(id) {
    if (!state.inventory.costumes.includes(id)) state.inventory.costumes.push(id);
  }

  function grantPack(pack) {
    state.treats.paid += pack.treats;
    logSpend(pack.usd, pack.id);
  }

  function grantStarterPack() {
    state.treats.paid += STARTER_PACK.treats;
    for (const [b, n] of Object.entries(STARTER_PACK.boosters)) state.inventory.boosters[b] += n;
    grantCostume(STARTER_PACK.costume);
    completeSets();
    state.starterPack.bought = true;
    logSpend(STARTER_PACK.usd, 'starter-pack');
  }

  function completeSets() {
    for (const set of SETS) {
      const owned = state.inventory.costumes;
      if (set.costumes.every(c => owned.includes(c)) && !owned.includes(set.bonus)) {
        grantCostume(set.bonus);
        return set.bonus;
      }
    }
    return null;
  }

  const wallet = {
    get state() { return JSON.parse(JSON.stringify(state)); },
    get spendingLimit() { return state.spendingLimit; },

    setDog({ name, breed, coat }) {
      const trimmed = String(name ?? '').trim();
      if (trimmed.length < 1 || trimmed.length > 20) return fail('invalid-name');
      state.dog = { name: trimmed, breed, coat };
      save();
      return { ok: true };
    },

    balance() {
      const { free, converted, paid } = state.treats;
      const total = free + converted + paid;
      return { free, converted, paid, total, usd: Math.round(total * 5) / 100 };
    },

    buyPack(packId) {
      const pack = PACKS.find(p => p.id === packId);
      if (!pack) return fail('unknown-pack');
      grantPack(pack);
      save();
      return { ok: true, treats: pack.treats };
    },

    buyStarterPack() {
      if (state.starterPack.bought) return fail('already-bought');
      grantStarterPack();
      save();
      return { ok: true };
    },

    // A purchase the server confirmed was paid (Stripe). Each purchase id is added once per save,
    // so syncing again, or on another device with the same save, never doubles it.
    applyPurchase(id, product) {
      if (typeof id !== 'string' || !id) return fail('invalid');
      if (state.purchases.applied.includes(id)) return { ok: true, duplicate: true };
      const pack = PACKS.find(p => p.id === product);
      if (pack) grantPack(pack);
      else if (product === 'starter') grantStarterPack();
      else if (product === 'pass') { startPass(state, now()); logSpend(PASS.usd, 'pass'); }
      else return fail('unknown-product');
      state.purchases.applied.push(id);
      save();
      return { ok: true, product, treats: pack?.treats ?? (product === 'starter' ? STARTER_PACK.treats : 0) };
    },

    // A refunded purchase: its bought Treats come back off the balance (never below zero).
    // A refunded Pup Pass ends through syncPass, from the server's subscription status.
    applyRefund(id, product) {
      if (typeof id !== 'string' || !id) return fail('invalid');
      if (state.purchases.refunded.includes(id)) return { ok: true, duplicate: true };
      const treats = PACKS.find(p => p.id === product)?.treats ?? (product === 'starter' ? STARTER_PACK.treats : 0);
      let left = treats;
      for (const ledger of ['paid', 'converted', 'free']) {
        const take = Math.min(state.treats[ledger], left);
        state.treats[ledger] -= take;
        left -= take;
      }
      state.purchases.refunded.push(id);
      save();
      return { ok: true, product, treats: treats - left };
    },

    // The Pup Pass as Stripe sees it: { active, renewsOn: 'YYYY-MM-DD' | null, autoRenew }.
    syncPass(pass) {
      if (!pass || typeof pass.active !== 'boolean') return fail('invalid');
      const p = state.pass;
      if (pass.active) {
        if (!p.active) p.startedOn = dayKey(now());
        p.active = true;
        p.autoRenew = !!pass.autoRenew;
        if (typeof pass.renewsOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(pass.renewsOn)) p.renewsOn = pass.renewsOn;
      } else if (p.active) {
        p.active = false;
        p.autoRenew = false;
      }
      save();
      return { ok: true, active: passActive(state, now()) };
    },

    convertCoins(n) {
      if (!Number.isInteger(n) || n < COINS.min) return fail('min-20');
      if (n > state.demoCoins) return fail('not-enough-coins');
      state.demoCoins -= n;
      state.treats.converted += n;
      save();
      return { ok: true };
    },

    buyItem(itemId) {
      const item = ITEMS[itemId];
      if (!item) return fail('unknown-item');
      if (itemId === 'lives') {
        regenLives();
        if (state.lives.count >= LIVES.max) return fail('lives-full');
      }
      if (!spendTreats(item.treats)) return fail('insufficient');
      if (itemId === 'lives') state.lives.count = LIVES.max;
      if (BOOSTERS.includes(itemId)) state.inventory.boosters[itemId] += 1;
      save();
      return { ok: true };
    },

    useBoosterItem(type) {
      if (!BOOSTERS.includes(type) || state.inventory.boosters[type] < 1) return fail('none-left');
      state.inventory.boosters[type] -= 1;
      save();
      return { ok: true };
    },

    buyCostume(id) {
      const costume = COSTUMES.find(c => c.id === id);
      if (!costume) return fail('unknown-costume');
      if (costume.price === null) return fail('not-for-sale');
      if (costume.set === 'event') {
        const today = dayKey(now());
        if (today < EVENT.start || today > EVENT.end) return fail('event-over');
      }
      if (state.inventory.costumes.includes(id)) return fail('owned');
      if (!spendTreats(costume.price)) return fail('insufficient');
      grantCostume(id);
      const bonusCostume = completeSets();
      save();
      return { ok: true, bonusCostume };
    },

    equip(id) {
      if (id !== null && !state.inventory.costumes.includes(id)) return fail('not-owned');
      state.inventory.equipped = id;
      save();
      return { ok: true };
    },

    lives() {
      regenLives();
      const { count, lastRegenAt } = state.lives;
      const unlimited = unlimitedLives();
      const nextInMs = !unlimited && count < LIVES.max ? LIVES.regenMs - (now() - lastRegenAt) : null;
      const pass = passActive(state, now());
      return { count, max: LIVES.max, unlimited, nextInMs, pass, unlimitedMs: pass ? null : timedLivesMs() || null };
    },

    startLevel(levelId) {
      regenLives();
      if (!unlimitedLives()) {
        if (state.lives.count < 1) return fail('no-lives');
        if (state.lives.count >= LIVES.max) state.lives.lastRegenAt = now();
        state.lives.count -= 1;
        state.activeLevel = { levelId, startedAt: now(), reserved: true };
      } else {
        state.activeLevel = { levelId, startedAt: now(), reserved: false };
      }
      save();
      return { ok: true };
    },

    endLevel(result) {
      const active = state.activeLevel;
      if (active && active.reserved && result.won) {
        regenLives();
        state.lives.count = Math.min(LIVES.max, state.lives.count + 1);
      }
      state.activeLevel = null;
      const summary = applyLevelResult(state, result, now());
      save();
      return summary;
    },

    // A level closed before any saved board can't be picked up again; one with a saved board can.
    recoverAbandonedLevel() {
      if (!state.activeLevel || state.activeLevel.snapshot) return false;
      state.activeLevel = null;
      save();
      return true;
    },

    // The board of the level being played, saved after each move so it can be resumed.
    saveLevelSnapshot(snapshot) {
      if (!state.activeLevel || state.activeLevel.levelId !== snapshot?.levelId) return fail('no-level');
      state.activeLevel.snapshot = snapshot;
      save();
      return { ok: true };
    },

    levelInProgress() {
      const a = state.activeLevel;
      return a?.snapshot ? { levelId: a.levelId, snapshot: structuredClone(a.snapshot) } : null;
    },

    resumeLevel(levelId) {
      const a = state.activeLevel;
      if (!a?.snapshot || a.levelId !== levelId) return fail('nothing-to-resume');
      return { ok: true, snapshot: structuredClone(a.snapshot) };
    },

    monthSpendUsd() {
      const month = monthKey(now());
      const cents = state.spending
        .filter(s => monthKey(s.at) === month)
        .reduce((sum, s) => sum + Math.round(s.usd * 100), 0);
      return cents / 100;
    },

    setSpendingLimit(usd) {
      if (typeof usd !== 'number' || usd < SPENDING_LIMIT.min || usd > SPENDING_LIMIT.max) return fail('invalid');
      state.spendingLimit = usd;
      save();
      return { ok: true };
    },

    onAppOpen() {
      const abandonedLevel = wallet.recoverAbandonedLevel();
      const daily = applyDailyOpen(state, now());
      if (daily.passRenewed) logSpend(PASS.usd, 'pass');
      const milestones = claimMilestones(state, now());
      save();
      return { abandonedLevel, ...daily, milestones };
    },

    passStatus() {
      const p = state.pass;
      return { active: passActive(state, now()), autoRenew: p.autoRenew, renewsOn: p.renewsOn, tier: tierReached(state, now()), points: p.points };
    },

    startPass() {
      if (passActive(state, now())) {
        if (state.pass.autoRenew) return fail('already-active');
        state.pass.autoRenew = true;
        save();
        return { ok: true, resumed: true };
      }
      startPass(state, now());
      logSpend(PASS.usd, 'pass');
      save();
      return { ok: true };
    },

    cancelPass() {
      cancelPass(state);
      save();
      return { ok: true };
    },

    claimTier(track, tier) {
      const out = claimTier(state, track, tier, now());
      save();
      return out;
    },

    reportCard(areaId) {
      return reportCard(state, areaId);
    },

    markIntroSeen(areaId) {
      if (!state.seenIntros.includes(areaId)) state.seenIntros.push(areaId);
      save();
    },

  };
  return wallet;
}
