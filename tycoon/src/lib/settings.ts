// Player settings shared by every PAWtastic game (stored on this device only).
import { useSyncExternalStore } from "react";

export type ViewMode = "overhead" | "walk" | "list";
export type Settings = {
  view: ViewMode;
  lookSpeed: number; // 0.5 .. 2
  invertLook: boolean;
  reducedMotion: boolean;
  lowPower: boolean;
  nameTags: boolean;
  analytics: boolean;
  seenWalkHelp: boolean;
  sound: boolean;
  music: boolean;
};

const KEY = "pawtastic-settings-v1";
const prefersReduced = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const smallDevice = () =>
  typeof window !== "undefined" &&
  Math.min(window.screen?.width ?? 1000, window.screen?.height ?? 1000) < 500;

export const DEFAULTS: Settings = {
  view: "overhead",
  lookSpeed: 1,
  invertLook: false,
  reducedMotion: false,
  lowPower: false,
  nameTags: true,
  analytics: true,
  seenWalkHelp: false,
  sound: true,
  music: true,
};

function read(): Settings {
  const base = { ...DEFAULTS, reducedMotion: prefersReduced(), lowPower: smallDevice() };
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Settings> | null;
    if (!v || typeof v !== "object") return base;
    return {
      view: v.view === "walk" || v.view === "list" || v.view === "overhead" ? v.view : base.view,
      lookSpeed:
        typeof v.lookSpeed === "number" && v.lookSpeed >= 0.5 && v.lookSpeed <= 2
          ? v.lookSpeed
          : base.lookSpeed,
      invertLook: v.invertLook === true,
      reducedMotion: typeof v.reducedMotion === "boolean" ? v.reducedMotion : base.reducedMotion,
      lowPower: typeof v.lowPower === "boolean" ? v.lowPower : base.lowPower,
      nameTags: v.nameTags !== false,
      analytics: v.analytics !== false,
      seenWalkHelp: v.seenWalkHelp === true,
      sound: v.sound !== false,
      music: v.music !== false,
    };
  } catch {
    return base;
  }
}

let cache: Settings | null = null;
const listeners = new Set<() => void>();
export function getSettings(): Settings {
  cache ??= read();
  return cache;
}
export function setSettings(patch: Partial<Settings>) {
  cache = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* storage blocked */
  }
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useSettings = () => useSyncExternalStore(subscribe, getSettings, () => DEFAULTS);
/** Called after any setting changes (e.g. the audio engine stopping music when Music is switched off). */
export const onSettingsChange = subscribe;
