import { createFileRoute } from "@tanstack/react-router";
import { handleKey } from "@/lib/notify/api.server";
import type { NotifyRpc } from "@/lib/notify/sender.server";

// The public half of the notification signing key (browsers need it to subscribe). The private half never leaves the server.
export const Route = createFileRoute("/api/public/notifications/key")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          return await handleKey(supabaseAdmin as unknown as NotifyRpc);
        } catch {
          return Response.json({ error: "unavailable" }, { status: 503 });
        }
      },
    },
  },
});
