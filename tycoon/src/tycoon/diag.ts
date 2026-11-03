// PAWtastic Daycare Tycoon — private performance diagnostics (phone readiness plan, tasks 1 and 6). Only in the dev
// server and the private review build, and only after "Test tools → Diagnostics" (a per-tab flag). It measures, in
// this browser: frame intervals, the 3D view's update + draw time on the main thread, the simulation's time per tick,
// and the play screen's render time. Nothing here changes the game; when off, every record call returns at once.

const FLAG = "pawtastic-diag";
const SIZE = 600; // the last ~10 seconds at 60 fps

/** Diagnostics can exist in this build (never in the public hub build). */
export const diagAvailable = (): boolean => !!(import.meta.env.DEV || import.meta.env["VITE_REVIEW_BUILD"]);
let on = false;
try {
  on = diagAvailable() && typeof sessionStorage !== "undefined" && sessionStorage.getItem(FLAG) === "1";
} catch {
  on = false;
}
export const diagOn = () => on;
export function setDiag(v: boolean) {
  on = v && diagAvailable();
  try {
    if (on) sessionStorage.setItem(FLAG, "1");
    else sessionStorage.removeItem(FLAG);
  } catch {
    /* storage blocked: on for this page only */
  }
  reset();
}

type Ring = { v: number[]; i: number };
const ring = (): Ring => ({ v: [], i: 0 });
const push = (r: Ring, x: number) => {
  if (r.v.length < SIZE) r.v.push(x);
  else r.v[r.i] = x;
  r.i = (r.i + 1) % SIZE;
};
let frames = ring();
let render = ring();
let ticks = ring();
let ui = ring();
let since = 0;
export function reset() {
  frames = ring();
  render = ring();
  ticks = ring();
  ui = ring();
  since = typeof performance !== "undefined" ? performance.now() : 0;
}

/** One 3D frame: the time since the last one, and the main-thread time spent updating and drawing it. */
export function recordFrame(intervalMs: number, renderMs: number) {
  if (!on) return;
  if (intervalMs > 1000) return; // the page was away (locked, hidden): that's time off, not a frame
  push(frames, intervalMs);
  push(render, renderMs);
}
/** One simulation tick (the game rules, not the screen). */
export function recordTick(ms: number) {
  if (on) push(ticks, ms);
}
/** One render of the play screen (React). */
export function recordUi(ms: number) {
  if (on) push(ui, ms);
}

const sorted = (r: Ring) => [...r.v].sort((a, b) => a - b);
const pct = (s: number[], p: number) => (s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))]! : 0);
const avg = (r: Ring) => (r.v.length ? r.v.reduce((a, b) => a + b, 0) / r.v.length : 0);

export type DiagSummary = {
  seconds: number;
  frames: number;
  fps: number;
  frameP50: number;
  frameP95: number;
  frameP99: number;
  longestFrame: number;
  /** Frames over 50 ms (visible stutter) and over 100 ms (a freeze-like hitch). */
  slow50: number;
  slow100: number;
  renderAvg: number;
  renderP95: number;
  tickAvg: number;
  tickP95: number;
  ticks: number;
  uiAvg: number;
  uiP95: number;
  uiRenders: number;
};
export function summary(): DiagSummary {
  const f = sorted(frames);
  const total = frames.v.reduce((a, b) => a + b, 0);
  const r = sorted(render);
  const t = sorted(ticks);
  const u = sorted(ui);
  return {
    seconds: (performance.now() - since) / 1000,
    frames: f.length,
    fps: total > 0 ? (1000 * f.length) / total : 0,
    frameP50: pct(f, 0.5),
    frameP95: pct(f, 0.95),
    frameP99: pct(f, 0.99),
    longestFrame: f.at(-1) ?? 0,
    slow50: f.filter((x) => x > 50).length,
    slow100: f.filter((x) => x > 100).length,
    renderAvg: avg(render),
    renderP95: pct(r, 0.95),
    tickAvg: avg(ticks),
    tickP95: pct(t, 0.95),
    ticks: t.length,
    uiAvg: avg(ui),
    uiP95: pct(u, 0.95),
    uiRenders: u.length,
  };
}

if (typeof window !== "undefined" && diagAvailable()) (window as unknown as { __tycoonDiag?: unknown }).__tycoonDiag = { summary, reset, on: () => on, set: setDiag };
