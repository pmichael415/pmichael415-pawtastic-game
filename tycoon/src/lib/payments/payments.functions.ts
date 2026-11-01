import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PAID_PRODUCTS } from "@/lib/catalog";
import { accountMatches, checkoutParams, paymentsConfig, reconcileSession, serverPaymentsEnv } from "./verify";

// Cache the "this key belongs to the confirmed game account" check briefly per server instance.
let accountOk: { key: string; account: string; until: number } | null = null;
async function keyMatchesAccount(key: string, account: string): Promise<boolean> {
  if (accountOk && accountOk.key === key && accountOk.account === account && accountOk.until > Date.now()) return true;
  try {
    const res = await fetch("https://api.stripe.com/v1/account", { headers: { Authorization: `Bearer ${key}` } });
    const body = await res.json();
    const ok = res.ok && accountMatches(body, account);
    accountOk = ok ? { key, account, until: Date.now() + 10 * 60_000 } : null;
    return ok;
  } catch {
    return false;
  }
}

/** Public: is test checkout configured? Never reveals secrets. */
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

/** Creates a TEST-mode checkout session. Fails closed when not configured or not test mode. */
export const createCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ productId: z.enum(["blue-ribbon-style", "deluxe-daycare-decor"]) }).parse(input))
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
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `${context.userId}-${product.id}-${Math.floor(Date.now() / 60000)}` },
      body,
    });
    const session = (await res.json()) as { id?: string; url?: string; livemode?: boolean };
    if (!res.ok || !session.id || !session.url || session.livemode) return { ok: false as const, error: "Checkout could not be started" };

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
