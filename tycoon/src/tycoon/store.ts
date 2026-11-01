// The running Daycare Tycoon (new engine, preview). Like src/game/store.ts: one external store that every action and
// clock tick reads and writes synchronously, so rapid taps always build on each other.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { track, type EventName } from "@/lib/analytics";
import { guideProgress, guideVisible } from "./guide";
import { setOnLevel } from "./progress";
import { tick, welcomeBack } from "./run";
import { fac, newTycoon, parseTycoon } from "./state";
import { checkTrophies, type Trophy } from "./trophies";
import type { TResult, TycoonState } from "./types";

export const KEY = "pawtastic-daycare-next-v1";
export const TICK_MS = 250;

type Props = Record<string, string | number | boolean>;
export type ActOpts = { quiet?: boolean; event?: { name: EventName; props: Props } };

function setAside(raw: string) {
  try {
    localStorage.setItem(`${KEY}-unreadable-${Date.now()}`, raw);
  } catch {
    /* storage blocked */
  }
}

function load(): TycoonState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
    const parsed = raw ? parseTycoon(JSON.parse(raw)) : null;
    if (parsed) return parsed;
    if (raw) setAside(raw);
  } catch {
    if (raw) setAside(raw);
  }
  return newTycoon(Date.now());
}

function persist(s: TycoonState) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, lastSeen: Date.now() }));
  } catch {
    /* storage full / blocked */
  }
}

// ---------- the store ----------
type Snapshot = { state: TycoonState | null; paused: boolean };
let snap: Snapshot = { state: null, paused: false };
let users = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let lastTick = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Events that follow from a state change: a finished game day, and guide steps newly done. */
function report(prev: TycoonState | null, next: TycoonState, checkGuide: boolean) {
  const before = prev ? fac(prev).report : null;
  const after = fac(next).report;
  if (after && after !== before && after.day !== before?.day)
    track("tycoon_day", { day: after.day, income: after.income, expenses: after.expenses });
  if (checkGuide && prev && guideVisible(prev)) {
    const a = guideProgress(prev).checks;
    const b = guideProgress(next).checks;
    b.forEach((done, i) => {
      if (done && !a[i]) track("tycoon_guide", { step: i + 1 });
    });
  }
}

function commit(next: TycoonState | null, opts: { paused?: boolean; checkGuide?: boolean } = {}) {
  const prev = snap.state;
  snap = { state: next, paused: opts.paused ?? snap.paused };
  if (next) {
    persist(next);
    report(prev, next, opts.checkGuide ?? false);
  }
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
    commit(tick(snap.state, sec));
  }, TICK_MS);
}
function stopClock() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Load once per activation and welcome the player back. Returns the welcome bonus. */
function activate(): number {
  users++;
  setOnLevel((n) => track("tycoon_level", { level: n }));
  if (users > 1 && snap.state) return 0;
  const { state, bonus } = welcomeBack(load(), Date.now());
  commit(state, { paused: false });
  startClock();
  return bonus;
}
function deactivate() {
  users = Math.max(0, users - 1);
  if (users > 0) return;
  stopClock();
  setOnLevel(null);
  if (snap.state) persist(snap.state);
  snap = { state: null, paused: false };
}

export type ActResult = TResult & { unlocked?: Trophy[] };

export const tycoonStore = {
  getState: () => snap.state,
  getSnapshot: () => snap,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Applies an engine action to the latest state and pays any trophies it earned. */
  dispatch(fn: (s: TycoonState) => TResult): ActResult {
    const s = snap.state;
    if (!s) return { ok: false, error: "The daycare is still loading." };
    const r = fn(s);
    if (!r.ok) return r;
    const { state, unlocked } = checkTrophies(r.state);
    commit(state, { checkGuide: true });
    return { ...r, state, unlocked };
  },
  set(fn: (s: TycoonState) => TycoonState) {
    if (snap.state) commit(fn(snap.state), { checkGuide: true });
  },
  setPaused(p: boolean) {
    if (p === snap.paused) return;
    lastTick = Date.now();
    snap = { ...snap, paused: p };
    if (snap.state) persist(snap.state);
    emit();
  },
  /** Test helper: replace state without touching timers. */
  _reset(s: TycoonState | null) {
    snap = { state: s, paused: false };
    emit();
  },
};

const SERVER_SNAPSHOT: Snapshot = { state: null, paused: false };

export function useTycoon() {
  const current = useSyncExternalStore(tycoonStore.subscribe, tycoonStore.getSnapshot, () => SERVER_SNAPSHOT);

  useEffect(() => {
    const bonus = activate();
    if (bonus > 0) toast.success(`Welcome back! Your team kept everyone safe and comfy. +${bonus} coins`);
    const onHide = () => {
      if (document.hidden) tycoonStore.setPaused(true);
      if (snap.state) persist(snap.state);
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      deactivate();
    };
  }, []);

  /** Runs an action, reports it with a toast and its analytics event. Returns the result for inline reasons. */
  const act = useCallback((fn: (s: TycoonState) => TResult, opts: ActOpts = {}): ActResult => {
    const r = tycoonStore.dispatch(fn);
    if (!r.ok) {
      if (!opts.quiet) toast.error(r.error);
      return r;
    }
    if (opts.event) track(opts.event.name, opts.event.props);
    for (const t of r.unlocked ?? []) {
      track("tycoon_trophy", { id: t.id });
      toast.success(`🏆 ${t.name} · +${t.reward} coins`);
    }
    if (r.msg && !opts.quiet) toast(r.msg);
    return r;
  }, []);

  const set = useCallback((fn: (s: TycoonState) => TycoonState) => tycoonStore.set(fn), []);
  const setPaused = useCallback((p: boolean | ((p: boolean) => boolean)) => tycoonStore.setPaused(typeof p === "function" ? p(snap.paused) : p), []);

  return { state: current.state, act, set, paused: current.paused, setPaused };
}
