// The hub's Shop takes real payments: one explicit mode, and keys, Stripe events and purchases from the other
// mode never count (test purchases made before go-live don't become real packs).
import { describe, expect, it } from "vitest";
import { PAYMENT_MODE, countsIn, paymentsConfig, sessionPrefix, validatePaidEvent } from "./verify";

const env = {
  PAYMENT_WEBHOOK_SECRET: "whsec_x",
  APP_ORIGIN: "https://paw-sitive-playhouse-rush.lovable.app",
  STRIPE_EXPECTED_ACCOUNT: "acct_1UWfxx58XGeAL8Pr",
};
const paid = {
  eventId: "evt_1",
  sessionId: "cs_live_1",
  userId: "11111111-1111-1111-1111-111111111111",
  productId: "blue-ribbon-style",
  amount: 299,
  currency: "usd",
  status: "paid",
};

describe("the hub Shop is live", () => {
  it("is deployed in live mode, on purpose", () => {
    expect(PAYMENT_MODE).toBe("live");
  });
  it("accepts only live keys", () => {
    for (const key of ["sk_live_abc", "rk_live_abc"]) expect(paymentsConfig({ ...env, STRIPE_SECRET_KEY: key }).ready).toBe(true);
    for (const key of ["sk_test_abc", "rk_test_abc", "pk_live_abc", "whatever"]) {
      const c = paymentsConfig({ ...env, STRIPE_SECRET_KEY: key });
      expect(c.ready).toBe(false);
      if (!c.ready) expect(c.reason).toBe("Only live-mode keys are accepted");
    }
  });
  it("a test deployment would accept only test keys", () => {
    expect(paymentsConfig({ ...env, STRIPE_SECRET_KEY: "sk_test_abc" }, "test").ready).toBe(true);
    expect(paymentsConfig({ ...env, STRIPE_SECRET_KEY: "sk_live_abc" }, "test").ready).toBe(false);
  });
  it("grants only for payments made in the same mode", () => {
    expect(validatePaidEvent({ ...paid, livemode: true })).toEqual({ ok: true });
    expect(validatePaidEvent({ ...paid, livemode: false })).toEqual({ ok: false, reason: "wrong payment mode" });
    expect(validatePaidEvent({ ...paid, sessionId: "cs_test_1", livemode: false }, "test")).toEqual({ ok: true });
    expect(validatePaidEvent({ ...paid, livemode: true }, "test")).toEqual({ ok: false, reason: "wrong payment mode" });
  });
  it("a purchase counts only in the mode it was made in", () => {
    expect(sessionPrefix("live")).toBe("cs_live_");
    expect(sessionPrefix("test")).toBe("cs_test_");
    expect(countsIn("cs_live_a1B2", "live")).toBe(true);
    expect(countsIn("cs_test_a1B2", "live")).toBe(false);
    expect(countsIn("cs_test_a1B2", "test")).toBe(true);
    expect(countsIn("", "live")).toBe(false);
  });
});
