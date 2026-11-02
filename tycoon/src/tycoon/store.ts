// The running Daycare Tycoon (new engine, preview). Like src/game/store.ts: one external store that every action and
// clock tick reads and writes synchronously, so rapid taps always build on each other.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { track, type EventName } from "@/lib/analytics";
import { guideProgress, guideVisible } from "./guide";
import { setOnLevel } from "./progress";
import { buyLand, placeFirstFree } from "./build";
import { createArrival, tick, welcomeBack } from "./run";
import { fac, newTycoon, parseTycoon, withFac } from "./state";
import { checkTrophies, type Trophy } from "./trophies";
import { TOUR_ORDER, hasTourUpgrade, syncTour } from "./tour";
import { rollWeekly } from "./weekly";
import { nyDateKey, weekKey } from "@/game/engine";
import type { Controls } from "./controls";
import type { TDog, TResult, TycoonState } from "./types";
import { applyTycoonContents } from "./purchases";
import { confirmed, planDeliveries, type Delivery, type DeliveryStep } from "@/lib/purchases/delivery";
import { createSaveGuard } from "@/lib/purchases/saveGuard";
import { LEASE_REFRESH_MS, claimLease, heldElsewhere, releaseLease, tabId } from "./lease";

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

/** The stored save, parsed, without side effects (no setting aside). */
function readStored(): TycoonState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseTycoon(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
const guard = createSaveGuard<TycoonState>(KEY, readStored);

// ---------- one tab plays (the lease): only the leading tab runs the clock and writes the save ----------
const TAB = typeof window !== "undefined" ? tabId() : "server";
let leading = true;
let leaseTimer: ReturnType<typeof setInterval> | null = null;
const storage = () => (typeof localStorage !== "undefined" ? localStorage : null);

function persist(s: TycoonState) {
  if (!leading) return; // another tab is playing: never write over its save
  const ls = storage();
  if (ls && heldElsewhere(ls, TAB, Date.now())) {
    // another tab took over since the last lease check: stop here, without writing
    leading = false;
    snap = { ...snap, spectator: true };
    return;
  }
  // Another tab stored purchases this one doesn't have: take its save instead of writing over it.
  const adopt = guard.check(s);
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
 * Adds reserved deliveries to the latest stored save and writes it once, with their ids (spec: "Delivery: reserve,
 * apply, confirm"). ok=false (and nothing changed) if the write fails, so the caller must not confirm.
 */
export function applyDeliveries(batch: Delivery[]): { ok: boolean; ids: string[]; steps: DeliveryStep[] } {
  const base = readStored() ?? snap.state ?? newTycoon(Date.now());
  const { steps, log } = planDeliveries(base.deliveries, batch);
  let next = base;
  for (const step of steps) next = applyTycoonContents(next, step.contents, step.sign);
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
type Snapshot = { state: TycoonState | null; paused: boolean; spectator: boolean };
let snap: Snapshot = { state: null, paused: false, spectator: false };
let users = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let lastTick = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// ---------- measuring the guided tour (spec §3.8): start, each beat reached, skip, return ----------
// Unknown until the playing screen says (the save loads before it renders): events leave it out rather than guess.
let controls: Controls | null = null;
/** The playing screen says which controls the player has (3D, the 2D map or the list), for the tour's events. */
export function setTourControls(c: Controls | null) {
  controls = c;
}
const withControls = () => (controls ? { controls } : {});

function reportTour(prev: TycoonState | null, next: TycoonState) {
  const a = prev?.tour ?? null;
  const b = next.tour;
  if (!b) return;
  const base = { mode: b.mode, ...withControls(), sec: Math.max(0, Math.round((Date.now() - b.startedAt) / 1000)) };
  if (!a) track("tycoon_guide", { beat: "start", ...base });
  if (b.skipped) {
    if (!a?.skipped) track("tycoon_guide", { beat: "skipped", at: b.beat, ...base });
    return;
  }
  // Every beat passed since the last change, in order (one change can pass several); "meet" is the start itself.
  const from = a && !a.skipped ? TOUR_ORDER.indexOf(a.beat) : 0;
  const to = TOUR_ORDER.indexOf(b.beat);
  for (let i = Math.max(1, from + 1); i <= to; i++) {
    // "Not now" at the upgrade jumps past the benefit beat: report that, not a benefit that didn't happen.
    const beat = TOUR_ORDER[i] === "benefit" && !hasTourUpgrade(next) ? "upgrade_passed" : TOUR_ORDER[i]!;
    track("tycoon_guide", { beat, ...base });
  }
}

/** Whole New York calendar days between two times (0 on the same day). */
function daysBetween(from: number, to: number): number {
  const day = (ms: number) => Date.parse(`${nyDateKey(ms)}T00:00:00Z`);
  return Math.max(0, Math.round((day(to) - day(from)) / 86_400_000));
}

/** Events that follow from a state change: a finished game day, and guide steps newly done. */
function report(prev: TycoonState | null, next: TycoonState, checkGuide: boolean) {
  if (prev) reportTour(prev, next);
  const before = prev ? fac(prev).report : null;
  const after = fac(next).report;
  if (after && after !== before && after.day !== before?.day)
    track("tycoon_day", { day: after.day, income: after.income, expenses: after.expenses });
  // The building checklist is hidden while there's a tour, so its step events would describe nothing on screen.
  if (checkGuide && prev && !next.tour && guideVisible(prev)) {
    const a = guideProgress(prev).checks;
    const b = guideProgress(next).checks;
    b.forEach((done, i) => {
      if (done && !a[i]) track("tycoon_guide", { step: i + 1 });
    });
  }
}

function commit(next: TycoonState | null, opts: { paused?: boolean; checkGuide?: boolean } = {}) {
  const prev = snap.state;
  // The guided tour catches up with every change (an action, a tick, a load): next beat, scripted pups, reward.
  if (next) next = syncTour(next, Date.now()).state;
  snap = { state: next, paused: opts.paused ?? snap.paused, spectator: snap.spectator };
  if (next) {
    persist(next);
    report(prev, next, opts.checkGuide ?? false);
  }
  emit();
}

let speed = 1; // DEV-only fast-forward for browser checks (window.__tycoonSpeed)
let lastWeekCheck = 0;
let weeklyPaidListener: ((n: number) => void) | null = null;

/** Starts a new week's challenge when the New York week changes (checked at most once a minute). */
function checkWeek(force = false) {
  const now = Date.now();
  if (!snap.state || (!force && now - lastWeekCheck < 60_000)) return 0;
  lastWeekCheck = now;
  const r = rollWeekly(snap.state, weekKey(now));
  if (r.state !== snap.state) commit(r.state);
  if (r.paid) weeklyPaidListener?.(r.paid);
  return r.paid;
}

function startClock() {
  if (timer) return;
  lastTick = Date.now();
  timer = setInterval(() => {
    const now = Date.now();
    // Clamp so a throttled background tab can't fast-forward the day.
    const sec = Math.min(1, Math.max(0, (now - lastTick) / 1000));
    lastTick = now;
    if (!snap.state || snap.paused || !leading || sec <= 0) return;
    commit(tick(snap.state, sec * speed));
    checkWeek();
  }, TICK_MS);
}
function stopClock() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Load once per activation and welcome the player back. Returns the welcome bonus and any weekly reward paid. */
/** Keeps the lease fresh while leading; notices when another tab took over (this one then watches). */
function watchLease() {
  if (leaseTimer) return;
  leaseTimer = setInterval(() => {
    const st = storage();
    if (!st) return;
    if (leading) {
      if (heldElsewhere(st, TAB, Date.now())) {
        leading = false;
        snap = { ...snap, spectator: true };
        emit();
      } else claimLease(st, TAB, Date.now());
    } else if (!heldElsewhere(st, TAB, Date.now())) {
      // the other tab went away: play here, from its latest save
      playHere();
    }
  }, LEASE_REFRESH_MS);
  if (!pagehideWired && typeof window !== "undefined") {
    pagehideWired = true;
    window.addEventListener("pagehide", () => {
      const s = storage();
      if (leading && s) releaseLease(s, TAB);
    });
  }
}
let pagehideWired = false;

/** "Play here": take over from another tab, picking up its latest save. */
export function playHere() {
  const st = storage();
  if (st) claimLease(st, TAB, Date.now(), true);
  leading = true;
  const fresh = readStored();
  snap = { ...snap, spectator: false };
  // a hidden tab that takes over stays paused: time away never costs anything
  const hidden = typeof document !== "undefined" && document.hidden;
  if (fresh) commit(fresh, { paused: snap.paused || hidden });
  else emit();
}

function activate(): { bonus: number; weekly: number } {
  users++;
  setOnLevel((n) => track("tycoon_level", { level: n }));
  if (users > 1 && snap.state) return { bonus: 0, weekly: 0 };
  const st = storage();
  leading = st ? claimLease(st, TAB, Date.now()) : true;
  snap = { ...snap, spectator: !leading };
  watchLease();
  const loaded = load();
  const days = readStored() ? daysBetween(loaded.lastSeen, Date.now()) : 0;
  if (days > 0) track("tycoon_guide", { beat: "return", days, tour: !loaded.tour ? "none" : loaded.tour.done ? "done" : loaded.tour.skipped ? "skipped" : loaded.tour.beat, ...withControls() });
  const { state, bonus } = welcomeBack(loaded, Date.now());
  commit(state, { paused: false });
  const weekly = checkWeek(true);
  startClock();
  return { bonus, weekly };
}
function deactivate() {
  users = Math.max(0, users - 1);
  if (users > 0) return;
  stopClock();
  if (leaseTimer) clearInterval(leaseTimer);
  leaseTimer = null;
  setOnLevel(null);
  if (snap.state) persist(snap.state);
  snap = { state: null, paused: false, spectator: false };
}

export type ActResult = TResult & { unlocked?: Trophy[] };

// ---------- "Get coins" on a refusal for coins ----------
let getCoins: (() => void) | null = null;
/** The playing screen registers how to open the Daycare Shop (null when it closes). */
export function onGetCoins(fn: (() => void) | null) {
  getCoins = fn;
}
const COIN_REFUSAL = /^Need \d+ more coins\.$|^Paused until your coins are back above zero\.$/;
/** Toast options that add "Get coins" to a refusal for coins, when the shop can be opened. */
export function coinRefusalAction(error: string, open: (() => void) | null) {
  if (!open || !COIN_REFUSAL.test(error)) return undefined;
  return { action: { label: "Get coins", onClick: () => open() } };
}

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
    if (snap.spectator) return { ok: false, error: "Your daycare is open in another tab — tap Play here first." };
    const r = fn(s);
    if (!r.ok) return r;
    const { state, unlocked } = checkTrophies(r.state);
    commit(state, { checkGuide: true });
    return { ...r, state: snap.state ?? state, unlocked };
  },
  set(fn: (s: TycoonState) => TycoonState) {
    if (snap.state && !snap.spectator) commit(fn(snap.state), { checkGuide: true });
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
    leading = true;
    snap = { state: s, paused: false, spectator: false };
    emit();
  },
};

const SERVER_SNAPSHOT: Snapshot = { state: null, paused: false, spectator: false };

export function useTycoon() {
  const current = useSyncExternalStore(tycoonStore.subscribe, tycoonStore.getSnapshot, () => SERVER_SNAPSHOT);

  useEffect(() => {
    weeklyPaidListener = (n) => toast.success(`Last week's challenge was finished — +${n} coins`);
    const { bonus, weekly } = activate();
    if (bonus > 0) toast.success(`Welcome back! Your team kept everyone safe and comfy. +${bonus} coins`);
    if (weekly > 0) toast.success(`Last week's challenge was finished — +${weekly} coins`);
    // Save only when this tab goes away; coming back must never overwrite what another tab saved meanwhile.
    const onHide = (e: Event) => {
      if (e.type !== "pagehide" && !document.hidden) return;
      tycoonStore.setPaused(true);
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
      if (!opts.quiet) toast.error(r.error, coinRefusalAction(r.error, getCoins));
      return r;
    }
    if (opts.event) track(opts.event.name, opts.event.props);
    for (const t of r.unlocked ?? []) {
      track("tycoon_trophy", { id: t.id });
      toast.success(`Trophy: ${t.name} · +${t.reward} coins`);
    }
    if (r.msg && !opts.quiet) toast(r.msg);
    return r;
  }, []);

  const set = useCallback((fn: (s: TycoonState) => TycoonState) => tycoonStore.set(fn), []);
  const setPaused = useCallback((p: boolean | ((p: boolean) => boolean)) => tycoonStore.setPaused(typeof p === "function" ? p(snap.paused) : p), []);

  return { state: current.state, act, set, paused: current.paused, setPaused, spectator: current.spectator, playHere };
}

// ---------- DEV-only test hooks for qa/e2e-tycoon.cjs (never in production builds) ----------
if (import.meta.env.DEV && typeof window !== "undefined") {
  const w = window as unknown as Record<string, unknown>;
  Object.defineProperty(w, "__tycoonSpeed", {
    configurable: true,
    get: () => speed,
    set: (v: unknown) => {
      speed = Math.max(1, Math.min(64, Number(v) || 1));
    },
  });
  w["__tycoonState"] = () => snap.state;
  w["__tycoonSet"] = (patch: Partial<TycoonState> | ((s: TycoonState) => TycoonState)) =>
    tycoonStore.set((st) => (typeof patch === "function" ? patch(st) : { ...st, ...patch }));
  /** A drop-off of a given size and temperament, at once. */
  w["__tycoonArrive"] = (size: "small" | "large" = "small", temper: "gentle" | "active" = "gentle") =>
    tycoonStore.set((st) => {
      const r = createArrival(st, Math.random);
      if (!r.ok) return st;
      const f = fac(r.state);
      return withFac(r.state, { ...f, dogs: f.dogs.map((d, i) => (i === f.dogs.length - 1 ? { ...d, size, temper } : d)) });
    });
  /** 12 rooms and 200 things on all the land (frame-rate check). */
  w["__tycoonStress"] = () =>
    tycoonStore.set((st0) => {
      let st: TycoonState = { ...st0, xp: 50 * 15 * 14, coins: 1_000_000 };
      for (const p of ["west", "east", "north", "northwest", "northeast"] as const) {
        const r = buyLand(st, p);
        if (r.ok) st = r.state;
      }
      const groups = ["small-gentle", "small-active", "large-gentle", "large-active"] as const;
      for (let i = 0; fac(st).rooms.length < 12 && i < 40; i++) {
        const r = placeFirstFree(st, i === 0 ? { room: "lobby" } : { room: "playroom", group: groups[i % 4]! });
        if (r.ok) st = r.state;
      }
      const kinds = ["dog_bed", "play_mat", "toy_bin", "plant", "rug", "play_yard", "shade_tree", "flowers", "park_bench", "lights", "fence"] as const;
      for (let i = 0; fac(st).items.length < 200 && i < 600; i++) {
        const r = placeFirstFree(st, kinds[i % kinds.length]!);
        if (r.ok) st = r.state;
      }
      // 30 pups: spread over the playrooms (and the lobby), as in a busy day
      const f = fac(st);
      const plays = f.rooms.filter((r) => r.type === "playroom");
      const dogs = Array.from({ length: 30 }, (_, i): TDog => ({
        id: `stress${i}`, name: `Pup ${i + 1}`, breed: i % 8, size: i % 2 ? "large" : "small", temper: i % 3 ? "gentle" : "active", visits: 1,
        place: i < 4 || !plays.length ? { kind: "lobby" } : { kind: "room", room: plays[i % plays.length]!.uid },
        checkedIn: i >= 2, happiness: 70, clean: 70, boarding: false, played: 0, bathed: false,
      }));
      return withFac(st, { ...f, dogs });
    });
}

/** The saved game without loading it into the clock (for the hub). Never sets anything aside or writes. */
export function peekTycoon(): TycoonState | null {
  if (snap.state) return snap.state;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseTycoon(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
