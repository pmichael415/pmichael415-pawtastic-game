// Competing (the public site): a home PAWtastic (Hawthorne or Hillsdale), the Weekly Challenge,
// leaderboards and the real prizes the Weekly Challenge wins. Prizes are given at the front desk:
// each week the top 3 at each location win, 1st a free day of daycare, 2nd and 3rd a free bath.

import { h } from './dom.js';
import { clientOf } from './payments.js';
import { onMap } from './referral.js';
import { LOCATIONS } from '../engine/levels.js';
import { totalStars, totalBestScore } from '../economy/progression.js';
import { weekKey, weekEndsAt } from '../engine/challenge.js';

export const PRIZES = { 1: 'a free day of daycare', 2: 'a free bath', 3: 'a free bath' };
export const PRIZE_LINE = 'Top 3 at each location win every week: 1st a free day of daycare, 2nd and 3rd a free bath.';
const PRIZE_NAMES = { 'daycare-day': 'Free day of daycare', bath: 'Free bath' };
const PRIZES_SEEN_KEY = 'pawtastic-gd-prizes-seen-v1';
const PENDING_RUN_KEY = 'pawtastic-gd-pending-run-v1';

export const homeName = state => (state.home ? LOCATIONS[state.home] : null);
export const prizeName = reward => PRIZE_NAMES[reward] ?? 'Prize';

/** Two big buttons: Hawthorne and Hillsdale. */
export function homeChoices(current, onPick) {
  return h('div', { class: 'home-choices', role: 'radiogroup', 'aria-label': 'Your PAWtastic' },
    Object.entries(LOCATIONS).map(([id, name]) => h('button', {
      type: 'button', class: `choice home-choice${current === id ? ' picked' : ''}`, role: 'radio', 'aria-checked': String(current === id),
      onClick: () => onPick(id),
    }, h('strong', {}, name), h('span', { class: 'small' }, `PAWtastic ${name}`))));
}

/** Ask for the home PAWtastic; resolves the choice (or null). */
export function pickHome(app, { reason = '' } = {}) {
  const { backend } = app.services;
  return new Promise(resolve => {
    let sheet;
    let picked = null;
    sheet = app.modal(h('div', { class: 'stack' },
      h('p', { class: 'eyebrow' }, 'Your PAWtastic'),
      h('h2', {}, 'Which PAWtastic is yours?'),
      h('p', {}, reason || 'Pick the location you visit (or the one closest to you). It unlocks your local adventure and puts you on that team in the leaderboards.'),
      homeChoices(backend.state().home, async id => { picked = id; await backend.setHome(id); sheet.close(); }),
      h('p', { class: 'muted small' }, 'You can change it later in the menu.')),
    { label: 'Pick your PAWtastic', onClose: () => resolve(picked) });
  });
}

const fmtLeft = ms => {
  const hours = Math.max(0, Math.floor(ms / 3600000));
  return hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h ${Math.max(0, Math.floor(ms / 60000) % 60)}m`;
};
export const endsInText = (week, now = Date.now()) => `ends in ${fmtLeft(weekEndsAt(week) - now)}`;

/** The map's Weekly Challenge card. */
export function weeklyCard(app) {
  const state = app.services.backend.state();
  const week = weekKey(Date.now());
  const best = state.weekly.week === week ? state.weekly.best : 0;
  return h('section', { class: 'card weekly-card', 'aria-label': 'Weekly Challenge' },
    h('p', { class: 'eyebrow' }, `Weekly Challenge · ${endsInText(week)}`),
    h('h2', {}, 'Win a free daycare day'),
    h('p', { class: 'small' }, PRIZE_LINE),
    best ? h('p', { class: 'small num' }, h('strong', {}, `Your best this week: ${best.toLocaleString('en-US')}`)) : null,
    h('div', { class: 'btn-pair' },
      h('button', { class: 'btn gold', type: 'button', onClick: () => app.go('challenge') }, best ? 'Play again' : 'Play the challenge'),
      h('button', { class: 'btn secondary', type: 'button', onClick: () => app.go('leaderboard') }, 'Leaderboard')));
}

/** The leaderboard profile: dog name, home and progress (signed-in players with a home only). */
export async function syncProfile(app) {
  const pay = clientOf(app);
  const state = app.services.backend.state();
  if (!pay?.signedIn || !state.home || !state.dog?.name) return null;
  const levels = Object.keys(state.progress.levels).length;
  return pay.sendProfile({ dogName: state.dog.name, location: state.home, stars: totalStars(state), levels, bestTotal: totalBestScore(state) });
}

/** Keeps a finished run to send once the player has signed in. */
export function keepPendingRun(run) { try { localStorage.setItem(PENDING_RUN_KEY, JSON.stringify(run)); } catch { /* ignore */ } }

/** Sends this week's best run when it hasn't reached the leaderboard yet (e.g. played before signing in). */
export async function sendPendingRun(app) {
  const pay = clientOf(app);
  const { backend } = app.services;
  const state = backend.state();
  if (!pay?.signedIn || !state.home) return null;
  let run = null;
  try { run = JSON.parse(localStorage.getItem(PENDING_RUN_KEY) ?? 'null'); } catch { run = null; }
  const w = state.weekly;
  if (!run && w.week === weekKey(Date.now()) && w.bestMoves && w.best > w.sentBest) run = { week: w.week, moves: w.bestMoves };
  if (!run) return null;
  const res = await pay.submitChallenge(run);
  if (res.ok || res.error === 'week-over' || res.error === 'bad-run') { try { localStorage.removeItem(PENDING_RUN_KEY); } catch { /* ignore */ } }
  if (res.ok) backend.markChallengeSent(run.week, res.score);
  return res;
}

const seenPrizes = () => { try { return JSON.parse(localStorage.getItem(PRIZES_SEEN_KEY) ?? '[]'); } catch { return []; } };

export function prizeCard(p) {
  return h('div', { class: 'card prize-card' },
    h('p', { class: 'eyebrow' }, `Weekly Challenge · week of ${p.week} · #${p.rank} at ${LOCATIONS[p.location] ?? p.location}`),
    h('h3', {}, prizeName(p.reward)),
    p.status === 'won'
      ? [h('p', {}, `Show this code at the PAWtastic ${LOCATIONS[p.location] ?? ''} front desk by ${new Date(p.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}:`),
        h('p', { class: 'friend-code num', 'aria-label': `Prize code ${String(p.code).split('').join(' ')}` }, p.code),
        h('p', { class: 'muted small' }, "For one dog. New clients complete PAWtastic's usual evaluation and paperwork first.")]
      : h('p', { class: 'muted small' }, p.status === 'redeemed' ? 'Enjoyed. Thanks for playing!' : 'This prize has expired.'));
}

/** After opening (signed in): tell a winner about a new prize. */
export async function prizeNews(app) {
  const pay = clientOf(app);
  if (!pay?.signedIn) return;
  const res = await pay.prizes();
  if (!res.ok || !Array.isArray(res.prizes)) return;
  const seen = new Set(seenPrizes());
  const fresh = res.prizes.filter(p => p.status === 'won' && !seen.has(p.id));
  if (!fresh.length || !(await onMap(app))) return;
  try { localStorage.setItem(PRIZES_SEEN_KEY, JSON.stringify([...seen, ...fresh.map(p => p.id)])); } catch { /* ignore */ }
  const dog = app.services.backend.state().dog?.name ?? 'Your pup';
  let s;
  s = app.modal(h('div', { class: 'stack' },
    h('p', { class: 'eyebrow' }, 'You won!'),
    h('h2', {}, `${dog} placed in the Weekly Challenge!`),
    ...fresh.map(prizeCard),
    h('button', { class: 'btn block', type: 'button', onClick: () => s.close() }, 'Yay!')), { label: 'Prize won' });
}

/** After opening: profile, any run not sent yet, and prize news. */
export async function competeOnOpen(app) {
  await syncProfile(app).catch(() => null);
  await sendPendingRun(app).catch(() => null);
  await prizeNews(app).catch(() => null);
}

