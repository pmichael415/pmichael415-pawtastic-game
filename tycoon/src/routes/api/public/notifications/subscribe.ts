import { createFileRoute } from "@tanstack/react-router";
import { handleSubscribe } from "@/lib/notify/api.server";
import type { NotifyRpc } from "@/lib/notify/sender.server";

// Saves a browser's push subscription after the player tapped "Notify me". Linked to the account when signed in.
export const Route = createFileRoute("/api/public/notifications/subscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          let userId: string | null = null;
          const token = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
          if (token) {
            const { data } = await supabaseAdmin.auth.getUser(token);
            userId = data.user?.id ?? null; // an invalid token is treated as signed out
          }
          return await handleSubscribe(raw, supabaseAdmin as unknown as NotifyRpc, userId);
        } catch {
          return Response.json({ error: "unavailable" }, { status: 503 });
        }
      },
    },
  },
});
