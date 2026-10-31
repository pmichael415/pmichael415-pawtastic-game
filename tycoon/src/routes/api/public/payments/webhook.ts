import { createFileRoute } from "@tanstack/react-router";
import { GRANTING_EVENTS, paymentsConfig, serverPaymentsEnv, validatePaidEvent, verifySignature } from "@/lib/payments/verify";

// Signed payment webhook (test mode only). Fails closed: missing config -> 503,
// bad signature -> 400, validation failure -> 400, DB failure -> 500 (provider retries).
// Granting is atomic + idempotent in public.grant_entitlement (event dedupe + session match).
export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cfg = paymentsConfig(serverPaymentsEnv());
        if (!cfg.ready) return Response.json({ error: "payments not configured" }, { status: 503 });
        const raw = await request.text();
        const ok = await verifySignature(raw, request.headers.get("stripe-signature"), process.env["PAYMENT_WEBHOOK_SECRET"]!);
        if (!ok) return Response.json({ error: "bad signature" }, { status: 400 });

        let evt: { id?: string; type?: string; livemode?: boolean; data?: { object?: Record<string, unknown> } };
        try {
          evt = JSON.parse(raw);
        } catch {
          return Response.json({ error: "bad json" }, { status: 400 });
        }
        if (!(GRANTING_EVENTS as readonly string[]).includes(String(evt.type))) return Response.json({ received: true });

        const o = evt.data?.object ?? {};
        const meta = (o["metadata"] ?? {}) as Record<string, string>;
        const paid = {
          eventId: String(evt.id ?? ""),
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
        if (evt.type === "checkout.session.completed" && paid.status !== "paid") return Response.json({ received: true, pending: true });
        const check = validatePaidEvent(paid);
        if (!check.ok) return Response.json({ error: check.reason }, { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("grant_entitlement", {
          _event_id: paid.eventId,
          _session_id: paid.sessionId,
          _user_id: paid.userId,
          _product_id: paid.productId,
          _amount: paid.amount,
          _currency: paid.currency,
        });
        if (error) {
          const permanent = /mismatch|unknown session/.test(error.message);
          return Response.json({ error: permanent ? "session mismatch" : "temporary failure" }, { status: permanent ? 400 : 500 });
        }
        return Response.json({ received: true, result: data });
      },
    },
  },
});
