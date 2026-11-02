// Signed payment webhook logic (the route at /api/public/payments/webhook calls this). Fails closed: missing config
// → 503, bad signature → 400, validation failure → 400, DB failure → 500 (Stripe retries).
// The Stripe account is shared with the other PAWtastic games, so notifications that aren't this hub's (other
// games' sales, or events from the other payment mode) are acknowledged and ignored — never retried.
// Granting is atomic and idempotent in public.grant_purchase: looks become entitlements, consumables a delivery.
// `mode` and `secret` are passed only by the Stripe test harness (qa/stripe-test); production uses PAYMENT_MODE.
import { delivers, entitles, productById } from "@/lib/catalog";
import {
  CLOSING_EVENTS,
  GAME_TAG,
  GRANTING_EVENTS,
  PAYMENT_MODE,
  REFUND_EVENT,
  gameOf,
  isModeEvent,
  paymentsConfig,
  refundOf,
  serverPaymentsEnv,
  validatePaidEvent,
  verifySignature,
  type PaymentMode,
} from "./verify";

export async function processWebhook(
  request: Request,
  opts: { mode?: PaymentMode; secret?: string } = {},
): Promise<Response> {
  const mode = opts.mode ?? PAYMENT_MODE;
  const cfg = paymentsConfig(serverPaymentsEnv(), mode);
  if (!cfg.ready) return Response.json({ error: "payments not configured" }, { status: 503 });
  const raw = await request.text();
  const ok = await verifySignature(
    raw,
    request.headers.get("stripe-signature"),
    opts.secret ?? process.env["PAYMENT_WEBHOOK_SECRET"]!,
  );
  if (!ok) return Response.json({ error: "bad signature" }, { status: 400 });

  let evt: {
    id?: string;
    type?: string;
    livemode?: boolean;
    data?: { object?: Record<string, unknown> };
  };
  try {
    evt = JSON.parse(raw);
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const o = evt.data?.object ?? {};
  const type = String(evt.type);
  if (!isModeEvent(Boolean(evt.livemode) || o["livemode"] === true, mode))
    return Response.json({ received: true, ignored: "other-mode" });
  const eventId = String(evt.id ?? "");
  if (!eventId) return Response.json({ error: "missing event id" }, { status: 400 });

  const notOurs = Response.json({ received: true, ignored: "other-game" });

  // Failed / expired checkouts: record them (nothing is granted). Idempotent per event.
  const closing = CLOSING_EVENTS[type];
  if (closing && gameOf(o) !== GAME_TAG) return notOurs;
  if (closing) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("mark_checkout_closed", {
      _event_id: eventId,
      _session_id: String(o["id"] ?? ""),
      _status: closing,
    });
    if (error) return Response.json({ error: "temporary failure" }, { status: 500 });
    return Response.json({ received: true, result: data });
  }

  // Full refunds switch looks off and void or reverse consumables. Partial refunds are acknowledged only.
  if (type === REFUND_EVENT) {
    // Charges may not repeat the payment's tag; untagged refunds are matched by payment below (unknown ones change nothing).
    const g = gameOf(o);
    if (g !== null && g !== GAME_TAG) return notOurs;
    const r = refundOf(o);
    if (!r) return Response.json({ error: "missing payment intent" }, { status: 400 });
    if (!r.full) return Response.json({ received: true, partial: true });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc(
      "refund_purchase" as never,
      { _event_id: eventId, _payment_intent: r.paymentIntent, _mode: mode } as never,
    );
    if (error) return Response.json({ error: "temporary failure" }, { status: 500 });
    return Response.json({ received: true, result: data });
  }

  if (!(GRANTING_EVENTS as readonly string[]).includes(type))
    return Response.json({ received: true });
  if (gameOf(o) !== GAME_TAG) return notOurs;
  const meta = (o["metadata"] ?? {}) as Record<string, string>;
  const paid = {
    eventId,
    sessionId: String(o["id"] ?? ""),
    userId: meta["user_id"] ?? "",
    productId: meta["product_id"] ?? "",
    amount: Number(o["amount_total"]),
    currency: String(o["currency"] ?? ""),
    status: String(o["payment_status"] ?? ""),
    livemode: Boolean(evt.livemode) || Boolean(o["livemode"]),
  };
  // A completed session that is still "unpaid" (delayed method) is acknowledged without granting;
  // the later async_payment_succeeded event (status "paid") grants it.
  if (type === "checkout.session.completed" && paid.status !== "paid")
    return Response.json({ received: true, pending: true });
  const check = validatePaidEvent(paid, mode);
  if (!check.ok) return Response.json({ error: check.reason }, { status: 400 });
  const product = productById(paid.productId)!;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc(
    "grant_purchase" as never,
    {
      _event_id: paid.eventId,
      _session_id: paid.sessionId,
      _user_id: paid.userId,
      _product_id: paid.productId,
      _amount: paid.amount,
      _currency: paid.currency,
      _payment_intent:
        typeof o["payment_intent"] === "string" ? (o["payment_intent"] as string) : null,
      _mode: mode,
      _entitle: entitles(product),
      _game: delivers(product) ? product.game : null,
      _contents: delivers(product) ? (product.contents ?? null) : null,
    } as never,
  );
  if (error) {
    const permanent = /mismatch|unknown session|refunded/.test(error.message);
    return Response.json(
      { error: permanent ? "session mismatch" : "temporary failure" },
      { status: permanent ? 400 : 500 },
    );
  }
  return Response.json({ received: true, result: data });
}
