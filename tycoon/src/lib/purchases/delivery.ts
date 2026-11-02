// Delivering consumables (coins, power-ups) exactly once. Server rows are reserved for one account and one
// installation before a game adds them to its save (spec: "Delivery: reserve, apply, confirm"). This file is the
// pure planning: which deliveries change the save, and how the save remembers them.
import type { Contents } from "@/lib/catalog";

/** A reserved delivery as the server returns it; `reverses` names the delivery a refund takes back. */
export type Delivery = { id: string; contents: Contents; reverses: string | null };
/** Kept inside each game's save. applied: added here, not yet confirmed. done: confirmed (recent ones only). */
export type DeliveryLog = { applied: string[]; done: string[] };
export type DeliveryStep = { id: string; contents: Contents; sign: 1 | -1 };

export const DONE_MAX = 500;
export const EMPTY_LOG: DeliveryLog = { applied: [], done: [] };

const magnitude = (c: Contents): Contents =>
  Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.abs(Number(v) || 0)])) as Contents;

/**
 * What a batch does to a save. Reversals are handled first: a reversal of a delivery applied here takes it back;
 * a reversal of one never applied here records both, so that delivery can never apply later. Every id is checked
 * against `applied` and `done`, so a delivery applies once however often it is returned.
 */
export function planDeliveries(log: DeliveryLog, batch: Delivery[]): { steps: DeliveryStep[]; log: DeliveryLog } {
  const seen = new Set([...log.applied, ...log.done]);
  const added: string[] = [];
  const steps: DeliveryStep[] = [];
  const record = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    added.push(id);
  };
  for (const d of batch.filter((x) => x.reverses)) {
    if (seen.has(d.id)) continue;
    if (seen.has(d.reverses!)) {
      steps.push({ id: d.id, contents: magnitude(d.contents), sign: -1 });
      record(d.id);
    } else {
      record(d.reverses!);
      record(d.id);
    }
  }
  for (const d of batch.filter((x) => !x.reverses)) {
    if (seen.has(d.id)) continue;
    steps.push({ id: d.id, contents: d.contents, sign: 1 });
    record(d.id);
  }
  return { steps, log: { applied: [...log.applied, ...added], done: log.done } };
}

/** After the server confirmed `ids`: they move from applied to done; done keeps the last DONE_MAX. */
export function confirmed(log: DeliveryLog, ids: string[]): DeliveryLog {
  const ok = new Set(ids.filter((id) => log.applied.includes(id)));
  const done = [...log.done.filter((id) => !ok.has(id)), ...log.applied.filter((id) => ok.has(id))];
  return { applied: log.applied.filter((id) => !ok.has(id)), done: done.slice(-DONE_MAX) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const INSTALL_KEY = "pawtastic-install-v1";
/** This browser install's random id (sent only to our server). "" when storage is blocked: nothing is collected. */
export function installationId(storage: Storage = globalThis.localStorage): string {
  try {
    const have = storage.getItem(INSTALL_KEY);
    if (have && UUID.test(have)) return have;
    const id = crypto.randomUUID();
    storage.setItem(INSTALL_KEY, id);
    return storage.getItem(INSTALL_KEY) === id ? id : "";
  } catch {
    return "";
  }
}

// One holder at a time per name: across tabs with Web Locks, and within this tab always.
const chains = new Map<string, Promise<unknown>>();
export function withLock<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  const run = (): Promise<T> => (locks ? (locks.request(name, async () => await fn()) as Promise<T>) : Promise.resolve().then(fn));
  const prev = chains.get(name) ?? Promise.resolve();
  const next = prev.then(run, run) as Promise<T>;
  chains.set(name, next.catch(() => undefined));
  return next;
}
