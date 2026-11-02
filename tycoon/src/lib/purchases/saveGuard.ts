// Protects deliveries in a game save that other tabs also write (spec: "Tabs and stale writes"). A delivery write
// stores the save and then a fresh revision token under `<key>-rev`. Before a routine write, a tab that sees a
// revision it doesn't know reads the stored save: if it holds delivery ids this tab lacks, the tab adopts it
// instead of writing over it. The common path costs one small getItem.
import type { DeliveryLog } from "./delivery";

/** True if `stored` remembers deliveries that `mine` doesn't (writing `mine` would erase them). */
export function hasUnknownDeliveries(stored: DeliveryLog, mine: DeliveryLog): boolean {
  const known = new Set([...mine.applied, ...mine.done]);
  return [...stored.applied, ...stored.done].some((id) => !known.has(id));
}

export function createSaveGuard<S extends { deliveries: DeliveryLog }>(
  key: string,
  readStored: () => S | null,
) {
  const revKey = `${key}-rev`;
  const readRev = () => {
    try {
      return localStorage.getItem(revKey) ?? "";
    } catch {
      return "";
    }
  };
  let known = readRev();
  return {
    /** Null: go ahead and write `s`. A save: another tab stored deliveries `s` lacks; adopt that instead. */
    check(s: S): S | null {
      const rev = readRev();
      if (rev === known) return null;
      known = rev;
      const stored = readStored();
      return stored && hasUnknownDeliveries(stored.deliveries, s.deliveries) ? stored : null;
    },
    /** Stores a save that changed its deliveries, then a new revision. False if either write failed. */
    deliveryWrite(json: string): boolean {
      try {
        localStorage.setItem(key, json);
        const next = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(revKey, next);
        known = next;
        return true;
      } catch {
        return false;
      }
    },
  };
}
