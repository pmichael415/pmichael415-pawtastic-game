import { createFileRoute } from "@tanstack/react-router";

// The unsubscribe button posts here. Always answers 200 so it never reveals whether a token exists.
export const Route = createFileRoute("/api/public/notifications/email-unsubscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = (await request.text()).slice(0, 512);
        try {
          const token = (JSON.parse(raw) as { token?: unknown }).token;
          if (typeof token === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin.rpc("notify_email_unsubscribe", { _token: token });
          }
        } catch {
          /* answer the same either way */
        }
        return Response.json({ ok: true });
      },
    },
  },
});
