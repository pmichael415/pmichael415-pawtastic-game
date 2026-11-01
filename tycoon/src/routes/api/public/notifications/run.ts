import { createFileRoute } from "@tanstack/react-router";
import { handleRun } from "@/lib/notify/api.server";
import { emailUpdatesEnabled } from "@/lib/notify/email";
import { getEmailTransport } from "@/lib/notify/email-transport.server";
import type { NotifyRpc } from "@/lib/notify/sender.server";
import { PUBLIC_ORIGIN } from "@/lib/site";

// Called every 15 minutes by the database scheduler with the run secret. Sends only owner-approved, due messages.
export const Route = createFileRoute("/api/public/notifications/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const env = { NOTIFY_EMAIL_ENABLED: process.env["NOTIFY_EMAIL_ENABLED"], NOTIFY_MAILING_ADDRESS: process.env["NOTIFY_MAILING_ADDRESS"] };
          const transport = getEmailTransport();
          const email =
            transport && emailUpdatesEnabled(env, transport)
              ? { transport, mailingAddress: env.NOTIFY_MAILING_ADDRESS!.trim(), origin: process.env["APP_ORIGIN"]?.replace(/\/$/, "") || PUBLIC_ORIGIN }
              : null;
          // Outgoing-request budget per run (the scheduler call itself and the key check use 2).
          const limit = Number(process.env["NOTIFY_MAX_SUBREQUESTS"]);
          const maxRequests = Number.isFinite(limit) && limit > 25 ? limit - 2 : undefined;
          return await handleRun(request, supabaseAdmin as unknown as NotifyRpc, Date.now(), email, maxRequests);
        } catch {
          return Response.json({ error: "unavailable" }, { status: 503 });
        }
      },
    },
  },
});
