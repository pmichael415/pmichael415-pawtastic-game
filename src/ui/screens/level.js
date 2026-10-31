// Playing a level: HUD, board, boosters, quit, and the end-of-level flow.

import { h } from '../dom.js';
import { tileSVG, leashSVG, professorPawsSVG } from '../art.js';
import { starIcon, heartIcon, shuffleIcon, mudIcon, closeIcon } from '../icons.js';
import { createBoardView } from '../board-view.js';
import { createHint } from '../hint.js';
import { renderWin, renderLoss } from './results.js';
import { formatCountdown } from '../topbar.js';
import { TIPS } from '../tips.js';
import { getLevel, areaOf, isHardLevel } from '../../engine/levels.js';
import { createGame, trySwap, addMoves, useBooster, canUseBooster, snapshotGame, restoreGame, goalProgress, remainingText, KIND_NAMES } from '../../engine/game.js';
import { findValidMove } from '../../engine/shuffle.js';
import { ITEMS, PACKS, formatUsd } from '../../economy/catalog.js';
import { confirmPurchase } from '../purchase.js';
import { withBusy, showFailure } from '../failure.js';
import { treatPrice, showsDollars } from '../prices.js';

const BOOSTER_INFO = {
  shuffle: { name: 'Shuffle', art: () => shuffleIcon() },
  bomb: { name: 'Bone Bomb', art: () => tileSVG('bone', 'bomb') },
  blaster: { name: 'Bubble Blaster', art: () => tileSVG(null, 'blaster') },
};

function goalIcon(goal) {
  if (goal.type === 'collect') return tileSVG(goal.kind, null);
  if (goal.type === 'mud') return mudIcon('Mud');
  if (goal.type === 'leash') return leashSVG(2);
  return starIcon(true, 'Points');
}

function goalLabel(game) {
  const { goal } = game.level;
  const p = goalProgress(game);
  if (goal.type === 'collect') return `${Math.min(p.current, p.target)} / ${p.target} ${KIND_NAMES[goal.kind][1]}`;
  if (goal.type === 'mud') return `${p.current} / ${p.target} mud cleaned`;
  if (goal.type === 'leash') return `${p.current} / ${p.target} leash knots untied`;
  return `${Math.min(p.current, p.target).toLocaleString('en-US')} / ${p.target.toLocaleString('en-US')} points`;
}

function outOfLives(app, levelId) {
  const { backend } = app.services;
  const bal = backend.balance();
  const price = ITEMS.lives.treats;
  const countdown = h('p', { class: 'num' });
  // A life coming back shows a Play button rather than starting by itself: the server has
  // the final word, and a phone clock that runs fast must not bounce between screens.
  const play = h('button', { class: 'btn', type: 'button', hidden: true, onClick: () => app.go('level', { levelId }) }, 'Play');
  const tick = () => {
    const l = backend.lives();
    const back = l.count > 0;
    play.hidden = !back;
    buy.hidden = back || !canBuy;
    countdown.textContent = back ? 'A life is back!' : `Next free life in ${formatCountdown(l.nextInMs)}`;
  };
  // Refill with Treats, or (only where Treats can be bought) go and get some.
  const canBuy = bal.total >= price || showsDollars(app);
  const buy = bal.total >= price
    ? h('button', { class: 'btn', type: 'button', onClick: e => refill(e) }, `Refill for ${treatPrice(app, price)}`)
    : h('button', { class: 'btn', type: 'button', onClick: () => app.go('shop') }, 'Get Treats');
  const refill = async e => {
    const res = await withBusy(e.currentTarget, () => backend.buyItem('lives'));
    if (res.ok) { app.toast('Lives refilled.'); app.go('level', { levelId }); }
    else showFailure(app, res.error);
  };
  app.view.append(h('section', { class: 'results stack' },
    h('span', { html: heartIcon('Lives'), class: 'big-icon' }),
    h('h1', {}, 'Out of lives'),
    h('p', { class: 'muted' }, 'Lives come back free, one every 30 minutes.'),
    countdown,
    h('div', { class: 'btn-pair' },
      play,
      buy,
      h('button', { class: 'btn secondary', type: 'button', onClick: () => app.go('map') }, 'No thanks')),
  ));
  tick();
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer);
}

// Starts the level (using a life), or, when asked to, picks up its saved board instead,
// which costs nothing. Resolves { ok, snapshot } or { ok: false, error }.
export async function beginLevel(backend, levelId, resume) {
  if (resume) {
    const res = await backend.resumeLevel(levelId);
    if (res.ok) return { ok: true, snapshot: res.snapshot };
  }
  const start = await backend.startLevel(levelId);
  return start.ok ? { ok: true, snapshot: null } : { ok: false, error: start.error };
}

// Starting a level uses a life, which the backend decides (the server, in the real app),
// so the board is built only once the start comes back.
export function render(app, { levelId = 1, resume = false } = {}) {
  let cleanup = null;
  let left = false;
  app.view.append(h('p', { class: 'boot' }, 'Getting your board ready…'));
  beginLevel(app.services.backend, levelId, resume).then(begun => {
    if (left) return;
    app.view.replaceChildren();
    if (begun.ok) cleanup = play(app, levelId, begun.snapshot);
    else if (begun.error === 'no-lives') cleanup = outOfLives(app, levelId);
    else { showFailure(app, begun.error, () => app.go('level', { levelId })); app.go('map'); }
  });
  return () => { left = true; if (typeof cleanup === 'function') cleanup(); };
}

function play(app, levelId, snapshot = null) {
  const { backend, debug, audio } = app.services;
  const level = getLevel(levelId);

  // A saved board picks up exactly where it was; otherwise a new one is dealt.
  const game = (snapshot && restoreGame(level, snapshot)) || createGame(level, (Date.now() ^ (levelId * 7919)) >>> 0);
  // Saved after every change, so closing the app mid-level loses nothing.
  const saveBoard = () => {
    if (game.status === 'playing' || game.status === 'lost') backend.saveLevelSnapshot?.(snapshotGame(game));
  };
  let ended = false;
  let view;
  let winTimer = null;
  let alive = true; // false once the player leaves; a move still animating must then stop
  let win = null;

  const NO_NEWS = { newBadges: [], unlockedCostume: null, areaCompleted: null, pawPoints: 0, starterPackOffer: false };
  // Resolves the level's summary; a failed save still lets the result screen show.
  const end = async won => {
    if (ended) return null;
    ended = true;
    const summary = await backend.endLevel({ levelId, won, stars: won ? game.stars : 0, score: game.score, movesMade: game.movesMade });
    if (summary.ok === false) { showFailure(app, summary.error); return NO_NEWS; }
    if (summary.queued) app.toast("Saved on this phone. We'll send it when you're back online.");
    return summary;
  };

  // ---------- HUD ----------
  const movesEl = h('div', { class: 'moves num', 'data-moves': String(game.movesLeft), 'aria-live': 'polite' });
  const goalText = h('span', { class: 'goal-text num' });
  const scoreText = h('span', { class: 'num score-text' });
  const starFill = h('div', { class: 'star-fill' });
  const [s2, s3] = level.stars;
  const markers = [s2, s3].map(s => h('span', { class: 'star-mark', style: `left:${(s / s3) * 100}%`, html: starIcon(false) }));
  const starReached = [false, false];
  let lastMoves = game.movesLeft;
  const updateHud = () => {
    if (game.movesLeft <= 5 && game.movesLeft !== lastMoves) {
      movesEl.classList.remove('pulse');
      void movesEl.offsetWidth;
      movesEl.classList.add('pulse');
    }
    movesEl.classList.toggle('low', game.movesLeft <= 5);
    lastMoves = game.movesLeft;
    movesEl.dataset.moves = String(game.movesLeft);
    movesEl.replaceChildren(h('strong', {}, String(game.movesLeft)), h('span', {}, game.movesLeft === 1 ? 'move' : 'moves'));
    goalText.textContent = goalLabel(game);
    scoreText.textContent = `${game.score.toLocaleString('en-US')} pts`;
    starFill.style.width = `${Math.min(100, (game.score / s3) * 100)}%`;
    markers.forEach((m, i) => {
      const reached = game.score >= [s2, s3][i];
      m.innerHTML = starIcon(reached);
      if (reached && !starReached[i]) { m.classList.add('pop'); audio?.sfx('star', i + 2); }
      starReached[i] = reached;
    });
  };

  const quit = () => {
    let sheet;
    sheet = app.modal(h('div', { class: 'stack' },
      h('h2', {}, 'Quit this level?'),
      h('p', {}, "You'll use one life."),
      h('div', { class: 'btn-pair' },
        h('button', { class: 'btn', type: 'button', onClick: () => { sheet.close(); end(false); app.go('map'); } }, 'Quit level'),
        h('button', { class: 'btn secondary', type: 'button', onClick: () => sheet.close() }, 'Keep playing')),
    ), { label: 'Quit level' });
  };

  const header = h('div', { class: 'level-head' },
    h('button', { class: 'btn secondary icon-btn', type: 'button', 'aria-label': 'Quit level', onClick: quit, html: closeIcon() }),
    h('div', { class: 'level-title' },
      h('p', { class: 'eyebrow' }, areaOf(levelId).name),
      h('h2', {}, `Level ${levelId}`, isHardLevel(levelId) ? h('span', { class: 'quiz-tag' }, 'Pop quiz') : null)),
    movesEl,
  );
  const goalBar = h('div', { class: 'goal-bar card' },
    h('span', { class: 'goal-icon', html: goalIcon(level.goal) }), goalText, h('span', { class: 'spacer' }), scoreText,
    h('div', { class: 'star-track', 'aria-hidden': 'true' }, starFill, ...markers));

  // ---------- boosters ----------
  const tray = h('div', { class: 'booster-tray' });
  let activeBooster = null;
  const renderTray = () => {
    const owned = backend.state().inventory.boosters;
    tray.replaceChildren(...['shuffle', 'bomb', 'blaster'].map(type => h('button', {
      type: 'button', class: `booster${activeBooster === type ? ' active' : ''}`,
      'aria-label': `${BOOSTER_INFO[type].name}, ${owned[type]} left`, onClick: () => useBoosterType(type),
    }, h('span', { class: 'booster-art', html: BOOSTER_INFO[type].art() }), h('span', { class: 'booster-count num' }, String(owned[type])), h('span', { class: 'booster-name' }, BOOSTER_INFO[type].name))));
  };
  const useBoosterType = async type => {
    if (view.isBusy() || game.status !== 'playing') return;
    if (activeBooster === type) { activeBooster = null; view.setTargeting(null); renderTray(); return; }
    if (backend.state().inventory.boosters[type] < 1) { app.toast(`No ${BOOSTER_INFO[type].name}s left. Get more in the Shop.`); return; }
    // The booster is taken first, then placed, so a refused spend never changes the board.
    const spend = async () => {
      view.setBusy(true);
      const res = await backend.useBoosterItem(type);
      if (!alive) return false;
      view.setBusy(false);
      if (!res.ok) showFailure(app, res.error);
      return res.ok;
    };
    if (type === 'shuffle') {
      if (canUseBooster(game, 'shuffle') && await spend()) { useBooster(game, 'shuffle'); saveBoard(); view.render(); app.toast('Board shuffled.'); renderTray(); }
      return;
    }
    activeBooster = type;
    app.toast(`Tap a piece to place the ${BOOSTER_INFO[type].name}.`);
    view.setTargeting(async cell => {
      if (!canUseBooster(game, type, cell)) { app.toast('Pick a regular piece.'); return; }
      view.setTargeting(null);
      activeBooster = null;
      if (await spend()) { useBooster(game, type, cell); saveBoard(); }
      view.render();
      renderTray();
    });
    renderTray();
  };

  // ---------- end of moves ----------
  const outOfMoves = () => {
    const { backend: w } = app.services;
    let sheet;
    const price = ITEMS.moves5.treats;
    const body = h('div', { class: 'stack' });
    const draw = () => {
      const enough = w.balance().total >= price;
      body.replaceChildren(
        h('h2', {}, 'So close!'),
        h('p', { class: 'remaining' }, `${remainingText(game)} to go.`),
        h('p', { class: 'muted small' }, `You have ${w.balance().total} Treats.`),
        h('div', { class: 'btn-pair' },
          enough
            ? h('button', { class: 'btn', type: 'button', onClick: buyMoves }, `+5 moves for ${treatPrice(app, price)}`)
            : showsDollars(app) ? h('button', { class: 'btn', type: 'button', onClick: buyTreats }, `Get ${PACKS[0].treats} Treats for ${formatUsd(PACKS[0].usd)}`) : null,
          h('button', { class: 'btn secondary', type: 'button', onClick: giveUp }, 'No thanks')),
      );
    };
    const buyMoves = async e => {
      const res = await withBusy(e.currentTarget, () => w.buyItem('moves5'));
      if (!res.ok) { showFailure(app, res.error); draw(); return; }
      addMoves(game, 5);
      saveBoard();
      sheet.close();
      updateHud();
    };
    const buyTreats = async () => {
      const ok = await confirmPurchase(app, { title: `${PACKS[0].treats} Treats`, usd: PACKS[0].usd, lines: [`${PACKS[0].treats} Treats`] });
      if (ok) {
        const res = await w.buyPack(PACKS[0].id);
        if (res.ok) app.toast('Treats added. Receipt sent (demo).');
        else showFailure(app, res.error);
      }
      draw();
    };
    const giveUp = async () => {
      sheet.close();
      const summary = await end(false);
      if (!alive) return;
      renderLoss(app, { levelId, summary });
    };
    draw();
    sheet = app.modal(body, { label: 'Out of moves', dismissible: false });
  };

  // ---------- moves ----------
  const onSwap = async (a, b) => {
    if (game.status !== 'playing' || view.isBusy()) return;
    const res = trySwap(game, a, b);
    if (!res.ok) { await view.wiggle(a, b); return; }
    view.setBusy(true);
    movesEl.dataset.moves = String(game.movesLeft);
    await view.animateSwap(a, b);
    if (!alive) return;
    await view.animate(res.steps);
    if (!alive) return;
    if (res.reshuffled) { view.render(); app.toast('No moves left — shuffling the board.'); }
    updateHud();
    view.setBusy(false);
    hint.reset();
    saveBoard();
    if (game.status === 'won') {
      const before = backend.state().progress.unlocked;
      const summary = await end(true);
      if (!alive) return;
      const after = backend.state().progress.unlocked;
      if (after > before) app.services.lastWin = { from: levelId, to: after };
      winTimer = setTimeout(() => { win = renderWin(app, { levelId, score: game.score, starsEarned: game.stars, summary, bonus: game.bonus }); }, 400);
    } else if (game.status === 'lost') {
      outOfMoves();
    }
  };

  const tip = TIPS[levelId] && level.tip
    ? h('div', { class: 'tip card', role: 'note' },
      h('span', { class: 'tip-prof', html: professorPawsSVG({ mood: 'think' }) }),
      h('p', {}, TIPS[levelId]),
      h('button', { class: 'tip-close', type: 'button', 'aria-label': 'Got it, hide tip', html: closeIcon(), onClick: e => e.currentTarget.closest('.tip').remove() }))
    : null;

  const screen = h('section', { class: 'level' }, header, goalBar, tip);
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
  screen.append(tray);
  renderTray();
  updateHud();
  saveBoard(); // a level closed before its first move can still be picked up
  if (game.status === 'lost') outOfMoves(); // it was saved at "So close!"

  if (debug) window.__pawtastic = { game, validMove: () => findValidMove(game.grid) };

  return () => {
    alive = false;
    clearTimeout(winTimer);
    win?.destroy();
    hint.stop();
    view.destroy();
    // Leaving without Quit keeps the level in progress; it's picked up from the map later.
    if (debug) delete window.__pawtastic;
  };
}
