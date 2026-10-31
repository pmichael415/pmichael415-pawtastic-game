import { createFileRoute } from "@tanstack/react-router";
import { isRefCode } from "@/lib/referral";

// How many friends joined through an invite code, and how many finished the first-day tutorial.
// Counts only; codes are random 8-character strings, so they can't be enumerated.
export const Route = createFileRoute("/api/public/referrals")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const device = (url.searchParams.get("device") ?? "").slice(0, 64);
        if (!isRefCode(code)) return Response.json({ error: "bad code" }, { status: 400 });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.rpc(
            "referral_stats" as never,
            { _code: code, _exclude_device: device } as never,
          );
          if (error) throw error;
          const row = (Array.isArray(data) ? data[0] : data) as {
            joined?: number;
            completed?: number;
          } | null;
          return Response.json(
            { joined: Number(row?.joined ?? 0), completed: Number(row?.completed ?? 0) },
            { headers: { "cache-control": "no-store" } },
          );
        } catch {
          return Response.json({ unavailable: true }, { status: 503 });
        }
      },
    },
  },
});
