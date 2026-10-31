// iPhone and iPad: the email's sign-in link always opens Safari, and an app added to the Home Screen
// keeps its own storage, so it can't see that sign-in. Safari (signed in) shows a 6-digit code; the
// player types it in the Home Screen app's "Check your email" box, which signs the app in too.

import { h, fill } from './dom.js';
import { clientOf, payError } from './payments.js';
import { isStandalone, platform } from './install.js';
import { onMap } from './referral.js';

const onIPhone = () => platform().startsWith('ios');

/** Shows a fresh code for the Home Screen app. */
export async function showAppCode(app, { landed = false } = {}) {
  const pay = clientOf(app);
  if (!pay?.signedIn) return;
  const box = h('div', { class: 'stack app-code' }, h('p', { class: 'muted' }, 'Getting your code…'));
  let sheet;
  sheet = app.modal(box, { label: 'Sign in your Home Screen app' });
  const res = await pay.appSigninCode();
  if (!res.ok || !/^\d{6}$/.test(res.code ?? '')) {
    fill(box, h('h2', {}, 'Sign in your Home Screen app'), h('p', {}, payError(res.error ?? 'server')),
      h('button', { class: 'btn block', type: 'button', onClick: () => sheet.close() }, 'OK'));
    return;
  }
  fill(box,
    h('p', { class: 'eyebrow' }, landed ? "You're signed in" : 'Home Screen app'),
    h('h2', {}, 'Playing from your Home Screen?'),
    h('p', {}, 'Open the PAWtastic app on your Home Screen and type this code in the "Check your email" box:'),
    h('p', { class: 'friend-code num', 'aria-label': `Code ${res.code.split('').join(' ')}` }, res.code),
    h('p', { class: 'muted small' }, `The code works once, for ${res.minutes ?? 10} minutes. Your purchases and progress are on your account, so they show up in the app too.`),
    h('button', { class: 'btn block', type: 'button', onClick: () => sheet.close() }, landed ? 'Keep playing here' : 'Done'));
}

/** After the email's sign-in link opens the game in Safari on an iPhone: offer the code for the app. */
export async function offerAppCode(app) {
  const pay = clientOf(app);
  if (!pay?.landedFromLink || !pay.signedIn || isStandalone() || !onIPhone()) return;
  if (await onMap(app)) await showAppCode(app, { landed: true });
}

/** Menu item (iPhone browser, signed in): get a code for the Home Screen app any time. */
export function appCodeMenuItem(app, close) {
  const pay = clientOf(app);
  if (!pay?.signedIn || isStandalone() || !onIPhone()) return null;
  return h('button', { class: 'btn secondary block', type: 'button', onClick: () => { close(); showAppCode(app); } }, 'Sign in my Home Screen app');
}
