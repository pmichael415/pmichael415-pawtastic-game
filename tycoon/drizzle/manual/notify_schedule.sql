-- Notification scheduler for the hub (apply by hand on the Daycare database AFTER migration 0007 and after the
-- notification routes are published). Every 15 minutes the database asks the hub to send any owner-approved, due
-- message. The hub checks the run secret, quiet hours, the weekly cap and once-only delivery itself.
-- Kept outside drizzle/migrations because pg_cron and pg_net don't exist in the PGlite test database.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('pawtastic-notify') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pawtastic-notify');
SELECT cron.schedule('pawtastic-notify', '*/15 * * * *', $job$
  SELECT net.http_post(
    url := (SELECT origin FROM public.notify_config WHERE id = 1) || '/api/public/notifications/run',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-run', (SELECT run_secret FROM public.notify_keys WHERE id = 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  WHERE EXISTS (SELECT 1 FROM public.notify_keys WHERE id = 1)
$job$);
