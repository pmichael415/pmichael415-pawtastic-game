// One tab plays the new Daycare at a time (service design, "One tab plays"). The tab holding the lease runs the clock
// and saves; another tab watches until the player taps "Play here". A lease not refreshed for LEASE_STALE_MS is free.
export const LEASE_KEY = "pawtastic-daycare-next-lease";
export const LEASE_REFRESH_MS = 2000;
export const LEASE_STALE_MS = 6000;

type Store = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void };

function read(st: Store): { tab: string; at: number } | null {
  try {
    const v = JSON.parse(st.getItem(LEASE_KEY) ?? "null") as { tab?: unknown; at?: unknown } | null;
    return v && typeof v.tab === "string" && typeof v.at === "number" ? { tab: v.tab, at: v.at } : null;
  } catch {
    return null;
  }
}

/** Takes (or refreshes) the lease for `tab`; `force` takes it from another tab. True if this tab now holds it. */
export function claimLease(st: Store, tab: string, now: number, force = false): boolean {
  const cur = read(st);
  if (!force && cur && cur.tab !== tab && now - cur.at <= LEASE_STALE_MS) return false;
  try {
    st.setItem(LEASE_KEY, JSON.stringify({ tab, at: now }));
  } catch {
    return true; // storage blocked: nothing to coordinate with, so play here
  }
  return true;
}

/** Whether another tab holds a fresh lease. */
export function heldElsewhere(st: Store, tab: string, now: number): boolean {
  const cur = read(st);
  return !!cur && cur.tab !== tab && now - cur.at <= LEASE_STALE_MS;
}

export const newTabId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `t${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);

const TAB_KEY = "pawtastic-daycare-next-tab";
/** This tab's id, kept for the life of the tab (sessionStorage survives a reload), so a reload keeps its own lease. */
export function tabId(): string {
  try {
    const have = sessionStorage.getItem(TAB_KEY);
    if (have) return have;
    const id = newTabId();
    sessionStorage.setItem(TAB_KEY, id);
    return id;
  } catch {
    return newTabId();
  }
}

/** Lets the lease go (this tab is closing), so another tab can take over at once. */
export function releaseLease(st: Store, tab: string) {
  const cur = read(st);
  if (cur && cur.tab === tab) {
    try {
      st.setItem(LEASE_KEY, JSON.stringify({ tab, at: 0 }));
    } catch {
      /* ignore */
    }
  }
}
