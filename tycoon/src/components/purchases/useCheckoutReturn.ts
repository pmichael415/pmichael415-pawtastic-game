// Coming back from Stripe (spec: "Buying inside a game"): the return address carries ?checkout=returned|cancelled
// and &item=<product>. Stripe's confirmation can reach our server a little after the buyer is back, so the game
// keeps collecting for a short while, says what arrived, or that the purchase is on its way.
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { productById, type GameId, type PaidProduct } from "@/lib/catalog";
import type { DeliveryStep } from "@/lib/purchases/delivery";
import { liveCollect, liveOwned } from "@/lib/purchases/live";
import { useEntitlementsMaybe } from "@/lib/entitlements";

export const CANCELLED = "Checkout cancelled — nothing was charged.";
export const ON_ITS_WAY = "Payment received — your purchase is on its way";

const plural = (n: number, one: string, many: string) =>
  `+${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
/** "+8,000 coins added", "+10 Shield Starts and +10 Extra Lives added". */
export function addedMessage(steps: DeliveryStep[]): string {
  let coins = 0,
    shields = 0,
    lives = 0;
  for (const s of steps.filter((x) => x.sign === 1)) {
    coins += Number(s.contents.coins) || 0;
    shields += Number(s.contents.shieldStarts) || 0;
    lives += Number(s.contents.extraLives) || 0;
  }
  const parts = [
    coins && plural(coins, "coin", "coins"),
    shields && plural(shields, "Shield Start", "Shield Starts"),
    lives && plural(lives, "Extra Life", "Extra Lives"),
  ].filter(Boolean);
  return `${parts.join(" and ")} added`;
}

type Opts = {
  collect?: () => Promise<{ added: DeliveryStep[]; pending: boolean }>;
  refresh?: () => Promise<ReadonlySet<string> | null>;
  tries?: number;
  delayMs?: number;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The return being checked on, for this page visit. It lives outside the component because the game can re-mount
// right after the return (seen in the browser): the new copy carries on checking, and the result is reported once.
type PendingReturn = { game: GameId; item: PaidProduct | null; done: boolean };
let pending: PendingReturn | null = null;

export function useCheckoutReturn(game: GameId, opts: Opts = {}) {
  // The page's own record of what the account owns (Equip vs Buy) is refreshed when a look is confirmed late.
  const ent = useEntitlementsMaybe();
  const refreshPage = useRef(ent?.refresh);
  refreshPage.current = ent?.refresh;
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("checkout");
    if (status === "returned" || status === "cancelled") {
      const item = productById(params.get("item") ?? "") ?? null;
      params.delete("checkout");
      params.delete("item");
      const rest = params.toString();
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash,
      );
      if (status === "cancelled") {
        pending = null;
        toast(CANCELLED);
        return;
      }
      pending = { game, item, done: false };
    }
    const p = pending;
    if (!p || p.done || p.game !== game) return;
    const item = p.item;
    const collect =
      opts.collect ??
      (game === "daycare" ? async () => ({ added: [], pending: false }) : () => liveCollect(game));
    const refresh = opts.refresh ?? liveOwned;
    const tries = opts.tries ?? 6;
    const delayMs = opts.delayMs ?? 2000;
    const report = (say: () => void) => {
      if (p.done) return;
      p.done = true;
      say();
    };
    let stopped = false;
    void (async () => {
      for (let i = 0; i < tries && !stopped && !p.done; i++) {
        if (i) await sleep(delayMs);
        if (stopped || p.done) return;
        if (!item || item.kind === "consumable") {
          const r = await collect().catch(() => ({ added: [] as DeliveryStep[], pending: true }));
          // Reported even if this copy was re-mounted meanwhile: it was added, and only once.
          if (r.added.some((s) => s.sign === 1)) return report(() => toast.success(addedMessage(r.added)));
        }
        if (!item || item.kind === "looks") {
          const owned = await refresh().catch(() => null);
          if (item && owned?.has(item.id)) {
            await refreshPage.current?.().catch(() => null);
            return report(() => toast.success(`${item.name} unlocked`));
          }
        }
      }
      if (!stopped) report(() => toast(ON_ITS_WAY));
    })();
    return () => {
      stopped = true;
    };
    // The return address is read and removed on the first run; later runs (a re-mount) carry on from `pending`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
