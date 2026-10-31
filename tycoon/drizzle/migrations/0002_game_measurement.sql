-- Anonymous gameplay measurement (written only by the server route /api/public/events with the service role).
-- No names, emails, contacts or locations: a random device id, a cohort day (first-seen New York date) and a build id.
-- A booking-link click is only a click. Confirmed bookings and service revenue need a separate, reviewed integration.
CREATE TABLE IF NOT EXISTS public.game_events (
  id bigserial PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now(),
  client_at timestamptz NOT NULL,
  device_id text NOT NULL CHECK (char_length(device_id) BETWEEN 8 AND 64),
  cohort_day date NOT NULL,
  session_id text NOT NULL CHECK (char_length(session_id) BETWEEN 8 AND 64),
  build text NOT NULL CHECK (char_length(build) <= 40),
  name text NOT NULL CHECK (name IN ('session_start','tutorial_step','tutorial_complete','checkin_success','first_care_cycle','camera_mode','client_error','shop_preview','checkout_start','restore_result','booking_click','recess_run','share','hub_open','referral_open','team_pick','team_points')),
  props jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(props) < 4096)
);
CREATE INDEX IF NOT EXISTS game_events_name_time ON public.game_events (name, received_at);
CREATE INDEX IF NOT EXISTS game_events_device_time ON public.game_events (device_id, received_at);
ALTER TABLE public.game_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.game_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.game_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.game_events_id_seq TO service_role;

-- Daily funnel per build (New York days).
CREATE OR REPLACE VIEW public.game_daily_funnel WITH (security_invoker = true) AS
SELECT (received_at AT TIME ZONE 'America/New_York')::date AS day,
       build,
       count(DISTINCT device_id) FILTER (WHERE name = 'session_start') AS players,
       count(DISTINCT device_id) FILTER (WHERE name = 'session_start' AND props->>'first_visit' = 'true') AS first_time_players,
       count(DISTINCT device_id) FILTER (WHERE name = 'checkin_success') AS players_who_checked_in,
       count(DISTINCT device_id) FILTER (WHERE name = 'first_care_cycle') AS players_first_care_cycle,
       count(DISTINCT device_id) FILTER (WHERE name = 'tutorial_complete') AS players_completed_tutorial,
       count(*) FILTER (WHERE name = 'camera_mode' AND props->>'mode' = 'walk') AS camera_walk_picks,
       count(*) FILTER (WHERE name = 'camera_mode' AND props->>'mode' = 'overhead') AS camera_overhead_picks,
       count(*) FILTER (WHERE name = 'camera_mode' AND props->>'mode' = 'list') AS camera_list_picks,
       count(*) FILTER (WHERE name = 'shop_preview') AS shop_previews,
       count(*) FILTER (WHERE name = 'restore_result' AND props->>'ok' = 'false') AS restore_failures,
       count(*) FILTER (WHERE name = 'booking_click' AND props->>'location' = 'hawthorne') AS booking_link_clicks_hawthorne,
       count(*) FILTER (WHERE name = 'booking_click' AND props->>'location' = 'hillsdale') AS booking_link_clicks_hillsdale,
       count(*) FILTER (WHERE name = 'client_error') AS client_errors,
       count(*) FILTER (WHERE name = 'client_error' AND props->>'mobile' = 'true') AS mobile_client_errors,
       count(*) FILTER (WHERE name = 'share' AND props->>'kind' = 'invite') AS invite_shares,
       count(*) FILTER (WHERE name = 'share' AND props->>'kind' = 'recommend') AS pawtastic_recommend_shares,
       count(*) FILTER (WHERE name = 'referral_open') AS referral_link_opens,
       count(DISTINCT device_id) FILTER (WHERE name = 'session_start' AND props->>'first_visit' = 'true' AND props ? 'ref') AS first_time_players_from_referrals,
       count(*) FILTER (WHERE name = 'booking_click' AND props ? 'ref') AS booking_link_clicks_by_referred_players,
       count(DISTINCT device_id) FILTER (WHERE name = 'team_pick' AND props->>'team' = 'hawthorne') AS players_picked_team_hawthorne,
       count(DISTINCT device_id) FILTER (WHERE name = 'team_pick' AND props->>'team' = 'hillsdale') AS players_picked_team_hillsdale
FROM public.game_events
GROUP BY 1, 2;

-- Return rates by cohort (first-seen day) and the build a player first saw.
CREATE OR REPLACE VIEW public.game_retention WITH (security_invoker = true) AS
WITH active AS (
  SELECT DISTINCT device_id, cohort_day, (received_at AT TIME ZONE 'America/New_York')::date AS day
  FROM public.game_events WHERE name = 'session_start'
), first_build AS (
  SELECT DISTINCT ON (device_id) device_id, build
  FROM public.game_events WHERE name = 'session_start' ORDER BY device_id, received_at
)
SELECT a.cohort_day,
       f.build AS first_build,
       count(DISTINCT a.device_id) AS players,
       count(DISTINCT a.device_id) FILTER (WHERE a.day = a.cohort_day + 1) AS returned_next_day,
       count(DISTINCT a.device_id) FILTER (WHERE a.day BETWEEN a.cohort_day + 1 AND a.cohort_day + 7) AS returned_within_7_days,
       count(DISTINCT a.device_id) FILTER (WHERE a.day BETWEEN a.cohort_day + 8 AND a.cohort_day + 30) AS returned_days_8_to_30
FROM active a JOIN first_build f USING (device_id)
GROUP BY 1, 2;

REVOKE ALL ON public.game_daily_funnel, public.game_retention FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.game_daily_funnel, public.game_retention TO service_role;
