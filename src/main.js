// Boot. Two ways to run:
//   local  — the claude.ai demo: the wallet in this browser's storage and, inside claude.ai,
//            the player's own account save (src/backend/local.js, src/backend/saved-game.js)
//   server — the game site (VITE_BACKEND=server): sign in, then the PAWtastic database
//            (src/net/), loaded on demand so the demo never needs supabase-js.

import { createRng } from './engine/rng.js';
import { createWallet } from './economy/wallet.js';
import { createLocalBackend, DEMO_FEATURES, FREE_PLAY_FEATURES, PAID_FEATURES } from './backend/local.js';
import { openPayments } from './net/pay-api.js';
import { startPlayerCount, DEVICE_KEY } from './net/player-count.js';
import { afterOpen, readCheckoutReturn } from './ui/payments.js';
import { initInstall } from './ui/install.js';
import { captureReferral, confirmFriendCode, referralNews } from './ui/referral.js';
import { offerAppCode } from './ui/app-signin.js';
import { openSavedGame } from './backend/saved-game.js';
import { bootServer } from './net/boot.js';
import { createAttemptQueue, QUEUE_KEY } from './net/attempt-queue.js';
import { render as signin } from './ui/screens/signin.js';
import { render as gate } from './ui/screens/gate.js';
import { render as pickDog } from './ui/screens/pick-dog.js';
import { render as stats } from './ui/screens/stats.js';
import { render as rules } from './ui/screens/rules.js';
import { createLocalStorage, STORAGE_KEYS } from './economy/storage-local.js';
import { createJar } from './prize/jar-demo.js';
import { createApp } from './ui/app.js';
import { render as loading } from './ui/screens/loading.js';
import { render as setup } from './ui/screens/setup.js';
import { render as map } from './ui/screens/map.js';
import { render as level } from './ui/screens/level.js';
import { render as report } from './ui/screens/report.js';
import { render as shop } from './ui/screens/shop.js';
import { render as closet } from './ui/screens/closet.js';
import { render as challenge } from './ui/screens/challenge.js';
import { render as leaderboard } from './ui/screens/leaderboard.js';
import { competeOnOpen } from './ui/compete.js';
import { render as pass } from './ui/screens/pass.js';
import { render as jarScreen } from './ui/screens/jar.js';
import { COATS } from './ui/art.js';
import { createSoundSettings, SETTINGS_KEY } from './audio/settings.js';
import { createAudio } from './audio/engine.js';

// Catch the browser's "install app" offer early (Android/desktop), for the Add to Home Screen button.
initInstall();
// An invite link (?ref=CODE): keep the friend code for the $10 off offer.
captureReferral();

const params = new URLSearchParams(location.search);
const debug = params.has('debug');
// Local development only (Vite dev server): ?debug=1&api=<url> runs server mode against
// tools/test-server.mjs. Never in a built site, where such a link would send sign-ins elsewhere.
const testApiUrl = import.meta.env?.DEV && debug ? params.get('api') : null;
const serverMode = import.meta.env?.VITE_BACKEND === 'server' || !!testApiUrl;
// A page with <meta name="pawtastic-release" content="free-play"> runs local mode as the free-play
// release: no demo purchases, Pup Pass or Treat Jar (the public site, where demo prizes would read as real).
const freePlay = document.querySelector('meta[name="pawtastic-release"]')?.content === 'free-play';

const now = () => Date.now();
// Debug only: ?odds=1 forces a demo win so staff can see the win notice.
const oddsParam = debug && params.has('odds') ? Number(params.get('odds')) : NaN;
const odds = oddsParam >= 0 && oddsParam <= 1 ? oddsParam : undefined;
const settings = createSoundSettings(createLocalStorage(SETTINGS_KEY));
const audioLog = debug ? [] : null;
const audio = createAudio({ settings, log: audioLog });
if (debug) window.__pawtasticAudio = { get state() { return audio.state; }, log: audioLog };

// Browsers only start sound inside a user gesture; iPhones accept some events and not others,
// and suspend audio after a call or app switch — so every gesture tries again (it's cheap).
for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) document.addEventListener(type, () => audio.unlock(), true);
document.addEventListener('visibilitychange', () => (document.hidden ? audio.suspend() : audio.resume()));
document.addEventListener('click', e => { if (e.target.closest?.('button.btn, button.chip, button.icon-btn, button.switch')) audio.sfx('tap'); });

const screens = {
  loading, setup, map, level, report, shop, closet, pass, jar: jarScreen, challenge, leaderboard, signin, gate, 'pick-dog': pickDog, stats, rules,
};

let app = null;
// storagePersistent: false shows "Progress won't be saved on this device."
// pay: the public site's server (src/net/pay-api.js); flushSave: send the saved game now.
const startApp = ({ storagePersistent, jar = null, pay = null, flushSave = null }) => {
  app = createApp(document.getElementById('app'), {
    backend: null, api: null, reboot: null, jar, debug, openResult: null, settings, audio, pay, flushSave,
    onScreen: name => audio.music(name === 'level' ? 'level-theme' : 'map-theme'),
    storagePersistent,
  }, screens);
};

async function bootLocal() {
  // The public site's own server: real purchases (Stripe), buyers' saved games and reports.
  // Null anywhere else (claude.ai, a file on disk), where the game stays as it was.
  const pay = freePlay ? await openPayments() : null;
  const checkoutReturn = pay ? readCheckoutReturn() : { checkout: null, sessionId: null };
  // Inside claude.ai the saved game also lives on the player's account, so an app that forgets
  // its storage (the Claude phone app) picks up where they left off. On the public site the same
  // happens for a signed-in buyer, with their PAWtastic game account.
  const saved = await openSavedGame({
    claude: window.claude ?? (pay?.signedIn ? pay.accountStore() : undefined), now,
    stores: { wallet: createLocalStorage(STORAGE_KEYS.wallet), jar: createLocalStorage(STORAGE_KEYS.jar) },
    stamp: createLocalStorage('pawtastic-gd-saved-at-v1'),
  });
  const wallet = createWallet({ storage: saved.stores.wallet, now });
  const jar = createJar({ storage: saved.stores.jar, now, rng: createRng(Date.now() >>> 0), odds });
  // Send the latest save before the page goes away (a closed app or a switched tab).
  addEventListener('pagehide', () => { saved.flush(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) saved.flush(); });
  startApp({ storagePersistent: saved.stores.wallet.persistent && saved.stores.jar.persistent, jar, pay, flushSave: () => saved.flush() });
  // Debug only: give screenshot runs a dog so they can jump straight to a screen.
  if (debug && !wallet.state.dog) wallet.setDog({ name: 'Biscuit', breed: 'lab', coat: COATS[0].hex });
  const features = !freePlay ? DEMO_FEATURES : pay?.payments ? PAID_FEATURES : FREE_PLAY_FEATURES;
  app.services.backend = createLocalBackend({
    wallet, features, release: freePlay ? 'public' : 'demo', payments: pay?.payments ? pay : null,
  });
  app.services.openResult = await app.services.backend.open();
  const debugScreen = debug && params.get('screen');
  app.go(debugScreen || 'loading', debugScreen ? { levelId: Number(params.get('level') || 1), areaId: params.get('area') || undefined, skipIntro: true } : {});
  // Purchases paid for (or refunded) since last time, and the return from Stripe's checkout.
  if (pay) afterOpen(app, checkoutReturn).catch(() => {});
  // Invite a friend: confirm an invite link's code, and tell the player about free baths they earned.
  if (pay?.accounts) { confirmFriendCode(app).catch(() => {}); referralNews(app).catch(() => {}); offerAppCode(app).catch(() => {}); competeOnOpen(app).catch(() => {}); }
  // Player counter for PAWtastic's weekly numbers: a random id, once a day, in the background.
  if (pay) startPlayerCount({ store: createLocalStorage(DEVICE_KEY) });
}

async function bootServerMode() {
  // Progress is saved to the PAWtastic account, so the "won't be saved" banner never applies.
  startApp({ storagePersistent: true });
  const api = testApiUrl
    ? (await import('./net/http-test-api.js')).createHttpTestApi(testApiUrl)
    : (await import('./net/supabase-api.js')).createSupabaseApi({ url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_KEY });
  const queue = createAttemptQueue(createLocalStorage(QUEUE_KEY));
  const inPlay = createLocalStorage('pawtastic-gd-inplay-v1'); // a level in progress on this phone
  app.services.api = api;
  // Runs sign-in, access and dog checks again (after signing in, or "Try again").
  app.services.reboot = async () => {
    const result = await bootServer({
      api, loc: location, hist: history, queue, inPlay,
      onSignedOut: () => app.go('signin'),
      onGameOff: () => app.go('gate', { reason: 'game-off' }),
    });
    if (!result.backend) { app.go(result.screen, { reason: result.reason }); return; }
    app.services.backend = result.backend;
    if (result.screen === 'loading') {
      const opened = await result.backend.open();
      app.services.openResult = opened.ok ? opened : null;
    }
    result.backend.logEvent('opened', {});
    app.go(screens[result.screen] ? result.screen : 'loading');
  };
  // Results kept on this phone while offline go out as soon as the connection is back.
  window.addEventListener('online', () => app.services.backend?.flush?.());
  await app.services.reboot();
}

// A sign-in link from the email opened in a tab where the game is already running: load it properly.
if (freePlay) addEventListener('hashchange', () => { if (/access_token=/.test(location.hash)) location.reload(); });

if (serverMode) bootServerMode().catch(() => app.go('gate', { reason: 'server' }));
else bootLocal();
