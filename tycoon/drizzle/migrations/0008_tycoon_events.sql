-- Daycare Tycoon (new engine, preview): allow its balancing, progress and weekly-challenge events in game_events,
-- and clicks on the hub's Graduation Day Weekly Challenge card.
-- Same list as 0007 plus the tycoon_* names. Apply before publishing a build that sends them.
ALTER TABLE public.game_events DROP CONSTRAINT IF EXISTS game_events_name_check;
ALTER TABLE public.game_events ADD CONSTRAINT game_events_name_check CHECK (name IN (
  'session_start', 'tutorial_step', 'tutorial_complete', 'checkin_success', 'first_care_cycle', 'camera_mode', 'client_error',
  'shop_preview', 'checkout_start', 'restore_result', 'booking_click', 'recess_run', 'share', 'hub_open', 'referral_open',
  'team_pick', 'team_points', 'app_click', 'directions_click', 'notify_prompt', 'notify_optin', 'notify_open', 'email_optin',
  'tycoon_build', 'tycoon_land', 'tycoon_level', 'tycoon_guide', 'tycoon_open', 'tycoon_price', 'tycoon_marketing',
  'tycoon_day', 'tycoon_trophy', 'tycoon_weekly', 'graduation_weekly_open'));
