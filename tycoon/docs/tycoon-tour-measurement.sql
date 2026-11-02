-- The new Daycare's first 15 minutes, from real players (spec docs/superpowers/specs/2026-11-02-tycoon-replayability-design.md §3.8).
-- Read-only. Rows are anonymous device ids; no names, emails or locations. Stage A's events carry
-- build = '2026-11-02.tycoon-stage-a' (src/lib/analytics.ts BUILD_ID). Owner and tester devices are included: with
-- small numbers, treat these as anecdotes, not rates. A booking click is never a booking.

-- 1. How players start: Quick start or Build from scratch, and with which controls (3D, the 2D map, the list).
select props->>'mode' as mode, props->>'controls' as controls, count(distinct device_id) as devices
from public.game_events
where name = 'tycoon_guide' and props->>'beat' = 'start' and build = '2026-11-02.tycoon-stage-a'
group by 1, 2 order by 3 desc;

-- 2. The funnel: how many devices reached each beat (checkout reached = first pup checked in and placed;
--    upgrade reached = first payout collected; benefit reached = first upgrade placed; upgrade_passed = "Not now"
--    at the upgrade (short of coins); goals = tour complete).
select props->>'beat' as beat, count(distinct device_id) as devices
from public.game_events
where name = 'tycoon_guide' and build = '2026-11-02.tycoon-stage-a'
  and props->>'beat' in ('start','checkin','place','play','checkout','upgrade','upgrade_passed','benefit','decision','goals','skipped')
group by 1
order by array_position(array['start','checkin','place','play','checkout','upgrade','upgrade_passed','benefit','decision','goals','skipped'], props->>'beat');

-- 3. Time to the first payout ('upgrade' reached) and to the first upgrade placed ('benefit' reached), in seconds since
--    the tour started (median and 90th percentile, per mode). Targets: payout by 2 minutes, upgrade by 5.
select props->>'mode' as mode, props->>'beat' as beat, count(*) as players,
       percentile_cont(0.5) within group (order by (props->>'sec')::numeric) as median_sec,
       percentile_cont(0.9) within group (order by (props->>'sec')::numeric) as p90_sec
from public.game_events
where name = 'tycoon_guide' and build = '2026-11-02.tycoon-stage-a' and props->>'beat' in ('upgrade','benefit','goals')
group by 1, 2 order by 1, 2;

-- 4. Where people skip the guide.
select props->>'at' as skipped_at, count(distinct device_id) as devices
from public.game_events
where name = 'tycoon_guide' and props->>'beat' = 'skipped' and build = '2026-11-02.tycoon-stage-a'
group by 1 order by 2 desc;

-- 5. Drop-off: devices that started but never reached the next beat, by the last beat they reached.
with last as (
  select device_id,
         max(array_position(array['start','checkin','place','play','checkout','upgrade','benefit','decision','goals'], props->>'beat')) as i
  from public.game_events
  where name = 'tycoon_guide' and build = '2026-11-02.tycoon-stage-a' and props ? 'beat'
  group by device_id
)
select (array['start','checkin','place','play','checkout','upgrade','benefit','decision','goals'])[i] as last_beat, count(*) as devices
from last where i is not null group by 1, i order by i;

-- 6. Return visits: opening the new Daycare on a later New York day, with the days away and how far the tour got.
select props->>'days' as days_away, props->>'tour' as tour_state, count(distinct device_id) as devices
from public.game_events
where name = 'tycoon_guide' and props->>'beat' = 'return' and build = '2026-11-02.tycoon-stage-a'
group by 1, 2 order by (props->>'days')::int, 2;
