// Email updates opt-in for signed-in players. Off until the owner's email gates are done (see email.ts).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { emailOptInDecision, emailUpdatesEnabled } from "./email";
import { getEmailTransport } from "./email-transport.server";

const available = () =>
  emailUpdatesEnabled(
    { NOTIFY_EMAIL_ENABLED: process.env["NOTIFY_EMAIL_ENABLED"], NOTIFY_MAILING_ADDRESS: process.env["NOTIFY_MAILING_ADDRESS"] },
    getEmailTransport(),
  );

/** Public: can players sign up for email updates yet? */
export const emailUpdatesAvailable = createServerFn({ method: "GET" }).handler(async () => ({ available: available() }));

export const getEmailOptIn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = typeof context.claims["email"] === "string" ? (context.claims["email"] as string) : null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("email_optins" as never)
      .select("unsubscribed_at")
      .eq("user_id" as never, context.userId as never)
      .maybeSingle();
    const row = data as { unsubscribed_at: string | null } | null;
    return { available: available(), on: !!row && row.unsubscribed_at === null, email };
  });

export const setEmailOptIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ on: z.boolean(), adult: z.boolean() }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const d = emailOptInDecision(data, { email: context.claims["email"] }, available());
    if (!d.ok) return d;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("notify_set_email_optin", { _user: context.userId, _email: d.email, _on: data.on, _adult: data.adult });
    if (error) return { ok: false as const, error: "Couldn't save — try again." };
    return { ok: true as const };
  });
