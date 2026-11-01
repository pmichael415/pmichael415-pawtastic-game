// Paid pack items in the new game. Ownership comes only from fresh server entitlements, set here in memory by the
// page while it runs (never saved). Empty by default, so nothing paid counts unless the server says it's owned.
import type { PaidItemId } from "@/lib/paidVisuals";
import { furnitureDef } from "./catalog";

const NONE: ReadonlySet<PaidItemId> = new Set();
let owned: ReadonlySet<PaidItemId> = NONE;

export const ownedPaid = (): ReadonlySet<PaidItemId> => owned;
export function setOwnedPaid(next: ReadonlySet<PaidItemId>) {
  owned = next;
}
export const PAID_LOCK = "Part of the Deluxe Daycare Decor pack.";
export const PAID_GONE = "Pack no longer active.";

/** The paid visual a thing needs, if any. */
export const paidOf = (kind: string): PaidItemId | null => furnitureDef(kind)?.paid ?? null;
/** False for a paid thing whose pack isn't owned right now: it counts nothing. */
export const isActive = (kind: string, have: ReadonlySet<PaidItemId> = owned) => {
  const p = paidOf(kind);
  return !p || have.has(p);
};
