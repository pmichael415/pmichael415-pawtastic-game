// Cloud saves for signed-in players. Rows are owner-isolated by RLS (user_id = auth.uid()).
// Saves contain free progress only — paid ownership lives in server-written entitlements and
// parseSave strips any paid fields before upload.
// Every write is conditional on the revision this device last saw, so a stale device can never
// silently overwrite newer progress from another device: it pauses and asks the player instead.
import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseSave, type GameState } from "./engine";
import { save } from "./store";

const LINK_KEY = "pawtastic-cloud-link-v2";
const SAVE_KEY = "pawtastic-tycoon-save-v1";
export const SYNC_INTERVAL_MS = 20000;

export type CloudSave = { data: GameState; updated_at: string; revision: number } | null;
export type Link = { userId: string; revision: number; hash?: string };
export type SyncStatus =
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "ok"; at: number; revision: number }
  | { kind: "error"; message: string }
  | { kind: "conflict" };

export class SaveConflictError extends Error {
  constructor() { super("Your cloud save changed on another device."); }
}

// ---------- tiny reactive store (link + status), shared by Root sync hook and Account page ----------
let status: SyncStatus = { kind: "idle" };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => { if (e.key === LINK_KEY) l(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
};

let cachedRaw: string | null | undefined;
let cachedLink: Link | null = null;
export function getLink(): Link | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(LINK_KEY);
  if (raw === cachedRaw) return cachedLink;
  cachedRaw = raw;
  try {
    const v = raw ? JSON.parse(raw) : null;
    cachedLink = v && typeof v.userId === "string" && Number.isInteger(v.revision) && v.revision >= 0 ? { userId: v.userId, revision: v.revision, ...(typeof v.hash === "string" ? { hash: v.hash } : {}) } : null;
  } catch { cachedLink = null; }
  return cachedLink;
}
export function setLink(l: Link | null) {
  if (l) localStorage.setItem(LINK_KEY, JSON.stringify(l)); else localStorage.removeItem(LINK_KEY);
  emit();
}
export function setStatus(s: SyncStatus) { status = s; emit(); }
export const useLink = () => useSyncExternalStore(subscribe, getLink, () => null);
export const useSyncStatus = () => useSyncExternalStore(subscribe, () => status, () => status);
export const linkedUser = () => getLink()?.userId ?? null;
export const unlink = () => { setLink(null); setStatus({ kind: "idle" }); };

export function readLocal(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? parseSave(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Throws on network/permission errors — callers must NOT treat an error as "no cloud save". */
export async function fetchCloud(userId: string): Promise<CloudSave> {
  const { data, error } = await supabase.from("player_saves").select("data, updated_at, revision").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Couldn't reach cloud saves");
  if (!data) return null;
  const parsed = parseSave(data.data);
  if (!parsed) throw new Error("Cloud save is unreadable");
  return { data: parsed, updated_at: data.updated_at, revision: Number(data.revision) };
}

/** Conditional write. expectedRevision 0 = first save. Returns the new revision or throws SaveConflictError. */
export async function uploadCloud(s: GameState, expectedRevision: number): Promise<number> {
  const clean = parseSave(s); // re-validate + strip any non-progress fields
  if (!clean) throw new Error("Local progress is invalid");
  const { data, error } = await supabase.rpc("save_player_progress", { _data: clean as never, _expected_revision: expectedRevision });
  if (error) {
    if (/save conflict/i.test(error.message)) throw new SaveConflictError();
    throw new Error("Cloud save failed — we'll retry");
  }
  return Number(data);
}

export type SyncDeps = {
  getLink: () => Link | null;
  setLink: (l: Link) => void;
  readLocal: () => GameState | null;
  upload: (s: GameState, expected: number) => Promise<number>;
  setStatus: (s: SyncStatus) => void;
};

/** Fingerprint of progress (ignores lastSeen, which changes on every local autosave). */
export function progressHash(s: GameState): string {
  const str = JSON.stringify({ ...s, lastSeen: 0 });
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return `${str.length}:${h.toString(36)}`;
}

/** One automatic sync step. Pure over deps so multi-device behaviour is testable. */
export async function syncOnce(userId: string, deps: SyncDeps): Promise<SyncStatus> {
  const link = deps.getLink();
  if (!link || link.userId !== userId) return { kind: "idle" };
  const local = deps.readLocal();
  if (!local) return { kind: "idle" };
  const hash = progressHash(local);
  if (link.hash === hash) return { kind: "idle" }; // nothing new — don't bump the revision
  deps.setStatus({ kind: "syncing" });
  try {
    const rev = await deps.upload(local, link.revision);
    deps.setLink({ userId, revision: rev, hash });
    const st: SyncStatus = { kind: "ok", at: Date.now(), revision: rev };
    deps.setStatus(st);
    return st;
  } catch (e) {
    const st: SyncStatus = e instanceof SaveConflictError ? { kind: "conflict" } : { kind: "error", message: e instanceof Error ? e.message : "Cloud save failed" };
    deps.setStatus(st);
    return st;
  }
}

const liveDeps: SyncDeps = { getLink, setLink, readLocal, upload: uploadCloud, setStatus };

/** Link choice: upload the device save (read at click time) or adopt the cloud save. */
export async function chooseDevice(userId: string, expectedRevision: number) {
  const local = readLocal();
  if (!local) throw new Error("No progress on this device yet");
  const rev = await uploadCloud(local, expectedRevision);
  setLink({ userId, revision: rev, hash: progressHash(local) });
  setStatus({ kind: "ok", at: Date.now(), revision: rev });
}
export function chooseCloud(userId: string, cloud: NonNullable<CloudSave>) {
  save(cloud.data);
  setLink({ userId, revision: cloud.revision, hash: progressHash(cloud.data) });
  setStatus({ kind: "ok", at: Date.now(), revision: cloud.revision });
}
export const saveNow = (userId: string) => syncOnce(userId, liveDeps);

/** Mounted once in the root. Reacts immediately when this device gets linked; pauses on conflict. */
export function useCloudSync(userId: string | null) {
  const link = useLink();
  const st = useSyncStatus();
  const active = !!userId && link?.userId === userId && st.kind !== "conflict";
  useEffect(() => {
    if (!active || !userId) return;
    const push = () => { if (status.kind !== "syncing" && status.kind !== "conflict") void syncOnce(userId, liveDeps); };
    const id = setInterval(push, SYNC_INTERVAL_MS);
    const onHide = () => document.hidden && push();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [active, userId]);
  // A different account signed in on this device: drop the old link so it can't write cross-account.
  useEffect(() => {
    if (userId && link && link.userId !== userId) unlink();
  }, [userId, link?.userId]);
}

/** Summarise a save for the conflict chooser. */
export const summary = (s: GameState) => `${s.coins} coins · Day ${s.gameDay} · ${s.upgrades.length} upgrades · ${s.stats.admitted} pups admitted`;
