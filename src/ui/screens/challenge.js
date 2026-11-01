// The Weekly Challenge: this week's board (the same for everyone), 25 moves, the highest score wins.
// Tries are free (no lives) and boosters can't be used, so buying never helps. Each finished run is
// sent to the server, which replays the moves to check the score before it goes on the leaderboard.

import { h } from '../dom.js';
import { closeIcon, starIcon } from '../icons.js';
import { createBoardView } from '../board-view.js';
import { createHint } from '../hint.js';
import { trySwap } from '../../engine/game.js';
import { findValidMove } from '../../engine/shuffle.js';
import { newChallengeGame, weekKey, CHALLENGE_MOVES } from '../../engine/challenge.js';
import { clientOf, signInSheet } from '../payments.js';
import { isPublicSite } from '../../backend/local.js';
import { prizeLine, endsInText, homeName, keepPendingRun, pickHome, syncProfile } from '../compete.js';
import { LOCATIONS } from '../../engine/levels.js';

const ERRORS = {
  'week-over': 'This week\'s challenge just ended, so this run can\'t count. A new challenge is ready!',
  'bad-run': "This run couldn't be checked, so it wasn't counted.",
  'no-home': 'Pick your PAWtastic first.',
  offline: "Couldn't reach the leaderboard. Your best score is kept on this phone and sent next time.",
};

export function render(app) {
  const { backend, audio } = app.services;
  const pay = clientOf(app);
  let week = weekKey(Date.now());
  // The server decides which week it is (a phone clock can be wrong); this fills in when it answers.
  pay?.challengeWeek?.().then(r => { if (r.ok && r.week && r.week !== week) { week = r.week; app.go('challenge'); } }).catch(() => {});

  const game = newChallengeGame(week);
  const moves = [];
  let alive = true;
  let view;

  const movesEl = h('div', { class: 'moves num' });
  const scoreText = h('span', { class: 'num score-text' });
  const bestOf = () => (backend.state().weekly.week === week ? backend.state().weekly.best : 0);
  const bestText = h('span', { class: 'small muted num' });
  const updateHud = () => {
    movesEl.replaceChildren(h('strong', {}, String(game.movesLeft)), h('span', {}, game.movesLeft === 1 ? 'move' : 'moves'));
    movesEl.classList.toggle('low', game.movesLeft <= 5);
    scoreText.textContent = `${game.score.toLocaleString('en-US')} pts`;
    const best = bestOf();
    bestText.textContent = best ? `Your best: ${best.toLocaleString('en-US')}` : 'No score yet this week';
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
      h('p', { class: 'eyebrow' }, `Weekly Challenge · ${endsInText(week)}`),
      h('h2', {}, 'High score run')),
    movesEl);
  const goalBar = h('div', { class: 'goal-bar card' },
    h('span', { class: 'goal-icon', html: starIcon(true, 'Points') }),
    h('span', { class: 'goal-text' }, `Score as much as you can in ${CHALLENGE_MOVES} moves`),
    h('span', { class: 'spacer' }), scoreText);
  const info = h('p', { class: 'small muted challenge-info' }, 'Same board for everyone this week. No boosters, and tries are free. ', bestText);

  async function finish() {
    const score = game.score;
    const { best } = backend.recordChallenge(week, score, moves.slice());
    audio?.jingle?.(best ? 'graduation-jingle' : 'happy-bark');
    const result = h('div', { class: 'stack' });
    const status = h('p', { class: 'small', role: 'status' });
    let sheet;
    const again = h('button', { class: 'btn', type: 'button', onClick: () => { sheet.close(); app.go('challenge'); } }, 'Play again');
    const board = h('button', { class: 'btn secondary', type: 'button', onClick: () => { sheet.close(); app.go('leaderboard'); } }, 'Leaderboard');
    result.append(
      h('p', { class: 'eyebrow' }, 'Weekly Challenge'),
      h('h2', {}, best ? 'New best score!' : 'Run complete'),
      h('p', { class: 'big-score num' }, score.toLocaleString('en-US')),
      h('p', { class: 'small num' }, `Your best this week: ${bestOf().toLocaleString('en-US')}`),
      status,
      h('div', { class: 'btn-pair' }, again, board));
    sheet = app.modal(result, { label: 'Run complete', dismissible: false });
    if (!best) { status.textContent = 'Only your best run counts. Keep trying!'; return; }
    await sendRun(score, status, () => sheet.close());
  }

  async function sendRun(score, status, closeResult) {
    const run = { week, moves: moves.slice() };
    if (!pay?.accounts) { status.textContent = 'The leaderboard needs the internet.'; return; }
    if (!backend.state().home) await pickHome(app, { reason: 'Pick your PAWtastic to join its leaderboard and play for its prizes.' });
    if (!backend.state().home) { status.textContent = ERRORS['no-home']; return; }
    if (!pay.signedIn) {
      keepPendingRun(run);
      status.replaceChildren(
        h('span', {}, 'Save your progress (sign in with your email) to put this score on the leaderboard and play for prizes. '),
        h('button', { class: 'linkish', type: 'button', onClick: async () => {
          closeResult();
          const ok = await signInSheet(app, { title: 'Join the leaderboard', reason: 'Sign in with your email. Your score goes on the leaderboard and your progress is saved to the cloud.' });
          if (ok) location.reload(); else app.go('challenge');
        } }, 'Sign in'));
      return;
    }
    status.textContent = 'Checking your run…';
    await syncProfile(app).catch(() => null);
    const res = await pay.submitChallenge(run);
    if (!alive) return;
    if (!res.ok) {
      if (res.error === 'offline' || res.error === 'server') keepPendingRun(run);
      status.textContent = ERRORS[res.error] ?? ERRORS.offline;
      return;
    }
    backend.markChallengeSent(week, res.score);
    const where = LOCATIONS[res.location] ?? homeName(backend.state());
    status.replaceChildren(h('strong', {}, `#${res.rank} at ${where}`), ` this week (${res.players} ${res.players === 1 ? 'player' : 'players'}). `,
      res.rank <= 3 ? 'You are in the prizes right now! Hold on until Monday.' : prizeLine());
  }

  const onSwap = async (a, b) => {
    if (game.status !== 'playing' || view.isBusy()) return;
    const res = trySwap(game, a, b);
    if (!res.ok) { await view.wiggle(a, b); return; }
    moves.push([a.r, a.c, b.r, b.c]);
    view.setBusy(true);
    await view.animateSwap(a, b);
    if (!alive) return;
    await view.animate(res.steps);
    if (!alive) return;
    if (res.reshuffled) { view.render(); app.toast('No moves left — shuffling the board.'); }
    updateHud();
    view.setBusy(false);
    hint.reset();
    if (game.status === 'won') finish();
  };

  const screen = h('section', { class: 'level challenge' }, header, goalBar, info);
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
  screen.append(h('p', { class: 'small muted center' }, isPublicSite(backend) ? prizeLine() : 'Weekly Challenge'));
  updateHud();
  if (app.services.debug) window.__pawtasticChallenge = { game, moves, validMove: () => findValidMove(game.grid), swap: (a, b) => onSwap(a, b) };
  return () => { alive = false; hint.stop(); view.destroy(); if (app.services.debug) delete window.__pawtasticChallenge; };
}
