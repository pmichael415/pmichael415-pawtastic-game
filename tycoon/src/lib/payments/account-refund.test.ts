import { describe, expect, it } from "vitest";
import { CLOSING_EVENTS, accountMatches, paymentsConfig, refundOf } from "./verify";

const ok = {
  STRIPE_SECRET_KEY: "sk_test_x",
  PAYMENT_WEBHOOK_SECRET: "whsec_x",
  APP_ORIGIN: "https://play.example.com",
};

describe("receiving account must be confirmed", () => {
  it("Buy stays locked until the owner confirms the game's Stripe account id", () => {
    expect(paymentsConfig(ok).ready).toBe(false);
    expect(paymentsConfig({ ...ok, STRIPE_EXPECTED_ACCOUNT: "pawtastic games" }).ready).toBe(false);
    const c = paymentsConfig({ ...ok, STRIPE_EXPECTED_ACCOUNT: "acct_1PawGames000" });
    expect(c.ready && c.account).toBe("acct_1PawGames000");
  });
  it("a key from any other account (e.g. the customer app's) is refused", () => {
    expect(accountMatches({ id: "acct_1PawGames000" }, "acct_1PawGames000")).toBe(true);
    expect(accountMatches({ id: "acct_1CustomerApp0" }, "acct_1PawGames000")).toBe(false);
    expect(accountMatches(null, "acct_1PawGames000")).toBe(false);
    expect(accountMatches({ error: { message: "Invalid API Key" } }, "acct_1PawGames000")).toBe(
      false,
    );
  });
});

describe("refunds and closed checkouts", () => {
  it("only a full refund revokes; partial refunds are acknowledged", () => {
    expect(
      refundOf({ payment_intent: "pi_1", amount: 299, amount_refunded: 299, refunded: true }),
    ).toEqual({ paymentIntent: "pi_1", full: true });
    expect(
      refundOf({ payment_intent: "pi_1", amount: 699, amount_refunded: 100, refunded: false }),
    ).toEqual({ paymentIntent: "pi_1", full: false });
    expect(refundOf({ amount: 299, amount_refunded: 299 })).toBeNull();
  });
  it("failed and expired sessions are recorded, never granted", () => {
    expect(CLOSING_EVENTS["checkout.session.async_payment_failed"]).toBe("failed");
    expect(CLOSING_EVENTS["checkout.session.expired"]).toBe("expired");
    expect(CLOSING_EVENTS["checkout.session.completed"]).toBeUndefined();
  });
});
