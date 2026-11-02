// The server backend: the same interface as src/backend/local.js, over the game_* functions
// in the PAWtastic customer app's database (server/migrations/game_free_play.sql).
//
// The server decides every balance; this keeps the last player it returned and shows that.
// Finished-level results go through a queue so a dropped connection never loses one.

import { reportCard as reportCardFor } from '../economy/progression.js';
import { LIVES } from '../economy/catalog.js';
import { toWalletState, projectLives } from './state-map.js';

const APP_URL = 'https://app.pawtasticacademy.com';
const SITE_FALLBACK = 'https://pawtasticacademy.com/?utm_source=graduation-day&utm_medium=share';
const NO_NEWS = { newBadges: [], unlockedCostume: null, areaCompleted: null };
const COMING_SOON = { ok: false, error: 'coming-soon' };
// Refusals that can never succeed on a resend; the queued result is dropped.
const FINAL_FINISH_ERRORS = new Set(['bad-result', 'unknown-attempt']);
const TRANSPORT = new Set(['offline', 'signed-out', 'server']);

// A level being played on this phone, so closing the app mid-level loses nothing (the server's
// attempt stays open and is finished later with the same id).
const memoryStore = () => { let v = null; return { load: () => v, save: x => { v = x; } }; };

export function createServerBackend({ api, queue, inPlay = memoryStore(), now = () => Date.now(), newId = () => crypto.randomUUID() }) {
  let access = null;
  let player = null;
  let dogs = [];
  let referralCode = null;
  let attempt = null; // the level being played: { id, levelId }
  let userId = null; // whose results this phone may send (a family tablet can hold several)
  let offset = 0; // server clock minus phone clock, so a wrong phone clock can't move lives
  const serverNow = () => now() + offset;
  const syncClock = at => { const t = Date.parse(at); if (Number.isFinite(t)) offset = t - now(); };
  let hooks = {};

  // One call to a game function. Returns its jsonb answer, or { ok: false, error: kind }.
  async function rpc(name, args = {}) {
    const { data, error } = await api.rpc(name, args);
    if (error) {
      if (error.kind === 'signed-out') hooks.signedOut?.();
      return { ok: false, error: error.kind };
    }
    if (data?.player) player = data.player;
    if (data?.ok === false && data.error === 'game-off') hooks.gameOff?.();
    return data;
  }

  // A refused change means this phone may be out of date (another phone, a new day); refresh.
  async function mutate(name, args) {
    const res = await rpc(name, args);
    if (res?.ok === false && !TRANSPORT.has(res.error) && res.error !== 'game-off') await refresh();
    return res;
  }

  async function refresh() {
    const { data, error } = await api.rpc('game_bootstrap', {});
    if (error || !data?.access?.allowed) return;
    syncClock(data.now);
    player = data.player;
    dogs = data.dogs;
  }

  const readInPlay = () => {
    try {
      const s = inPlay.load();
      return s && s.userId === userId && typeof s.attemptId === 'string' ? s : null;
    } catch { return null; }
  };
  const writeInPlay = value => { try { inPlay.save(value); } catch { /* blocked storage: this visit only */ } };

  async function sendFinish(entry) {
    const res = await rpc('game_finish_level', {
      _attempt_id: entry.attemptId, _won: entry.won, _stars: entry.stars, _score: entry.score, _moves_made: entry.movesMade,
    });
    if (res.ok || FINAL_FINISH_ERRORS.has(res.error)) queue.remove(entry.attemptId);
    return res;
  }

  const backend = {
    kind: 'server',
    features: { purchases: false, jar: false, pass: false, account: true, stats: false },
    setHooks(h) { hooks = h; },

    // Loads the player. { ok: true } or { ok: false, error } (an access reason or transport kind).
    async load() {
      userId = (await api.auth.session())?.userId ?? null;
      const { data, error } = await api.rpc('game_bootstrap', {});
      if (error) return { ok: false, error: error.kind };
      access = data.access;
      backend.features.stats = !!access.staff;
      if (!access.allowed) return { ok: false, error: access.reason, access };
      syncClock(data.now);
      player = data.player;
      dogs = data.dogs;
      referralCode = data.referral_code;
      if (!referralCode && dogs.length) {
        const made = await api.invoke('referrals', { action: 'my_code' });
        if (typeof made.data?.code === 'string') referralCode = made.data.code;
      }
      return { ok: true, access };
    },
    access: () => access,

    state: () => toWalletState(player, dogs, serverNow()),
    balance() {
      const total = player.treats;
      return { free: total, converted: 0, paid: 0, total, usd: Math.round(total * 5) / 100 };
    },
    lives() {
      const { count, nextInMs } = projectLives(player, serverNow());
      return { count, max: LIVES.max, unlimited: false, nextInMs };
    },
    reportCard: areaId => reportCardFor(backend.state(), areaId),
    passStatus: () => ({ active: false, autoRenew: false, renewsOn: null, tier: 0, points: 0 }),
    monthSpendUsd: () => 0,
    get spendingLimit() { return null; },
    dogs: () => dogs.map(d => ({ id: d.id, name: d.name, breed: d.breed, photoUrl: d.photo_url ?? null })),
    referralLink: () => (referralCode ? `${APP_URL}/r/${encodeURIComponent(referralCode)}?s=game` : SITE_FALLBACK),

    // Sends any queued results, then claims today's reward (once per Eastern day, server-dated).
    async open() {
      await backend.flush();
      const res = await rpc('game_claim_daily');
      if (!res.ok) return res;
      return { ok: true, abandonedLevel: false, streak: res.streak, welcomeBack: res.welcomeBack };
    },
    // Sends this player's queued results; anyone else's wait for them to sign in here.
    async flush() {
      for (const entry of queue.all().filter(e => !e.userId || e.userId === userId)) {
        const res = await sendFinish(entry);
        if (!res.ok && TRANSPORT.has(res.error)) return;
      }
    },

    async setDog({ dogId = null, breed, coat }) {
      return mutate('game_set_dog', { _dog_id: dogId, _look: { breed, coat }, _equipped: null });
    },
    async startLevel(levelId) {
      const id = newId();
      const res = await mutate('game_start_level', { _attempt_id: id, _level_id: levelId });
      if (res.ok) {
        attempt = { id, levelId };
        if (readInPlay()) writeInPlay(null); // starting another level drops the one in progress
      }
      return res;
    },
    async endLevel(result) {
      if (!attempt || attempt.levelId !== result.levelId) return { ok: false, error: 'unknown-attempt' };
      if (readInPlay()?.attemptId === attempt.id) writeInPlay(null);
      const entry = { userId, attemptId: attempt.id, levelId: result.levelId, won: result.won, stars: result.stars, score: result.score, movesMade: result.movesMade };
      attempt = null;
      queue.add(entry);
      const res = await sendFinish(entry);
      if (res.ok) return { ok: true, ...res.summary, pawPoints: 0, starterPackOffer: false };
      if (res.error === 'offline') return { ok: true, queued: true, ...NO_NEWS, pawPoints: 0, starterPackOffer: false };
      return res;
    },
    levelInProgress() {
      const s = readInPlay();
      return s ? { levelId: s.levelId, snapshot: s.snapshot } : null;
    },
    async saveLevelSnapshot(snapshot) {
      if (!attempt || attempt.levelId !== snapshot?.levelId) return { ok: false, error: 'no-level' };
      writeInPlay({ userId, attemptId: attempt.id, levelId: attempt.levelId, snapshot });
      return { ok: true };
    },
    async resumeLevel(levelId) {
      const s = readInPlay();
      if (!s || s.levelId !== levelId) return { ok: false, error: 'nothing-to-resume' };
      attempt = { id: s.attemptId, levelId };
      return { ok: true, snapshot: s.snapshot };
    },
    buyItem: itemId => mutate('game_spend', { _item_id: itemId }),
    buyCostume: id => mutate('game_spend', { _item_id: id }),
    useBoosterItem: type => mutate('game_use_booster', { _type: type }),
    equip: id => mutate('game_equip', { _costume_id: id }),
    markIntroSeen: areaId => mutate('game_mark_intro', { _area_id: areaId }),
    logEvent: (type, data = {}) => rpc('game_log_event', { _type: type, _data: data }),
    stats: (weeks = 8) => rpc('game_stats', { _weeks: weeks }),

    // Not in the free-play release.
    buyPack: async () => COMING_SOON,
    buyStarterPack: async () => COMING_SOON,
    convertCoins: async () => COMING_SOON,
    startPass: async () => COMING_SOON,
    cancelPass: async () => COMING_SOON,
    claimTier: async () => COMING_SOON,
    setSpendingLimit: async () => COMING_SOON,
  };
  return backend;
}
