// Planning what a batch of reserved deliveries does to a save: each delivery applies once, a refund's reversal takes
// back only what was added, and only confirmed ids are ever forgotten (spec: "Delivery: reserve, apply, confirm").
import { describe, expect, it } from "vitest";
import {
  DONE_MAX,
  confirmed,
  installationId,
  planDeliveries,
  withLock,
  type DeliveryLog,
} from "./delivery";

const empty: DeliveryLog = { applied: [], done: [] };
const O = { id: "00000000-0000-4000-8000-00000000000a", contents: { coins: 8000 }, reverses: null };
const R = {
  id: "00000000-0000-4000-8000-00000000000b",
  contents: { coins: -8000 },
  reverses: O.id,
};
const P = {
  id: "00000000-0000-4000-8000-00000000000c",
  contents: { shieldStarts: 10, extraLives: 10 },
  reverses: null,
};

describe("planning deliveries", () => {
  it("a new delivery is one +1 step and is remembered as applied", () => {
    const { steps, log } = planDeliveries(empty, [O]);
    expect(steps).toEqual([{ id: O.id, contents: { coins: 8000 }, sign: 1 }]);
    expect(log).toEqual({ applied: [O.id], done: [] });
  });
  it("a delivery already applied or already confirmed adds nothing", () => {
    expect(planDeliveries({ applied: [O.id], done: [] }, [O]).steps).toEqual([]);
    expect(planDeliveries({ applied: [], done: [O.id] }, [O]).steps).toEqual([]);
  });
  it("a reversal of an applied delivery takes it back once", () => {
    const { steps, log } = planDeliveries({ applied: [O.id], done: [] }, [O, R]);
    expect(steps).toEqual([{ id: R.id, contents: { coins: 8000 }, sign: -1 }]);
    expect(log.applied).toEqual([O.id, R.id]);
    expect(planDeliveries(log, [O, R]).steps).toEqual([]);
  });
  it("a reversal of a delivery never applied here changes nothing, and that delivery never applies later", () => {
    const first = planDeliveries(empty, [O, R]); // reversals are handled before originals in one batch
    expect(first.steps).toEqual([]);
    expect(new Set(first.log.applied)).toEqual(new Set([O.id, R.id]));
    expect(planDeliveries(first.log, [O]).steps).toEqual([]);
  });
  it("several deliveries in one batch each apply once", () => {
    const { steps } = planDeliveries(empty, [O, P, O]);
    expect(steps.map((s) => s.id)).toEqual([O.id, P.id]);
  });
  it("confirming moves ids to done; only done is trimmed, never applied", () => {
    const log = confirmed({ applied: [O.id, P.id], done: [] }, [O.id]);
    expect(log).toEqual({ applied: [P.id], done: [O.id] });
    const many = Array.from(
      { length: DONE_MAX + 20 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    const big = confirmed({ applied: [...many, P.id], done: [] }, many);
    expect(big.done).toHaveLength(DONE_MAX);
    expect(big.done.at(-1)).toBe(many.at(-1));
    expect(big.applied).toEqual([P.id]);
  });
});

describe("installation id", () => {
  const store = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      m,
    } as unknown as Storage & { m: Map<string, string> };
  };
  it("is created once and stays the same", () => {
    const s = store();
    const a = installationId(s);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(installationId(s)).toBe(a);
    expect((s as unknown as { m: Map<string, string> }).m.get("pawtastic-install-v1")).toBe(a);
  });
  it("is empty when storage is blocked (then nothing is collected)", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(installationId(blocked)).toBe("");
  });
  it("replaces a corrupted id", () => {
    const s = store();
    s.setItem("pawtastic-install-v1", "not-a-uuid");
    expect(installationId(s)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("the cross-tab lock", () => {
  it("runs one holder at a time when Web Locks exist, and still runs without them", async () => {
    const order: string[] = [];
    const a = withLock("t", async () => {
      order.push("a1");
      await new Promise((r) => setTimeout(r, 20));
      order.push("a2");
      return 1;
    });
    const b = withLock("t", async () => {
      order.push("b1");
      return 2;
    });
    expect(await Promise.all([a, b])).toEqual([1, 2]);
    expect(order).toEqual(["a1", "a2", "b1"]);
  });
});
