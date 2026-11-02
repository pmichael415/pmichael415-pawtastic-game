import { describe, expect, it } from "vitest";
import { allowedReturn, canonicalOrigin, checkoutParams, GRANTING_EVENTS, paymentsConfig, reconcileSession, STRIPE_VERSION, stripeErrorSummary, stripeHeaders } from "./verify";

const base = { STRIPE_SECRET_KEY: "sk_live_x", PAYMENT_WEBHOOK_SECRET: "whsec_x", STRIPE_EXPECTED_ACCOUNT: "acct_1PawGames000" };
describe("payment readiness requires a canonical HTTPS origin", () => {
  it("missing or invalid APP_ORIGIN keeps Buy locked", () => {
    for (const o of [undefined, "", "http://play.example.com", "https://play.example.com/shop", "https://play.example.com?x=1", "https://u:p@play.example.com", "not a url"]) {
      expect(paymentsConfig({ ...base, APP_ORIGIN: o }).ready).toBe(false);
    }
  });
  it("valid origin enables live mode only", () => {
    const c = paymentsConfig({ ...base, APP_ORIGIN: "https://play.example.com/" });
    expect(c.ready && c.origin).toBe("https://play.example.com");
    expect(paymentsConfig({ ...base, STRIPE_SECRET_KEY: "sk_test_x", APP_ORIGIN: "https://play.example.com" }).ready).toBe(false);
    expect(canonicalOrigin("https://PLAY.example.com")).toBeNull();
  });
});

describe("checkout retry within the idempotency window", () => {
  const want = { id: "cs_test_1", user_id: "u1", product_id: "blue-ribbon-style", amount: 299, currency: "usd" };
  it("first call inserts, identical retry reuses the same session", () => {
    expect(reconcileSession(null, want)).toBe("insert");
    expect(reconcileSession({ ...want }, want)).toBe("reuse");
    expect(reconcileSession({ ...want, currency: "USD" }, want)).toBe("reuse");
  });
  it("same session id recorded for another buyer, product or amount fails closed", () => {
    expect(reconcileSession({ ...want, user_id: "u2" }, want)).toBe("mismatch");
    expect(reconcileSession({ ...want, product_id: "deluxe-daycare-decor" }, want)).toBe("mismatch");
    expect(reconcileSession({ ...want, amount: 1 }, want)).toBe("mismatch");
  });
  it("delayed payments are handled via async_payment_succeeded", () => {
    expect(GRANTING_EVENTS).toContain("checkout.session.async_payment_succeeded");
    expect(GRANTING_EVENTS).toContain("checkout.session.completed");
  });
});

describe("a refused checkout says why, without leaking keys", () => {
  it("names Stripe's error code and message", () => {
    const body = { error: { type: "invalid_request_error", code: "parameter_unknown", param: "payment_intent_data[description]", message: "Received unknown parameter: payment_intent_data[description]" } };
    expect(stripeErrorSummary(body, 400)).toBe("parameter_unknown: Received unknown parameter: payment_intent_data[description]");
  });
  it("names the parameter when Stripe gives one but no code", () => {
    const body = { error: { type: "invalid_request_error", param: "payment_method_types", message: "The payment_method_types parameter is no longer supported when creating a Checkout Session." } };
    expect(stripeErrorSummary(body, 400)).toBe("invalid_request_error (payment_method_types): The payment_method_types parameter is no longer supported when creating a Checkout Session.");
  });
  it("falls back to the error type, then the HTTP status", () => {
    expect(stripeErrorSummary({ error: { type: "api_error" } }, 500)).toBe("api_error");
    expect(stripeErrorSummary({}, 502)).toBe("HTTP 502");
    expect(stripeErrorSummary("not json", 503)).toBe("HTTP 503");
  });
  it("masks anything shaped like a Stripe key and stays short", () => {
    const body = { error: { type: "permission_error", message: "The provided key 'rk_test_51Abc*********************XyZ9' does not have the required permissions for this endpoint. Having the 'rak_checkout_session_write' permission would allow this request to continue." } };
    const s = stripeErrorSummary(body, 403);
    expect(s).not.toMatch(/rk_test_51/);
    expect(s).toContain("[key]");
    expect(s).toContain("rak_checkout_session_write");
    expect(stripeErrorSummary({ error: { message: "x".repeat(900) } }, 400).length).toBeLessThanOrEqual(300);
  });
});

describe("Stripe requests use the same pinned API version as Graduation Day", () => {
  it("pins the version Graduation Day already uses on the shared games account", () => {
    expect(STRIPE_VERSION).toBe("2026-01-28.clover");
    const h = stripeHeaders("sk_test_x");
    expect(h["Stripe-Version"]).toBe(STRIPE_VERSION);
    expect(h["Authorization"]).toBe("Bearer sk_test_x");
    expect(h["Idempotency-Key"]).toBeUndefined();
  });
  it("form requests carry the content type and idempotency key", () => {
    const h = stripeHeaders("sk_test_x", "u1-blue-ribbon-style-1");
    expect(h["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(h["Idempotency-Key"]).toBe("u1-blue-ribbon-style-1");
    expect(h["Stripe-Version"]).toBe(STRIPE_VERSION);
  });
  it("checkout follows the current API: payment methods come from the Dashboard, not payment_method_types", () => {
    const p = checkoutParams({ id: "blue-ribbon-style", name: "Blue Ribbon Style Pack", priceCents: 299, currency: "usd" } as never, "u1", "https://play.example.com", "/shop");
    expect([...p.keys()].some((k) => k.startsWith("payment_method_types"))).toBe(false);
    expect(p.get("mode")).toBe("payment");
    expect(p.get("metadata[game]")).toBe("pawtastic-games-hub");
    expect(p.get("metadata[user_id]")).toBe("u1");
    expect(p.get("payment_intent_data[metadata][product_id]")).toBe("blue-ribbon-style");
    expect(p.get("line_items[0][price_data][unit_amount]")).toBe("299");
  });
});

describe("checkout returns the buyer to the game", () => {
  it("success and cancel go back to the page the purchase started from", async () => {
    const { productById } = await import("@/lib/catalog");
    const pp = productById("power-pack")!;
    const p = checkoutParams(pp, "u1", "https://play.example.com", "/recess");
    expect(p.get("success_url")).toBe("https://play.example.com/recess?checkout=returned&item=power-pack");
    expect(p.get("cancel_url")).toBe("https://play.example.com/recess?checkout=cancelled");
    expect(checkoutParams(pp, "u1", "https://play.example.com", "/shop").get("success_url")).toBe("https://play.example.com/shop?checkout=returned&item=power-pack");
  });
  it("only the product's own game page or the Shop tab is allowed", async () => {
    const { productById } = await import("@/lib/catalog");
    const pp = productById("power-pack")!;
    expect(allowedReturn(pp, "/recess")).toBe(true);
    expect(allowedReturn(pp, "/shop")).toBe(true);
    expect(allowedReturn(pp, "/daycare-next")).toBe(false);
    expect(allowedReturn(pp, "https://evil.example/" as never)).toBe(false);
    expect(allowedReturn(productById("coins-8000")!, "/daycare-next")).toBe(true);
  });
});
