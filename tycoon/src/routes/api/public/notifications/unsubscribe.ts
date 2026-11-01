import { createFileRoute } from "@tanstack/react-router";
import { handleUnsubscribe } from "@/lib/notify/api.server";
import type { NotifyRpc } from "@/lib/notify/sender.server";

// Turns a browser's notifications off (Settings switch).
export const Route = createFileRoute("/api/public/notifications/unsubscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          return await handleUnsubscribe(raw, supabaseAdmin as unknown as NotifyRpc);
        } catch {
          return Response.json({ error: "unavailable" }, { status: 503 });
        }
      },
    },
  },
});
