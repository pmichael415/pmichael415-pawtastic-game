// One coin pack through Stripe TEST mode, start to refund (started by qa/stripe-test/harness.mjs, which checks the
// key is a test key of the games account first). Stripe's events are re-signed with a local secret and handed to the
// hub's own webhook code in "test" mode — the only place that mode is used. The database is a local throwaway.
import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { productById } from "@/lib/catalog";
import type { Delivery } from "@/lib/purchases/delivery";
import { checkoutIdempotencyKey, checkoutParams, stripeHeaders } from "@/lib/payments/verify";
import { processWebhook } from "@/lib/payments/webhook.server";
import { supabaseAdmin } from "../stubs/supabase-admin";

const BASE = process.env["HARNESS_STRIPE_BASE"] ?? "";
const KEY = process.env["HARNESS_KEY"] ?? "";
const PAY = process.env["HARNESS_PAY"] ?? "stripe";
const ORIGIN = "https://hub.test"; // where Stripe sends the buyer back; the browser below answers it locally
const SECRET = "whsec_harness_local";
// What paymentsConfig(…, "test") checks for; the real hub's settings are never read or changed.
Object.assign(process.env, { STRIPE_SECRET_KEY: KEY, PAYMENT_WEBHOOK_SECRET: SECRET, APP_ORIGIN: ORIGIN, STRIPE_EXPECTED_ACCOUNT: process.env["HARNESS_ACCOUNT"] });

type Obj = Record<string, unknown>;
type StripeEvent = { id: string; type: string; livemode: boolean; data: { object: Obj } };

async function stripe(pathAndQuery: string, init: { method?: string; form?: URLSearchParams; idem?: string } = {}): Promise<Obj> {
  const headers = { ...stripeHeaders(KEY, init.idem), ...(init.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) };
  const res = await fetch(`${BASE}${pathAndQuery}`, { method: init.method ?? "GET", headers, ...(init.form ? { body: init.form } : {}) });
  const body = (await res.json()) as Obj & { error?: { type?: string; message?: string } };
  if (!res.ok) throw new Error(`Stripe ${pathAndQuery.split("?")[0]}: ${res.status} ${body.error?.type}: ${body.error?.message}`);
  return body;
}

/** Waits for Stripe's event of this type about this object (events can take a few seconds to appear). */
async function eventFor(type: string, since: number, match: (o: Obj) => boolean): Promise<StripeEvent> {
  for (let i = 0; i < 45; i++) {
    const q = new URLSearchParams({ type, "created[gte]": String(since), limit: "100" });
    const list = (await stripe(`/v1/events?${q}`)) as { data: StripeEvent[] };
    const e = list.data.find((x) => match(x.data.object));
    if (e) return e;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Stripe sent no ${type} event`);
}

/** Hands an event to the hub's webhook code, signed as Stripe would sign it (with the harness's own secret). */
async function deliver(evt: StripeEvent): Promise<{ status: number; body: Obj }> {
  const raw = JSON.stringify(evt);
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", SECRET).update(`${t}.${raw}`).digest("hex");
  const req = new Request(`${ORIGIN}/api/public/payments/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${sig}` }, body: raw });
  const res = await processWebhook(req, { mode: "test", secret: SECRET });
  return { status: res.status, body: (await res.json()) as Obj };
}

// Playwright comes with the machine's browser tools, not this project, so Node's require finds it (vitest's resolver
// would not). Only the calls used below are typed.
type Loc = { fill(v: string): Promise<void>; click(): Promise<void>; check(): Promise<void>; isVisible(): Promise<boolean>; first(): Loc };
type PwPage = { goto(u: string): Promise<unknown>; locator(s: string): Loc; getByRole(role: string, o: { name: string | RegExp }): Loc; waitForURL(f: (u: URL) => boolean, o: { timeout: number }): Promise<void> };
type PwContext = { route(pattern: string, h: (r: { fulfill(o: { status: number; contentType: string; body: string }): Promise<void> }) => unknown): Promise<void>; newPage(): Promise<PwPage>; close(): Promise<void> };
type Browser = { newContext(o: { locale: string }): Promise<PwContext>; close(): Promise<void> };
const { chromium } = createRequire(import.meta.url)("playwright") as { chromium: { launch(): Promise<Browser> } };

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

/** Pays on the checkout page: Stripe's hosted page with the 4242 test card, or the stand-in's Pay button. */
async function pay(url: string) {
  const ctx = await browser.newContext({ locale: "en-US" });
  await ctx.route(`${ORIGIN}/**`, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>Back in the hub.</p>" }));
  const page = await ctx.newPage();
  await page.goto(url);
  if (PAY === "mock") await page.getByRole("button", { name: "Pay" }).click();
  else {
    // Stripe's hosted Checkout fields (ids set by Stripe). The card may sit behind a "Card" choice.
    await page.locator("#email").fill("harness@example.com");
    const cardChoice = page.getByRole("radio", { name: /card/i }).first();
    if (await cardChoice.isVisible().catch(() => false)) await cardChoice.check().catch(() => {});
    await page.locator("#cardNumber").fill("4242424242424242");
    await page.locator("#cardExpiry").fill("12 / 34");
    await page.locator("#cardCvc").fill("123");
    await page.locator("#billingName").fill("Harness Test");
    const zip = page.locator("#billingPostalCode");
    if (await zip.isVisible().catch(() => false)) await zip.fill("07506");
    await page.locator('button[type="submit"]').first().click();
  }
  await page.waitForURL((u) => u.href.startsWith(ORIGIN), { timeout: 90_000 });
  await ctx.close();
}

describe("a coin pack through Stripe test mode, from checkout to refund", () => {
  const user = randomUUID();
  const phone = randomUUID();
  const otherPhone = randomUUID();
  const product = productById("coins-2500")!;
  const since = Math.floor(Date.now() / 1000) - 10;
  let session: Obj;
  let paid: StripeEvent;
  let delivery: Delivery;

  it("Stripe makes a test checkout from the hub's exact request", async () => {
    session = await stripe("/v1/checkout/sessions", {
      method: "POST",
      form: checkoutParams(product, user, ORIGIN, "/daycare-next"),
      idem: checkoutIdempotencyKey(user, product.id, "/daycare-next", randomUUID()),
    });
    expect(String(session["id"])).toMatch(/^cs_test_/);
    expect(session["livemode"]).toBe(false);
    expect(session["amount_total"]).toBe(product.priceCents);
    // What createCheckout records for the webhook to match against.
    const { error } = await supabaseAdmin.from("checkout_sessions").insert({ id: session["id"], user_id: user, product_id: product.id, amount: product.priceCents, currency: product.currency, mode: "test" });
    expect(error).toBeNull();
  });

  it("paying with the 4242 test card gives a paid checkout.session.completed", async () => {
    await pay(String(session["url"]));
    paid = await eventFor("checkout.session.completed", since, (o) => o["id"] === session["id"]);
    expect(paid.livemode).toBe(false);
    expect(paid.data.object["payment_status"]).toBe("paid");
  });

  it("the hub's webhook grants it once, even when Stripe sends the event twice", async () => {
    const first = await deliver(paid);
    expect(first).toEqual({ status: 200, body: { received: true, result: "granted" } });
    const again = await deliver(paid);
    expect(again.status).toBe(200);
    expect(again.body["result"]).toBe("duplicate");
    const { data } = await supabaseAdmin.from("deliveries").select("id, status").eq("user_id", user);
    expect(data).toHaveLength(1);
  });

  it("one installation reserves and confirms it; another installation gets nothing", async () => {
    const mine = (await supabaseAdmin.rpc("reserve_deliveries", { _user_id: user, _installation: phone, _game: "daycare-next", _mode: "test" })).data as Delivery[];
    expect(mine).toHaveLength(1);
    delivery = mine[0]!;
    expect(delivery.contents).toEqual({ coins: 2500 });
    const theirs = (await supabaseAdmin.rpc("reserve_deliveries", { _user_id: user, _installation: otherPhone, _game: "daycare-next", _mode: "test" })).data as Delivery[];
    expect(theirs).toEqual([]);
    const acked = await supabaseAdmin.rpc("ack_deliveries", { _user_id: user, _installation: phone, _ids: [delivery.id], _mode: "test" });
    expect(acked.data).toBe(1);
    const { data } = await supabaseAdmin.from("deliveries").select("status").eq("id", delivery.id).single();
    expect(data).toEqual({ status: "delivered" });
  });

  it("a full refund through Stripe takes the coins back once", async () => {
    const pi = String(paid.data.object["payment_intent"]);
    await stripe("/v1/refunds", { method: "POST", form: new URLSearchParams({ payment_intent: pi }) });
    const refunded = await eventFor("charge.refunded", since, (o) => o["payment_intent"] === pi);
    expect(await deliver(refunded)).toEqual({ status: 200, body: { received: true, result: "revoked" } });
    expect((await deliver(refunded)).status).toBe(200);
    const back = (await supabaseAdmin.rpc("reserve_deliveries", { _user_id: user, _installation: phone, _game: "daycare-next", _mode: "test" })).data as Delivery[];
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ reverses: delivery.id, contents: { coins: -2500 } }); // a reversal takes them back
  });
});
