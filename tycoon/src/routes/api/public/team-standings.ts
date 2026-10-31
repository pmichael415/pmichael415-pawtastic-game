import { createFileRoute } from "@tanstack/react-router";

// Team Hawthorne vs Team Hillsdale totals for this week and last week (totals only, no player data).
export const Route = createFileRoute("/api/public/team-standings")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const week = async (ago: number) => {
            const { data, error } = await supabaseAdmin.rpc(
              "team_standings" as never,
              { _weeks_ago: ago } as never,
            );
            if (error) throw error;
            const rows = (data ?? []) as { team: string; points: number; players: number }[];
            const pick = (t: string) => {
              const r = rows.find((x) => x.team === t);
              return { points: Number(r?.points ?? 0), players: Number(r?.players ?? 0) };
            };
            return { hawthorne: pick("hawthorne"), hillsdale: pick("hillsdale") };
          };
          const [thisWeek, lastWeek] = await Promise.all([week(0), week(1)]);
          return Response.json(
            { thisWeek, lastWeek },
            { headers: { "cache-control": "public, max-age=60" } },
          );
        } catch {
          return Response.json({ unavailable: true }, { status: 503 });
        }
      },
    },
  },
});
