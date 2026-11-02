// The live wiring for collecting purchases: this installation, the server's reserve/confirm calls and each game's
// save store. Tests use collectDeliveries with stand-ins instead.
import {
  ackDeliveries,
  listEntitlements,
  reserveDeliveries,
} from "@/lib/payments/payments.functions";
import { collectDeliveries, type CollectGame } from "./collect";
import { installationId } from "./delivery";

export async function liveCollect(game: CollectGame) {
  // Each game's save code loads only when that game collects, so the Shop, Recess Rush and today's Daycare don't
  // carry the new Daycare's engine (about 59 KB) on start-up.
  const store = game === "daycare-next" ? await import("@/tycoon/store") : await import("@/game/store");
  return collectDeliveries(game, {
    installation: () => installationId(),
    reserve: (installation) => reserveDeliveries({ data: { installation, game } }),
    ack: (installation, ids) => ackDeliveries({ data: { installation, ids } }).then((r) => r.acked),
    apply: store.applyDeliveries,
    confirm: store.confirmDeliveries,
  });
}

/** The account's live permanent purchases (looks), for confirming a just-bought pack. */
export async function liveOwned(): Promise<ReadonlySet<string>> {
  const rows = await listEntitlements();
  return new Set(rows.map((r) => r.product_id));
}
