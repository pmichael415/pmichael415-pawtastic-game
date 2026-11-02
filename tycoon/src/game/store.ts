// Single source of truth for the running Tycoon game.
//
// Why this is an external store and not React state: the previous version computed every action from a
// ref that only updated on re-render. Two taps (or a tap and a clock tick) landing before React re-rendered
// both started from the same old state, so the second write silently replaced the first — a check-in
// could show "checked in!" and then vanish. Here every action and tick reads and writes `current`
// synchronously, so rapid actions always build on each other and double check-ins are refused by the engine.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { checkAchievements, newGame, nyDateKey, parseSave, rollMissionDay, rollWeek, tick, weekKey, welcomeBack, type GameState, type Result } from "./engine";
import { applyHubContents } from "./purchases";
import { confirmed, planDeliveries, type Delivery, type DeliveryStep } from "@/lib/purchases/delivery";
import { createSaveGuard } from "@/lib/purchases/saveGuard";

const KEY = "pawtastic-tycoon-save-v1";
export const todayKey = () => nyDateKey();
export const TICK_MS = 250;

function load(): GameState {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? parseSave(JSON.parse(raw)) : null;
    if (parsed) return parsed;
    if (raw) {
      // Keep an unreadable save aside instead of destroying it, so it can be recovered.
      localStorage.setItem(`${KEY}-unreadable-${Date.now()}`, raw);
    }
  } catch {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) localStorage.setItem(`${KEY}-unreadable-${Date.now()}`, raw);
    } catch { /* storage blocked */ }
  }
  return newGame(Date.now(), todayKey());
}

/** The stored save, parsed, without side effects (no setting aside). */
function readStored(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseSave(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
const guard = createSaveGuard<GameState>(KEY, readStored);

function persist(s: GameState, force = false) {
  // Another tab stored purchases this one doesn't have: take its save instead of writing over it.
  const adopt = force ? null : guard.check(s);
  if (adopt) {
    snap = { ...snap, state: adopt };
    emit();
    return;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, lastSeen: Date.now() }));
  } catch {
    /* storage full / blocked */
  }
}

/**
 * Adds reserved deliveries (Recess Rush power-ups) to the latest stored save and writes it once, with their ids.
 * ok=false (and nothing changed) if the write fails, so the caller must not confirm.
 */
export function applyDeliveries(batch: Delivery[]): { ok: boolean; ids: string[]; steps: DeliveryStep[] } {
  const base = readStored() ?? snap.state ?? newGame(Date.now(), todayKey());
  const { steps, log } = planDeliveries(base.deliveries, batch);
  let next = base;
  for (const step of steps) next = applyHubContents(next, step.contents, step.sign);
  next = { ...next, deliveries: log };
  const recorded = new Set([...log.applied, ...log.done]);
  const ids = batch.map((d) => d.id).filter((id) => recorded.has(id));
  const changed = steps.length > 0 || log.applied.length !== base.deliveries.applied.length;
  if (changed && !guard.deliveryWrite(JSON.stringify({ ...next, lastSeen: Date.now() }))) return { ok: false, ids: [], steps: [] };
  if (snap.state) {
    snap = { ...snap, state: next };
    emit();
  }
  return { ok: true, ids, steps };
}

/** After the server confirmed them: ids move from applied to done (best effort; they dedupe either way). */
export function confirmDeliveries(ids: string[]) {
  const base = readStored() ?? snap.state;
  if (!base) return;
  const next = { ...base, deliveries: confirmed(base.deliveries, ids) };
  if (guard.deliveryWrite(JSON.stringify({ ...next, lastSeen: Date.now() })) && snap.state) {
    snap = { ...snap, state: next };
    emit();
  }
}

// ---------- the store ----------
type Snapshot = { state: GameState | null; paused: boolean };
let snap: Snapshot = { state: null, paused: false };
let users = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let lastTick = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function commit(next: GameState | null, paused = snap.paused) {
  snap = { state: next, paused };
  if (next) persist(next);
  emit();
}

function startClock() {
  if (timer) return;
  lastTick = Date.now();
  timer = setInterval(() => {
    const now = Date.now();
    // Clamp so a throttled background tab can't fast-forward the day.
    const sec = Math.min(1, Math.max(0, (now - lastTick) / 1000));
    lastTick = now;
    if (!snap.state || snap.paused || sec <= 0) return;
    commit(rollWeek(rollMissionDay(tick(snap.state, sec), todayKey()), weekKey()));
  }, TICK_MS);
}
function stopClock() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Load (once per activation) and welcome the player back. Returns the welcome bonus. */
function activate(): number {
  users++;
  if (users > 1 && snap.state) return 0;
  const { state, bonus } = welcomeBack(rollWeek(rollMissionDay(load(), todayKey()), weekKey()), Date.now());
  commit(state, false);
  startClock();
  return bonus;
}
function deactivate() {
  users = Math.max(0, users - 1);
  if (users > 0) return;
  stopClock();
  if (snap.state) persist(snap.state);
  snap = { state: null, paused: false };
}

export const gameStore = {
  getState: () => snap.state,
  getSnapshot: () => snap,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Apply an engine action against the latest state. Synchronous; returns the engine result. */
  dispatch(fn: (s: GameState) => Result): Result {
    const s = snap.state;
    if (!s) return { ok: false, error: "The daycare is still loading." };
    const r = fn(s);
    if (!r.ok) return r;
    const { state, unlocked } = checkAchievements(r.state);
    commit(state);
    return { ...r, state, unlocked } as Result & { unlocked: typeof unlocked };
  },
  set(fn: (s: GameState) => GameState) {
    if (snap.state) commit(fn(snap.state));
  },
  setPaused(p: boolean) {
    if (p === snap.paused) return;
    lastTick = Date.now();
    snap = { ...snap, paused: p };
    if (snap.state) persist(snap.state);
    emit();
  },
  /** Test helper: replace state without touching timers. */
  _reset(s: GameState | null) {
    snap = { state: s, paused: false };
    emit();
  },
};

/** Save a game made elsewhere (cloud download). Updates the running game too, so it can't be overwritten. */
export function save(s: GameState) {
  persist(s, true); // a cloud restore the player chose replaces the save as a whole
  if (snap.state) commit(s);
}

export function resetSave() {
  localStorage.removeItem(KEY);
  if (snap.state) commit(newGame(Date.now(), todayKey()), false);
}

/** Read-modify-write helper for other screens (Recess Rush, share). Goes through the live game if it's running. */
export function updateSave(fn: (s: GameState) => GameState) {
  if (snap.state) {
    gameStore.set(fn);
    return snap.state;
  }
  const next = fn(load());
  persist(next);
  return next;
}

/** Read-only snapshot for screens that don't run the clock (hub, shop). */
export function peekSave(): GameState {
  return snap.state ?? load();
}

const SERVER_SNAPSHOT: Snapshot = { state: null, paused: false };
export function useGame() {
  const current = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot, () => SERVER_SNAPSHOT);

  useEffect(() => {
    const bonus = activate();
    if (bonus > 0) toast.success(`Welcome back! Your team kept everyone safe and comfy. +${bonus} coins`);
    const onHide = () => {
      if (document.hidden) {
        gameStore.setPaused(true);
        if (snap.state) persist(snap.state);
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      deactivate();
    };
  }, []);

  /** Runs an action and reports it with a toast. Returns the result so UIs can show inline reasons. */
  const act = useCallback((fn: (s: GameState) => Result, opts: { quiet?: boolean } = {}) => {
    const r = gameStore.dispatch(fn) as Result & { unlocked?: { label: string }[] };
    if (!r.ok) {
      if (!opts.quiet) toast.error(r.error);
      return r;
    }
    r.unlocked?.forEach((a) => toast.success(`🏆 ${a.label}`));
    if (r.msg && !opts.quiet) toast(r.msg + (r.earned ? `  +${r.earned}🪙` : ""));
    return r;
  }, []);

  const set = useCallback((fn: (s: GameState) => GameState) => gameStore.set(fn), []);
  const setPaused = useCallback((p: boolean | ((p: boolean) => boolean)) => gameStore.setPaused(typeof p === "function" ? p(snap.paused) : p), []);

  return { state: current.state, act, set, paused: current.paused, setPaused };
}
