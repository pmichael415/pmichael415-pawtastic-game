import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PAID_PRODUCTS, PRODUCT_IDS } from "@/lib/catalog";
import { PAYMENT_MODE, accountMatches, checkoutParams, paymentsConfig, reconcileSession, serverPaymentsEnv, stripeErrorSummary, stripeHeaders } from "./verify";

// Cache the "this key belongs to the confirmed game account" check briefly per server instance.
let accountOk: { key: string; account: string; until: number } | null = null;
async function keyMatchesAccount(key: string, account: string): Promise<boolean> {
  if (accountOk && accountOk.key === key && accountOk.account === account && accountOk.until > Date.now()) return true;
  try {
    const res = await fetch("https://api.stripe.com/v1/account", { headers: stripeHeaders(key) });
    const body = await res.json();
    const ok = res.ok && accountMatches(body, account);
    accountOk = ok ? { key, account, until: Date.now() + 10 * 60_000 } : null;
    return ok;
  } catch {
    return false;
  }
}

/** Public: is checkout configured? Never reveals secrets. */
export const getPaymentsStatus = createServerFn({ method: "GET" }).handler(async () => {
  const cfg = paymentsConfig(serverPaymentsEnv());
  return { ready: cfg.ready, reason: cfg.ready ? null : cfg.reason };
});

/** Authoritative restore: entitlements written only by the verified webhook, read as the caller (RLS). */
export const listEntitlements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("entitlements").select("product_id, granted_at").eq("user_id", context.userId).is("revoked_at" as never, null);
    if (error) throw new Error("Could not load purchases");
    return data ?? [];
  });

/** Creates a checkout session in PAYMENT_MODE. Fails closed when not configured or the key is in the other mode. */
export const createCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ productId: z.enum(PRODUCT_IDS) }).parse(input))
  .handler(async ({ data, context }) => {
    const cfg = paymentsConfig(serverPaymentsEnv());
    if (!cfg.ready) return { ok: false as const, error: cfg.reason };
    const product = PAID_PRODUCTS.find((p) => p.id === data.productId)!;
    if (!(await keyMatchesAccount(cfg.key, cfg.account))) return { ok: false as const, error: "Purchases are paused: the payment key doesn't match the confirmed PAWtastic Games account." };

    const { data: owned, error: ownErr } = await context.supabase.from("entitlements").select("id").eq("user_id", context.userId).eq("product_id", product.id).maybeSingle();
    if (ownErr) return { ok: false as const, error: "Couldn't confirm your purchases — try again" };
    if (owned) return { ok: false as const, error: "You already own this pack — use Restore purchases." };

    const origin = cfg.origin;
    const body = checkoutParams(product, context.userId, origin);
    let res: Response;
    try {
      res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: stripeHeaders(cfg.key, `${context.userId}-${product.id}-${Math.floor(Date.now() / 60000)}`),
        body,
      });
    } catch {
      console.error("[checkout] could not reach Stripe");
      return { ok: false as const, error: "Checkout could not be started — couldn't reach the payment service. Try again in a minute." };
    }
    const session = (await res.json().catch(() => null)) as { id?: string; url?: string; livemode?: boolean } | null;
    if (!res.ok || !session?.id || !session.url) {
      // Stripe's reason (key-like text masked) so the owner can fix the account or key setting; never the key itself.
      const reason = stripeErrorSummary(session, res.status);
      console.error(`[checkout] Stripe refused the checkout session (${res.status}): ${reason}`);
      return { ok: false as const, error: `Checkout could not be started — Stripe says: ${reason}` };
    }
    if (Boolean(session.livemode) !== (PAYMENT_MODE === "live")) return { ok: false as const, error: "Checkout could not be started — the payment key is in the wrong mode." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const want = { id: session.id, user_id: context.userId, product_id: product.id, amount: product.priceCents, currency: product.currency };
    const { error } = await supabaseAdmin.from("checkout_sessions").insert(want);
    if (error) {
      // Retried within the idempotency window -> Stripe returned the same session; reuse it only if it matches.
      if (error.code !== "23505") return { ok: false as const, error: "Checkout could not be recorded" };
      const { data: existing, error: readErr } = await supabaseAdmin.from("checkout_sessions").select("id, user_id, product_id, amount, currency").eq("id", session.id).maybeSingle();
      if (readErr || reconcileSession(existing, want) !== "reuse") return { ok: false as const, error: "Checkout could not be recorded" };
    }
    return { ok: true as const, url: session.url };
  });
