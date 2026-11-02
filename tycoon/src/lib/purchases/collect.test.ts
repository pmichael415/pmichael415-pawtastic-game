// Collecting deliveries end to end on the real save stores (jsdom storage) against an in-memory stand-in for the
// server's reserve/confirm: added once, never lost by a failed write, a failed confirm, a stale tab or a second tab.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { success: () => {}, error: () => {} }),
}));
import { collectDeliveries, type CollectDeps } from "./collect";
import type { Delivery } from "./delivery";
import * as tycoon from "@/tycoon/store";
import * as hub from "@/game/store";
import { newTycoon, parseTycoon } from "@/tycoon/state";
import { newGame, parseSave } from "@/game/engine";

const I1 = "11111111-1111-4111-8111-111111111111";
const O = "00000000-0000-4000-8000-00000000000a";
const R = "00000000-0000-4000-8000-00000000000b";
const P = "00000000-0000-4000-8000-00000000000c";
type Row = {
  id: string;
  contents: Delivery["contents"];
  reverses?: string;
  status: "ready" | "reserved" | "delivered";
  by?: string;
};

function server(rows: Row[]) {
  return {
    rows,
    reserve: async (inst: string): Promise<Delivery[]> => {
      for (const r of rows)
        if (r.status === "ready") Object.assign(r, { status: "reserved", by: inst });
      return rows
        .filter((r) => r.status === "reserved" && r.by === inst)
        .map((r) => ({ id: r.id, contents: r.contents, reverses: r.reverses ?? null }));
    },
    ack: async (inst: string, ids: string[]) => {
      let n = 0;
      for (const r of rows)
        if (ids.includes(r.id) && r.status === "reserved" && r.by === inst) {
          r.status = "delivered";
          n++;
        }
      return n;
    },
  };
}
const deps = (
  srv: ReturnType<typeof server>,
  store: typeof tycoon | typeof hub = tycoon,
  over: Partial<CollectDeps> = {},
): CollectDeps => ({
  installation: () => I1,
  reserve: srv.reserve,
  ack: srv.ack,
  apply: store.applyDeliveries,
  confirm: store.confirmDeliveries,
  ...over,
});
const tyc = () => parseTycoon(JSON.parse(localStorage.getItem(tycoon.KEY)!))!;
const hubSave = () => parseSave(JSON.parse(localStorage.getItem("pawtastic-tycoon-save-v1")!))!;

beforeEach(() => {
  localStorage.clear();
  tycoon.tycoonStore._reset(null);
  localStorage.setItem(tycoon.KEY, JSON.stringify(newTycoon(Date.now())));
});
afterEach(() => vi.restoreAllMocks());

describe("collecting purchases in the new Daycare", () => {
  it("adds 8,000 coins once; a second collect adds nothing", async () => {
    const srv = server([{ id: O, contents: { coins: 8000 }, status: "ready" }]);
    const r = await collectDeliveries("daycare-next", deps(srv));
    expect(r.added).toEqual([{ id: O, contents: { coins: 8000 }, sign: 1 }]);
    expect(tyc().coins).toBe(3000 + 8000);
    expect(srv.rows[0]!.status).toBe("delivered");
    expect(tyc().deliveries).toEqual({ applied: [], done: [O] });
    expect((await collectDeliveries("daycare-next", deps(srv))).added).toEqual([]);
    expect(tyc().coins).toBe(11000);
  });
  it("a failed confirm is retried next time without adding again", async () => {
    const srv = server([{ id: O, contents: { coins: 8000 }, status: "ready" }]);
    await collectDeliveries(
      "daycare-next",
      deps(srv, tycoon, {
        ack: async () => {
          throw new Error("offline");
        },
      }),
    );
    expect(tyc().coins).toBe(11000);
    expect(srv.rows[0]!.status).toBe("reserved");
    await collectDeliveries("daycare-next", deps(srv));
    expect(tyc().coins).toBe(11000);
    expect(srv.rows[0]!.status).toBe("delivered");
  });
  it("a failed save write is never confirmed; the next collect adds it", async () => {
    const srv = server([{ id: O, contents: { coins: 8000 }, status: "ready" }]);
    const real = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      k: string,
      v: string,
    ) {
      if (k === tycoon.KEY) throw new Error("QuotaExceeded");
      return real.call(this, k, v);
    });
    const ack = vi.fn(srv.ack);
    const r = await collectDeliveries("daycare-next", deps(srv, tycoon, { ack }));
    expect(r).toEqual({ added: [], pending: true });
    expect(ack).not.toHaveBeenCalled();
    expect(srv.rows[0]!.status).toBe("reserved");
    spy.mockRestore();
    await collectDeliveries("daycare-next", deps(srv));
    expect(tyc().coins).toBe(11000);
    expect(srv.rows[0]!.status).toBe("delivered");
  });
  it("two collects at once (two tabs, one installation) add once", async () => {
    const srv = server([{ id: O, contents: { coins: 8000 }, status: "ready" }]);
    await Promise.all([
      collectDeliveries("daycare-next", deps(srv)),
      collectDeliveries("daycare-next", deps(srv)),
    ]);
    expect(tyc().coins).toBe(11000);
  });
  it("a refund's reversal takes the coins back, never below 0", async () => {
    const srv = server([{ id: O, contents: { coins: 8000 }, status: "ready" }]);
    await collectDeliveries("daycare-next", deps(srv));
    localStorage.setItem(tycoon.KEY, JSON.stringify({ ...tyc(), coins: 5000 })); // spent some
    srv.rows.push({ id: R, contents: { coins: -8000 }, reverses: O, status: "reserved", by: I1 });
    const r = await collectDeliveries("daycare-next", deps(srv));
    expect(r.added).toEqual([{ id: R, contents: { coins: 8000 }, sign: -1 }]);
    expect(tyc().coins).toBe(0);
  });
  it("a stale tab can't write over a save that has a delivery it doesn't know about", async () => {
    const stale = tyc();
    tycoon.tycoonStore._reset(stale); // this tab loaded the game before the purchase arrived
    vi.resetModules();
    const other = await import("@/tycoon/store"); // another tab: same storage, its own memory
    const srv = server([{ id: O, contents: { coins: 8000 }, status: "ready" }]);
    await collectDeliveries("daycare-next", deps(srv, other as typeof tycoon));
    expect(tyc().coins).toBe(11000);
    tycoon.tycoonStore.set((s) => ({ ...s, xp: s.xp + 1 })); // the stale tab's next save
    expect(tyc().coins).toBe(11000);
    expect(tycoon.tycoonStore.getState()!.coins).toBe(11000); // and it adopted the newer save
  });
  it("without storage (blocked), nothing is reserved", async () => {
    const srv = server([{ id: O, contents: { coins: 8000 }, status: "ready" }]);
    expect(
      await collectDeliveries("daycare-next", deps(srv, tycoon, { installation: () => "" })),
    ).toEqual({ added: [], pending: false });
    expect(srv.rows[0]!.status).toBe("ready");
  });
});

describe("collecting power-ups in Recess Rush", () => {
  it("a Power Pack adds 10 Shield Starts and 10 Extra Lives to the hub save, once", async () => {
    localStorage.setItem(
      "pawtastic-tycoon-save-v1",
      JSON.stringify(newGame(Date.now(), "2026-11-02")),
    );
    const srv = server([
      { id: P, contents: { shieldStarts: 10, extraLives: 10 }, status: "ready" },
    ]);
    await collectDeliveries("recess", deps(srv, hub));
    await collectDeliveries("recess", deps(srv, hub));
    expect(hubSave().recessPowerups).toEqual({ shield: 10, life: 10 });
  });
});

describe("hostile saves", () => {
  it("bad delivery logs and power-up counts load as empty or clamped", () => {
    const t = parseTycoon({
      ...newTycoon(0),
      deliveries: { applied: ["x", 5, "<script>", O], done: "nope" },
    })!;
    expect(t.deliveries).toEqual({ applied: [O], done: [] });
    expect(parseTycoon({ ...newTycoon(0), deliveries: undefined })!.deliveries).toEqual({
      applied: [],
      done: [],
    });
    const g = parseSave({
      ...newGame(0, "2026-11-02"),
      recessPowerups: { shield: -5, life: "9" },
    })!;
    expect(g.recessPowerups).toEqual({ shield: 0, life: 0 });
    expect(
      parseSave({ ...newGame(0, "2026-11-02"), recessPowerups: { shield: 1e9, life: 3.7 } })!
        .recessPowerups,
    ).toEqual({ shield: 9999, life: 3 });
    expect(
      parseSave({ ...newGame(0, "2026-11-02"), deliveries: { applied: [O, O] } })!.deliveries,
    ).toEqual({ applied: [O], done: [] });
  });
});
