// "Add to Home Screen": a card on the map and a menu item that walk players through installing the
// game like an app. Android and desktop Chrome/Edge get the browser's own install prompt; iPhone and
// iPad (no prompt exists there) get short steps for Safari's Share button.

import { h } from './dom.js';

const DISMISS_KEY = 'pawtastic-gd-install-dismissed-v1';
const DISMISS_DAYS = 30;
let deferredPrompt = null;
let installed = false;

/** Call once at startup, before the browser fires its install event. */
export function initInstall(win = globalThis) {
  win.addEventListener?.('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; });
  win.addEventListener?.('appinstalled', () => { installed = true; deferredPrompt = null; });
}

export function isStandalone(win = globalThis) {
  return installed || win.navigator?.standalone === true || !!win.matchMedia?.('(display-mode: standalone)').matches;
}

export function platform(nav = globalThis.navigator) {
  const ua = nav?.userAgent ?? '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (nav?.platform === 'MacIntel' && nav?.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS/.test(ua) ? 'ios-other' : 'ios-safari';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

function dismissedRecently(store = globalThis.localStorage) {
  try {
    const at = Number(store?.getItem(DISMISS_KEY));
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86400000;
  } catch { return false; }
}
function dismiss(store = globalThis.localStorage) {
  try { store?.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
}

const shareIcon = () => '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" style="vertical-align:-4px"><path d="M12 3v12M8 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

function steps(kind) {
  if (kind === 'ios-safari' || kind === 'ios-other') {
    return [
      h('li', {}, 'Tap the Share button ', h('span', { html: shareIcon(), 'aria-label': 'Share' }), ' (at the bottom of the screen on iPhone, at the top on iPad).'),
      h('li', {}, 'Scroll down and tap ', h('strong', {}, 'Add to Home Screen'), '.'),
      h('li', {}, 'Tap ', h('strong', {}, 'Add'), '. PAWtastic appears on your Home Screen like an app.'),
      kind === 'ios-other' ? h('li', {}, "Don't see it? Open this page in Safari and try again.") : null,
    ];
  }
  if (kind === 'android') {
    return [
      h('li', {}, 'Tap your browser menu (', h('strong', {}, '⋮'), ', usually at the top right).'),
      h('li', {}, 'Tap ', h('strong', {}, 'Add to Home screen'), ' or ', h('strong', {}, 'Install app'), '.'),
      h('li', {}, 'Tap ', h('strong', {}, 'Add'), ' or ', h('strong', {}, 'Install'), '.'),
    ];
  }
  return [
    h('li', {}, 'In Chrome or Edge, click the install icon at the right end of the address bar, then Install.'),
    h('li', {}, 'On a phone, open this page there for the easiest setup.'),
  ];
}

/** The steps sheet (or the browser's own prompt, when it offers one). */
export async function showInstall(app) {
  if (deferredPrompt) {
    const prompt = deferredPrompt;
    deferredPrompt = null;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice?.outcome === 'accepted') { installed = true; app.toast('PAWtastic is on your Home Screen!'); refresh(app); }
      return;
    } catch { /* fall back to the steps */ }
  }
  const kind = platform();
  const cloud = app.services.pay?.accounts && !app.services.pay?.signedIn;
  let sheet;
  sheet = app.modal(h('div', { class: 'stack' },
    h('h2', {}, 'Add PAWtastic to your Home Screen'),
    h('p', {}, 'Open the game with one tap, full screen, like an app.'),
    h('ol', { class: 'install-steps' }, ...steps(kind)),
    cloud && kind.startsWith('ios')
      ? h('p', { class: 'muted small' }, "Tip: the Home Screen app keeps its own progress. Tap Save progress first, then sign in again in the app to bring your pup's progress along.")
      : null,
    h('button', { class: 'btn block', type: 'button', onClick: () => sheet.close() }, 'Got it'),
  ), { label: 'Add to Home Screen' });
}

function refresh(app) {
  if (app.current === 'map') app.go('map');
}

/** The map's card, shown until the game is installed or the player says "Not now". */
export function installCard(app) {
  if (isStandalone() || dismissedRecently()) return null;
  return h('div', { class: 'card nudge-card install-card' },
    h('p', {}, 'Play like an app: add PAWtastic to your Home Screen.'),
    h('button', { class: 'btn small-btn', type: 'button', onClick: () => showInstall(app) }, 'Add'),
    h('button', { class: 'nudge-close', type: 'button', 'aria-label': 'Not now', onClick: () => { dismiss(); refresh(app); } }, '×'));
}

/** The menu item (hidden once installed). */
export function installMenuItem(app, close) {
  if (isStandalone()) return null;
  return h('button', { class: 'btn secondary block', type: 'button', onClick: () => { close(); showInstall(app); } }, 'Add to Home Screen');
}
