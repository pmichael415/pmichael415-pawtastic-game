// Real purchases on the public site: sign-in with an emailed code, Stripe Checkout, the Stripe
// customer portal for the Pup Pass, adding what was paid for, and "Report a problem".
// Only used when the local backend carries a payments client (src/net/pay-api.js).

import { h } from './dom.js';
import { confirmPurchase } from './purchase.js';
import { PACKS, STARTER_PACK, PASS, formatUsd } from '../economy/catalog.js';
import { pendingCheckout, isEmail } from '../net/pay-api.js';

export const PRODUCTS = {
  ...Object.fromEntries(PACKS.map(p => [p.id, { title: `${p.treats} Treats`, usd: p.usd, lines: [`${p.treats} Treats added to your balance`] }])),
  starter: { title: 'Starter Pack', usd: STARTER_PACK.usd, lines: [`${STARTER_PACK.treats} Treats`, '1 Shuffle, 1 Bone Bomb, 1 Bubble Blaster', 'Bandana costume'] },
  pass: { title: 'Pup Pass', usd: PASS.usd, lines: ['Unlimited lives', 'Premium rewards on all 20 tiers', `${formatUsd(PASS.usd)} every month until you cancel`] },
};

export const REFUND_POLICY = 'Unspent purchased Treats can be refunded within 7 days. Purchases made by a child or by accident can be refunded too. Tell us which purchase and we will email you back.';

const ERRORS = {
  offline: "You're offline. Try again when you're connected.",
  'signed-out': 'Please sign in again.',
  'rate-limited': 'Too many tries. Please wait a few minutes and try again.',
  server: 'Something went wrong on our side. Please try again.',
  'invalid-email': 'Enter a valid email address.',
  'wrong-code': "That code didn't work. Check your newest email from PAWtastic and try again.",
  'monthly-cap': 'That would go over the $100 monthly limit for purchases.',
  'starter-owned': 'You already have the Starter Pack.',
  'pass-active': 'Your Pup Pass is already active.',
  'unknown-product': "That isn't for sale right now.",
  'no-customer': "You haven't bought anything yet.",
};
export const payError = code => ERRORS[code] ?? ERRORS.server;

const paymentsOf = app => app.services.backend?.payments ?? null;
const standalone = () => globalThis.navigator?.standalone === true || !!globalThis.matchMedia?.('(display-mode: standalone)').matches;
// The site's server client: sign-in and cloud saves work with or without payments.
const clientOf = app => app.services.pay ?? null;
export const cloudSaves = app => !!clientOf(app)?.accounts;

// Stripe pages are https; plain http is allowed only on this computer (the test server).
function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname));
  } catch { return false; }
}
export const realPayments = app => !!paymentsOf(app);

// Shown on every real-money sheet while Stripe is in test mode.
export function testModeLabel(app) {
  return paymentsOf(app)?.mode === 'test'
    ? h('span', { class: 'demo-label' }, 'Test mode — no real charge. Card 4242 4242 4242 4242.')
    : null;
}

async function saveNow(app) {
  try { await app.services.flushSave?.(); } catch { /* the browser copy is already saved */ }
}

// Leave the game (to Stripe, or to reload once signed in) with the save sent first.
async function leave(app, go) {
  await saveNow(app);
  go();
}

/** The email-code sign-in. Resolves true once signed in. */
export function signInSheet(app, { title = 'Sign in', reason = '' } = {}) {
  const pay = clientOf(app);
  return new Promise(resolve => {
    let sheet;
    let done = false;
    let email = pay?.email ?? '';
    const finish = ok => { if (done) return; done = true; sheet?.close(); resolve(ok); };
    const box = h('div', { class: 'stack signin-sheet' });
    const note = h('p', { class: 'small', role: 'status', 'aria-live': 'polite' });

    function askEmail() {
      const input = h('input', { type: 'email', id: 'signin-email', autocomplete: 'email', inputmode: 'email', value: email, placeholder: 'you@example.com' });
      const send = h('button', { class: 'btn', type: 'submit' }, 'Email me a code');
      const form = h('form', { class: 'stack' },
        h('label', { for: 'signin-email' }, 'Your email'), input, note,
        h('div', { class: 'btn-pair' }, send, h('button', { class: 'btn secondary', type: 'button', onClick: () => finish(false) }, 'Cancel')));
      form.addEventListener('submit', async e => {
        e.preventDefault();
        email = input.value.trim();
        if (!isEmail(email)) { note.textContent = payError('invalid-email'); return; }
        send.disabled = true; note.textContent = 'Sending…';
        const res = await pay.sendCode(email);
        send.disabled = false;
        if (res.ok) askCode(); else note.textContent = payError(res.error);
      });
      box.replaceChildren(h('h2', {}, title), reason ? h('p', {}, reason) : null, form,
        h('p', { class: 'muted small' }, "No password needed. We'll email you a 6-digit code."));
      setTimeout(() => input.focus(), 50);
    }

    function askCode() {
      const input = h('input', { type: 'text', id: 'signin-code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 10, placeholder: '123456', class: 'num' });
      const go = h('button', { class: 'btn', type: 'submit' }, 'Sign in');
      note.textContent = '';
      const form = h('form', { class: 'stack' },
        h('label', { for: 'signin-code' }, '6-digit code'), input, note,
        h('div', { class: 'btn-pair' }, go, h('button', { class: 'btn secondary', type: 'button', onClick: () => finish(false) }, 'Cancel')));
      form.addEventListener('submit', async e => {
        e.preventDefault();
        go.disabled = true; note.textContent = 'Checking…';
        const res = await pay.verifyCode(email, input.value);
        go.disabled = false;
        if (res.ok) finish(true); else note.textContent = payError(res.error);
      });
      box.replaceChildren(h('h2', {}, 'Check your email'),
        h('p', {}, 'We sent an email to ', h('strong', {}, email), '. Type the 6-digit code from it here, or tap the sign-in link in the email. It can take a minute to arrive.'),
        standalone() ? h('p', { class: 'muted small' }, 'In the Home Screen app, type the code: the link in the email opens your browser instead of the app.') : null,
        form,
        h('div', { class: 'btn-pair' },
          h('button', { class: 'linkish', type: 'button', onClick: async () => { note.textContent = 'Sending a new code…'; const r = await pay.sendCode(email); note.textContent = r.ok ? 'New code sent.' : payError(r.error); } }, 'Send a new code'),
          h('button', { class: 'linkish', type: 'button', onClick: askEmail }, 'Use a different email')));
      setTimeout(() => input.focus(), 50);
    }

    askEmail();
    sheet = app.modal(box, { label: title, onClose: () => finish(false) });
  });
}

/** After signing in, reload so the saved game links to the account, then carry on with `product`. */
export async function signInThenReload(app, { product = null, reason } = {}) {
  const ok = await signInSheet(app, { reason });
  if (!ok) return false;
  if (product) pendingCheckout().set(product);
  app.toast('Signed in. Loading your account…');
  await leave(app, () => location.reload());
  return true;
}

/** Buy `product` for real: confirm, check the monthly limit, sign in if needed, then go to Stripe. */
export async function startCheckout(app, product, { confirmed = false } = {}) {
  const { backend } = app.services;
  const pay = paymentsOf(app);
  const info = PRODUCTS[product];
  if (!pay || !info) return;
  const limit = backend.spendingLimit;
  if (backend.monthSpendUsd() + info.usd > limit + 1e-9) {
    app.toast(`That would go over your monthly limit of ${formatUsd(limit)}. You can change it in the Shop.`);
    return;
  }
  if (!confirmed && !(await confirmPurchase(app, { title: info.title, usd: info.usd, lines: info.lines, real: { mode: pay.mode } }))) return;
  if (!pay.signedIn) {
    await signInThenReload(app, { product, reason: 'To buy, sign in with your email. Your purchases and progress are saved to your account, so they are never lost.' });
    return;
  }
  app.toast('Opening secure checkout…');
  const res = await pay.checkout(product);
  if (!res.ok) {
    if (res.error === 'signed-out') { await signInThenReload(app, { product, reason: 'Please sign in again to finish your purchase.' }); return; }
    app.toast(payError(res.error));
    return;
  }
  if (typeof res.url !== 'string' || !safeUrl(res.url)) { app.toast(payError('server')); return; }
  await leave(app, () => location.assign(res.url));
}

/** A checkout started before signing in, picked up after the reload. */
export async function resumePendingCheckout(app) {
  const pay = paymentsOf(app);
  if (!pay?.signedIn) return;
  const product = pendingCheckout().take();
  if (product && PRODUCTS[product]) await startCheckout(app, product, { confirmed: true });
}

/** Stripe's page for managing the Pup Pass and seeing receipts. */
export async function openPortal(app) {
  const pay = paymentsOf(app);
  if (!pay) return;
  if (!pay.signedIn) { await signInThenReload(app, { reason: 'Sign in with the email you used to buy.' }); return; }
  app.toast('Opening your account on Stripe…');
  const res = await pay.portal();
  if (!res.ok || typeof res.url !== 'string' || !safeUrl(res.url)) { app.toast(payError(res.ok ? 'server' : res.error)); return; }
  await leave(app, () => location.assign(res.url));
}

function thanksText(p) {
  if (p.product === 'pass') return 'Your Pup Pass is active.';
  return `${PRODUCTS[p.product]?.title ?? 'Your purchase'} added.`;
}

/**
 * Adds what the account says was paid (once each), takes back refunds and follows the Pup Pass
 * status. The save is sent before the server is told, so nothing is lost if the page closes.
 */
export async function syncAccount(app) {
  const { backend } = app.services;
  const pay = paymentsOf(app);
  if (!pay?.signedIn) return { ok: false, error: 'signed-out' };
  const res = await pay.account();
  if (!res.ok) return res;
  const claimed = [];
  const refunds = [];
  const added = [];
  const refunded = [];
  let passBought = false;
  for (const p of Array.isArray(res.purchases) ? res.purchases : []) {
    if (typeof p?.id !== 'string' || typeof p.product !== 'string') continue;
    if (p.status === 'refunded') {
      const r = backend.applyRefund(p.id, p.product);
      if (r.ok) { refunds.push(p.id); if (!r.duplicate && r.treats > 0) refunded.push({ ...p, treats: r.treats }); }
    } else {
      const r = backend.applyPurchase(p.id, p.product);
      if (r.ok) { claimed.push(p.id); if (!r.duplicate) { added.push(p); if (p.product === 'pass') passBought = true; } }
    }
  }
  // Right after paying, the pass row can be a moment behind the purchase: never switch off a pass just bought.
  if (res.pass && typeof res.pass.active === 'boolean' && (res.pass.active || !passBought)) backend.syncPass(res.pass);
  await saveNow(app);
  if (claimed.length || refunds.length) await pay.ack({ claimed, refunds });
  return { ok: true, added, refunded };
}

const REFRESHABLE = new Set(['map', 'shop', 'pass', 'closet']);

function announce(app, result) {
  if (!result?.ok) return;
  if (result.added.length) app.toast(`Thanks! ${result.added.map(thanksText).join(' ')}`);
  else if (result.refunded.length) app.toast(`Refund processed: ${result.refunded.reduce((n, p) => n + p.treats, 0)} Treats removed.`);
  if ((result.added.length || result.refunded.length) && REFRESHABLE.has(app.current)) app.go(app.current);
}

/**
 * Once the game is open: a sync, then (back from Stripe) waits for the payment to arrive.
 * `checkout` is 'success' | 'cancel' | null, `sessionId` Stripe's session id from the return URL.
 */
export async function afterOpen(app, { checkout = null, sessionId = null, wait = ms => new Promise(r => setTimeout(r, ms)), tries = 12, everyMs = 2500 } = {}) {
  const pay = paymentsOf(app);
  if (!pay) return;
  if (checkout === 'cancel') app.toast("Checkout cancelled. You weren't charged.");
  if (!pay.signedIn) return;
  let result = await syncAccount(app);
  announce(app, result);
  if (checkout === 'success' && !(result.ok && result.added.length)) {
    for (let i = 0; i < tries && !(result.ok && result.added.length); i++) {
      await wait(everyMs);
      result = await syncAccount(app);
    }
    if (result.ok && result.added.length) announce(app, result);
    else {
      await pay.report({ kind: 'not-delivered', message: 'Player came back from a paid Stripe checkout, but the purchase had not arrived in the game after 30 seconds.', details: { sessionId, email: pay.email } });
      let s;
      s = app.modal(h('div', { class: 'stack' },
        h('h2', {}, 'Your payment is on its way'),
        h('p', {}, 'Stripe accepted your payment, but it has not reached the game yet. It will be added automatically, usually within a few minutes, the next time you open the game.'),
        h('p', {}, "We've let PAWtastic know, so they can check on it."),
        h('button', { class: 'btn block', type: 'button', onClick: () => s.close() }, 'OK')), { label: 'Payment on its way' });
    }
  }
  if (checkout !== 'success') await resumePendingCheckout(app);
}

/** Reads ?checkout=success|cancel&session_id=… from the return URL and removes it. */
export function readCheckoutReturn(loc = location, hist = history) {
  const params = new URLSearchParams(loc.search);
  const checkout = params.get('checkout');
  if (checkout !== 'success' && checkout !== 'cancel') return { checkout: null, sessionId: null };
  const sessionId = params.get('session_id');
  params.delete('checkout'); params.delete('session_id');
  const rest = params.toString();
  try { hist.replaceState(null, '', loc.pathname + (rest ? `?${rest}` : '') + loc.hash); } catch { /* ignore */ }
  return { checkout, sessionId };
}

/** "Report a problem" (and refund requests): emailed to PAWtastic. */
export function reportSheet(app, { kind = 'problem', title = 'Report a problem', intro = 'Something not working? Tell us what happened and we will look into it.', details = null, requireMessage = true } = {}) {
  const pay = app.services.pay;
  if (!pay) return;
  let sheet;
  const text = h('textarea', { id: 'report-text', rows: 5, maxlength: 2000, placeholder: 'What happened?' });
  const email = h('input', { type: 'email', id: 'report-email', autocomplete: 'email', value: pay.email ?? '', placeholder: 'you@example.com' });
  const note = h('p', { class: 'small', role: 'status', 'aria-live': 'polite' });
  const send = h('button', { class: 'btn', type: 'submit' }, 'Send');
  const form = h('form', { class: 'stack' },
    h('label', { for: 'report-text' }, requireMessage ? 'What happened?' : 'Anything to add? (optional)'), text,
    h('label', { for: 'report-email' }, 'Your email, so we can reply (optional)'), email,
    note,
    h('div', { class: 'btn-pair' }, send, h('button', { class: 'btn secondary', type: 'button', onClick: () => sheet.close() }, 'Cancel')));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const message = text.value.trim() || (requireMessage ? '' : title);
    if (!message) { note.textContent = 'Please tell us what happened.'; return; }
    if (email.value.trim() && !isEmail(email.value)) { note.textContent = payError('invalid-email'); return; }
    send.disabled = true; note.textContent = 'Sending…';
    const res = await pay.report({ kind, message, email: email.value.trim() || undefined, details: { ...(details ?? {}), page: app.current } });
    send.disabled = false;
    if (res.ok) { sheet.close(); app.toast('Sent to PAWtastic. Thank you!'); } else note.textContent = payError(res.error);
  });
  sheet = app.modal(h('div', { class: 'stack' }, h('h2', {}, title), h('p', {}, intro), form), { label: title });
}

const SAVE_REASON = "Sign in with your email to save your pup's progress to the cloud. Play on any phone, tablet or computer and never lose your progress.";
const SAVE_REASON_PAID = "Sign in with your email to save your pup's progress to the cloud and get back anything you bought, on any device.";
export const saveReason = app => (paymentsOf(app) ? SAVE_REASON_PAID : SAVE_REASON);

/** The account part of the sound menu on the public site. */
export function accountMenu(app, close) {
  const pay = app.services.pay;
  if (!pay) return null;
  const go = fn => () => { close(); fn(); };
  const items = [];
  if (pay.accounts) {
    items.push(h('h3', { class: 'eyebrow' }, 'Account'));
    if (pay.signedIn) {
      items.push(h('p', { class: 'small muted' }, `Signed in as ${pay.email ?? 'your account'}. Your progress is saved to the cloud.`),
        pay.payments ? h('button', { class: 'btn secondary block', type: 'button', onClick: go(() => openPortal(app)) }, 'Manage Pup Pass & receipts') : null,
        h('button', { class: 'btn secondary block', type: 'button', onClick: go(async () => { await saveNow(app); await pay.signOut(); location.reload(); }) }, 'Sign out'));
    } else {
      items.push(h('button', { class: 'btn secondary block', type: 'button', onClick: go(() => signInThenReload(app, { reason: saveReason(app) })) }, 'Save progress to the cloud'));
    }
  }
  items.push(h('button', { class: 'btn secondary block', type: 'button', onClick: go(() => reportSheet(app)) }, 'Report a problem'));
  return h('div', { class: 'stack account' }, ...items);
}

const CLOUD_DISMISS_KEY = 'pawtastic-gd-cloud-dismissed-v1';
const cloudDismissed = () => { try { return Date.now() - Number(localStorage.getItem(CLOUD_DISMISS_KEY)) < 7 * 86400000; } catch { return false; } };

/** The map's nudge for players not signed in: save progress to the cloud (× hides it for a week). */
export function cloudSaveCard(app) {
  const pay = clientOf(app);
  if (!pay?.accounts || pay.signedIn || cloudDismissed()) return null;
  return h('div', { class: 'card nudge-card cloud-card' },
    h('p', {}, "Save your pup's progress to the cloud, so you never lose it."),
    h('button', { class: 'btn small-btn', type: 'button', onClick: () => signInThenReload(app, { reason: saveReason(app) }) }, 'Save progress'),
    h('button', { class: 'nudge-close', type: 'button', 'aria-label': 'Not now', onClick: () => {
      try { localStorage.setItem(CLOUD_DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
      if (app.current === 'map') app.go('map');
    } }, '×'));
}
