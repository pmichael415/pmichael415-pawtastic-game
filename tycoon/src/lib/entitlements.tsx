import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSession } from "@/lib/auth";
import { listEntitlements } from "@/lib/payments/payments.functions";
import { activePaidVisuals, PREFS_KEY, readPrefs, type ActiveVisuals, type EntStatus, type PaidItemId, type Prefs } from "./paidVisuals";

type Ctx = { status: EntStatus; owned: ReadonlySet<string>; refresh: () => Promise<number | null>; prefs: Prefs; toggle: (id: PaidItemId, on: boolean) => void; visuals: ActiveVisuals };
const EntCtx = createContext<Ctx | null>(null);
const EMPTY: ReadonlySet<string> = new Set();

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const { user, ready } = useSession();
  const uid = user?.id ?? null;
  const [status, setStatus] = useState<EntStatus>("loading");
  const [owned, setOwned] = useState<ReadonlySet<string>>(EMPTY);
  const [prefs, setPrefs] = useState<Prefs>({});
  const reqId = useRef(0);
  useEffect(() => setPrefs(readPrefs()), []);

  const refresh = useCallback(async () => {
    const my = ++reqId.current;
    setStatus("loading");
    setOwned(EMPTY); // never carry one account's packs into another
    try {
      const rows = await listEntitlements();
      if (my !== reqId.current) return null;
      setOwned(new Set(rows.map((r) => r.product_id)));
      setStatus("ready");
      return rows.length;
    } catch {
      if (my === reqId.current) setStatus("error");
      return null;
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!uid) { reqId.current++; setOwned(EMPTY); setStatus("guest"); return; }
    void refresh();
  }, [uid, ready, refresh]);

  const toggle = useCallback((id: PaidItemId, on: boolean) => {
    setPrefs((p) => {
      const next = { ...p, [id]: on };
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const visuals = useMemo(() => activePaidVisuals(prefs, status, owned), [prefs, status, owned]);
  return <EntCtx.Provider value={{ status, owned, refresh, prefs, toggle, visuals }}>{children}</EntCtx.Provider>;
}

export function useEntitlements(): Ctx {
  const c = useContext(EntCtx);
  if (!c) throw new Error("EntitlementsProvider missing");
  return c;
}

/** Like useEntitlements, but null outside the provider (for screens that also render in tests). */
export function useEntitlementsMaybe(): Ctx | null {
  return useContext(EntCtx);
}
