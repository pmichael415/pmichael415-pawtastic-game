// Invite a friend (the public site). Each signed-in player has a friend code. A new PAWtastic client
// who shows it at their first visit gets $10 off; once that visit is done, the player who shared gets
// a free bath. The front desk records both on the staff page (/staff/index.html).
// In-game rewards too (owner, 10 Nov 2026, replacing "nothing in the game is paid for sharing"): a friend who
// joins the leaderboard through a friend's link gets 20 Treats, and so does the friend who invited them, for up
// to 5 friends a season. The server decides (POST /api/public/game/invite) and delivers the Treats to both saves.

import { h, fill } from './dom.js';
import { gameLink } from '../net/embed.js';
import { clientOf, signInSheet, payError, leave, syncAccount } from './payments.js';
import { FRIEND_CODE as CODE, normalizeCode } from '../net/friend-code.js';

export { normalizeCode };

export const OFFER = { friend: '$10 off', friendLong: '$10 off their first visit', reward: 'a free bath' };
const REF_KEY = 'pawtastic-gd-ref-v1';
const OPEN_INVITE_KEY = 'pawtastic-gd-open-invite-v1';
const BATHS_SEEN_KEY = 'pawtastic-gd-baths-seen-v1';
const MY_CODE_KEY = 'pawtastic-gd-my-code-v1';
const INVITE_SENT_KEY = 'pawtastic-gd-invite-sent-v1';
export const INVITE_REWARD_TEXT = 'Join the leaderboard and you both get 20 Treats.';
/** The 20-Treats line for a friend's code, unless the server said the inviter has had their 5 friends this season. */
export const friendRewardLine = ref => (ref?.code && ref.invitesOpen !== false ? INVITE_REWARD_TEXT : null);
const OFFER_DISMISS_DAYS = 14;
const BOOK_URL = 'https://pawtasticacademy.com/';

const read = (key, store = globalThis.localStorage) => { try { return JSON.parse(store?.getItem(key) ?? 'null'); } catch { return null; } };
const write = (key, value, store = globalThis.localStorage) => { try { if (value === null) store?.removeItem(key); else store?.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } };

/** Call once at startup: keeps a friend code from an invite link (?ref=CODE) and tidies the address. */
export function captureReferral(loc = globalThis.location, hist = globalThis.history) {
  try {
    const params = new URLSearchParams(loc.search);
    if (!params.has('ref')) return null;
    const code = normalizeCode(params.get('ref'));
    params.delete('ref');
    const rest = params.toString();
    hist?.replaceState(null, '', loc.pathname + (rest ? `?${rest}` : '') + loc.hash);
    if (!code) return null;
    const had = read(REF_KEY);
    if (had?.code !== code) write(REF_KEY, { code, verified: false, at: Date.now() });
    return code;
  } catch { return null; }
}

/** The friend offer this player was invited with, once the server has confirmed the code. */
export function friendOffer() {
  const ref = read(REF_KEY);
  return ref?.verified && CODE.test(ref.code) ? ref : null;
}

function inviteLink(code) {
  return gameLink(code ? `ref=${code}` : '');
}

/** For share cards: the invite link, with the player's friend code once they have one. */
export function shareLink() {
  const mine = read(MY_CODE_KEY);
  const code = CODE.test(mine ?? '') ? mine : null;
  return { url: inviteLink(code), code };
}

// Modals wait for the map with no other sheet open (daily rewards, area intros), so they never stack
// on another sheet or cover the start screen and the dog setup.
export async function onMap(app, timeoutMs = 180000) {
  const free = () => app.current === 'map' && !document.querySelector('.overlay');
  let calm = 0;
  for (let t = 0; t < timeoutMs; t += 250) {
    calm = free() ? calm + 250 : 0;
    if (calm >= 1000) return true;
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}

const codeBox = code => h('p', { class: 'friend-code num', 'aria-label': `Code ${code.split('').join(' ')}` }, code);

/** The friend's side: what the code gets them and how to use it. */
export function showFriendOffer(app) {
  const ref = friendOffer();
  if (!ref) return;
  let sheet;
  sheet = app.modal(h('div', { class: 'stack invite-sheet' },
    h('p', { class: 'eyebrow' }, 'A friend invited you'),
    h('h2', {}, `${OFFER.friend} your first PAWtastic visit`),
    h('p', {}, 'New to PAWtastic Academy? Daycare, boarding or grooming in Hawthorne or Hillsdale: show this code at the front desk on your first visit and get $10 off.'),
    codeBox(ref.code),
    h('p', { class: 'muted small' }, 'New clients only, one per new client. Staff confirm the offer at the front desk. You can find this code again in the menu (the speaker button).'),
    friendRewardLine(read(REF_KEY)) ? h('p', { class: 'invite-treats' }, h('strong', {}, 'In the game: '), INVITE_REWARD_TEXT) : null,
    h('a', { class: 'btn block', href: BOOK_URL, target: '_blank', rel: 'noopener' }, 'Visit PAWtastic Academy'),
    h('button', { class: 'btn secondary block', type: 'button', onClick: () => sheet.close() }, 'Play the game'),
  ), { label: 'Friend offer' });
}

function offerDismissed() {
  const at = Number(read(REF_KEY)?.dismissedAt);
  return at > 0 && Date.now() - at < OFFER_DISMISS_DAYS * 86400000;
}

/** The map's banner for an invited player (shown before the other banners). */
export function friendOfferCard(app) {
  const ref = friendOffer();
  if (!ref || offerDismissed()) return null;
  return h('div', { class: 'card nudge-card friend-card' },
    h('p', {}, `Friend offer: ${OFFER.friend} your first PAWtastic visit.`),
    h('button', { class: 'btn small-btn', type: 'button', onClick: () => showFriendOffer(app) }, 'See code'),
    h('button', { class: 'nudge-close', type: 'button', 'aria-label': 'Hide for now', onClick: () => { write(REF_KEY, { ...read(REF_KEY), dismissedAt: Date.now() }); if (app.current === 'map') app.go('map'); } }, '×'));
}

/** After the game opens: confirm an invite link's code with the server (and drop the player's own). */
export async function confirmFriendCode(app) {
  const pay = clientOf(app);
  const ref = read(REF_KEY);
  if (!pay || !ref?.code || ref.verified) return;
  const res = await pay.checkReferral(ref.code);
  if (!res.ok) return; // offline: try again next time
  if (!res.valid || res.own) { write(REF_KEY, null); return; }
  write(REF_KEY, { ...ref, verified: true, invitesOpen: res.invitesOpen !== false });
  if (!(await onMap(app))) return;
  app.go('map', { skipIntro: true });
  showFriendOffer(app);
}

async function share(app, { code, text }) {
  const url = inviteLink(code);
  const data = { title: 'PAWtastic Academy: Graduation Day', text, url };
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try { await navigator.share(data); app.services.measure?.track('share', { kind: 'invite', how: 'share-sheet' }); return; } catch (err) { if (err?.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(`${text} ${url}`); app.toast('Invite link copied. Paste it in a text or email.'); app.services.measure?.track('share', { kind: 'invite', how: 'copied' }); }
  catch { app.toast(`Send this link to your friends: ${url}`); }
}

const shareText = code => code
  ? `Play PAWtastic Academy: Graduation Day with me! New PAWtastic clients get $10 off their first visit with my code ${code}.`
  : 'Play PAWtastic Academy: Graduation Day with me! A free match-3 game from PAWtastic Academy.';

/** The sharer's side: their code, the share button and the free baths they've earned. */
export async function showInvite(app) {
  const pay = clientOf(app);
  const dog = app.services.backend.state().dog?.name ?? 'your pup';
  const box = h('div', { class: 'stack invite-sheet' }, h('p', { class: 'muted' }, 'Loading your friend code…'));
  let sheet;
  sheet = app.modal(box, { label: 'Invite friends' });
  const close = () => sheet.close();
  const how = h('ol', { class: 'install-steps' },
    h('li', {}, 'Share your invite. Friends who are new to PAWtastic get ', h('strong', {}, OFFER.friendLong), '.'),
    h('li', {}, 'They show your code at the front desk on their first visit.'),
    h('li', {}, 'After that visit, ', h('strong', {}, `${dog} gets a free bath`), '. One free bath for every new client you send.'));
  const terms = h('button', { class: 'linkish', type: 'button', onClick: () => { close(); app.go('rules'); } }, 'Offer terms');

  if (!pay?.accounts) {
    fill(box, h('h2', {}, 'Invite friends'), h('p', {}, 'Share PAWtastic Academy: Graduation Day with friends.'),
      h('button', { class: 'btn block', type: 'button', onClick: () => share(app, { code: null, text: shareText(null) }) }, 'Share the game'),
      h('button', { class: 'btn secondary block', type: 'button', onClick: close }, 'Done'));
    return;
  }
  if (!pay.signedIn) {
    fill(box, 
      h('p', { class: 'eyebrow' }, 'Invite friends'),
      h('h2', {}, `Give $10 off. Get ${OFFER.reward}.`), how,
      h('p', {}, 'To get credit for your friends, save your progress with your email first. It takes a minute, and your pup is never lost.'),
      h('button', { class: 'btn block', type: 'button', onClick: async () => {
        close();
        const ok = await signInSheet(app, { title: 'Save progress', reason: 'Sign in with your email to get your friend code. Your progress is saved to the cloud too.' });
        if (!ok) return;
        try { sessionStorage.setItem(OPEN_INVITE_KEY, '1'); } catch { /* ignore */ }
        app.toast('Signed in. Getting your friend code…');
        await leave(app, () => location.reload());
      } }, 'Save progress & get my code'),
      h('button', { class: 'btn secondary block', type: 'button', onClick: () => share(app, { code: null, text: shareText(null) }) }, 'Share without a code'),
      terms);
    return;
  }
  const res = await pay.referral();
  if (!res.ok || !CODE.test(res.code ?? '')) {
    fill(box, h('h2', {}, 'Invite friends'), h('p', {}, payError(res.error ?? 'server')),
      h('button', { class: 'btn secondary block', type: 'button', onClick: close }, 'OK'));
    return;
  }
  write(BATHS_SEEN_KEY, Math.max(Number(read(BATHS_SEEN_KEY)) || 0, res.friends ?? 0));
  write(MY_CODE_KEY, res.code);
  const waiting = res.bathsWaiting ?? 0;
  fill(box, 
    h('p', { class: 'eyebrow' }, 'Invite friends'),
    h('h2', {}, `Give $10 off. Get ${OFFER.reward}.`),
    h('p', {}, 'Your friend code'),
    codeBox(res.code),
    h('button', { class: 'btn gold block', type: 'button', onClick: () => share(app, { code: res.code, text: shareText(res.code) }) }, 'Share my invite'),
    waiting > 0
      ? h('div', { class: 'card bath-card' },
        h('p', {}, h('strong', {}, `${waiting} free ${waiting === 1 ? 'bath' : 'baths'} waiting for ${dog}!`)),
        h('p', { class: 'small' }, 'Show this code at the PAWtastic front desk to get it.'))
      : null,
    h('p', { class: 'small num' }, `Friends who visited: ${res.friends ?? 0} · Free baths given: ${res.bathsGiven ?? 0}`),
    Number.isFinite(res.cap) ? h('p', { class: 'small num invite-joined' }, `${res.joined ?? 0} of ${res.cap} friends joined this season · +${res.reward ?? 20} Treats each`) : null,
    how, terms,
    h('button', { class: 'btn secondary block', type: 'button', onClick: close }, 'Done'));
}

/** After opening (signed in): reopen the invite after sign-in, and tell the player about new free baths. */
export async function referralNews(app) {
  const pay = clientOf(app);
  if (!pay?.signedIn) return;
  let reopen = false;
  try { reopen = sessionStorage.getItem(OPEN_INVITE_KEY) === '1'; sessionStorage.removeItem(OPEN_INVITE_KEY); } catch { /* ignore */ }
  if (reopen) { if (await onMap(app)) await showInvite(app); return; }
  const res = await pay.referral();
  if (!res.ok) return;
  if (CODE.test(res.code ?? '')) write(MY_CODE_KEY, res.code);
  if (!(await onMap(app))) return;
  const seen = Number(read(BATHS_SEEN_KEY)) || 0;
  if ((res.friends ?? 0) > seen && (res.bathsWaiting ?? 0) > 0) {
    write(BATHS_SEEN_KEY, res.friends);
    const dog = app.services.backend.state().dog?.name ?? 'Your pup';
    let s;
    s = app.modal(h('div', { class: 'stack invite-sheet' },
      h('p', { class: 'eyebrow' }, 'Thanks for the referral!'),
      h('h2', {}, `${dog} earned a free bath!`),
      h('p', {}, 'A friend you invited came to PAWtastic for their first visit. Show your friend code at the front desk to get the free bath.'),
      codeBox(res.code),
      h('button', { class: 'btn block', type: 'button', onClick: () => s.close() }, 'Yay!')), { label: 'Free bath earned' });
  } else if ((res.friends ?? 0) > seen) {
    write(BATHS_SEEN_KEY, res.friends);
  }
}

/** Menu items: the invite, and (for an invited player) their friend offer. */
export function referralMenuItems(app, close) {
  return [
    h('button', { class: 'btn secondary block', type: 'button', onClick: () => { close(); showInvite(app); } }, 'Invite friends (free bath for you)'),
    friendOffer() ? h('button', { class: 'btn secondary block', type: 'button', onClick: () => { close(); showFriendOffer(app); } }, 'My $10 off code') : null,
  ];
}

/**
 * What a friend sees once the server has answered their invite: one calm message, and whether to stop trying.
 * A network or sign-in failure is retried on a later run; every real answer is final (never a loop of errors).
 */
export function inviteMessage(res) {
  if (res?.ok) return { text: "Welcome! 20 Treats from your friend's invite are on their way.", done: true, joined: true };
  if (res?.error === 'not-new') return { text: 'Invite rewards are for new players. Have fun!', done: true, joined: false };
  if (['own-code', 'already-invited', 'unknown-code', 'not-on-board'].includes(res?.error)) return { text: null, done: true, joined: false };
  return { text: null, done: false, joined: false };
}

/** After the player's first run reaches the leaderboard: tell the server once that they came through a friend's link. */
export async function sendInviteOnce(app) {
  const pay = clientOf(app);
  const ref = read(REF_KEY);
  if (!pay?.signedIn || typeof pay.invite !== 'function' || !CODE.test(ref?.code ?? '') || read(INVITE_SENT_KEY)) return null;
  const res = await pay.invite(ref.code).catch(() => ({ ok: false, error: 'offline' }));
  const m = inviteMessage(res);
  if (m.done) write(INVITE_SENT_KEY, { code: ref.code, at: Date.now(), joined: m.joined });
  if (m.joined) app.services.measure?.track('invite_joined', {});
  if (m.text) app.toast(m.text);
  if (m.joined) await syncAccount(app).catch(() => null); // the 20 Treats arrive now, claimed like a purchase
  return res;
}
