import { createFileRoute } from "@tanstack/react-router";
import { handleEmailUnsubscribe } from "@/lib/notify/api.server";
import type { NotifyRpc } from "@/lib/notify/sender.server";

// The unsubscribe button posts here (never a plain page load, which email scanners trigger).
export const Route = createFileRoute("/api/public/notifications/email-unsubscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          return await handleEmailUnsubscribe(raw, supabaseAdmin as unknown as NotifyRpc);
        } catch {
          return Response.json({ error: "unavailable" }, { status: 503 });
        }
      },
    },
  },
});
