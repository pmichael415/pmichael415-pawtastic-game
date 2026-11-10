// The Weekly Challenge: this week's board (the same for everyone), a fixed number of moves, the best result
// wins. Tries are free (no lives) and boosters can't be used, so buying never helps. Each finished run is
// sent to the server, which replays the moves to check the score before it goes on the leaderboard.
//
// Weeks on the three-challenge format (version 2) offer three runs all week: the High score run, the
// Combo run (chain reactions only, scaled so it counts like a high score run) and the Cleanup puzzle
// (clear every muddy paw print and leash). The best result in each is added up for the leaderboard.
//
// In a season (Season 1: Top Dog) each week is a chapter: the same High score run, and the best run of each
// chapter is added up to the season score; the screen says "chapter" where it says "week", and after a run
// shows the season standing too.

import { h, fill } from '../dom.js';
import { closeIcon, starIcon } from '../icons.js';
import { createBoardView } from '../board-view.js';
import { createHint } from '../hint.js';
import { trySwap, goalProgress } from '../../engine/game.js';
import { findValidMove } from '../../engine/shuffle.js';
import {
  newChallengeGame, CHALLENGES, CHALLENGE_IDS, isChallengeId, COMBO_SCALE, comboOf, cleanupScore,
  replayChallenge, tierOf, tipFor, movesFor, TIER_NAMES, TIER_ORDER,
} from '../../engine/challenge.js';
import { clientOf } from '../payments.js';
import { isPublicSite } from '../../backend/local.js';
import { TROPHIES } from '../../economy/wallet.js';
import {
  prizeLine, endsInText, homeName, keepPendingRun, pickHome, syncProfile, loadWeekPrizes, weekRules, formatTeaser, tierMark, challengeName,
  weekSeason, competitionLine, playWeek, serverWeekKnown, joinCard,
} from '../compete.js';
import { serverNow } from '../../net/server-clock.js';
import { seasonCountdown, SEASON_TEXT } from '../season.js';
import { shareResult, sharePlace } from '../share-card.js';
import { LOCATIONS } from '../../engine/levels.js';
import { prizeGap } from '../growth.js';
import { tellHub } from '../../net/embed.js';
import { sendInviteOnce, INVITE_REWARD_TEXT, friendRewardLine } from '../referral.js';
const hasFriendCode = () => { try { return !!friendRewardLine(JSON.parse(localStorage.getItem('pawtastic-gd-ref-v1') ?? 'null')); } catch { return false; } };

const ERRORS = {
  'week-over': 'This week\'s challenge just ended, so this run can\'t count. A new challenge is ready!',
  'bad-run': "This run couldn't be checked, so it wasn't counted.",
  'not-this-week': "This challenge isn't part of this week's competition, so the run wasn't counted.",
  'no-home': 'Pick your PAWtastic first.',
  offline: "Couldn't reach the leaderboard. Your best score is kept on this phone and sent next time.",
};
const num = n => Number(n || 0).toLocaleString('en-US');
const trophyName = id => TROPHIES.find(t => t.id === id)?.name ?? id;

/** The badge line after a run: the badge just earned, or the next one and how far it is. */
export function badgeLine(challenge, score, { newBadge = null, had = null, period = 'week' } = {}) {
  if (newBadge) return `${tierMark(newBadge)} ${TIER_NAMES[newBadge]} badge earned!`;
  const tiers = CHALLENGES[challenge].tiers;
  const names = ['bronze', 'silver', 'gold'];
  const held = had ? TIER_ORDER[had] : 0;
  const target = names.find(n => TIER_ORDER[n] > held);
  if (!target) return `${tierMark('gold')} Gold badge held this ${period}: the top!`;
  const goal = tiers[names.indexOf(target)];
  const need = Math.max(1, goal - score);
  if (had) return `${tierMark(had)} ${TIER_NAMES[had]} badge held · ${num(need)} more for ${TIER_NAMES[target]}`;
  return `${TIER_NAMES[target]} badge at ${num(goal)} · ${num(need)} to go`;
}

/** The personal-best line: a first run, a new best (by how much), or how far off the best this run was. `period` is "chapter" in a season. */
export function bestLine(score, previousBest, runs, period = 'week') {
  if (!previousBest || runs <= 1) return `Your first run this ${period} sets the mark.`;
  if (score > previousBest) return `New personal best: +${num(score - previousBest)} over your ${num(previousBest)}.`;
  if (score === previousBest) return `Tied your best this ${period} (${num(previousBest)}).`;
  return `${num(previousBest - score)} short of your best this ${period} (${num(previousBest)}).`;
}

// How long the screen waits for the server to say which week it is before it plays the best guess (offline play).
const ASK_SERVER_MS = 5000;

export function render(app, params = {}) {
  const { backend, audio, measure } = app.services;
  const pay = clientOf(app);
  // The server decides which week (in a season, which chapter) this is: a phone's clock can be days off. Until it has
  // said so for the current week, the board waits for its answer instead of playing a week the phone guessed.
  if (pay?.accounts && !serverWeekKnown() && !params.askedServer) {
    let waiting = true;
    app.view.append(h('section', { class: 'level challenge' }, h('p', { class: 'muted center', role: 'status' }, 'Getting the challenge board…')));
    Promise.race([loadWeekPrizes(app).catch(() => null), new Promise(r => setTimeout(r, ASK_SERVER_MS))])
      .then(() => { if (waiting) app.go('challenge', { ...params, askedServer: true }); });
    return () => { waiting = false; };
  }
  let week = playWeek();
  let rules = weekRules(week);
  const wanted = isChallengeId(params.challenge) ? params.challenge : 'high-score';
  // A challenge that isn't in this week's competition (a Beat My Pup link from a version-2 week, say) falls
  // back to the one that is; the player is told.
  const challenge = rules.challenges.includes(wanted) ? wanted : 'high-score';
  const def = CHALLENGES[challenge];
  const beat = params.beat === true || isChallengeId(params.beat);
  const v2 = rules.version === 2;
  const season = weekSeason(week); // null outside a season
  const period = season ? 'chapter' : 'week';
  // The server decides which week it is (a phone clock can be wrong) and which format it plays; this
  // reloads the screen when its latest answer differs from the week on the board.
  loadWeekPrizes(app).then(() => {
    const now = playWeek();
    const fresh = weekRules(now);
    if (now !== week || fresh.version !== rules.version || !weekSeason(now) !== !season) { week = now; app.go('challenge', params); }
  }).catch(() => {});

  const game = newChallengeGame(week, challenge);
  const moves = [];
  let combo = 0;
  let bestChain = 0;
  let alive = true;
  let view;

  const results = () => backend.weeklyResults?.(week) ?? {};
  const bestOf = () => results()[challenge]?.best ?? (challenge === 'high-score' && backend.state().weekly.week === week ? backend.state().weekly.best : 0);
  const liveScore = () => {
    if (challenge === 'combo') return Math.round(combo * COMBO_SCALE);
    if (challenge === 'cleanup') return cleanupScore(game);
    return game.score;
  };

  const movesEl = h('div', { class: 'moves num' });
  const scoreText = h('span', { class: 'num score-text' });
  const bestText = h('span', { class: 'small muted num' });
  const subText = h('span', { class: 'goal-text' });
  const updateHud = () => {
    movesEl.replaceChildren(h('strong', {}, String(game.movesLeft)), h('span', {}, game.movesLeft === 1 ? 'move' : 'moves'));
    movesEl.classList.toggle('low', game.movesLeft <= 5);
    scoreText.textContent = `${num(liveScore())} pts`;
    if (challenge === 'cleanup') {
      const p = goalProgress(game);
      subText.textContent = `Cleaned ${p.current} of ${p.target}`;
    } else if (challenge === 'combo') {
      subText.textContent = `Chain points ${num(combo)} · best chain ${bestChain}`;
    }
    const best = bestOf();
    bestText.textContent = best ? `Your best: ${num(best)}` : `No result yet this ${period}`;
  };

  const leave = () => {
    if (!moves.length || game.status !== 'playing') { app.go('map'); return; }
    let sheet;
    sheet = app.modal(h('div', { class: 'stack' },
      h('h2', {}, 'Leave this run?'),
      h('p', {}, "It won't count. Tries are free, so you can start again any time."),
      h('div', { class: 'btn-pair' },
        h('button', { class: 'btn', type: 'button', onClick: () => { sheet.close(); app.go('map'); } }, 'Leave'),
        h('button', { class: 'btn secondary', type: 'button', onClick: () => sheet.close() }, 'Keep playing'))), { label: 'Leave this run?' });
  };

  const header = h('div', { class: 'level-head' },
    h('button', { class: 'btn secondary icon-btn', type: 'button', 'aria-label': 'Leave the challenge', onClick: leave, html: closeIcon() }),
    h('div', { class: 'level-title' },
      h('p', { class: 'eyebrow' }, season
        ? `${beat ? 'Beat My Pup' : `Chapter ${season.chapter} of ${season.chapters}`} · ${seasonCountdown(season).replace(/^Season/, 'season')}`
        : `${beat ? 'Beat My Pup' : 'Weekly Challenge'} · ${endsInText(week)}`),
      h('h2', {}, def.name)),
    movesEl);
  const goalBar = h('div', { class: 'goal-bar card' },
    h('span', { class: 'goal-icon', html: starIcon(true, 'Points') }),
    challenge === 'high-score' ? h('span', { class: 'goal-text' }, `Score as much as you can in ${movesFor(challenge)} moves`) : subText,
    h('span', { class: 'spacer' }), scoreText);
  const infoText = beat
    ? `A friend challenged you to this ${period}'s ${def.name}. Beat the result on their card!${hasFriendCode() ? ` ${INVITE_REWARD_TEXT}` : ''} `
    : challenge === 'high-score' ? `Same board for everyone this ${period}. No boosters, and tries are free. ` : `${def.goal} ${def.scoring} Same board for everyone; no boosters, and tries are free. `;
  const info = h('p', { class: 'small muted challenge-info' }, infoText, bestText);
  const fallbackNote = wanted !== challenge
    ? h('p', { class: 'small card' }, `${challengeName(wanted)}s start with the three-challenge format${formatTeaser(rules) ? ` (${formatTeaser(rules).replace(/^From/, 'from').replace(/:.*$/, '')})` : ''}. Here is this week's ${def.name}.`)
    : null;

  // Picks another challenge of this week (version 2 only).
  const otherChallenges = () => {
    let sheet;
    const res = results();
    sheet = app.modal(h('div', { class: 'stack' },
      h('p', { class: 'eyebrow' }, 'This week'),
      h('h2', {}, 'Three challenges, one total'),
      h('p', { class: 'small muted' }, 'Your best in each is added up. All three are free to try as often as you like.'),
      ...CHALLENGE_IDS.map(id => h('button', { class: `btn ${id === challenge ? '' : 'secondary'} block challenge-pick`, type: 'button', onClick: () => { sheet.close(); app.go('challenge', { challenge: id }); } },
        h('span', {}, CHALLENGES[id].name), h('span', { class: 'small num' }, res[id]?.best ? `Best ${num(res[id].best)}` : CHALLENGES[id].short))),
      h('button', { class: 'btn secondary', type: 'button', onClick: () => sheet.close() }, 'Back')), { label: 'Pick a challenge' });
  };

  async function finish() {
    // The run is scored by replaying its moves, exactly as the server will (the HUD's live number should agree).
    const replay = replayChallenge(week, moves.slice(), challenge);
    const score = replay.ok ? replay.score : liveScore();
    const raw = replay.ok ? replay.raw : (challenge === 'combo' ? combo : game.score);
    const extra = replay.ok ? { clean: !!replay.clean, bestChain: replay.bestChain ?? bestChain } : { clean: game.status === 'won' && challenge === 'cleanup', bestChain };
    const tier = tierOf(challenge, score);
    const previousBest = bestOf();
    const had = backend.state().collection?.badges?.find(b => b.week === week && b.challenge === challenge)?.tier ?? null;
    const { best, bestScore, runs, newBadge, newTrophies } = backend.recordChallenge(week, score, moves.slice(), { challenge, raw, tier, extra });
    measure?.track('challenge_run', { challenge, version: rules.version, best, badge: newBadge ?? '' });
    audio?.jingle?.(newBadge ? 'graduation-jingle' : best ? 'graduation-jingle' : 'happy-bark');
    const result = h('div', { class: 'stack run-result' });
    const status = h('p', { class: 'small', role: 'status' });
    let sheet;
    const again = h('button', { class: 'btn', type: 'button', onClick: () => { sheet.close(); app.go('challenge', { challenge }); } }, 'Play again');
    const others = v2 ? h('button', { class: 'btn secondary', type: 'button', onClick: () => { sheet.close(); otherChallenges(); } }, 'Other challenges') : null;
    const board = h('button', { class: 'btn secondary', type: 'button', onClick: () => { sheet.close(); app.go('leaderboard'); } }, 'Leaderboard');
    const share = h('button', { class: 'btn gold', type: 'button', hidden: true }, 'Challenge a friend');
    const detail = challenge === 'combo'
      ? `From ${num(raw)} chain-reaction points × ${COMBO_SCALE}${extra.bestChain ? ` · best chain ${extra.bestChain}` : ''}`
      : challenge === 'cleanup'
        ? (replay.ok ? `Cleaned ${replay.cleaned} of ${replay.total}${replay.clean ? ` · board clean with ${replay.movesLeft} ${replay.movesLeft === 1 ? 'move' : 'moves'} left!` : ''}` : '')
        : '';
    const totals = v2 ? (() => {
      const r = results();
      const total = CHALLENGE_IDS.reduce((s, id) => s + (r[id]?.best ?? 0), 0);
      return h('p', { class: 'small num' }, h('strong', {}, `Your total this week: ${num(total)}`), ' · ', CHALLENGE_IDS.map(id => `${CHALLENGES[id].short} ${num(r[id]?.best ?? 0)}`).join(' · '));
    })() : null;
    result.append(...[
      h('p', { class: 'eyebrow' }, season ? `${season.name} · Chapter ${season.chapter}` : `Weekly Challenge · ${def.name}`),
      h('h2', {}, newBadge ? `${TIER_NAMES[newBadge]} badge!` : best && runs > 1 ? 'New personal best!' : 'Run complete'),
      h('p', { class: 'big-score num' }, num(score)),
      detail ? h('p', { class: 'small muted' }, detail) : null,
      h('p', { class: 'small num' }, bestLine(score, previousBest, runs, period), ` Best this ${period}: ${num(bestScore)}.`),
      h('p', { class: 'small badge-line' }, badgeLine(challenge, score, { newBadge, had, period })),
      newTrophies.length ? h('p', { class: 'small trophy-line' }, `🏆 Trophy${newTrophies.length > 1 ? 's' : ''}: ${newTrophies.map(trophyName).join(', ')}`) : null,
      totals,
      h('p', { class: 'small tip-line' }, h('strong', {}, "Professor Paws' tip: "), tipFor(challenge, runs)),
      status,
      h('div', { class: 'btn-pair' }, again, others ?? board),
      h('div', { class: 'btn-pair' }, share, others ? board : null)].filter(Boolean));
    sheet = app.modal(result, { label: 'Run complete', dismissible: false });
    if (!best) {
      status.textContent = 'Only your best run counts. Keep trying!';
      // A guest still gets the join card (their best is already on this phone and is sent after signing in).
      if (pay?.accounts && !pay.signedIn && backend.state().home) status.after(joinCard(app, { score: boardScoreNow(score), season: !!weekSeason(week) }));
      return;
    }
    const confirmed = await sendRun(score, status, () => sheet.close());
    if (!confirmed || !alive) return;
    sendInviteOnce(app).catch(() => null); // came through a friend's link: both get 20 Treats (once)
    tellHub('good-moment'); // inside the hub: a good moment to offer notifications
    // How close to a prize at the player's location, from this run's own answer (no extra request).
    const standing = confirmed.season ?? confirmed;
    const gap = prizeGap({ me: { rank: standing.rank, score: standing.score ?? confirmed.best }, location: LOCATIONS[confirmed.location] ?? confirmed.location });
    if (gap) status.after(h('p', { class: 'small gap-line' }, gap.text));
    // Beat My Pup: the card carries the server-checked result, never a number from this phone alone.
    share.hidden = false;
    share.addEventListener('click', () => shareResult(app, {
      challenge, week: confirmed.week, score: confirmed.best, tier: tierOf(challenge, confirmed.best), rank: sharePlace({ rank: confirmed.rank, threeChallenge: v2 }), players: confirmed.players, location: confirmed.location,
      season: weekSeason(confirmed.week),
    }));
  }

  // The board's score: the week's total of each challenge's best (version 2), else the best run this week.
  function boardScoreNow(score) {
    const results = backend.weeklyResults?.(week) ?? {};
    const st = backend.state();
    return weekRules(week).version === 2 ? CHALLENGE_IDS.reduce((sum, id) => sum + (results[id]?.best ?? 0), 0) : Math.max(score, st.weekly.week === week ? st.weekly.best : 0);
  }

  async function sendRun(score, status, closeResult) {
    const run = { week, moves: moves.slice(), challenge };
    if (!pay?.accounts) { status.textContent = 'The leaderboard needs the internet.'; return null; }
    if (!backend.state().home) await pickHome(app, { reason: 'Pick your PAWtastic to join its leaderboard and play for its prizes.' });
    if (!backend.state().home) { status.textContent = ERRORS['no-home']; return null; }
    if (!pay.signedIn) {
      keepPendingRun(run);
      // One step: the join card, with where this run would rank and the email sign-in right here.
      status.replaceChildren(joinCard(app, { score: boardScoreNow(score), season: !!weekSeason(week) }));
      return null;
    }
    status.textContent = 'Checking your run…';
    await syncProfile(app).catch(() => null);
    const res = await pay.submitChallenge(run);
    if (!alive) return null;
    if (!res.ok) {
      if (res.error === 'offline' || res.error === 'server') keepPendingRun(run);
      const s = weekSeason(week);
      status.textContent = res.error === 'week-over' && s ? (s.ended || serverNow() >= Date.parse(s.endsAt) ? SEASON_TEXT.seasonOver : SEASON_TEXT.chapterOver) : ERRORS[res.error] ?? ERRORS.offline;
      return null;
    }
    backend.markChallengeSent(week, res.score, challenge);
    const where = LOCATIONS[res.location] ?? homeName(backend.state());
    const rankLine = h('strong', {}, `#${res.rank} at ${where}`);
    const standing = season && res.season && Number.isFinite(res.season.rank) && res.season.rank > 0 ? res.season : null;
    if (season) {
      // A chapter run: the chapter rank, then the season standing (which is what the prizes go by).
      fill(status, rankLine, ` this chapter (${res.players} ${res.players === 1 ? 'player' : 'players'}). `,
        standing ? h('strong', { class: 'season-standing' }, `Season: #${standing.rank} at ${where} with ${num(standing.score)} pts. `) : null,
        standing && standing.rank <= 3 ? SEASON_TEXT.inPrizes : competitionLine(week));
      return res;
    }
    fill(status, rankLine, ` this week (${res.players} ${res.players === 1 ? 'player' : 'players'}). `,
      res.version === 2 && Number.isFinite(res.total) ? `Team total ${num(res.total)}. ` : '',
      res.rank <= 3 ? 'You are in the prizes right now! Hold on until Monday.' : prizeLine());
    return res;
  }

  const onSwap = async (a, b) => {
    if (game.status !== 'playing' || view.isBusy()) return;
    const res = trySwap(game, a, b);
    if (!res.ok) { await view.wiggle(a, b); return; }
    moves.push([a.r, a.c, b.r, b.c]);
    combo += comboOf(res.steps);
    bestChain = Math.max(bestChain, res.steps.length);
    view.setBusy(true);
    await view.animateSwap(a, b);
    if (!alive) return;
    await view.animate(res.steps);
    if (!alive) return;
    if (res.reshuffled) { view.render(); app.toast('No moves left — shuffling the board.'); }
    updateHud();
    view.setBusy(false);
    hint.reset();
    if (game.status !== 'playing') finish();
  };

  const screen = h('section', { class: `level challenge challenge-${challenge}` }, header, goalBar, fallbackNote, info);
  app.view.append(screen);
  view = createBoardView(screen, game, { onSwap, fx: { audio, effects: () => app.effects() } });
  const hint = createHint({
    findMove: () => findValidMove(game.grid),
    show: m => view.nudge(m.a, m.b),
    hide: () => view.clearNudge(),
    isBusy: () => view.isBusy() || game.status !== 'playing' || !!document.querySelector('.overlay'),
  });
  view.wrap.addEventListener('pointerdown', () => hint.reset());
  hint.reset();
  const foot = h('p', { class: 'small muted center' }, isPublicSite(backend) ? (season ? competitionLine(week) : prizeLine()) : (season ? season.name : 'Weekly Challenge'));
  screen.append(...[v2 ? h('div', { class: 'btn-pair center' }, h('button', { class: 'linkish small', type: 'button', onClick: otherChallenges }, 'Other challenges this week'), h('button', { class: 'linkish small', type: 'button', onClick: () => app.go('collection') }, 'Badges & trophies')) : null, foot].filter(Boolean));
  updateHud();
  if (app.services.debug) window.__pawtasticChallenge = { game, moves, challenge, week, validMove: () => findValidMove(game.grid), swap: (a, b) => onSwap(a, b) };
  return () => { alive = false; hint.stop(); view.destroy(); if (app.services.debug) delete window.__pawtasticChallenge; };
}
