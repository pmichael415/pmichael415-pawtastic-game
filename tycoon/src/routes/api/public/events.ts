import { createFileRoute } from "@tanstack/react-router";
import { parseEventBatch } from "@/lib/eventsIngest";

// Anonymous gameplay events (see src/lib/analytics.ts). Insert-only via the service role into
// public.game_events; clients can't read or change stored events. Always answers 202 so measurement
// problems never surface to players.
export const Route = createFileRoute("/api/public/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const text = await request.text();
        if (text.length > 32_000) return new Response(null, { status: 413 });
        let body: unknown;
        try { body = JSON.parse(text); } catch { return new Response(null, { status: 400 }); }
        const rows = parseEventBatch(body);
        if (!rows) return new Response(null, { status: 400 });
        if (!rows.length) return new Response(null, { status: 202 });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("game_events" as never).insert(rows as never);
        } catch { /* table not created yet or backend unavailable: drop silently */ }
        return new Response(null, { status: 202 });
      },
    },
  },
});
