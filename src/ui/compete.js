// Competing (the public site): a home PAWtastic (Hawthorne or Hillsdale), the Weekly Challenge,
// leaderboards and the real prizes the Weekly Challenge wins. Prizes are given at the front desk:
// each week the top 3 at each location win that week's prizes, which the server sends (the lineup the
// owner approved for the week, or the standard 1st a free day of daycare, 2nd and 3rd a free bath).

import { h, fill } from './dom.js';
import { clientOf } from './payments.js';
import { onMap } from './referral.js';
import { LOCATIONS } from '../engine/levels.js';
import { totalStars, totalBestScore } from '../economy/progression.js';
import { weekKey, weekEndsAt, CHALLENGES, CHALLENGE_IDS, isChallengeId, isWeekKey, TIER_NAMES, rulesFor } from '../engine/challenge.js';

const PRIZE_NAMES = { 'daycare-day': 'Free day of daycare', bath: 'Free bath' };
const lower = t => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);

// This week's prizes as the server sent them: [{ rank, label }] for 1st–3rd. Until it answers, the wording
// stays general, so a prize is never named that the server didn't confirm.
let weekly = null; // { week, prizes, next, rules }
const goodLineup = v => Array.isArray(v) && v.length === 3 && v.every((p, i) => p && p.rank === i + 1 && typeof p.label === 'string' && p.label.length >= 3 && p.label.length <= 80);
const goodRules = v => v && (v.version === 1 || v.version === 2) && Array.isArray(v.challenges) && v.challenges.every(isChallengeId);
export function weekPrizes(week = weekKey(Date.now())) { return weekly?.week === week ? weekly.prizes : null; }
export function nextPrizes() { return weekly?.next ?? null; }
/**
 * The format this week plays, as the server said: version 1 (one High score run) until the owner's scheduled
 * Monday, then version 2 (three challenges, best in each added up). Before the server answers, version 1.
 */
export function weekRules(week = weekKey(Date.now())) {
  if (weekly?.week === week && goodRules(weekly.rules)) return weekly.rules;
  return rulesFor(week, weekly?.rules?.from ?? null);
}
export const challengeName = id => CHALLENGES[id]?.name ?? 'High score run';
const fmtMonday = key => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); };
/** "From Mon Nov 24: three challenges a week" while version 2 is scheduled but not started. */
export function formatTeaser(rules = weekRules()) {
  return rules.version === 1 && rules.from ? `From Monday ${fmtMonday(rules.from)}: three free challenges a week (High score, Combo, Cleanup), your best in each added up.` : '';
}
/** Asks the server for this week's prizes (and next week's, once approved). Resolves the lineup or null. */
export async function loadWeekPrizes(app) {
  const pay = clientOf(app);
  if (!pay?.challengeWeek) return null;
  const r = await pay.challengeWeek().catch(() => null);
  if (!r?.ok || typeof r.week !== 'string' || !goodLineup(r.prizes)) return null;
  weekly = {
    week: r.week, prizes: r.prizes, next: r.next && typeof r.next.week === 'string' && goodLineup(r.next.prizes) ? r.next : null,
    rules: goodRules(r.rules) ? { version: r.rules.version, challenges: r.rules.challenges.slice(), from: typeof r.rules.from === 'string' ? r.rules.from : null } : null,
  };
  return weekly.prizes;
}
/** "Top 3 at each location win: 1st …, 2nd …, 3rd …" (or general wording until the server answers). */
export function prizeLine(prizes = weekPrizes()) {
  if (!prizes) return 'Top 3 at each location win real PAWtastic prizes every week.';
  const [a, b, c] = prizes.map(p => lower(p.label));
  return b === c ? `Top 3 at each location win: 1st ${a}, 2nd and 3rd ${b}.` : `Top 3 at each location win: 1st ${a}, 2nd ${b}, 3rd ${c}.`;
}
export const prizeHeadline = (prizes = weekPrizes()) => (prizes ? `Win ${lower(prizes[0].label)}` : 'Win real PAWtastic prizes');
export const prizeForRank = (rank, prizes = weekPrizes()) => (prizes && prizes[rank - 1] ? lower(prizes[rank - 1].label) : 'a prize');
const PRIZES_SEEN_KEY = 'pawtastic-gd-prizes-seen-v1';
const PENDING_RUN_KEY = 'pawtastic-gd-pending-run-v1';

export const homeName = state => (state.home ? LOCATIONS[state.home] : null);
/** A won prize's name: its own words when it came from a weekly lineup. */
export const prizeName = p => (p && typeof p === 'object' ? (p.label || PRIZE_NAMES[p.reward]) : PRIZE_NAMES[p]) ?? 'Prize';

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

const TIER_MARK = { bronze: '🥉', silver: '🥈', gold: '🥇' };
/** A badge mark for a tier (or '') and the player's best this week in a challenge. */
export const tierMark = tier => TIER_MARK[tier] ?? '';
export const tierLabel = tier => (tier ? `${TIER_NAMES[tier]} badge` : '');
export function myBadge(app, week, challenge) {
  return app.services.backend.state().collection?.badges?.find(b => b.week === week && b.challenge === challenge) ?? null;
}

/** The map's Weekly Challenge card: one run (version 1) or three challenges with the player's best in each (version 2). */
export function weeklyCard(app) {
  const { backend } = app.services;
  const state = backend.state();
  const week = weekKey(Date.now());
  const best = state.weekly.week === week ? state.weekly.best : 0;
  const headline = h('h2', {}, prizeHeadline());
  const line = h('p', { class: 'small' }, prizeLine());
  const upcoming = h('p', { class: 'small muted' });
  const formats = h('div', { class: 'stack tight challenge-rows' });
  const showNext = () => { const n = nextPrizes(); upcoming.textContent = n ? `Next week: 1st ${lower(n.prizes[0].label)}.` : ''; upcoming.hidden = !n; };
  const showFormats = () => {
    const rules = weekRules(week);
    const results = backend.weeklyResults?.(week) ?? {};
    if (rules.version === 2) {
      const total = CHALLENGE_IDS.reduce((sum, id) => sum + (results[id]?.best ?? 0), 0);
      fill(formats,
        h('p', { class: 'small muted' }, 'Three free challenges all week. Your best in each is added up; no boosters, and tries are free.'),
        ...CHALLENGE_IDS.map(id => {
          const r = results[id];
          const badge = myBadge(app, week, id);
          return h('div', { class: 'challenge-row' },
            h('div', { class: 'challenge-row-text' },
              h('strong', {}, `${badge ? `${tierMark(badge.tier)} ` : ''}${CHALLENGES[id].name}`),
              h('span', { class: 'small muted num' }, r?.best ? `Best ${r.best.toLocaleString('en-US')}` : CHALLENGES[id].goal)),
            h('button', { class: 'btn small-btn', type: 'button', onClick: () => app.go('challenge', { challenge: id }) }, r?.best ? 'Again' : 'Play'));
        }),
        total ? h('p', { class: 'small num' }, h('strong', {}, `Your total this week: ${total.toLocaleString('en-US')}`)) : null);
      formats.hidden = false;
    } else {
      const teaser = formatTeaser(rules);
      fill(formats, teaser ? h('p', { class: 'small muted' }, teaser) : null);
      formats.hidden = !teaser;
    }
  };
  showNext();
  showFormats();
  loadWeekPrizes(app).then(p => { if (p) { headline.textContent = prizeHeadline(p); line.textContent = prizeLine(p); showNext(); } showFormats(); }).catch(() => {});
  const v2 = () => weekRules(week).version === 2;
  const play = h('button', { class: 'btn gold', type: 'button', onClick: () => app.go('challenge', v2() ? { challenge: 'high-score' } : {}) }, best ? 'Play again' : 'Play the challenge');
  return h('section', { class: 'card weekly-card', 'aria-label': 'Weekly Challenge' },
    h('p', { class: 'eyebrow' }, `Weekly Challenge · ${endsInText(week)}`),
    headline,
    line,
    upcoming,
    formats,
    best && !v2() ? h('p', { class: 'small num' }, h('strong', {}, `Your best this week: ${best.toLocaleString('en-US')}`)) : null,
    h('div', { class: 'btn-pair' },
      play,
      h('button', { class: 'btn secondary', type: 'button', onClick: () => app.go('leaderboard') }, 'Leaderboard')),
    h('button', { class: 'linkish small', type: 'button', onClick: () => app.go('collection') }, 'Badges & trophies'));
}

/** The leaderboard profile: dog name, home and progress (signed-in players with a home only). */
export async function syncProfile(app) {
  const pay = clientOf(app);
  const state = app.services.backend.state();
  if (!pay?.signedIn || !state.home || !state.dog?.name) return null;
  const levels = Object.keys(state.progress.levels).length;
  return pay.sendProfile({ dogName: state.dog.name, location: state.home, stars: totalStars(state), levels, bestTotal: totalBestScore(state) });
}

/** Keeps a finished run to send once the player has signed in (one per challenge). */
export function keepPendingRun(run) {
  try {
    const kept = readPending();
    kept[run.challenge ?? 'high-score'] = { week: run.week, moves: run.moves, challenge: run.challenge ?? 'high-score' };
    localStorage.setItem(PENDING_RUN_KEY, JSON.stringify(kept));
  } catch { /* ignore */ }
}
function readPending() {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING_RUN_KEY) ?? 'null');
    if (v && Array.isArray(v.moves)) return { 'high-score': { week: v.week, moves: v.moves, challenge: 'high-score' } }; // the old single run
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}
function dropPending(challenge) {
  try {
    const kept = readPending();
    delete kept[challenge];
    if (Object.keys(kept).length) localStorage.setItem(PENDING_RUN_KEY, JSON.stringify(kept)); else localStorage.removeItem(PENDING_RUN_KEY);
  } catch { /* ignore */ }
}

/** Sends this week's best runs that haven't reached the leaderboard yet (e.g. played before signing in). */
export async function sendPendingRun(app) {
  const pay = clientOf(app);
  const { backend } = app.services;
  const state = backend.state();
  if (!pay?.signedIn || !state.home) return null;
  const week = weekKey(Date.now());
  const runs = { ...readPending() };
  const w = state.weekly;
  if (w.week === week) {
    for (const [challenge, r] of Object.entries(w.results ?? {})) {
      if (!runs[challenge] && r.bestMoves && r.best > r.sentBest) runs[challenge] = { week, moves: r.bestMoves, challenge };
    }
    if (!runs['high-score'] && w.bestMoves && w.best > w.sentBest) runs['high-score'] = { week, moves: w.bestMoves, challenge: 'high-score' };
  }
  let last = null;
  for (const run of Object.values(runs)) {
    if (!run || !isChallengeId(run.challenge) || !Array.isArray(run.moves)) continue;
    const res = await pay.submitChallenge(run);
    if (res.ok || res.error === 'week-over' || res.error === 'bad-run' || res.error === 'not-this-week') dropPending(run.challenge);
    if (res.ok) backend.markChallengeSent(run.week, res.score, run.challenge);
    last = res;
  }
  return last;
}

const seenPrizes = () => { try { return JSON.parse(localStorage.getItem(PRIZES_SEEN_KEY) ?? '[]'); } catch { return []; } };

export function prizeCard(p) {
  return h('div', { class: 'card prize-card' },
    h('p', { class: 'eyebrow' }, `Weekly Challenge · week of ${p.week} · #${p.rank} at ${LOCATIONS[p.location] ?? p.location}`),
    h('h3', {}, prizeName(p)),
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


// Beat My Pup links: ?beat=<challenge>&week=<Monday> opens that challenge. Only the challenge id and the week are
// read from the link; a score in a link or in storage is never shown or trusted (the card carries the checked result).
let beatLinkSeen = null;
export function captureBeatLink(loc = globalThis.location, hist = globalThis.history) {
  try {
    const params = new URLSearchParams(loc.search);
    if (!params.has('beat') && !params.has('challenge')) return null;
    const raw = params.get('beat') ?? params.get('challenge');
    const challenge = isChallengeId(raw) ? raw : 'high-score';
    const week = isWeekKey(params.get('week')) ? params.get('week') : null;
    for (const k of ['beat', 'challenge', 'week', 'score', 'pts']) params.delete(k);
    const rest = params.toString();
    hist?.replaceState(null, '', loc.pathname + (rest ? `?${rest}` : '') + loc.hash);
    beatLinkSeen = { challenge, week };
    return beatLinkSeen;
  } catch { return null; }
}
export const pendingBeatLink = () => beatLinkSeen;

/** Once the map is up with nothing else open, a Beat My Pup link opens its challenge (this week's, if the link's week is over). */
export async function openBeatLink(app) {
  const link = beatLinkSeen;
  if (!link) return false;
  beatLinkSeen = null;
  if (!(await onMap(app))) return false;
  await loadWeekPrizes(app).catch(() => null);
  const week = weekKey(Date.now());
  const rules = weekRules(week);
  const challenge = rules.challenges.includes(link.challenge) ? link.challenge : 'high-score';
  if (link.week && link.week !== week) app.toast(`That challenge week is over. Here's this week's ${challengeName(challenge)}.`);
  else if (challenge !== link.challenge) app.toast(`${challengeName(link.challenge)}s aren't in this week's competition. Here's the ${challengeName(challenge)}.`);
  app.go('challenge', { challenge, beat: true });
  return true;
}
