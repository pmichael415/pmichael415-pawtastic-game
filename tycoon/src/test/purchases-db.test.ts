// @vitest-environment node
// Purchases on the real migrations (PGlite): consumables become deliveries reserved for one account and one
// installation before anything is added to a save; refunds void or reverse them; test-mode rows never count live.
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { setupDb } from "./pg";

const U1 = "00000000-0000-0000-0000-0000000000a1";
const U2 = "00000000-0000-0000-0000-0000000000a2";
const I1 = "11111111-1111-4111-8111-111111111111";
const I2 = "22222222-2222-4222-8222-222222222222";
let db: PGlite;

type Row = { id: string; contents: Record<string, number>; reverses: string | null };
const q = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const grant = async (
  evt: string,
  session: string,
  user: string,
  product: string,
  amount: number,
  entitle: boolean,
  game: string | null,
  contents: object | null,
  mode = "live",
) =>
  (
    await q<{ r: string }>(
      `SELECT public.grant_purchase($1,$2,$3,$4,$5,'usd',$6,$7,$8,$9,$10::jsonb) r`,
      [
        evt,
        session,
        user,
        product,
        amount,
        `pi_${session}`,
        mode,
        entitle,
        game,
        contents ? JSON.stringify(contents) : null,
      ],
    )
  )[0]!.r;
const reserve = async (user: string, inst: string, game = "daycare-next", mode = "live") =>
  (
    await q<{ r: Row[] }>(`SELECT public.reserve_deliveries($1,$2,$3,$4) r`, [
      user,
      inst,
      game,
      mode,
    ])
  )[0]!.r;
const ack = async (user: string, inst: string, ids: string[], mode = "live") =>
  (
    await q<{ r: number }>(`SELECT public.ack_deliveries($1,$2,$3::uuid[],$4) r`, [
      user,
      inst,
      ids,
      mode,
    ])
  )[0]!.r;
const refund = async (evt: string, session: string, mode = "live") =>
  (
    await q<{ r: string }>(`SELECT public.refund_purchase($1,$2,$3) r`, [
      evt,
      `pi_${session}`,
      mode,
    ])
  )[0]!.r;
const session = (id: string, user: string, product: string, amount: number, mode = "live") =>
  q(
    `INSERT INTO public.checkout_sessions(id, user_id, product_id, amount, currency, mode) VALUES ($1,$2,$3,$4,'usd',$5)`,
    [id, user, product, amount, mode],
  );
const statusOf = async (source_ref: string) =>
  (
    await q<{ status: string }>(
      `SELECT status FROM public.deliveries WHERE source = 'purchase' AND source_ref = $1`,
      [source_ref],
    )
  )[0]?.status;

beforeAll(async () => {
  db = await setupDb();
  for (const [id, u, p, a] of [
    ["cs_live_c1", U1, "coins-8000", 299],
    ["cs_live_c2", U1, "coins-2500", 99],
    ["cs_live_c3", U1, "coins-20000", 599],
    ["cs_live_c4", U1, "coins-50000", 1299],
    ["cs_live_u2", U2, "coins-2500", 99],
    ["cs_live_l1", U1, "runner-looks", 199],
    ["cs_live_p1", U1, "power-pack", 299],
  ] as const)
    await session(id, u, p, a);
  await session("cs_test_t1", U1, "coins-2500", 99, "test");
}, 60_000);

describe("consumables become deliveries", () => {
  it("a paid consumable becomes one ready delivery; the same event again is a duplicate", async () => {
    expect(
      await grant("evt_c1", "cs_live_c1", U1, "coins-8000", 299, false, "daycare-next", {
        coins: 8000,
      }),
    ).toBe("granted");
    expect(
      await grant("evt_c1", "cs_live_c1", U1, "coins-8000", 299, false, "daycare-next", {
        coins: 8000,
      }),
    ).toBe("duplicate");
    const rows = await q<{ status: string; game: string; contents: object; mode: string }>(
      `SELECT status, game, contents, mode FROM public.deliveries WHERE source_ref = 'cs_live_c1'`,
    );
    expect(rows).toEqual([
      { status: "ready", game: "daycare-next", contents: { coins: 8000 }, mode: "live" },
    ]);
  });
  it("a paid session in the other mode is refused", async () => {
    await expect(
      grant(
        "evt_t1",
        "cs_test_t1",
        U1,
        "coins-2500",
        99,
        false,
        "daycare-next",
        { coins: 2500 },
        "live",
      ),
    ).rejects.toThrow(/session mismatch/);
  });
});

describe("looks are live entitlements", () => {
  it("a looks purchase grants a live entitlement; an old test-mode one of the same product doesn't block it", async () => {
    await q(
      `INSERT INTO public.entitlements(user_id, product_id, source_event_id, checkout_session_id, mode) VALUES ($1,'runner-looks','evt_old','cs_test_old','test')`,
      [U1],
    );
    expect(await grant("evt_l1", "cs_live_l1", U1, "runner-looks", 199, true, null, null)).toBe(
      "granted",
    );
    const rows = await q<{ mode: string }>(
      `SELECT mode FROM public.entitlements WHERE user_id = $1 AND product_id = 'runner-looks' AND revoked_at IS NULL ORDER BY mode`,
      [U1],
    );
    expect(rows.map((r) => r.mode)).toEqual(["live", "test"]);
  });
});

describe("delivery is reserved per account and installation", () => {
  it("installation A reserves; B gets nothing; A gets the same rows again until it acks", async () => {
    const first = await reserve(U1, I1);
    expect(first.map((r) => r.contents)).toEqual([{ coins: 8000 }]);
    expect(await reserve(U1, I2)).toEqual([]);
    const again = await reserve(U1, I1);
    expect(again.map((r) => r.id)).toEqual(first.map((r) => r.id));
    expect(await ack(U1, I2, [first[0]!.id])).toBe(0); // another installation can't confirm it
    expect(await ack(U1, I1, [first[0]!.id])).toBe(1);
    expect(await reserve(U1, I1)).toEqual([]);
    expect(await statusOf("cs_live_c1")).toBe("delivered");
  });
  it("two reserves racing: each row goes to exactly one installation", async () => {
    await grant("evt_c2", "cs_live_c2", U1, "coins-2500", 99, false, "daycare-next", {
      coins: 2500,
    });
    await grant("evt_c3", "cs_live_c3", U1, "coins-20000", 599, false, "daycare-next", {
      coins: 20000,
    });
    const [a, b] = await Promise.all([reserve(U1, I1), reserve(U1, I2)]);
    const ids = [...a, ...b].map((r) => r.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(a.length === 2 || b.length === 2).toBe(true);
    await ack(
      U1,
      I1,
      a.map((r) => r.id),
    );
    await ack(
      U1,
      I2,
      b.map((r) => r.id),
    );
  });
  it("account B never sees account A's rows, and A's game never sees B's", async () => {
    await grant("evt_u2", "cs_live_u2", U2, "coins-2500", 99, false, "daycare-next", {
      coins: 2500,
    });
    await grant("evt_c4", "cs_live_c4", U1, "coins-50000", 1299, false, "daycare-next", {
      coins: 50000,
    });
    expect((await reserve(U2, I1)).map((r) => r.contents)).toEqual([{ coins: 2500 }]);
    expect((await reserve(U1, I1)).map((r) => r.contents)).toEqual([{ coins: 50000 }]);
  });
  it("a game only collects its own game's deliveries", async () => {
    await grant("evt_p1", "cs_live_p1", U1, "power-pack", 299, false, "recess", {
      shieldStarts: 10,
      extraLives: 10,
    });
    expect((await reserve(U1, I2, "daycare-next")).length).toBe(0);
    expect((await reserve(U1, I2, "recess")).map((r) => r.contents)).toEqual([
      { shieldStarts: 10, extraLives: 10 },
    ]);
  });
});

describe("refunds", () => {
  it("a refund before anyone collected voids the delivery", async () => {
    await session("cs_live_r1", U1, "coins-2500", 99);
    await grant("evt_r1", "cs_live_r1", U1, "coins-2500", 99, false, "daycare-next", {
      coins: 2500,
    });
    expect(await refund("evt_rf1", "cs_live_r1")).toBe("revoked");
    expect(await statusOf("cs_live_r1")).toBe("void");
    expect((await reserve(U1, I2)).some((r) => r.contents["coins"] === 2500)).toBe(false);
  });
  it("a refund after collection creates one reversal, reserved for the same installation; a repeat is a duplicate", async () => {
    // cs_live_c4 (50,000 coins) is reserved for I1 and not yet confirmed.
    expect(await refund("evt_rf4", "cs_live_c4")).toBe("revoked");
    expect(await refund("evt_rf4", "cs_live_c4")).toBe("duplicate");
    const mine = await reserve(U1, I1);
    const reversal = mine.find((r) => r.reverses);
    expect(reversal?.contents).toEqual({ coins: -50000 });
    expect(mine.some((r) => r.id === reversal?.reverses)).toBe(true); // the original is still there to dedupe against
    expect((await reserve(U1, I2)).some((r) => r.reverses)).toBe(false);
  });
  it("a refunded looks purchase is switched off", async () => {
    expect(await refund("evt_rfl", "cs_live_l1")).toBe("revoked");
    const live = await q(
      `SELECT 1 FROM public.entitlements WHERE user_id = $1 AND product_id = 'runner-looks' AND mode = 'live' AND revoked_at IS NULL`,
      [U1],
    );
    expect(live).toHaveLength(0);
  });
});

describe("test data never counts live", () => {
  it("a test-mode delivery is never returned in live mode", async () => {
    await q(
      `INSERT INTO public.deliveries(mode, user_id, game, source, source_ref, contents) VALUES ('test', $1, 'daycare-next', 'purchase', 'cs_test_x', '{"coins": 999}')`,
      [U1],
    );
    expect(
      (await reserve(U1, I1, "daycare-next", "live")).some((r) => r.contents["coins"] === 999),
    ).toBe(false);
    expect((await reserve(U1, I1, "daycare-next", "test")).map((r) => r.contents)).toEqual([
      { coins: 999 },
    ]);
  });
  it("only the service role can reserve, confirm or read deliveries", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      try {
        await expect(
          db.query(`SELECT public.reserve_deliveries($1,$2,'daycare-next','live')`, [U1, I1]),
        ).rejects.toThrow();
        await expect(db.query(`SELECT * FROM public.deliveries`)).rejects.toThrow();
      } finally {
        await db.exec("RESET ROLE");
      }
    }
  });
});
