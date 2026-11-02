// @vitest-environment node
// Signed webhook events → the real webhook route → the real SQL functions (PGlite). Stripe itself is not
// contacted: these are locally signed test payloads, so this proves our handling, not Stripe's delivery.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const SECRET = "whsec_test_flow";
const U1 = "00000000-0000-0000-0000-0000000000a1";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    async rpc(name: string, args: Record<string, unknown>) {
      const keys = Object.keys(args);
      const sql = `SELECT public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) AS r`;
      try {
        const res = await db.query<{ r: string }>(
          sql,
          keys.map((k) => args[k]),
        );
        return { data: res.rows[0]!.r, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
  },
}));

async function sign(body: string, t = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const s = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
  return `t=${t},v1=${[...new Uint8Array(s)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
let post: (req: Request) => Promise<Response>;
async function send(evt: object, opts: { badSig?: boolean } = {}) {
  const body = JSON.stringify(evt);
  const sig = opts.badSig ? "t=1,v1=00" : await sign(body);
  const res = await post(
    new Request("https://play.example.com/api/public/payments/webhook", {
      method: "POST",
      body,
      headers: { "stripe-signature": sig },
    }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}
const completed = (
  id: string,
  session: string,
  amount: number,
  extra: Record<string, unknown> = {},
) => ({
  id,
  type: "checkout.session.completed",
  livemode: true,
  data: {
    object: {
      id: session,
      amount_total: amount,
      currency: "usd",
      payment_status: "paid",
      payment_intent: `pi_${session}`,
      metadata: { user_id: U1, product_id: "blue-ribbon-style", game: "pawtastic-games-hub" },
      ...extra,
    },
  },
});

beforeAll(async () => {
  process.env["STRIPE_SECRET_KEY"] = "sk_live_flow";
  process.env["PAYMENT_WEBHOOK_SECRET"] = SECRET;
  process.env["APP_ORIGIN"] = "https://play.example.com";
  process.env["STRIPE_EXPECTED_ACCOUNT"] = "acct_1PawGames000";
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);
  const dir = path.resolve(__dirname, "../../drizzle/migrations");
  for (const f of readdirSync(dir)
    .filter((x) => x.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(path.join(dir, f), "utf8"));
  await db.exec(
    `INSERT INTO public.checkout_sessions(id, user_id, product_id, amount, currency) VALUES ('cs_live_a', '${U1}', 'blue-ribbon-style', 299, 'usd'), ('cs_live_b', '${U1}', 'deluxe-daycare-decor', 699, 'usd')`,
  );
  const mod = await import("@/routes/api/public/payments/webhook");
  const handlers = (
    mod.Route as unknown as {
      options: { server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } } };
    }
  ).options.server.handlers;
  post = (request) => handlers.POST({ request });
}, 60_000);

const active = async () =>
  (
    await db.query<{ product_id: string }>(
      `SELECT product_id FROM public.entitlements WHERE user_id = $1 AND revoked_at IS NULL`,
      [U1],
    )
  ).rows.map((r) => r.product_id);

describe("signed webhook → entitlement", () => {
  it("rejects a bad signature without touching the database", async () => {
    const r = await send(completed("evt_x", "cs_live_a", 299), { badSig: true });
    expect(r.status).toBe(400);
    expect(await active()).toEqual([]);
  });

  it("grants on a valid paid event; a duplicate delivery is acknowledged and changes nothing", async () => {
    expect((await send(completed("evt_1", "cs_live_a", 299))).json["result"]).toBe("granted");
    const dup = await send(completed("evt_1", "cs_live_a", 299));
    expect(dup.status).toBe(200);
    expect(dup.json["result"]).toBe("duplicate");
    expect(await active()).toEqual(["blue-ribbon-style"]);
  });

  it("a wrong amount is rejected (400) and grants nothing", async () => {
    const r = await send({
      ...completed("evt_2", "cs_live_b", 1),
      data: {
        object: {
          id: "cs_live_b",
          amount_total: 1,
          currency: "usd",
          payment_status: "paid",
          metadata: { user_id: U1, product_id: "deluxe-daycare-decor", game: "pawtastic-games-hub" },
        },
      },
    });
    expect(r.status).toBe(400);
    expect(await active()).toEqual(["blue-ribbon-style"]);
  });

  it("an unpaid completion waits; the delayed-payment success grants later", async () => {
    const pending = await send({
      ...completed("evt_3", "cs_live_b", 699),
      data: {
        object: {
          id: "cs_live_b",
          amount_total: 699,
          currency: "usd",
          payment_status: "unpaid",
          metadata: { user_id: U1, product_id: "deluxe-daycare-decor", game: "pawtastic-games-hub" },
        },
      },
    });
    expect(pending.json["pending"]).toBe(true);
    expect(await active()).toEqual(["blue-ribbon-style"]);
    const ok = await send({
      id: "evt_4",
      type: "checkout.session.async_payment_succeeded",
      livemode: true,
      data: {
        object: {
          id: "cs_live_b",
          amount_total: 699,
          currency: "usd",
          payment_status: "paid",
          payment_intent: "pi_cs_live_b",
          metadata: { user_id: U1, product_id: "deluxe-daycare-decor", game: "pawtastic-games-hub" },
        },
      },
    });
    expect(ok.json["result"]).toBe("granted");
    expect((await active()).sort()).toEqual(["blue-ribbon-style", "deluxe-daycare-decor"]);
  });

  it("test-mode events are acknowledged and ignored now that the hub is live (no retries, nothing granted)", async () => {
    const before = await active();
    const r = await send({ ...completed("evt_5", "cs_live_a", 299), livemode: false });
    expect(r.status).toBe(200);
    expect(r.json["ignored"]).toBe("other-mode");
    expect(await active()).toEqual(before);
  });

  it("a full refund revokes the pack once; a partial refund keeps it", async () => {
    const partial = await send({
      id: "evt_6",
      type: "charge.refunded",
      livemode: true,
      data: {
        object: { payment_intent: "pi_cs_live_b", amount: 699, amount_refunded: 100, refunded: false },
      },
    });
    expect(partial.json["partial"]).toBe(true);
    expect(await active()).toContain("deluxe-daycare-decor");
    const full = await send({
      id: "evt_7",
      type: "charge.refunded",
      livemode: true,
      data: {
        object: { payment_intent: "pi_cs_live_a", amount: 299, amount_refunded: 299, refunded: true },
      },
    });
    expect(full.json["result"]).toBe("revoked");
    expect(
      (
        await send({
          id: "evt_7",
          type: "charge.refunded",
          livemode: true,
          data: {
            object: {
              payment_intent: "pi_cs_live_a",
              amount: 299,
              amount_refunded: 299,
              refunded: true,
            },
          },
        })
      ).json["result"],
    ).toBe("duplicate");
    expect(await active()).toEqual(["deluxe-daycare-decor"]);
  });

  it("an expired checkout is recorded and grants nothing", async () => {
    await db.exec(
      `INSERT INTO public.checkout_sessions(id, user_id, product_id, amount, currency) VALUES ('cs_live_c', '${U1}', 'blue-ribbon-style', 299, 'usd')`,
    );
    const r = await send({
      id: "evt_8",
      type: "checkout.session.expired",
      livemode: true,
      data: { object: { id: "cs_live_c", metadata: { game: "pawtastic-games-hub" } } },
    });
    expect(r.json["result"]).toBe("expired");
    expect(
      (
        await db.query<{ status: string }>(
          `SELECT status FROM public.checkout_sessions WHERE id = 'cs_live_c'`,
        )
      ).rows[0]!.status,
    ).toBe("expired");
    expect(await active()).toEqual(["deluxe-daycare-decor"]);
  });
});

describe("one Stripe account shared by every PAWtastic game", () => {
  const events = async () => (await db.query<{ n: number }>(`SELECT count(*)::int n FROM public.payment_events`)).rows[0]!.n;
  const grad = { user_id: "6f1c0d2e-1111-4222-8333-944455556666", product: "pack55", game: "pawtastic-graduation", mode: "test" };

  it("a Graduation Day sale is acknowledged and ignored: nothing granted, nothing recorded", async () => {
    const before = { packs: await active(), events: await events() };
    const r = await send(completed("evt_grad_1", "cs_grad_1", 299, { metadata: grad }));
    expect(r.status).toBe(200);
    expect(r.json["ignored"]).toBe("other-game");
    expect(await active()).toEqual(before.packs);
    expect(await events()).toBe(before.events);
  });

  it("an untagged checkout isn't granted either", async () => {
    const r = await send(completed("evt_untagged", "cs_live_a", 299, { metadata: { user_id: U1, product_id: "blue-ribbon-style" } }));
    expect(r.status).toBe(200);
    expect(r.json["ignored"]).toBe("other-game");
  });

  it("Graduation Day's expired checkouts and refunds are ignored too", async () => {
    const before = await events();
    const expired = await send({ id: "evt_grad_2", type: "checkout.session.expired", livemode: true, data: { object: { id: "cs_grad_2", metadata: grad } } });
    const refund = await send({ id: "evt_grad_3", type: "charge.refunded", livemode: true, data: { object: { id: "ch_g", payment_intent: "pi_grad", amount: 299, amount_refunded: 299, refunded: true, metadata: grad } } });
    expect([expired.status, refund.status]).toEqual([200, 200]);
    expect([expired.json["ignored"], refund.json["ignored"]]).toEqual(["other-game", "other-game"]);
    expect(await events()).toBe(before);
  });

  it("hub checkouts are tagged as PAWtastic Games (checkout and payment), so Stripe shows which game sold what", async () => {
    const { checkoutParams } = await import("@/lib/payments/verify");
    const { productById } = await import("@/lib/catalog");
    const product = productById("blue-ribbon-style")!;
    const p = checkoutParams(product, U1, "https://play.example.com");
    expect(p.get("metadata[game]")).toBe("pawtastic-games-hub");
    expect(p.get("payment_intent_data[metadata][game]")).toBe("pawtastic-games-hub");
    expect(p.get("payment_intent_data[metadata][user_id]")).toBe(U1);
    expect(p.get("payment_intent_data[metadata][product_id]")).toBe("blue-ribbon-style");
    expect(p.get("line_items[0][price_data][product_data][name]")).toBe("PAWtastic Games · Blue Ribbon Style Pack");
    expect(p.get("line_items[0][price_data][unit_amount]")).toBe("299");
    expect(p.get("success_url")).toBe("https://play.example.com/shop?checkout=returned");
  });
});
