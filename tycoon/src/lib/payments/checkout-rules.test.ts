import { describe, expect, it } from "vitest";
import { canonicalOrigin, GRANTING_EVENTS, paymentsConfig, reconcileSession } from "./verify";

const base = { STRIPE_SECRET_KEY: "sk_test_x", PAYMENT_WEBHOOK_SECRET: "whsec_x" };
describe("payment readiness requires a canonical HTTPS origin", () => {
  it("missing or invalid APP_ORIGIN keeps Buy locked", () => {
    for (const o of [undefined, "", "http://play.example.com", "https://play.example.com/shop", "https://play.example.com?x=1", "https://u:p@play.example.com", "not a url"]) {
      expect(paymentsConfig({ ...base, APP_ORIGIN: o }).ready).toBe(false);
    }
  });
  it("valid origin enables test-mode only", () => {
    const c = paymentsConfig({ ...base, APP_ORIGIN: "https://play.example.com/" });
    expect(c.ready && c.origin).toBe("https://play.example.com");
    expect(paymentsConfig({ ...base, STRIPE_SECRET_KEY: "sk_live_x", APP_ORIGIN: "https://play.example.com" }).ready).toBe(false);
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
