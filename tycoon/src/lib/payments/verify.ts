// Runtime-agnostic (Web Crypto) Stripe-style webhook verification + event checks.
import { PAID_PRODUCTS, type PaidProduct } from "../catalog";

const enc = new TextEncoder();

async function hmacHex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verifies header "t=<ts>,v1=<sig>[,v1=<sig>]" over `${t}.${rawBody}` with a 5-minute tolerance. */
export async function verifySignature(rawBody: string, header: string | null, secret: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300) {
  if (!header || !secret) return false;
  let t = 0;
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k === "t") t = Number(v);
    if (k === "v1" && v) sigs.push(v);
  }
  if (!t || !sigs.length || Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  return sigs.some((s) => safeEqual(expected, s));
}

export type PaidEvent = { eventId: string; sessionId: string; userId: string; productId: string; amount: number; currency: string; status: string; livemode: boolean };

/** Confirms test mode, paid status, and that amount/currency/product match the server catalog. */
export function validatePaidEvent(e: PaidEvent): { ok: true } | { ok: false; reason: string } {
  if (e.livemode) return { ok: false, reason: "live mode not enabled" };
  const p = PAID_PRODUCTS.find((x) => x.id === e.productId);
  if (!p) return { ok: false, reason: "unknown product" };
  if (e.status !== "paid") return { ok: false, reason: "not paid" };
  if (e.amount !== p.priceCents) return { ok: false, reason: "amount mismatch" };
  if (e.currency.toLowerCase() !== p.currency) return { ok: false, reason: "currency mismatch" };
  if (!/^[0-9a-f-]{36}$/i.test(e.userId)) return { ok: false, reason: "no verified user" };
  if (!e.sessionId || !e.eventId) return { ok: false, reason: "missing ids" };
  return { ok: true };
}

/** Canonical HTTPS origin only (no path/query/credentials). localhost http is never accepted. */
export function canonicalOrigin(v: string | undefined): string | null {
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" || u.username || u.password || (u.pathname !== "/" && u.pathname !== "") || u.search || u.hash) return null;
    return u.origin === v.replace(/\/$/, "") ? u.origin : null;
  } catch {
    return null;
  }
}

/** Stripe account ids look like acct_1AbC…; the owner confirms the game's own account id before payments open. */
export const isAccountId = (v: string | undefined): v is string => !!v && /^acct_[A-Za-z0-9]{8,40}$/.test(v);

/**
 * Server-only config check. Fails closed: refuses live keys, partial config, a missing/invalid return origin,
 * and an unconfirmed receiving account (STRIPE_EXPECTED_ACCOUNT, verified against the key at checkout).
 */
export function paymentsConfig(env: { STRIPE_SECRET_KEY?: string | undefined; PAYMENT_WEBHOOK_SECRET?: string | undefined; APP_ORIGIN?: string | undefined; STRIPE_EXPECTED_ACCOUNT?: string | undefined }) {
  const key = env.STRIPE_SECRET_KEY ?? "";
  if (!key || !env.PAYMENT_WEBHOOK_SECRET) return { ready: false as const, reason: "Payment provider not configured yet" };
  if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) return { ready: false as const, reason: "Only test-mode keys are accepted" };
  const origin = canonicalOrigin(env.APP_ORIGIN);
  if (!origin) return { ready: false as const, reason: "Checkout return address not configured" };
  if (!isAccountId(env.STRIPE_EXPECTED_ACCOUNT)) return { ready: false as const, reason: "Receiving Stripe account not confirmed yet" };
  return { ready: true as const, key, origin, account: env.STRIPE_EXPECTED_ACCOUNT };
}

export const serverPaymentsEnv = () => ({
  STRIPE_SECRET_KEY: process.env["STRIPE_SECRET_KEY"],
  PAYMENT_WEBHOOK_SECRET: process.env["PAYMENT_WEBHOOK_SECRET"],
  APP_ORIGIN: process.env["APP_ORIGIN"],
  STRIPE_EXPECTED_ACCOUNT: process.env["STRIPE_EXPECTED_ACCOUNT"],
});

/** The key must belong to the confirmed game account (never the customer app's account). */
export function accountMatches(fetched: unknown, expected: string): boolean {
  return !!fetched && typeof fetched === "object" && (fetched as { id?: unknown }).id === expected;
}

/** Events that close a checkout without payment. */
export const CLOSING_EVENTS: Record<string, "failed" | "expired"> = {
  "checkout.session.async_payment_failed": "failed",
  "checkout.session.expired": "expired",
};
export const REFUND_EVENT = "charge.refunded";
/** A full refund of a charge (partial refunds keep the cosmetic and are only acknowledged). */
export function refundOf(charge: Record<string, unknown>): { paymentIntent: string; full: boolean } | null {
  const pi = charge["payment_intent"];
  if (typeof pi !== "string" || !pi) return null;
  const amount = Number(charge["amount"]);
  const refunded = Number(charge["amount_refunded"]);
  return { paymentIntent: pi, full: charge["refunded"] === true || (Number.isFinite(amount) && amount > 0 && refunded >= amount) };
}

export type SessionRow = { id: string; user_id: string; product_id: string; amount: number; currency: string };
/**
 * Stripe idempotency can return the same session for a retried request. Reuse the recorded row only
 * when it belongs to the same buyer/product/amount/currency; anything else fails closed.
 */
export function reconcileSession(existing: SessionRow | null, want: SessionRow): "insert" | "reuse" | "mismatch" {
  if (!existing) return "insert";
  const same = existing.id === want.id && existing.user_id === want.user_id && existing.product_id === want.product_id && existing.amount === want.amount && existing.currency.toLowerCase() === want.currency.toLowerCase();
  return same ? "reuse" : "mismatch";
}

/** Webhook event types that may grant. Card-only checkout, but delayed payments are still handled. */
export const GRANTING_EVENTS = ["checkout.session.completed", "checkout.session.async_payment_succeeded"] as const;

// ---------- one Stripe account shared by every PAWtastic game ----------
// Graduation Day sells on the same Stripe account (its sessions carry metadata game=pawtastic-graduation).
// Hub sales carry this tag on the Checkout Session and on its payment, so each game's server ignores the
// other's notifications and Stripe's payments list shows which game earned what.
export const GAME_TAG = "pawtastic-games-hub";
export const ITEM_PREFIX = "PAWtastic Games · ";
export const gameOf = (o: Record<string, unknown>): string | null => {
  const m = o["metadata"];
  const g = m && typeof m === "object" ? (m as Record<string, unknown>)["game"] : null;
  return typeof g === "string" ? g : null;
};
/** The Checkout Session request for one cosmetic pack (card only, test mode is enforced by the caller). */
export function checkoutParams(product: PaidProduct, userId: string, origin: string): URLSearchParams {
  return new URLSearchParams({
    mode: "payment",
    "payment_method_types[0]": "card",
    success_url: `${origin}/shop?checkout=returned`,
    cancel_url: `${origin}/shop?checkout=cancelled`,
    client_reference_id: userId,
    "metadata[game]": GAME_TAG,
    "metadata[user_id]": userId,
    "metadata[product_id]": product.id,
    "payment_intent_data[metadata][game]": GAME_TAG,
    "payment_intent_data[metadata][user_id]": userId,
    "payment_intent_data[metadata][product_id]": product.id,
    "payment_intent_data[description]": `${ITEM_PREFIX}${product.name}`,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": product.currency,
    "line_items[0][price_data][unit_amount]": String(product.priceCents),
    "line_items[0][price_data][product_data][name]": `${ITEM_PREFIX}${product.name}`,
  });
}
