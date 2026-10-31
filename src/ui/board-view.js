// The game board: tiles positioned with CSS transforms, swipe or tap input,
// and step-by-step animation of what the engine resolved.
// All input is ignored while a move is animating (busy).

import { h, reducedMotion } from './dom.js';
import { tileSVG, TILE_COLORS } from './art.js';
import { stepEffects } from '../fx/step-effects.js';
import { SPECIAL_LABELS, calloutSize } from '../fx/callouts.js';
import { createParticleLayer } from '../fx/particles.js';
import { cellAt } from '../engine/grid.js';
import { KIND_NAMES } from '../engine/game.js';

const SWIPE_PX = 18;
const MS = { swap: 180, clear: 220, fall: 230, wiggle: 160, callout: 700 };
const SPECIAL_NAMES = { zoomieH: 'Zoomie', zoomieV: 'Zoomie', bomb: 'Bone Bomb', blaster: 'Bubble Blaster' };

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function tileName(kind, special) {
  if (special === 'blaster') return 'Bubble Blaster';
  const base = KIND_NAMES[kind]?.[0] ?? 'Piece';
  return special ? `${base} ${SPECIAL_NAMES[special]}` : base;
}

// `fx` (optional): { audio, effects } — sounds and celebration effects; effects() false means fades only.
export function createBoardView(container, game, { onSwap, fx = null }) {
  const grid = game.grid;
  const motion = !reducedMotion();
  const dur = ms => (motion ? ms : 0);
  const board = h('div', { class: 'board', role: 'group', 'aria-label': 'Game board', style: `aspect-ratio:${grid.cols}/${grid.rows}` });
  if (!motion) board.classList.add('no-motion');
  const wrap = h('div', { class: 'board-wrap' }, board);
  container.append(wrap);
  const effectsOn = () => !!fx && fx.effects() && motion;
  let destroyed = false;
  const sound = (name, arg) => { if (!destroyed) fx?.audio?.sfx(name, arg); };
  const layer = fx ? createParticleLayer(wrap, { enabled: effectsOn }) : null;
  const transient = new Set();

  const tiles = new Map(); // id → { el, r, c, kind, special }
  const under = new Map(); // "r,c" → { cell, crate }
  let cellSize = 40;
  let busy = false;
  let selected = null;
  let targeting = null;
  let gesture = null;

  // ---------- layout ----------
  function px(r, c) { return `translate(${c * cellSize}px, ${r * cellSize}px)`; }

  function buildUnderlay() {
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const cell = cellAt(grid, r, c);
        const el = h('div', { class: cell ? 'cell' : 'cell blocked', 'aria-hidden': 'true' });
        const crate = h('div', { class: 'crate', hidden: true, 'aria-hidden': 'true' });
        el.append(crate);
        board.append(el);
        under.set(`${r},${c}`, { el, crate });
        updateObstacles(r, c);
      }
    }
  }

  function updateObstacles(r, c) {
    const cell = cellAt(grid, r, c);
    const u = under.get(`${r},${c}`);
    if (!u || !cell) return;
    u.el.classList.toggle('mud1', cell.mud === 1);
    u.el.classList.toggle('mud2', cell.mud === 2);
    u.crate.hidden = cell.crate === 0;
    u.crate.className = `crate crate${cell.crate}`;
  }

  function setObstacle(r, c, { crate, mud }) {
    const u = under.get(`${r},${c}`);
    if (!u) return;
    if (mud !== undefined) { u.el.classList.toggle('mud1', mud === 1); u.el.classList.toggle('mud2', mud === 2); }
    if (crate !== undefined) { u.crate.hidden = crate === 0; u.crate.className = `crate crate${crate}`; }
  }

  function measure() {
    cellSize = board.clientWidth / grid.cols || 40;
    board.style.setProperty('--cell', `${cellSize}px`);
    for (const [key, u] of under) {
      const [r, c] = key.split(',').map(Number);
      u.el.style.transform = px(r, c);
    }
    for (const t of tiles.values()) t.el.style.transform = px(t.r, t.c);
  }

  // ---------- tiles ----------
  function label(t) {
    t.el.setAttribute('aria-label', `${tileName(t.kind, t.special)}, row ${t.r + 1} column ${t.c + 1}`);
  }

  function place(tile, r, c, { startRow } = {}) {
    let t = tiles.get(tile.id);
    if (!t) {
      const el = h('button', { type: 'button', class: 'tile' });
      board.append(el);
      t = { el, r, c, kind: undefined, special: undefined };
      tiles.set(tile.id, t);
      if (startRow !== undefined) {
        el.classList.add('instant');
        el.style.transform = px(startRow, c);
        el.getBoundingClientRect();
        el.classList.remove('instant');
      }
    }
    if (t.kind !== tile.kind || t.special !== tile.special) {
      t.kind = tile.kind;
      t.special = tile.special;
      t.el.innerHTML = tileSVG(tile.kind, tile.special);
      if (tile.special) t.el.dataset.special = tile.special; else delete t.el.dataset.special;
    }
    t.r = r; t.c = c;
    t.el.dataset.r = r;
    t.el.dataset.c = c;
    t.el.style.transform = px(r, c);
    label(t);
    return t;
  }

  function tileAt(r, c) {
    for (const t of tiles.values()) if (t.r === r && t.c === c) return t;
    return null;
  }

  function removeTile(id) {
    const t = tiles.get(id);
    if (!t) return;
    t.el.remove();
    tiles.delete(id);
  }

  function render() {
    const seen = new Set();
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const cell = cellAt(grid, r, c);
        updateObstacles(r, c);
        if (cell && cell.tile) { seen.add(cell.tile.id); place(cell.tile, r, c); }
      }
    }
    for (const id of [...tiles.keys()]) if (!seen.has(id)) removeTile(id);
    clearSelection();
  }

  // ---------- effects ----------
  const centre = (r, c) => ({ x: (c + 0.5) * cellSize, y: (r + 0.5) * cellSize });

  // A short-lived label over the board (callouts, floating points, special names). Never takes taps.
  function flash(cls, text, r, c, ms) {
    const el = h('div', { class: cls, 'aria-hidden': 'true' }, text);
    if (r !== undefined) { const p = centre(r, c); el.style.left = `${p.x}px`; el.style.top = `${p.y}px`; }
    wrap.append(el);
    transient.add(el);
    setTimeout(() => { el.remove(); transient.delete(el); }, ms);
  }

  function showCallout(text, stepNo) {
    if (!text) return;
    const el = h('div', { class: 'callout', role: 'status', style: `--size:${calloutSize(stepNo)}` }, text);
    wrap.append(el);
    transient.add(el);
    setTimeout(() => { el.remove(); transient.delete(el); }, MS.callout);
  }

  function shake() {
    if (!effectsOn()) return;
    wrap.classList.remove('shake');
    void wrap.offsetWidth;
    wrap.classList.add('shake');
    setTimeout(() => wrap.classList.remove('shake'), 160);
  }

  function playStepEffects(step, stepNo) {
    const e = stepEffects(step, stepNo);
    for (const [name, arg] of e.sounds) sound(name, arg);
    showCallout(e.callout, stepNo);
    if (!layer) return e;
    for (const cl of step.cleared) {
      const p = centre(cl.r, cl.c);
      layer.burst(p.x, p.y, TILE_COLORS[cl.kind] ?? '#7FB8F0', 4);
    }
    if (e.centroid) {
      const p = centre(e.centroid.r, e.centroid.c);
      layer.paws(p.x, p.y, TILE_COLORS[step.cleared[0]?.kind] ?? '#0068D6');
      if (e.points > 0) flash('float-points num', `+${e.points}`, e.centroid.r, e.centroid.c, 800);
    }
    for (const f of e.fired) {
      const p = centre(f.r, f.c);
      if (f.type === 'zoomieH') layer.streak(0, p.y, grid.cols * cellSize, p.y, '#FFFFFF');
      else if (f.type === 'zoomieV') layer.streak(p.x, 0, p.x, grid.rows * cellSize, '#FFFFFF');
      else if (f.type === 'bomb') { layer.ring(p.x, p.y, '#F6A823'); shake(); }
      else if (f.type === 'blaster') for (const cl of step.cleared) { const q = centre(cl.r, cl.c); layer.bubbles(q.x, q.y); }
    }
    return e;
  }

  // ---------- animation ----------
  async function animateSwap(a, b) {
    sound('swap');
    const ta = tileAt(a.r, a.c), tb = tileAt(b.r, b.c);
    if (ta) { ta.r = b.r; ta.c = b.c; ta.el.style.transform = px(b.r, b.c); }
    if (tb) { tb.r = a.r; tb.c = a.c; tb.el.style.transform = px(a.r, a.c); }
    await wait(dur(MS.swap));
  }

  async function wiggle(a, b) {
    sound('invalid');
    const t = tileAt(a.r, a.c);
    if (!t || !motion) return;
    const dr = (b.r - a.r) * 0.3, dc = (b.c - a.c) * 0.3;
    t.el.style.transform = px(a.r + dr, a.c + dc);
    await wait(MS.wiggle);
    t.el.style.transform = px(a.r, a.c);
    await wait(MS.wiggle);
  }

  async function animate(steps) {
    for (const [i, step] of steps.entries()) {
      if (destroyed) return;
      for (const tr of step.transformed) {
        const t = tileAt(tr.r, tr.c);
        if (t) { t.special = tr.special; t.el.innerHTML = tileSVG(t.kind, t.special); label(t); }
      }
      const e = playStepEffects(step, i + 1);
      for (const cl of step.cleared) tiles.get(cl.id)?.el.classList.add(effectsOn() ? 'popping' : 'clearing');
      await wait(dur(MS.clear));
      for (const cl of step.cleared) removeTile(cl.id);
      for (const k of step.crates) setObstacle(k.r, k.c, { crate: k.left });
      for (const m of step.mud) setObstacle(m.r, m.c, { mud: m.left });
      for (const cr of step.created) place(cr.tile, cr.r, cr.c).el.classList.add('pop-in');
      for (const m of e.made) {
        tileAt(m.r, m.c)?.el.classList.add('made');
        flash('special-label', SPECIAL_LABELS[m.special], m.r, m.c, 900);
      }
      for (const f of step.fell) {
        const t = tiles.get(f.id);
        if (t) { t.r = f.to.r; t.c = f.to.c; t.el.style.transform = px(f.to.r, f.to.c); t.el.dataset.r = f.to.r; t.el.dataset.c = f.to.c; label(t); }
      }
      const perColumn = new Map();
      for (const s of step.spawned) perColumn.set(s.c, (perColumn.get(s.c) || 0) + 1);
      for (const s of step.spawned) place(s.tile, s.r, s.c, { startRow: s.r - perColumn.get(s.c) });
      await wait(dur(MS.fall));
    }
    if (destroyed) return;
    render();
  }

  // ---------- hint ----------
  let nudged = [];
  function nudge(a, b) {
    clearNudge();
    const cls = effectsOn() ? 'nudge' : 'hinted';
    for (const [p, q] of [[a, b], [b, a]]) {
      const t = tileAt(p.r, p.c);
      if (!t) continue;
      t.el.style.setProperty('--nx', `${(q.c - p.c) * 6}px`);
      t.el.style.setProperty('--ny', `${(q.r - p.r) * 6}px`);
      t.el.classList.add(cls);
      nudged.push(t.el);
    }
  }
  function clearNudge() {
    for (const el of nudged) el.classList.remove('nudge', 'hinted');
    nudged = [];
  }

  // ---------- input ----------
  function clearSelection() {
    if (selected) tileAt(selected.r, selected.c)?.el.classList.remove('selected');
    selected = null;
  }

  function select(p) {
    clearSelection();
    selected = p;
    tileAt(p.r, p.c)?.el.classList.add('selected');
  }

  function trigger(a, b) {
    if (busy) return;
    if (b.r < 0 || b.c < 0 || b.r >= grid.rows || b.c >= grid.cols) return;
    clearSelection();
    onSwap(a, b);
  }

  function tap(p) {
    if (busy) return;
    if (targeting) { const fn = targeting; fn(p); return; }
    if (!selected) { select(p); return; }
    if (selected.r === p.r && selected.c === p.c) { clearSelection(); return; }
    if (Math.abs(selected.r - p.r) + Math.abs(selected.c - p.c) === 1) { trigger(selected, p); return; }
    select(p);
  }

  const posOf = el => ({ r: Number(el.dataset.r), c: Number(el.dataset.c) });

  function onPointerDown(e) {
    const el = e.target.closest('.tile');
    if (!el || busy) return;
    gesture = { ...posOf(el), x: e.clientX, y: e.clientY, moved: false };
  }

  function onPointerMove(e) {
    if (!gesture || gesture.moved || busy || targeting) return;
    const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    gesture.moved = true;
    const b = Math.abs(dx) > Math.abs(dy)
      ? { r: gesture.r, c: gesture.c + Math.sign(dx) }
      : { r: gesture.r + Math.sign(dy), c: gesture.c };
    trigger({ r: gesture.r, c: gesture.c }, b);
  }

  function onPointerUp() {
    if (!gesture) return;
    const g = gesture;
    gesture = null;
    if (!g.moved) tap({ r: g.r, c: g.c });
  }

  function onClick(e) {
    // Keyboard activation (Enter/Space) arrives as a click with detail 0.
    if (e.detail !== 0) return;
    const el = e.target.closest('.tile');
    if (el) tap(posOf(el));
  }

  board.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  board.addEventListener('click', onClick);
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
  resizeObserver?.observe(board);

  buildUnderlay();
  render();
  measure();

  return {
    render,
    animateSwap,
    animate,
    wiggle,
    setBusy(value) { busy = value; board.classList.toggle('busy', value); },
    isBusy: () => busy,
    setTargeting(fn) {
      targeting = fn;
      clearSelection();
      board.classList.toggle('targeting', !!fn);
    },
    nudge,
    clearNudge,
    wrap,
    destroy() {
      destroyed = true;
      layer?.destroy();
      for (const el of transient) el.remove();
      transient.clear();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      resizeObserver?.disconnect();
    },
  };
}
