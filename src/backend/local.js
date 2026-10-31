// The local backend: the demo's wallet in this browser's storage, behind the same
// interface as the server backend (src/net/server-backend.js).
//
// Reads are synchronous; anything that changes the player's things is async and
// resolves { ok: true, … } or { ok: false, error }.

export const DEMO_FEATURES = { purchases: true, jar: true, pass: true, account: false, stats: false };
// The public free-play site: nothing for sale, no Pup Pass, no Treat Jar (they show "Coming soon").
export const FREE_PLAY_FEATURES = { purchases: false, jar: false, pass: false, account: false, stats: false };

export function createLocalBackend({ wallet, features = DEMO_FEATURES }) {
  return {
    kind: 'local',
    features: { ...features },

    state: () => wallet.state,
    balance: () => wallet.balance(),
    lives: () => wallet.lives(),
    reportCard: areaId => wallet.reportCard(areaId),
    passStatus: () => wallet.passStatus(),
    monthSpendUsd: () => wallet.monthSpendUsd(),
    get spendingLimit() { return wallet.spendingLimit; },
    dogs: () => [],
    referralLink: () => null,

    async open() { return { ok: true, ...wallet.onAppOpen() }; },
    async setDog(dog) { return wallet.setDog(dog); },
    async startLevel(levelId) { return wallet.startLevel(levelId); },
    async endLevel(result) { return { ok: true, ...wallet.endLevel(result) }; },
    async buyItem(itemId) { return wallet.buyItem(itemId); },
    async useBoosterItem(type) { return wallet.useBoosterItem(type); },
    async buyCostume(id) { return wallet.buyCostume(id); },
    async equip(id) { return wallet.equip(id); },
    async markIntroSeen(areaId) { wallet.markIntroSeen(areaId); return { ok: true }; },
    levelInProgress: () => wallet.levelInProgress(),
    async saveLevelSnapshot(snapshot) { return wallet.saveLevelSnapshot(snapshot); },
    async resumeLevel(levelId) { return wallet.resumeLevel(levelId); },
    async logEvent() { return { ok: true }; },
    async stats() { return { ok: false, error: 'coming-soon' }; },

    async buyPack(packId) { return wallet.buyPack(packId); },
    async buyStarterPack() { return wallet.buyStarterPack(); },
    async convertCoins(n) { return wallet.convertCoins(n); },
    async startPass() { return wallet.startPass(); },
    async cancelPass() { return wallet.cancelPass(); },
    async claimTier(track, tier) { return wallet.claimTier(track, tier); },
    async setSpendingLimit(usd) { return wallet.setSpendingLimit(usd); },
  };
}
