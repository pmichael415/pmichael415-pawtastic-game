import { describe, expect, it } from "vitest";
import { paymentsConfig, validatePaidEvent, verifySignature } from "./verify";

async function sign(secret: string, t: number, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
  return [...new Uint8Array(s)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("payment webhook checks", () => {
  it("accepts a valid signature and rejects tampering / stale timestamps", async () => {
    const t = 1_800_000_000;
    const body = '{"id":"evt_1"}';
    const v1 = await sign("whsec_test", t, body);
    expect(await verifySignature(body, `t=${t},v1=${v1}`, "whsec_test", t)).toBe(true);
    expect(await verifySignature(body + " ", `t=${t},v1=${v1}`, "whsec_test", t)).toBe(false);
    expect(await verifySignature(body, `t=${t},v1=${v1}`, "whsec_test", t + 301)).toBe(false);
    expect(await verifySignature(body, null, "whsec_test", t)).toBe(false);
  });

  it("requires $2.99 USD for the Blue Ribbon pack", () => {
    const base = { eventId: "evt_1", sessionId: "cs_test_1", userId: "11111111-1111-1111-1111-111111111111", productId: "blue-ribbon-style", currency: "usd", status: "paid", livemode: false };
    expect(validatePaidEvent({ ...base, amount: 299 }).ok).toBe(true);
    expect(validatePaidEvent({ ...base, amount: 1 }).ok).toBe(false);
    expect(validatePaidEvent({ ...base, amount: 299, currency: "eur" }).ok).toBe(false);
    expect(validatePaidEvent({ ...base, amount: 299, userId: "" }).ok).toBe(false);
  });

  it("requires $6.99 for Deluxe Daycare Decor", () => {
    const base = { eventId: "evt_2", sessionId: "cs_test_2", userId: "11111111-1111-1111-1111-111111111111", currency: "usd", livemode: false };
    expect(validatePaidEvent({ ...base, productId: "deluxe-daycare-decor", amount: 699, status: "paid" }).ok).toBe(true);
    expect(validatePaidEvent({ ...base, productId: "deluxe-daycare-decor", amount: 699, status: "unpaid" }).ok).toBe(false);
    expect(validatePaidEvent({ ...base, productId: "deluxe-daycare-decor", amount: 699, status: "paid", livemode: true }).ok).toBe(false);
    expect(validatePaidEvent({ ...base, productId: "free-stuff", amount: 0, status: "paid" }).ok).toBe(false);
  });
});

describe("payments config fails closed", () => {
  it("not ready without both secrets, refuses live keys", () => {
    expect(paymentsConfig({}).ready).toBe(false);
    expect(paymentsConfig({ STRIPE_SECRET_KEY: "sk_test_x" }).ready).toBe(false);
    expect(paymentsConfig({ STRIPE_SECRET_KEY: "sk_live_x", PAYMENT_WEBHOOK_SECRET: "whsec" }).ready).toBe(false);
    expect(paymentsConfig({ STRIPE_SECRET_KEY: "sk_test_x", PAYMENT_WEBHOOK_SECRET: "whsec", APP_ORIGIN: "https://play.example.com" }).ready).toBe(false); // receiving account not confirmed
    expect(paymentsConfig({ STRIPE_SECRET_KEY: "sk_test_x", PAYMENT_WEBHOOK_SECRET: "whsec", APP_ORIGIN: "https://play.example.com", STRIPE_EXPECTED_ACCOUNT: "acct_1PawGames000" }).ready).toBe(true);
  });
  it("accepts any of multiple v1 signatures", async () => {
    const t = 1_800_000_000, body = "{}";
    const v1 = await sign("s", t, body);
    expect(await verifySignature(body, `t=${t},v1=deadbeef,v1=${v1}`, "s", t)).toBe(true);
  });
});
