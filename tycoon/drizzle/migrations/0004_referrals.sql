-- Referral counts for one invite code: devices whose FIRST session came through that code's link, and how
-- many of them finished the first-day tutorial. The inviter's own device is never counted. Returns counts only.
CREATE INDEX IF NOT EXISTS game_events_session_ref ON public.game_events ((props->>'ref')) WHERE name = 'session_start';

CREATE OR REPLACE FUNCTION public.referral_stats(_code text, _exclude_device text)
RETURNS TABLE (joined int, completed int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH friends AS (
    SELECT DISTINCT device_id FROM public.game_events
    WHERE name = 'session_start' AND props->>'ref' = _code AND props->>'first_visit' = 'true'
      AND device_id <> COALESCE(_exclude_device, '')
  )
  SELECT (SELECT count(*) FROM friends)::int,
         (SELECT count(DISTINCT e.device_id) FROM public.game_events e JOIN friends f USING (device_id) WHERE e.name = 'tutorial_complete')::int
$$;
REVOKE ALL ON FUNCTION public.referral_stats(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.referral_stats(text, text) TO service_role;
