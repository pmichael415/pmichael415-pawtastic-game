// The front desk's referral page (/staff/index.html). Staff sign in with a PAWtastic staff email,
// look up a friend code, record a new client's first visit ($10 off) and mark free baths given.
// Same sign-in as the game: the session is shared, so signing in on either page signs in both.

import { h, fill } from '../ui/dom.js';
import { openPayments, isEmail } from '../net/pay-api.js';
import { normalizeCode } from '../net/friend-code.js';

const root = document.getElementById('staff');
const ERR = {
  offline: "Can't reach the server. Check the internet connection and try again.",
  'signed-out': 'Please sign in again.',
  'not-staff': "This email isn't on the PAWtastic staff list.",
  'unknown-code': "That code doesn't match any player. Check the letters and try again.",
  duplicate: 'This new client is already recorded for this code.',
  'no-bath-waiting': 'That free bath was already marked as given.',
  'already-undone': 'That record was already undone.',
  'rate-limited': 'Too many tries. Wait a minute and try again.',
  'invalid-email': 'Please enter a valid email address.',
  'not-redeemable': 'This prize was already used, voided or has expired.',
  'already-void': 'This prize was already voided.',
  'wrong-code': "That code didn't work. Check the email and try again.",
};
const errText = e => ERR[e] ?? 'Something went wrong. Please try again.';
const when = iso => { try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } };
const STATUS = { earned: 'Free bath waiting', 'bath-given': 'Bath given', void: 'Undone' };
const place = l => (l === 'hawthorne' ? 'Hawthorne' : l === 'hillsdale' ? 'Hillsdale' : '');

let pay = null;
const LOC = { hawthorne: 'Hawthorne', hillsdale: 'Hillsdale' };
const REWARD = { 'daycare-day': 'Free day of daycare', bath: 'Free bath' };
const rewardOf = p => p.label || REWARD[p.reward] || p.reward;
const PRIZE_STATUS = { won: 'Not used yet', redeemed: 'Redeemed', void: 'Voided', expired: 'Expired' };

function prizeBox(p, after) {
  const actions = [];
  if (p.status === 'won') actions.push(h('button', { class: 'btn', type: 'button', onClick: async () => {
    if (!confirm(`Give ${p.dogName} the ${rewardOf(p).toLowerCase()} now and mark the prize redeemed?`)) return;
    const res = await pay.staffPrizeAction({ action: 'redeem', id: p.id });
    if (!res.ok) { alert(errText(res.error)); return; }
    after(res.prize);
  } }, 'Mark redeemed'));
  if (p.status !== 'void') actions.push(h('button', { class: 'link', type: 'button', onClick: async () => {
    if (!confirm('Void this prize? Use this only for cheating or a mistake.')) return;
    const res = await pay.staffPrizeAction({ action: 'void', id: p.id });
    if (!res.ok) { alert(errText(res.error)); return; }
    after(res.prize);
  } }, 'Void'));
  return h('div', { class: 'card stack' },
    h('p', { class: 'eyebrow' }, 'Weekly Challenge prize'),
    h('p', { class: 'code' }, p.code),
    h('p', { class: 'big' }, `${rewardOf(p)} for ${p.dogName}`),
    h('p', {}, `#${p.rank} at ${LOC[p.location] ?? p.location}, week of ${p.week} · player ${p.email || 'unknown'}`),
    h('p', {}, h('span', { class: `tag ${p.status === 'won' ? 'earned' : p.status === 'redeemed' ? 'bath-given' : ''}` }, PRIZE_STATUS[p.status] ?? p.status),
      p.status === 'won' ? ` · use by ${when(p.expiresAt)}` : p.redeemedAt ? ` · ${when(p.redeemedAt)} by ${p.redeemedBy ?? ''}` : ''),
    p.status === 'won' ? h('p', { class: 'muted' }, "One dog. New clients complete the usual evaluation and paperwork first. Prize can't be exchanged for cash.") : null,
    actions.length ? h('div', { class: 'row-side' }, ...actions) : null);
}

function screen(...children) {
  fill(root, h('header', { class: 'top' },
    h('img', { src: '/apple-touch-icon.png', alt: '', width: 44, height: 44 }),
    h('div', {}, h('p', { class: 'eyebrow' }, 'PAWtastic Academy'), h('h1', {}, 'Referral desk')),
    pay?.signedIn ? h('button', { class: 'link', type: 'button', onClick: async () => { await pay.signOut(); signIn(); } }, 'Sign out') : null),
  ...children);
}

function signIn(message = '') {
  let email = pay?.email ?? '';
  const note = h('p', { class: 'note', role: 'status' }, message);
  const input = h('input', { type: 'email', id: 'email', autocomplete: 'email', value: email, placeholder: 'info@pawtasticacademy.com' });
  const send = h('button', { class: 'btn', type: 'submit' }, 'Email me a sign-in code');
  const form = h('form', { class: 'card stack' }, h('h2', {}, 'Staff sign-in'),
    h('label', { for: 'email' }, 'Staff email'), input, note, send);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    email = input.value.trim();
    if (!isEmail(email)) { note.textContent = errText('invalid-email'); return; }
    send.disabled = true; note.textContent = 'Sending…';
    const r = await pay.sendCode(email);
    send.disabled = false;
    if (!r.ok) { note.textContent = errText(r.error); return; }
    askCode(email);
  });
  screen(form);
}

function askCode(email) {
  const note = h('p', { class: 'note', role: 'status' });
  const input = h('input', { type: 'text', id: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 10, placeholder: '123456' });
  const go = h('button', { class: 'btn', type: 'submit' }, 'Sign in');
  const form = h('form', { class: 'card stack' }, h('h2', {}, 'Check your email'),
    h('p', {}, 'We sent an email to ', h('strong', {}, email), '. Type the code from it, or open the sign-in link in it and then come back to this page.'),
    h('label', { for: 'code' }, 'Code'), input, note, go,
    h('button', { class: 'link', type: 'button', onClick: () => signIn() }, 'Use a different email'));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    go.disabled = true; note.textContent = 'Checking…';
    const r = await pay.verifyCode(email, input.value);
    go.disabled = false;
    if (r.ok) home(); else note.textContent = errText(r.error);
  });
  screen(form);
  // Signed in from the email link in another tab: pick the session up when this tab comes back.
  const back = () => { if (document.visibilityState === 'visible') location.reload(); };
  document.addEventListener('visibilitychange', back, { once: true });
}

function referralRow(r, onChange) {
  const actions = [];
  if (r.status === 'earned') actions.push(h('button', { class: 'btn small', type: 'button', onClick: () => onChange('bath', r) }, 'Bath given'));
  if (r.status !== 'void') actions.push(h('button', { class: 'link', type: 'button', onClick: () => onChange('void', r) }, 'Undo'));
  return h('li', { class: `row ${r.status}` },
    h('div', {},
      h('strong', {}, r.friend_name), r.friend_dog ? ` · ${r.friend_dog}` : '',
      h('p', { class: 'muted' }, [`First visit ${when(r.created_at)}`, place(r.location), r.referrer ? `Code ${r.code} (${r.referrer})` : null, r.bath_given_at ? `Bath given ${when(r.bath_given_at)}` : null].filter(Boolean).join(' · ')),
      r.note ? h('p', { class: 'muted' }, r.note) : null),
    h('div', { class: 'row-side' }, h('span', { class: `tag ${r.status}` }, STATUS[r.status] ?? r.status), ...actions));
}

async function change(action, r, after) {
  const question = action === 'bath'
    ? `Mark the free bath for ${r.friend_name}'s referral as given?`
    : `Undo the record for ${r.friend_name}? Use this only for a mistake.`;
  if (!confirm(question)) return;
  const res = await pay.staffAction({ action, id: r.id });
  if (!res.ok) { alert(errText(res.error)); return; }
  after(res);
}

function showCode(found, area) {
  const note = h('p', { class: 'note', role: 'status' });
  const name = h('input', { id: 'friend', maxlength: 120, autocomplete: 'off', required: true });
  const dog = h('input', { id: 'dog', maxlength: 120, autocomplete: 'off' });
  const where = h('select', { id: 'where' }, h('option', { value: '' }, 'Location'), h('option', { value: 'hawthorne' }, 'Hawthorne'), h('option', { value: 'hillsdale' }, 'Hillsdale'));
  const memo = h('input', { id: 'memo', maxlength: 500, autocomplete: 'off', placeholder: 'Optional' });
  const save = h('button', { class: 'btn', type: 'submit' }, 'Record first visit ($10 off given)');
  const form = h('form', { class: 'card stack' },
    h('h3', {}, 'New client using this code'),
    h('p', { class: 'muted' }, 'At the new client\'s first visit: give $10 off in the register, then record it here. That earns the player a free bath.'),
    h('label', { for: 'friend' }, "New client's name"), name,
    h('label', { for: 'dog' }, "Their dog's name"), dog,
    h('label', { for: 'where' }, 'Location'), where,
    h('label', { for: 'memo' }, 'Note'), memo, note, save);
  async function submit(allowDuplicate) {
    save.disabled = true; note.textContent = 'Saving…';
    const res = await pay.staffAction({
      action: 'record', code: found.code, friendName: name.value.trim(),
      ...(dog.value.trim() ? { friendDog: dog.value.trim() } : {}),
      ...(where.value ? { location: where.value } : {}),
      ...(memo.value.trim() ? { note: memo.value.trim() } : {}),
      ...(allowDuplicate ? { allowDuplicate: true } : {}),
    });
    save.disabled = false;
    if (res.ok) { showCode(res, area); area.prepend(h('p', { class: 'card ok' }, 'Recorded. The player now has a free bath waiting.')); return; }
    if (res.error === 'duplicate' && confirm(`${errText('duplicate')} Record it again anyway?`)) { submit(true); return; }
    note.textContent = errText(res.error);
  }
  form.addEventListener('submit', e => { e.preventDefault(); if (name.value.trim()) submit(false); });
  const after = res => showCode(res, area);
  fill(area, 
    h('div', { class: 'card stack' },
      h('p', { class: 'code' }, found.code),
      h('p', {}, 'Player: ', h('strong', {}, found.email || 'unknown email'), found.since ? ` · playing since ${when(found.since)}` : ''),
      h('p', { class: 'big' }, `Free baths waiting: ${found.bathsWaiting} · Given: ${found.bathsGiven} · Friends who visited: ${found.friends}`),
      found.bathsWaiting > 0 ? h('p', { class: 'muted' }, 'When this player\'s dog gets the free bath, tap "Bath given" on one of the friends below.') : null,
      found.referrals.length ? h('ul', { class: 'list' }, found.referrals.map(r => referralRow(r, (a, row) => change(a, row, after)))) : h('p', { class: 'muted' }, 'No friends recorded for this code yet.')),
    form);
}

// ---------- Owner report (measurement) ----------
const usd = cents => `$${(Number(cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const n = v => Number(v || 0).toLocaleString('en-US');
const PRODUCT = { pack55: '55 Treats', pack100: '100 Treats', pack220: '220 Treats', pack480: '480 Treats', starter: 'Starter Pack', pass: 'Pup Pass' };
const EVENT_LABEL = {
  opened: 'Opened the game', first_play_started: 'Played a first level', first_play_completed: 'Finished a first level', replay: 'Replayed a level',
  shop_viewed: 'Visited the Shop', product_previewed: 'Looked at a price', checkout_started: 'Went to Stripe Checkout', checkout_failed: 'Checkout could not start',
  purchase_arrived: 'Purchase arrived in the game', purchase_waiting: 'Paid, purchase still on its way', share: 'Shared a card or invite', challenge_link_visit: 'Came from a shared link',
};
const ratio = (a, b) => (Number(b) > 0 ? `${Math.round((Number(a) / Number(b)) * 100)}%` : '—');
const plural = (v, one, many) => `${n(v)} ${Number(v) === 1 ? one : many}`;

function reportBody(r) {
  if (!r.available) {
    return h('div', { class: 'stack' },
      h('p', {}, h('span', { class: 'tag' }, 'Not available yet')),
      h('p', { class: 'muted' }, 'The owner report needs database update 0010 (game measurement) applied to the game\'s database. Until then nothing is counted here, and the game keeps working as before. Purchases are still recorded by Stripe and the server as usual.'));
  }
  const d = r.devices ?? {}; const ev = r.events ?? {}; const pu = r.purchases ?? {}; const pass = r.pass ?? {}; const pr = r.problems ?? {}; const pz = r.prizes ?? {};
  const count = name => Number(ev[name]?.devices ?? 0);
  const stat = (label, value, note) => h('div', { class: 'stat' }, h('p', { class: 'big' }, value), h('p', { class: 'muted' }, label, note ? h('span', { class: 'muted' }, ` · ${note}`) : null));
  const net = Number(pu.gross_cents || 0) - Number(pu.refund_cents || 0);
  return h('div', { class: 'stack' },
    h('p', { class: 'muted' }, `${r.from} to ${r.to} · ${r.mode === 'live' ? 'live payments only' : 'TEST MODE — not real money'} · counts are devices, never people`),
    h('h3', {}, 'Money (verified Stripe payments)'),
    h('div', { class: 'stats' },
      stat('Paid, after refunds', usd(net), plural(pu.paid_count, 'payment', 'payments')),
      stat('Refunded', usd(pu.refund_cents), plural(pu.refund_count, 'refund', 'refunds')),
      stat('Buyers', n(pu.buyers), 'distinct accounts'),
      stat('Pup Pass active', n(pass.active), pass.ending ? `${n(pass.ending)} ending` : 'none ending'),
      stat('All-time paid', usd(pu.all_time_gross_cents), 'before refunds')),
    Array.isArray(pu.by_product) && pu.by_product.length
      ? h('ul', { class: 'list' }, pu.by_product.map(x => h('li', { class: 'row' }, h('div', {}, h('strong', {}, PRODUCT[x.product] ?? x.product), h('p', { class: 'muted' }, `${n(x.count)} × ${x.kind === 'subscription' ? 'monthly' : 'one-off'}`)), h('div', { class: 'row-side' }, usd(x.cents)))))
      : h('p', { class: 'muted' }, 'No verified payments in this period.'),
    h('h3', {}, 'Players'),
    h('div', { class: 'stats' },
      stat('Devices that played', n(d.active)),
      stat('New devices', n(d.new)),
      stat('Came back (2+ days)', n(d.returning), ratio(d.returning, d.active)),
      stat('Opened → first level', ratio(count('first_play_started'), count('opened')), `${n(count('first_play_started'))} devices`),
      stat('Shop visitors', n(count('shop_viewed')), `${ratio(count('shop_viewed'), count('opened'))} of openers`),
      stat('Checkout starts', n(count('checkout_started')), `${ratio(count('checkout_started'), count('shop_viewed'))} of shop visitors`)),
    h('h3', {}, 'What players did'),
    Object.keys(ev).length
      ? h('ul', { class: 'list' }, Object.keys(EVENT_LABEL).filter(k => ev[k]).map(k => h('li', { class: 'row' }, h('div', {}, h('strong', {}, EVENT_LABEL[k])), h('div', { class: 'row-side' }, `${n(ev[k].devices)} devices · ${n(ev[k].count)} times`))))
      : h('p', { class: 'muted' }, 'No events recorded yet. The game starts sending them once this update is live.'),
    h('h3', {}, 'Watch list'),
    h('ul', { class: 'list' },
      h('li', { class: `row${Number(pu.unclaimed) ? ' earned' : ''}` }, h('div', {}, h('strong', {}, 'Paid but not delivered after 1 hour'), h('p', { class: 'muted' }, 'Stripe took the money, the game has not added it. Email the player.')), h('div', { class: 'row-side' }, n(pu.unclaimed))),
      h('li', { class: 'row' }, h('div', {}, h('strong', {}, 'Players who reported a purchase on its way')), h('div', { class: 'row-side' }, n(pr.not_delivered))),
      h('li', { class: 'row' }, h('div', {}, h('strong', {}, 'Problem and refund reports')), h('div', { class: 'row-side' }, n(pr.reports))),
      h('li', { class: 'row' }, h('div', {}, h('strong', {}, 'Weekly Challenge prizes won · redeemed')), h('div', { class: 'row-side' }, `${n(pz.won)} · ${n(pz.redeemed)}`))),
    Array.isArray(d.by_day) && d.by_day.length
      ? h('p', { class: 'muted' }, 'Devices by day: ', d.by_day.map(x => `${x.day.slice(5)} ${x.devices}`).join(' · '))
      : null);
}

function ownerReport() {
  const section = h('section', { class: 'card stack report' });
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Loading…'));
  let days = 7;
  const tabs = h('div', { class: 'row-side' }, ...[7, 30, 90].map(k => h('button', { class: 'link', type: 'button', 'aria-pressed': String(k === days), onClick: () => { days = k; load(); } }, `${k} days`)));
  async function load() {
    for (const b of tabs.children) b.setAttribute('aria-pressed', String(b.textContent === `${days} days`));
    fill(body, h('p', { class: 'muted' }, 'Loading…'));
    const r = await pay.staffReport(days);
    if (!r.ok && r.error) { fill(body, h('p', { class: 'muted' }, r.error === 'not-staff' || r.error === 'forbidden' ? 'Owner report is for staff accounts.' : errText(r.error))); return; }
    fill(body, reportBody(r));
  }
  fill(section, h('h2', {}, 'Owner report'), h('p', { class: 'muted' }, 'How the game is doing: verified Stripe payments, players, and where they stop. Nothing here comes from the browser alone.'), tabs, body);
  load();
  return section;
}

async function home() {
  const res = await pay.staffHome();
  if (!res.ok) { if (res.error === 'signed-out') signIn(errText('signed-out')); else screen(h('p', { class: 'card' }, errText(res.error))); return; }
  if (!res.staff) { screen(h('div', { class: 'card stack' }, h('p', {}, `Signed in as ${res.email}.`), h('p', {}, errText('not-staff')))); return; }
  const area = h('div', { class: 'stack' });
  const note = h('p', { class: 'note', role: 'status' });
  const input = h('input', { id: 'lookup', maxlength: 12, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'K7Q3DM', class: 'code-input' });
  const look = h('button', { class: 'btn', type: 'submit' }, 'Look up');
  const form = h('form', { class: 'card stack' },
    h('h2', {}, 'Look up a code'),
    h('p', { class: 'muted' }, 'A Weekly Challenge prize code, a new client\'s friend code, or a player coming in for their referral bath.'),
    h('label', { for: 'lookup' }, 'Code (6 letters and numbers)'), input, note, look);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const code = normalizeCode(input.value);
    if (!code) { note.textContent = errText('unknown-code'); return; }
    look.disabled = true; note.textContent = 'Looking up…';
    // A prize code (Weekly Challenge) or a friend code (Invite a friend).
    const prize = await pay.staffPrizeAction({ action: 'lookup', code });
    if (prize.ok) {
      look.disabled = false; note.textContent = '';
      const show = p => fill(area, prizeBox(p, show));
      show(prize.prize);
      return;
    }
    const found = await pay.staffAction({ action: 'lookup', code });
    look.disabled = false;
    if (!found.ok) { note.textContent = errText(found.error); return; }
    note.textContent = '';
    showCode(found, area);
  });
  const recent = Array.isArray(res.recent) ? res.recent : [];
  const prizes = await pay.staffPrizes();
  const prizeList = prizes.ok && Array.isArray(prizes.prizes) ? prizes.prizes : [];
  const boardRows = prizes.ok && Array.isArray(prizes.board) ? prizes.board : [];
  const prizeSection = h('section', { class: 'card stack' }, h('h2', {}, 'Weekly Challenge prizes'),
    h('p', { class: 'muted' }, 'Each week the top 3 at each location win: 1st a free day of daycare, 2nd and 3rd a free bath. Players show their code at the front desk within 30 days.'),
    prizeList.length
      ? h('ul', { class: 'list' }, prizeList.map(p => h('li', { class: `row ${p.status === 'won' ? 'earned' : p.status === 'void' || p.status === 'expired' ? 'void' : ''}` },
        h('div', {}, h('strong', {}, `${rewardOf(p)} · ${p.dogName}`), h('p', { class: 'muted' }, `#${p.rank} ${LOC[p.location] ?? ''} · week of ${p.week} · code ${p.code} · ${p.email || ''}`)),
        h('div', { class: 'row-side' }, h('span', { class: `tag ${p.status === 'won' ? 'earned' : p.status === 'redeemed' ? 'bath-given' : ''}` }, PRIZE_STATUS[p.status] ?? p.status)))))
      : h('p', { class: 'muted' }, 'No prizes yet. Winners appear here after each week ends (Monday).'));
  const boardSection = h('section', { class: 'card stack' }, h('h2', {}, "This week's leaderboard"),
    h('p', { class: 'muted' }, 'Hide a player whose dog name is rude, or who is cheating. Hidden players are off the leaderboard and win no prizes.'),
    boardRows.length
      ? h('ul', { class: 'list' }, boardRows.map(b => h('li', { class: `row${b.hidden ? ' void' : ''}` },
        h('div', {}, h('strong', {}, b.dogName), h('p', { class: 'muted' }, `${LOC[b.location] ?? ''} · ${Number(b.score).toLocaleString('en-US')} pts`)),
        h('div', { class: 'row-side' }, h('button', { class: 'link', type: 'button', onClick: async () => {
          if (!confirm(b.hidden ? `Show ${b.dogName} on the leaderboard again?` : `Hide ${b.dogName} from the leaderboard?`)) return;
          const r = await pay.staffPrizeAction({ action: 'hide', userId: b.userId, hidden: !b.hidden });
          if (!r.ok) { alert(errText(r.error)); return; }
          home();
        } }, b.hidden ? 'Show' : 'Hide')))))
      : h('p', { class: 'muted' }, 'No scores yet this week.'));
  screen(
    h('p', { class: 'muted signed' }, `Signed in as ${res.email}`),
    form, area,
    h('section', { class: 'card stack' }, h('h2', {}, 'How it works'),
      h('ol', {},
        h('li', {}, 'A new client shows a friend code from the game at their first visit. Give them $10 off in the register.'),
        h('li', {}, 'Look up the code here and record the first visit. The player who shared now has a free bath waiting.'),
        h('li', {}, 'When that player brings their dog in, look up their code, give the free bath and tap "Bath given".'),
        h('li', {}, 'Weekly Challenge winners show a prize code: look it up, give the free daycare day or bath, and tap "Mark redeemed".'))),
    ownerReport(),
    prizeSection,
    boardSection,
    h('section', { class: 'card stack' }, h('h2', {}, 'Recent'),
      recent.length ? h('ul', { class: 'list' }, recent.map(r => referralRow(r, (a, row) => change(a, row, () => home())))) : h('p', { class: 'muted' }, 'No referrals recorded yet.')));
  setTimeout(() => input.focus(), 50);
}

(async () => {
  pay = await openPayments({ redirectPath: '/staff/index.html' });
  if (!pay?.accounts) { screen(h('p', { class: 'card' }, "This page works on the PAWtastic game site only.")); return; }
  if (pay.signedIn) home(); else signIn();
})();
