// Reserve → lock → apply-and-write → confirm (spec: "Delivery: reserve, apply, confirm"). The server reserves
// deliveries for this installation; the game adds them to its save together with their ids in one write; only
// then does it confirm. Any failure leaves the delivery reserved here, and the saved ids stop a second add.
import { withLock, type Delivery, type DeliveryStep } from "./delivery";

export type CollectGame = "daycare-next" | "recess";
export type CollectDeps = {
  installation: () => string;
  reserve: (installation: string) => Promise<Delivery[]>;
  ack: (installation: string, ids: string[]) => Promise<number>;
  /** The store's read-latest, plan, apply and single write. `ids`: batch ids now recorded in the save. */
  apply: (batch: Delivery[]) => { ok: boolean; ids: string[]; steps: DeliveryStep[] };
  /** The store moves confirmed ids from applied to done. */
  confirm: (ids: string[]) => void;
};

export async function collectDeliveries(
  game: CollectGame,
  deps: CollectDeps,
): Promise<{ added: DeliveryStep[]; pending: boolean }> {
  const installation = deps.installation();
  if (!installation) return { added: [], pending: false };
  return withLock(`pawtastic-delivery-${game}`, async () => {
    let batch: Delivery[];
    try {
      batch = await deps.reserve(installation);
    } catch {
      return { added: [], pending: true };
    }
    if (!batch.length) return { added: [], pending: false };
    const r = deps.apply(batch);
    if (!r.ok) return { added: [], pending: true };
    if (r.ids.length) {
      try {
        await deps.ack(installation, r.ids);
        deps.confirm(r.ids);
      } catch {
        /* still reserved here; the next collect confirms it, and the saved ids stop a second add */
      }
    }
    return { added: r.steps, pending: false };
  });
}
