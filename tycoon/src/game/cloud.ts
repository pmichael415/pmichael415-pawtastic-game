// Cloud saves for signed-in players: one save per game — Daycare Tycoon, Recess Rush and Graduation Day — in
// public.game_saves (owner-only; written only through save_game_progress, which checks the revision). Saves hold
// free progress only; paid ownership lives in server-written entitlements.
// Each game is synced on its own: a stale phone pauses that game and asks the player instead of overwriting newer
// progress, and loading one game never touches another.
import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { newGame, parseSave, type GameState } from "./engine";
import { save, todayKey, updateSave } from "./store";
import { GRADUATION_SAVE_KEY } from "@/lib/graduation";
import { syncGraduation } from "./linkSync";
import {
  GAME_IDS, GAME_NAMES, daycareOf, hasProgress, parseGraduationSave, parseSlot, planSignIn, recessOf, slotHash,
  withDaycare, withRecess, type GameId, type SlotData,
} from "./cloudSlots";

const LINK_KEY = "pawtastic-cloud-links-v3";
const SAVE_KEY = "pawtastic-tycoon-save-v1";
export const SYNC_INTERVAL_MS = 20000;

export type SlotLink = { revision: number; hash?: string };
export type Links = { userId: string; slots: Partial<Record<GameId, SlotLink>> };
export type SyncStatus =
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "ok"; at: number; revision: number }
  | { kind: "error"; message: string }
  | { kind: "conflict" };
export type Statuses = Record<GameId, SyncStatus>;
export type CloudRow = { data: unknown; revision: number; updated_at: string };
export type CloudRows = Partial<Record<GameId, CloudRow>>;

export class SaveConflictError extends Error {
  constructor() { super("This game's cloud save changed on another device."); }
}

// ---------- links (which revision of each game this phone last saw) + statuses ----------
const IDLE: Statuses = { daycare: { kind: "idle" }, recess: { kind: "idle" }, graduation: { kind: "idle" } };
let statuses: Statuses = IDLE;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => { if (e.key === LINK_KEY) l(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
};

let cachedRaw: string | null | undefined;
let cachedLinks: Links | null = null;
export function getLinks(): Links | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = localStorage.getItem(LINK_KEY);
  } catch {
    raw = null; // storage blocked (even getting it can throw): no links on this device, never a failed page
  }
  if (raw === cachedRaw) return cachedLinks;
  cachedRaw = raw;
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v.userId !== "string" || !v.slots || typeof v.slots !== "object") cachedLinks = null;
    else {
      const slots: Links["slots"] = {};
      for (const g of GAME_IDS) {
        const s = v.slots[g];
        if (s && Number.isInteger(s.revision) && s.revision >= 0) slots[g] = { revision: s.revision, ...(typeof s.hash === "string" ? { hash: s.hash } : {}) };
      }
      cachedLinks = { userId: v.userId, slots };
    }
  } catch { cachedLinks = null; }
  return cachedLinks;
}
export function setLinks(l: Links | null) {
  if (l) localStorage.setItem(LINK_KEY, JSON.stringify(l)); else localStorage.removeItem(LINK_KEY);
  emit();
}
export function setStatus(game: GameId, s: SyncStatus) { statuses = { ...statuses, [game]: s }; emit(); }
export const useLinks = () => useSyncExternalStore(subscribe, getLinks, () => null);
export const useStatuses = () => useSyncExternalStore(subscribe, () => statuses, () => IDLE);
export const unlink = () => { setLinks(null); statuses = IDLE; emit(); };

/** One word for the header: the most important state across the three games. */
export function overall(s: Statuses): SyncStatus["kind"] {
  const kinds = GAME_IDS.map((g) => s[g].kind);
  for (const k of ["conflict", "error", "syncing", "ok"] as const) if (kinds.includes(k)) return k;
  return "idle";
}

// ---------- this phone's progress for each game ----------
function readDaycareState(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? parseSave(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
export function readLocal<G extends GameId>(game: G): SlotData[G] | null {
  if (game === "graduation") {
    try {
      const raw = localStorage.getItem(GRADUATION_SAVE_KEY);
      return (raw ? parseGraduationSave(JSON.parse(raw)) : null) as SlotData[G] | null;
    } catch {
      return null;
    }
  }
  const s = readDaycareState();
  if (!s) return null;
  return (game === "daycare" ? daycareOf(s) : recessOf(s)) as SlotData[G];
}
/** Put a game's cloud progress on this phone. Only that game's part changes. */
export function writeLocal<G extends GameId>(game: G, data: SlotData[G]) {
  if (game === "daycare") save(withDaycare(readDaycareState(), data as GameState));
  else if (game === "recess") {
    if (readDaycareState()) updateSave((s) => withRecess(s, data as SlotData["recess"]));
    else save(withRecess(newGame(Date.now(), todayKey()), data as SlotData["recess"]));
  } else {
    localStorage.setItem(GRADUATION_SAVE_KEY, JSON.stringify(data));
    syncGraduation(); // shared achievements and bandanas follow the loaded progress
  }
}

// ---------- the server ----------
/** Every game's cloud save for the signed-in player. Throws on network errors — never read as "no saves". */
export async function fetchAll(): Promise<CloudRows> {
  const { data, error } = await supabase.from("game_saves").select("game, data, revision, updated_at");
  if (error) throw new Error("Couldn't reach your cloud saves");
  const rows: CloudRows = {};
  for (const r of data ?? []) {
    if ((GAME_IDS as string[]).includes(r.game)) rows[r.game as GameId] = { data: r.data, revision: Number(r.revision), updated_at: r.updated_at };
  }
  return rows;
}
/** Conditional write of one game. expected 0 = first save. Returns the new revision or throws SaveConflictError. */
export async function upload<G extends GameId>(game: G, data: SlotData[G], expected: number): Promise<number> {
  const clean = parseSlot(game, JSON.parse(JSON.stringify(data)));
  if (!clean) throw new Error("This progress can't be saved");
  const { data: rev, error } = await supabase.rpc("save_game_progress", { _game: game, _data: clean as never, _expected_revision: expected });
  if (error) {
    if (/save conflict/i.test(error.message)) throw new SaveConflictError();
    throw new Error("Cloud save failed — we'll retry");
  }
  return Number(rev);
}

// ---------- syncing (pure over deps so multi-device behaviour is testable) ----------
export type SyncDeps = {
  getLinks: () => Links | null;
  setLinks: (l: Links) => void;
  read: <G extends GameId>(game: G) => SlotData[G] | null;
  write: <G extends GameId>(game: G, data: SlotData[G]) => void;
  upload: <G extends GameId>(game: G, data: SlotData[G], expected: number) => Promise<number>;
  fetchAll: () => Promise<CloudRows>;
  setStatus: (game: GameId, s: SyncStatus) => void;
  /** False while a game can't take a load right now (Graduation Day while it's open on screen). */
  canWrite?: (game: GameId) => boolean;
};
const link = (deps: SyncDeps, userId: string, game: GameId, l: SlotLink | null) => {
  const cur = deps.getLinks();
  const slots = cur && cur.userId === userId ? { ...cur.slots } : {};
  if (l) slots[game] = l; else delete slots[game];
  deps.setLinks({ userId, slots });
};

/** One automatic save of one game. Saves only real progress, and only when it changed. */
export async function syncSlot(userId: string, game: GameId, deps: SyncDeps): Promise<SyncStatus> {
  const links = deps.getLinks();
  const l = links && links.userId === userId ? links.slots[game] : undefined;
  if (!l) return { kind: "idle" };
  const local = deps.read(game);
  if (!local || !hasProgress(game, local)) return { kind: "idle" };
  const hash = slotHash(game, local);
  if (l.hash === hash) return { kind: "idle" };
  deps.setStatus(game, { kind: "syncing" });
  try {
    const revision = await deps.upload(game, local, l.revision);
    link(deps, userId, game, { revision, hash });
    const st: SyncStatus = { kind: "ok", at: Date.now(), revision };
    deps.setStatus(game, st);
    return st;
  } catch (e) {
    if (e instanceof SaveConflictError) {
      link(deps, userId, game, null); // re-checked by reconcile: loads by itself if this phone has nothing real
      deps.setStatus(game, { kind: "conflict" });
      return { kind: "conflict" };
    }
    const st: SyncStatus = { kind: "error", message: e instanceof Error ? e.message : "Cloud save failed" };
    deps.setStatus(game, st);
    return st;
  }
}

export type Outcome = "loaded" | "saved" | "linked" | "ask" | "error";
/** Sign-in on this phone (and after a conflict): settle every game that isn't linked yet. */
export async function reconcile(userId: string, deps: SyncDeps): Promise<Partial<Record<GameId, Outcome>>> {
  const links = deps.getLinks();
  const pending = GAME_IDS.filter((g) => !(links && links.userId === userId && links.slots[g]));
  if (!pending.length) return {};
  let rows: CloudRows;
  try {
    rows = await deps.fetchAll();
  } catch (e) {
    for (const g of pending) deps.setStatus(g, { kind: "error", message: e instanceof Error ? e.message : "Couldn't reach your cloud saves" });
    return Object.fromEntries(pending.map((g) => [g, "error"]));
  }
  const out: Partial<Record<GameId, Outcome>> = {};
  for (const game of pending) {
    const local = deps.read(game);
    const row = rows[game];
    const cloudData = row ? parseSlot(game, row.data) : null;
    const plan = planSignIn(
      local ? { has: hasProgress(game, local), hash: slotHash(game, local) } : null,
      row ? { hasProgress: !!cloudData && hasProgress(game, cloudData), hash: cloudData ? slotHash(game, cloudData) : "unreadable", revision: row.revision } : null,
    );
    if (plan.action === "load" && cloudData && deps.canWrite && !deps.canWrite(game)) continue; // settled later
    if (plan.action === "load") {
      if (cloudData) deps.write(game, cloudData);
      link(deps, userId, game, { revision: row!.revision, ...(cloudData ? { hash: slotHash(game, cloudData) } : {}) });
      deps.setStatus(game, { kind: "ok", at: Date.now(), revision: row!.revision });
      out[game] = cloudData ? "loaded" : "linked";
    } else if (plan.action === "link") {
      link(deps, userId, game, { revision: plan.revision, ...(plan.revision && cloudData ? { hash: slotHash(game, cloudData) } : {}) });
      deps.setStatus(game, plan.revision ? { kind: "ok", at: Date.now(), revision: plan.revision } : { kind: "idle" });
      out[game] = "linked";
    } else if (plan.action === "upload") {
      try {
        const revision = await deps.upload(game, local!, plan.expected);
        link(deps, userId, game, { revision, hash: slotHash(game, local!) });
        deps.setStatus(game, { kind: "ok", at: Date.now(), revision });
        out[game] = "saved";
      } catch (e) {
        deps.setStatus(game, e instanceof SaveConflictError ? { kind: "conflict" } : { kind: "error", message: e instanceof Error ? e.message : "Cloud save failed" });
        out[game] = e instanceof SaveConflictError ? "ask" : "error";
      }
    } else {
      deps.setStatus(game, { kind: "conflict" });
      out[game] = "ask";
    }
  }
  return out;
}

/** The player's choice for one game with progress in both places. */
export async function chooseDevice(userId: string, game: GameId, deps: SyncDeps = liveDeps) {
  const local = deps.read(game);
  if (!local) throw new Error("No progress on this phone for this game");
  const rows = await deps.fetchAll();
  const revision = await deps.upload(game, local, rows[game]?.revision ?? 0);
  link(deps, userId, game, { revision, hash: slotHash(game, local) });
  deps.setStatus(game, { kind: "ok", at: Date.now(), revision });
}
export async function chooseCloud(userId: string, game: GameId, deps: SyncDeps = liveDeps) {
  const rows = await deps.fetchAll();
  const row = rows[game];
  const data = row ? parseSlot(game, row.data) : null;
  if (!row || !data) throw new Error("There's no cloud save for this game");
  deps.write(game, data);
  link(deps, userId, game, { revision: row.revision, hash: slotHash(game, data) });
  deps.setStatus(game, { kind: "ok", at: Date.now(), revision: row.revision });
}

// Graduation Day keeps its save in memory while it runs, so a load waits until its screen isn't open.
const canWrite = (game: GameId) => game !== "graduation" || !window.location.pathname.startsWith("/graduation");
export const liveDeps: SyncDeps = { getLinks, setLinks, read: readLocal, write: writeLocal, upload, fetchAll, setStatus, canWrite };
export const saveAllNow = async (userId: string) => {
  const res = await Promise.all(GAME_IDS.map((g) => syncSlot(userId, g, liveDeps)));
  return res;
};

const describeOutcomes = (out: Partial<Record<GameId, Outcome>>) => {
  const names = (o: Outcome) => GAME_IDS.filter((g) => out[g] === o).map((g) => GAME_NAMES[g]);
  const loaded = names("loaded"), saved = names("saved"), ask = names("ask");
  if (loaded.length) toast.success(`Loaded from your account: ${loaded.join(", ")}`);
  if (saved.length) toast.success(`Saved to your account: ${saved.join(", ")}`);
  if (ask.length) toast.info(`Choose which progress to keep for ${ask.join(", ")} (Account page).`);
};

/** Mounted once in the root: settles each game when a player signs in, then saves changes automatically. */
export function useCloudSync(userId: string | null) {
  useEffect(() => {
    if (!userId) return;
    let stopped = false;
    let busy = false;
    const cur = getLinks();
    if (cur && cur.userId !== userId) unlink(); // another account on this phone: never write across accounts
    const settle = async (announce: boolean) => {
      if (busy || stopped) return;
      busy = true;
      try {
        const out = await reconcile(userId, liveDeps);
        if (announce && !stopped) describeOutcomes(out);
      } finally { busy = false; }
    };
    const push = async () => {
      if (busy || stopped) return;
      busy = true;
      let conflict = false;
      try {
        for (const g of GAME_IDS) {
          if (statuses[g].kind === "syncing") continue;
          if ((await syncSlot(userId, g, liveDeps)).kind === "conflict") conflict = true;
        }
      } finally { busy = false; }
      // A game that isn't linked (new to this account, or a conflict) gets settled again; a choice stays a choice.
      const l = getLinks();
      if (conflict || GAME_IDS.some((g) => !l?.slots[g] && statuses[g].kind !== "conflict")) await settle(conflict);
    };
    void settle(true);
    const id = setInterval(() => void push(), SYNC_INTERVAL_MS);
    const onHide = () => { if (document.hidden) void push(); };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [userId]);
}
