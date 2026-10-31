// The local backend: the demo's wallet in this browser's storage, behind the same
// interface as the server backend (src/net/server-backend.js).
//
// Reads are synchronous; anything that changes the player's things is async and
// resolves { ok: true, … } or { ok: false, error }.

export const DEMO_FEATURES = { purchases: true, jar: true, pass: true, account: false, stats: false };
// The public site without payments: nothing for sale, no Pup Pass, no Treat Jar (they show "Coming soon").
export const FREE_PLAY_FEATURES = { purchases: false, jar: false, pass: false, account: false, stats: false };
// The public site with Stripe switched on: real Treat packs, Starter Pack and Pup Pass. The Treat Jar
// stays off (a prize draw next to real purchases needs official rules approved first).
export const PAID_FEATURES = { purchases: true, jar: false, pass: true, account: false, stats: false };

// True on the public site (pawtastic-graduation.lovable.app), with or without payments.
export const isPublicSite = backend => backend?.kind === 'local' && backend.release === 'public';

/**
 * release:  'demo' (claude.ai, simulated purchases) or 'public' (the website).
 * payments: the client from src/net/pay-api.js when real purchases are on, else null.
 */
export function createLocalBackend({ wallet, features = DEMO_FEATURES, release = 'demo', payments = null }) {
  return {
    kind: 'local',
    release,
    payments,
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

    // Real purchases: apply what the server says was paid or refunded, and the Pup Pass status.
    applyPurchase: (id, product) => wallet.applyPurchase(id, product),
    applyRefund: (id, product) => wallet.applyRefund(id, product),
    syncPass: pass => wallet.syncPass(pass),

    async buyPack(packId) { return wallet.buyPack(packId); },
    async buyStarterPack() { return wallet.buyStarterPack(); },
    async convertCoins(n) { return wallet.convertCoins(n); },
    async startPass() { return wallet.startPass(); },
    async cancelPass() { return wallet.cancelPass(); },
    async claimTier(track, tier) { return wallet.claimTier(track, tier); },
    async setSpendingLimit(usd) { return wallet.setSpendingLimit(usd); },
  };
}
