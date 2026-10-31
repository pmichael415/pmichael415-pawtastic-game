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
  'wrong-code': "That code didn't work. Check the email and try again.",
};
const errText = e => ERR[e] ?? 'Something went wrong. Please try again.';
const when = iso => { try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } };
const STATUS = { earned: 'Free bath waiting', 'bath-given': 'Bath given', void: 'Undone' };
const place = l => (l === 'hawthorne' ? 'Hawthorne' : l === 'hillsdale' ? 'Hillsdale' : '');

let pay = null;

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

async function home() {
  const res = await pay.staffHome();
  if (!res.ok) { if (res.error === 'signed-out') signIn(errText('signed-out')); else screen(h('p', { class: 'card' }, errText(res.error))); return; }
  if (!res.staff) { screen(h('div', { class: 'card stack' }, h('p', {}, `Signed in as ${res.email}.`), h('p', {}, errText('not-staff')))); return; }
  const area = h('div', { class: 'stack' });
  const note = h('p', { class: 'note', role: 'status' });
  const input = h('input', { id: 'lookup', maxlength: 12, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'K7Q3DM', class: 'code-input' });
  const look = h('button', { class: 'btn', type: 'submit' }, 'Look up');
  const form = h('form', { class: 'card stack' },
    h('h2', {}, 'Look up a friend code'),
    h('p', { class: 'muted' }, 'A new client shows a code from the PAWtastic game, or a player comes in for their free bath.'),
    h('label', { for: 'lookup' }, 'Friend code (6 letters and numbers)'), input, note, look);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const code = normalizeCode(input.value);
    if (!code) { note.textContent = errText('unknown-code'); return; }
    look.disabled = true; note.textContent = 'Looking up…';
    const found = await pay.staffAction({ action: 'lookup', code });
    look.disabled = false;
    if (!found.ok) { note.textContent = errText(found.error); return; }
    note.textContent = '';
    showCode(found, area);
  });
  const recent = Array.isArray(res.recent) ? res.recent : [];
  screen(
    h('p', { class: 'muted signed' }, `Signed in as ${res.email}`),
    form, area,
    h('section', { class: 'card stack' }, h('h2', {}, 'How it works'),
      h('ol', {},
        h('li', {}, 'A new client shows a friend code from the game at their first visit. Give them $10 off in the register.'),
        h('li', {}, 'Look up the code here and record the first visit. The player who shared now has a free bath waiting.'),
        h('li', {}, 'When that player brings their dog in, look up their code, give the free bath and tap "Bath given".'))),
    h('section', { class: 'card stack' }, h('h2', {}, 'Recent'),
      recent.length ? h('ul', { class: 'list' }, recent.map(r => referralRow(r, (a, row) => change(a, row, () => home())))) : h('p', { class: 'muted' }, 'No referrals recorded yet.')));
  setTimeout(() => input.focus(), 50);
}

(async () => {
  pay = await openPayments({ redirectPath: '/staff/index.html' });
  if (!pay?.accounts) { screen(h('p', { class: 'card' }, "This page works on the PAWtastic game site only.")); return; }
  if (pay.signedIn) home(); else signIn();
})();
