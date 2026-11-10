// The player's wallet: Treats, purchases, lives, costumes and saved progress.
// Pure JavaScript with injected storage and clock, so it runs in Node.

import { dayKey, monthKey } from './time.js';
import {
  applyLevelResult, applyDailyOpen, claimMilestones, passActive, startPass, cancelPass, claimTier, tierReached, reportCard,
} from './progression.js';
import {
  PACKS, ITEMS, BOOSTERS, COSTUMES, SETS, STARTER_PACK, EVENT, LIVES, COINS, SPENDING_LIMIT, PASS, SKINS, skinsOnSale,
} from './catalog.js';

export function defaultState() {
  return {
    version: 1,
    dog: null,
    demoCoins: COINS.demoStart,
    treats: { free: 0, converted: 0, paid: 0 },
    lives: { count: LIVES.max, lastRegenAt: 0, unlimitedUntil: 0 },
    activeLevel: null,
    inventory: { boosters: { shuffle: 0, bomb: 0, blaster: 0 }, costumes: [], equipped: null, skins: [], skin: null },
    progress: { unlocked: 1, levels: {}, badges: [], side: { hawthorne: 101, hillsdale: 201 } },
    // The player's own PAWtastic: picks their home-location adventure and their leaderboard team.
    home: null,
    // This week's Weekly Challenge on this device: best score and the moves that made it (the High score run,
    // as version 1 keeps it), plus, per challenge, the best normalized result, its moves and what was sent.
    weekly: { week: null, best: 0, bestMoves: null, sentBest: 0, results: {}, runs: 0 },
    // Digital rewards for competing (never prize entries): tier badges per week and challenge, and trophies.
    collection: { badges: [], trophies: [], runs: 0 },
    pass: {
      active: false, autoRenew: false, startedOn: null, renewsOn: null,
      month: null, points: 0, claimedFree: [], claimedPremium: [], countedDay: null, countedToday: 0,
    },
    streak: { day: 0, lastOpenDay: null },
    starterPack: { bought: false, offerShown: false },
    // Real purchases (public site): server purchase ids already added to, or refunded from, this save.
    purchases: { applied: [], refunded: [], invites: [] }, // invites: invite reward ids already added (owner, 10 Nov 2026)
    spending: [],
    spendingLimit: SPENDING_LIMIT.default,
    limitChosen: false,
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
  loadLimit(state, loaded);
  cleanLists(state);
  state.weekly.results = loadResults(loaded.weekly?.results);
  return state;
}

// The monthly limit: none unless the player chose one. Saves from before 2 Nov always had 100 (the old default),
// so an unmarked 100 means "never chosen"; any other valid old value was the player's choice and is kept.
function loadLimit(state, loaded) {
  const v = loaded.spendingLimit;
  const valid = Number.isFinite(v) && v >= SPENDING_LIMIT.min && v <= SPENDING_LIMIT.max;
  const chosen = loaded.limitChosen === true || (valid && v !== 100);
  state.limitChosen = chosen;
  state.spendingLimit = chosen && valid ? v : null;
}

/** True if spending `usd` more this month would go over `limit` (null: no limit). */
export function wouldExceed(limit, spentUsd, usd) {
  return limit != null && spentUsd + usd > limit + 1e-9;
}

// mergeInto only checks typeof, so a list saved as null or {} (or with junk rows)
// would load as-is and break purchases later. Keep only well-formed entries.
const list = (v, ok) => (Array.isArray(v) ? v.filter(ok) : []);
const isText = v => typeof v === 'string';
const isTier = v => Number.isInteger(v) && v >= 1;
const TIERS = ['bronze', 'silver', 'gold'];
// The Weekly Challenge's formats (src/engine/challenge.js keeps the rules; the wallet only stores results by id).
const CHALLENGE_KEYS = ['high-score', 'combo', 'cleanup'];

/** The trophies (digital only; they never create prize entries) and when each is earned. */
export const TROPHIES = [
  { id: 'first-run', name: 'First Bell', how: 'Finish your first Weekly Challenge run.' },
  { id: 'three-formats', name: 'Triple Threat', how: 'Finish all three challenges in one week.' },
  { id: 'first-bronze', name: 'Bronze Bone', how: 'Earn your first bronze badge.' },
  { id: 'first-silver', name: 'Silver Whistle', how: 'Earn your first silver badge.' },
  { id: 'first-gold', name: 'Gold Star', how: 'Earn your first gold badge.' },
  { id: 'clean-sweep', name: 'Clean Sweep', how: 'Clean the whole board in a Cleanup puzzle.' },
  { id: 'chain-5', name: 'Chain Reaction', how: 'Set off a chain of 5 or more in one move.' },
  { id: 'ten-runs', name: 'Regular', how: 'Finish 10 challenge runs.' },
  { id: 'all-gold-week', name: 'Valedictorian of the Week', how: 'Gold in all three challenges in one week.' },
];
const TROPHY_IDS = new Set(TROPHIES.map(t => t.id));

function awardTrophies(state, { week, challenge, tier, extra }) {
  const earned = [];
  const give = id => { if (TROPHY_IDS.has(id) && !state.collection.trophies.includes(id)) { state.collection.trophies.push(id); earned.push(id); } };
  const results = state.weekly.results;
  give('first-run');
  if (CHALLENGE_KEYS.every(id => results[id]?.runs > 0)) give('three-formats');
  if (tier) give(`first-${tier}`);
  if (challenge === 'cleanup' && extra?.clean) give('clean-sweep');
  if (challenge === 'combo' && (extra?.bestChain ?? 0) >= 5) give('chain-5');
  if (state.collection.badges.filter(b => b.week === week && b.tier === 'gold').length === 3) give('all-gold-week');
  if (state.collection.runs >= 10) give('ten-runs');
  return earned;
}
function cleanLists(state) {
  const costumeIds = new Set(COSTUMES.map(c => c.id));
  state.inventory.costumes = list(state.inventory.costumes, id => costumeIds.has(id));
  if (!state.inventory.costumes.includes(state.inventory.equipped)) state.inventory.equipped = null;
  // Season skins (owner, 10 Nov 2026): only known ids, once each; the worn skin only if owned.
  const skinIds = new Set(SKINS.map(k => k.id));
  state.inventory.skins = [...new Set(list(state.inventory.skins, id => skinIds.has(id)))];
  if (!state.inventory.skins.includes(state.inventory.skin)) state.inventory.skin = null;
  state.progress.badges = list(state.progress.badges, isText);
  state.pass.claimedFree = list(state.pass.claimedFree, isTier);
  state.pass.claimedPremium = list(state.pass.claimedPremium, isTier);
  state.seenIntros = list(state.seenIntros, isText);
  state.milestones.claimed = list(state.milestones.claimed, isText);
  if (!Number.isFinite(state.lives.unlimitedUntil)) state.lives.unlimitedUntil = 0;
  if (state.home !== 'hawthorne' && state.home !== 'hillsdale') state.home = null;
  for (const [k, first] of [['hawthorne', 101], ['hillsdale', 201]]) {
    const v = state.progress.side[k];
    state.progress.side[k] = Number.isInteger(v) && v >= first && v <= first + 16 ? v : first;
  }
  if (!Array.isArray(state.weekly.bestMoves)) state.weekly.bestMoves = null;
  if (!Number.isInteger(state.weekly.runs) || state.weekly.runs < 0) state.weekly.runs = 0;
  state.collection.badges = list(state.collection.badges, b => isPlainObject(b) && isText(b.week) && CHALLENGE_KEYS.includes(b.challenge) && TIERS.includes(b.tier) && Number.isFinite(b.score));
  state.collection.trophies = list(state.collection.trophies, id => TROPHY_IDS.has(id));
  if (!Number.isInteger(state.collection.runs) || state.collection.runs < 0) state.collection.runs = 0;
  state.purchases.applied = list(state.purchases.applied, isText);
  state.purchases.refunded = list(state.purchases.refunded, isText);
  state.purchases.invites = list(state.purchases.invites, isText);
  state.spending = list(state.spending, s => isPlainObject(s) && Number.isFinite(s.at) && Number.isFinite(s.usd) && isText(s.what));
}

// weekly.results is keyed by challenge id, so mergeInto never sees it either.
function loadResults(results) {
  const out = {};
  if (!isPlainObject(results)) return out;
  for (const [id, v] of Object.entries(results)) {
    if (!CHALLENGE_KEYS.includes(id) || !isPlainObject(v)) continue;
    out[id] = { best: Number.isFinite(v.best) && v.best >= 0 ? v.best : 0, raw: Number.isFinite(v.raw) ? v.raw : 0, bestMoves: Array.isArray(v.bestMoves) ? v.bestMoves : null, sentBest: Number.isFinite(v.sentBest) ? v.sentBest : 0, runs: Number.isInteger(v.runs) ? v.runs : 0 };
  }
  return out;
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

    setHome(location) {
      if (location !== 'hawthorne' && location !== 'hillsdale') return fail('invalid-location');
      state.home = location;
      save();
      return { ok: true };
    },

    // The Weekly Challenge best on this device (tries are free: no lives, no boosters).
    /**
     * A finished Weekly Challenge run on this device. `challenge` is 'high-score' (version 1's run, which also
     * fills the old best/bestMoves fields) or 'combo' / 'cleanup'. `score` is the normalized result; `tier` a
     * bronze/silver/gold badge or null. Returns { best, bestScore, runs, newBadge, newTrophies }.
     */
    recordChallenge(week, score, moves, { challenge = 'high-score', raw = score, tier = null, extra = {} } = {}) {
      const w = state.weekly;
      if (w.week !== week) Object.assign(w, { week, best: 0, bestMoves: null, sentBest: 0, results: {}, runs: 0 });
      const r = w.results[challenge] ?? (w.results[challenge] = { best: 0, raw: 0, bestMoves: null, sentBest: 0, runs: 0 });
      r.runs += 1; w.runs += 1; state.collection.runs += 1;
      const best = score > r.best;
      if (best) { r.best = score; r.raw = raw; r.bestMoves = moves; }
      if (challenge === 'high-score' && best) { w.best = score; w.bestMoves = moves; }
      let newBadge = null;
      if (tier) {
        const have = state.collection.badges.find(b => b.week === week && b.challenge === challenge);
        const better = !have || TIERS.indexOf(tier) > TIERS.indexOf(have.tier);
        if (better) {
          state.collection.badges = state.collection.badges.filter(b => !(b.week === week && b.challenge === challenge));
          state.collection.badges.push({ week, challenge, tier, score });
          newBadge = tier;
        }
      }
      const newTrophies = awardTrophies(state, { week, challenge, score, tier, extra });
      save();
      return { best, bestScore: r.best, runs: r.runs, newBadge, newTrophies };
    },
    markChallengeSent(week, score, challenge = 'high-score') {
      if (state.weekly.week !== week) return;
      if (challenge === 'high-score') state.weekly.sentBest = Math.max(state.weekly.sentBest, score);
      const r = state.weekly.results[challenge];
      if (r) r.sentBest = Math.max(r.sentBest, score);
      save();
    },
    /** This week's results per challenge (empty when the week has turned). */
    weeklyResults(week) { return state.weekly.week === week ? state.weekly.results : {}; },

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

    // An invite reward the server confirmed (owner, 10 Nov 2026): free Treats, added once per reward id per save,
    // so syncing again or on another device with the same save never doubles it.
    applyInviteReward(id, amount) {
      if (typeof id !== 'string' || !id) return fail('invalid');
      if (!Number.isInteger(amount) || amount < 1 || amount > 100) return fail('invalid');
      const done = state.purchases.invites;
      if (done.includes(id)) return { ok: true, duplicate: true };
      state.treats.free += amount;
      done.push(id);
      if (done.length > 200) done.splice(0, done.length - 200);
      save();
      return { ok: true, treats: amount };
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

    buySkin(id) {
      const skin = SKINS.find(k => k.id === id);
      if (!skin) return fail('unknown-skin');
      if (state.inventory.skins.includes(id)) return fail('owned');
      if (!skinsOnSale(now()).some(k => k.id === id)) return fail('not-on-sale');
      if (!spendTreats(skin.price)) return fail('insufficient');
      state.inventory.skins.push(id);
      save();
      return { ok: true };
    },

    wearSkin(id) {
      if (id !== null && !state.inventory.skins.includes(id)) return fail('not-owned');
      state.inventory.skin = id;
      save();
      return { ok: true };
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
      if (usd !== null && (typeof usd !== 'number' || usd < SPENDING_LIMIT.min || usd > SPENDING_LIMIT.max)) return fail('invalid');
      state.spendingLimit = usd;
      state.limitChosen = true;
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
