// Coming back from Stripe (spec: "Buying inside a game"): the return address carries ?checkout=returned|cancelled
// and &item=<product>. Stripe's confirmation can reach our server a little after the buyer is back, so the game
// keeps collecting for a short while, says what arrived, or that the purchase is on its way.
import { useEffect } from "react";
import { toast } from "sonner";
import { productById, type GameId } from "@/lib/catalog";
import type { DeliveryStep } from "@/lib/purchases/delivery";
import { liveCollect, liveOwned } from "@/lib/purchases/live";

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

export function useCheckoutReturn(game: GameId, opts: Opts = {}) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("checkout");
    if (status !== "returned" && status !== "cancelled") return;
    const item = productById(params.get("item") ?? "");
    params.delete("checkout");
    params.delete("item");
    const rest = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash,
    );
    if (status === "cancelled") {
      toast(CANCELLED);
      return;
    }
    const collect =
      opts.collect ??
      (game === "daycare" ? async () => ({ added: [], pending: false }) : () => liveCollect(game));
    const refresh = opts.refresh ?? liveOwned;
    const tries = opts.tries ?? 6;
    const delayMs = opts.delayMs ?? 2000;
    let stopped = false;
    void (async () => {
      for (let i = 0; i < tries && !stopped; i++) {
        if (i) await sleep(delayMs);
        if (stopped) return;
        if (!item || item.kind === "consumable") {
          const r = await collect().catch(() => ({ added: [] as DeliveryStep[], pending: true }));
          if (r.added.some((s) => s.sign === 1)) {
            toast.success(addedMessage(r.added));
            return;
          }
        }
        if (!item || item.kind === "looks") {
          const owned = await refresh().catch(() => null);
          if (item && owned?.has(item.id)) {
            toast.success(`${item.name} unlocked`);
            return;
          }
        }
      }
      if (!stopped) toast(ON_ITS_WAY);
    })();
    return () => {
      stopped = true;
    };
    // Runs once per page load: the return address is read and removed straight away.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
