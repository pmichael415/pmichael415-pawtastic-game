import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { checkAchievements, newGame, nyDateKey, parseSave, rollMissionDay, tick, welcomeBack, type GameState, type Result } from "./engine";

const KEY = "pawtastic-tycoon-save-v1";
export const todayKey = () => nyDateKey();

function load(): GameState {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? parseSave(JSON.parse(raw)) : null;
    if (parsed) return parsed;
  } catch {
    /* corrupt save -> fresh */
  }
  return newGame(Date.now(), todayKey());
}

export function save(s: GameState) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, lastSeen: Date.now() }));
  } catch {
    /* storage full / blocked */
  }
}

export function resetSave() {
  localStorage.removeItem(KEY);
}

/** Read-modify-write helper for other screens (Recess Rush, share). */
export function updateSave(fn: (s: GameState) => GameState) {
  const next = fn(load());
  save(next);
  return next;
}

export function useGame() {
  const [state, setState] = useState<GameState | null>(null);
  const [paused, setPaused] = useState(false);
  const ref = useRef<GameState | null>(null);
  ref.current = state;

  useEffect(() => {
    const { state: s, bonus } = welcomeBack(rollMissionDay(load(), todayKey()), Date.now());
    setState(s);
    if (bonus > 0) toast.success(`Welcome back! Your team kept things tidy. +${bonus} coins`);
  }, []);

  useEffect(() => {
    if (!state || paused) return;
    const id = setInterval(() => {
      setState((s) => (s ? rollMissionDay(tick(s, 1), todayKey()) : s));
    }, 1000);
    return () => clearInterval(id);
  }, [!!state, paused]);

  // autosave
  useEffect(() => {
    if (state) save(state);
  }, [state]);
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) {
        setPaused(true);
        if (ref.current) save(ref.current);
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  const act = useCallback((fn: (s: GameState) => Result) => {
    const s = ref.current;
    if (!s) return false;
    const r = fn(s);
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    const { state: withAch, unlocked } = checkAchievements(r.state);
    unlocked.forEach((a) => toast.success(`🏆 ${a.label}`));
    if (r.msg) toast(r.msg + (r.earned ? `  +${r.earned}🪙` : ""));
    setState(withAch);
    return true;
  }, []);

  const set = useCallback((fn: (s: GameState) => GameState) => setState((s) => (s ? fn(s) : s)), []);

  return { state, act, set, paused, setPaused };
}
