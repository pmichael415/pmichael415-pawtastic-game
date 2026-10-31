-- Team Hawthorne vs Team Hillsdale weekly totals (New York weeks, Monday start). Each device counts at most
-- 60 points per day per team, and only events of 1–10 points count. Returns totals only.
CREATE INDEX IF NOT EXISTS game_events_team_points_time ON public.game_events (received_at) WHERE name = 'team_points';

CREATE OR REPLACE FUNCTION public.team_standings(_weeks_ago int DEFAULT 0)
RETURNS TABLE (team text, points int, players int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT date_trunc('week', now() AT TIME ZONE 'America/New_York') - make_interval(weeks => GREATEST(0, LEAST(COALESCE(_weeks_ago, 0), 52))) AS start_local
  ), daily AS (
    SELECT e.props->>'team' AS team, e.device_id,
           (e.received_at AT TIME ZONE 'America/New_York')::date AS day,
           sum((e.props->>'points')::int) AS pts
    FROM public.game_events e CROSS JOIN bounds b
    WHERE e.name = 'team_points'
      AND e.props->>'team' IN ('hawthorne', 'hillsdale')
      AND (e.props->>'points') ~ '^[0-9]{1,2}$'
      AND (e.props->>'points')::int BETWEEN 1 AND 10
      AND (e.received_at AT TIME ZONE 'America/New_York') >= b.start_local
      AND (e.received_at AT TIME ZONE 'America/New_York') < b.start_local + interval '7 days'
    GROUP BY 1, 2, 3
  )
  -- LEAST() ignores NULLs, so a team with no rows must be zeroed before capping.
  SELECT t.team, COALESCE(sum(LEAST(COALESCE(d.pts, 0), 60)), 0)::int, count(DISTINCT d.device_id)::int
  FROM (VALUES ('hawthorne'), ('hillsdale')) AS t(team)
  LEFT JOIN daily d ON d.team = t.team
  GROUP BY t.team
  ORDER BY t.team
$$;
REVOKE ALL ON FUNCTION public.team_standings(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.team_standings(int) TO service_role;
