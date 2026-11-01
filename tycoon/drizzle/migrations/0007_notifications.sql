-- Notifications (phone + email) for PAWtastic Games. Owner rules enforced here, not only in app code:
-- * nothing is sent unless the owner approved it (approved_at + approved_by before a message can leave draft);
-- * each phone subscription / email address gets a message at most once (delivery rows are claimed before sending);
-- * at most 2 distinct messages per person per New York week (the same message by push and email counts once);
-- * opt-outs stick. Everything here is service-role only: players never read or write these tables directly.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL UNIQUE CHECK (endpoint ~ '^https://' AND char_length(endpoint) <= 1000),
  p256dh text NOT NULL CHECK (char_length(p256dh) BETWEEN 80 AND 100),
  auth text NOT NULL CHECK (char_length(auth) BETWEEN 16 AND 32),
  device_id text NOT NULL CHECK (char_length(device_id) BETWEEN 8 AND 64),
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_success_at timestamptz,
  failure_count int NOT NULL DEFAULT 0,
  disabled_at timestamptz
);
CREATE INDEX IF NOT EXISTS push_subscriptions_device ON public.push_subscriptions (device_id) WHERE disabled_at IS NULL;

CREATE TABLE IF NOT EXISTS public.email_optins (
  user_id uuid PRIMARY KEY,
  email text NOT NULL CHECK (position('@' IN email) > 1 AND char_length(email) <= 254),
  adult_confirmed boolean NOT NULL CHECK (adult_confirmed),
  opted_in_at timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at timestamptz,
  unsub_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid()
);

CREATE TABLE IF NOT EXISTS public.notify_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('weekly', 'announcement', 'test')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 50),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 140),
  path text NOT NULL DEFAULT '/' CHECK (path ~ '^/[a-z0-9/_-]{0,60}$' AND position('//' IN path) = 0),
  channels text[] NOT NULL DEFAULT '{push}' CHECK (cardinality(channels) >= 1 AND channels <@ ARRAY['push', 'email']::text[]),
  email_subject text CHECK (char_length(email_subject) <= 80),
  email_body text CHECK (char_length(email_body) <= 2000),
  audience_user uuid,
  send_at timestamptz NOT NULL,
  approved_at timestamptz,
  approved_by text CHECK (char_length(approved_by) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  sending_started_at timestamptz,
  sent_at timestamptz,
  CHECK (NOT ('email' = ANY (channels)) OR (email_subject IS NOT NULL AND email_body IS NOT NULL)),
  CHECK (status IN ('draft', 'cancelled') OR (approved_at IS NOT NULL AND approved_by IS NOT NULL))
);

-- What the owner approved is what gets sent: once approved, the text, link, audience and time can't change
-- (cancel it and draft a new one). Status changes (sending, sent, cancelled) are still allowed.
CREATE OR REPLACE FUNCTION public.notify_messages_lock_approved()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.approved_at IS NOT NULL AND NEW.approved_at IS NOT DISTINCT FROM OLD.approved_at
     AND (NEW.kind, NEW.title, NEW.body, NEW.path, NEW.channels, NEW.email_subject, NEW.email_body, NEW.audience_user, NEW.send_at, NEW.approved_by)
         IS DISTINCT FROM
         (OLD.kind, OLD.title, OLD.body, OLD.path, OLD.channels, OLD.email_subject, OLD.email_body, OLD.audience_user, OLD.send_at, OLD.approved_by) THEN
    RAISE EXCEPTION 'approved messages can''t be edited: cancel it and draft a new one';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_messages_lock_approved ON public.notify_messages;
CREATE TRIGGER notify_messages_lock_approved BEFORE UPDATE ON public.notify_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_messages_lock_approved();

CREATE TABLE IF NOT EXISTS public.notify_deliveries (
  message_id uuid NOT NULL REFERENCES public.notify_messages (id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('push', 'email')),
  target_id text NOT NULL,
  person text NOT NULL,
  week date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'gone')),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  error text CHECK (char_length(error) <= 200),
  PRIMARY KEY (message_id, channel, target_id)
);
CREATE INDEX IF NOT EXISTS notify_deliveries_person_week ON public.notify_deliveries (person, week);

CREATE TABLE IF NOT EXISTS public.notify_keys (
  id int PRIMARY KEY CHECK (id = 1),
  vapid_public text NOT NULL,
  vapid_private_jwk jsonb NOT NULL,
  run_secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notify_config (
  id int PRIMARY KEY CHECK (id = 1),
  origin text NOT NULL CHECK (origin ~ '^https://[a-z0-9.-]+$')
);
INSERT INTO public.notify_config (id, origin) VALUES (1, 'https://paw-sitive-playhouse-rush.lovable.app') ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['push_subscriptions', 'email_optins', 'notify_messages', 'notify_deliveries', 'notify_keys', 'notify_config'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- New measurement events for notifications.
ALTER TABLE public.game_events DROP CONSTRAINT IF EXISTS game_events_name_check;
ALTER TABLE public.game_events ADD CONSTRAINT game_events_name_check CHECK (name IN (
  'session_start', 'tutorial_step', 'tutorial_complete', 'checkin_success', 'first_care_cycle', 'camera_mode', 'client_error',
  'shop_preview', 'checkout_start', 'restore_result', 'booking_click', 'recess_run', 'share', 'hub_open', 'referral_open',
  'team_pick', 'team_points', 'app_click', 'directions_click', 'notify_prompt', 'notify_optin', 'notify_open', 'email_optin'));

-- Store or refresh a browser's subscription; a device keeps only its 3 newest active subscriptions.
CREATE OR REPLACE FUNCTION public.notify_subscribe(_endpoint text, _p256dh text, _auth text, _device text, _user uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE sid uuid;
BEGIN
  INSERT INTO push_subscriptions (endpoint, p256dh, auth, device_id, user_id)
  VALUES (_endpoint, _p256dh, _auth, _device, _user)
  ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, device_id = EXCLUDED.device_id,
    user_id = EXCLUDED.user_id, disabled_at = NULL, failure_count = 0, created_at = clock_timestamp()
  RETURNING id INTO sid;
  UPDATE push_subscriptions SET disabled_at = now()
  WHERE id IN (SELECT id FROM push_subscriptions WHERE device_id = _device AND disabled_at IS NULL
               ORDER BY created_at DESC, id OFFSET 3);
  RETURN sid;
END $$;

CREATE OR REPLACE FUNCTION public.notify_unsubscribe(_endpoint text)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE push_subscriptions SET disabled_at = coalesce(disabled_at, now()) WHERE endpoint = _endpoint;
  RETURN FOUND;
END $$;

-- The next approved message that is due (or a send that stopped part-way), marked as sending.
CREATE OR REPLACE FUNCTION public.notify_start_next(_now timestamptz)
RETURNS SETOF public.notify_messages LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r notify_messages;
BEGIN
  SELECT * INTO r FROM notify_messages
  WHERE status IN ('scheduled', 'sending') AND approved_at IS NOT NULL AND send_at <= _now
  ORDER BY send_at, created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE notify_messages SET status = 'sending', sending_started_at = coalesce(sending_started_at, _now)
  WHERE id = r.id RETURNING * INTO r;
  RETURN NEXT r;
END $$;

-- Claim up to _limit phone subscriptions for a message: once per subscription, within the weekly cap, audience-limited.
-- Claims are serialized (one at a time across all messages), so overlapping sender runs can't both pass the weekly
-- cap or mistake another run's in-flight claims for "nobody left".
CREATE OR REPLACE FUNCTION public.notify_claim_push(_message uuid, _week date, _limit int)
RETURNS TABLE (subscription_id uuid, endpoint text, p256dh text, auth text) LANGUAGE sql SET search_path = public AS $$
  SELECT pg_advisory_xact_lock(727001);
  WITH m AS (
    SELECT id, audience_user, kind FROM notify_messages WHERE id = _message AND status = 'sending' AND approved_at IS NOT NULL
  ), cand AS (
    SELECT s.id, s.endpoint, s.p256dh, s.auth,
           CASE WHEN s.user_id IS NOT NULL THEN 'u:' || s.user_id ELSE 'd:' || s.device_id END AS person
    FROM push_subscriptions s CROSS JOIN m
    WHERE s.disabled_at IS NULL
      AND (m.audience_user IS NULL OR s.user_id = m.audience_user)
      AND NOT EXISTS (SELECT 1 FROM notify_deliveries d WHERE d.message_id = _message AND d.channel = 'push' AND d.target_id = s.id::text)
      AND (m.kind = 'test' OR (SELECT count(DISTINCT d.message_id) FROM notify_deliveries d JOIN notify_messages x ON x.id = d.message_id AND x.kind <> 'test'
           WHERE d.person = CASE WHEN s.user_id IS NOT NULL THEN 'u:' || s.user_id ELSE 'd:' || s.device_id END
             AND d.week = _week AND d.message_id <> _message AND d.status IN ('pending', 'sent')) < 2)
    ORDER BY s.created_at
    LIMIT greatest(_limit, 0)
  ), ins AS (
    INSERT INTO notify_deliveries (message_id, channel, target_id, person, week)
    SELECT _message, 'push', cand.id::text, cand.person, _week FROM cand
    ON CONFLICT DO NOTHING
    RETURNING target_id
  )
  SELECT cand.id, cand.endpoint, cand.p256dh, cand.auth FROM cand JOIN ins ON ins.target_id = cand.id::text;
$$;

-- The same for email opt-ins (person = the account).
CREATE OR REPLACE FUNCTION public.notify_claim_email(_message uuid, _week date, _limit int)
RETURNS TABLE (user_id uuid, email text, unsub_token uuid) LANGUAGE sql SET search_path = public AS $$
  SELECT pg_advisory_xact_lock(727001);
  WITH m AS (
    SELECT id, audience_user, kind FROM notify_messages
    WHERE id = _message AND status = 'sending' AND approved_at IS NOT NULL AND 'email' = ANY (channels)
  ), cand AS (
    SELECT o.user_id, o.email, o.unsub_token, 'u:' || o.user_id AS person
    FROM email_optins o CROSS JOIN m
    WHERE o.unsubscribed_at IS NULL
      AND (m.audience_user IS NULL OR o.user_id = m.audience_user)
      AND NOT EXISTS (SELECT 1 FROM notify_deliveries d WHERE d.message_id = _message AND d.channel = 'email' AND d.target_id = o.user_id::text)
      AND (m.kind = 'test' OR (SELECT count(DISTINCT d.message_id) FROM notify_deliveries d JOIN notify_messages x ON x.id = d.message_id AND x.kind <> 'test'
           WHERE d.person = 'u:' || o.user_id AND d.week = _week AND d.message_id <> _message AND d.status IN ('pending', 'sent')) < 2)
    ORDER BY o.opted_in_at
    LIMIT greatest(_limit, 0)
  ), ins AS (
    INSERT INTO notify_deliveries (message_id, channel, target_id, person, week)
    SELECT _message, 'email', cand.user_id::text, cand.person, _week FROM cand
    ON CONFLICT DO NOTHING
    RETURNING target_id
  )
  SELECT cand.user_id, cand.email, cand.unsub_token FROM cand JOIN ins ON ins.target_id = cand.user_id::text;
$$;

CREATE OR REPLACE FUNCTION public.notify_mark(_message uuid, _channel text, _target text, _status text, _error text)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF _status NOT IN ('sent', 'failed', 'gone') THEN RAISE EXCEPTION 'bad delivery status %', _status; END IF;
  UPDATE notify_deliveries SET status = _status,
    sent_at = CASE WHEN _status = 'sent' THEN now() ELSE sent_at END,
    error = left(_error, 200)
  WHERE message_id = _message AND channel = _channel AND target_id = _target;
END $$;

CREATE OR REPLACE FUNCTION public.notify_push_result(_subscription uuid, _ok boolean, _gone boolean)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF _ok THEN
    UPDATE push_subscriptions SET last_success_at = now(), failure_count = 0 WHERE id = _subscription;
  ELSIF _gone THEN
    UPDATE push_subscriptions SET disabled_at = coalesce(disabled_at, now()) WHERE id = _subscription;
  ELSE
    UPDATE push_subscriptions SET failure_count = failure_count + 1,
      disabled_at = CASE WHEN failure_count + 1 >= 5 THEN coalesce(disabled_at, now()) ELSE disabled_at END
    WHERE id = _subscription;
  END IF;
END $$;

-- Records a whole slice of send results in one call (fewer requests per run).
-- _results: [{ "target": "<subscription id or user id>", "status": "sent" | "failed" | "gone", "error": null | "..." }]
CREATE OR REPLACE FUNCTION public.notify_record_results(_message uuid, _channel text, _results jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(_results, '[]'::jsonb)) LOOP
    PERFORM notify_mark(_message, _channel, r->>'target', r->>'status', r->>'error');
    IF _channel = 'push' THEN
      PERFORM notify_push_result((r->>'target')::uuid, r->>'status' = 'sent', r->>'status' = 'gone');
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.notify_finish(_message uuid, _now timestamptz)
RETURNS void LANGUAGE sql SET search_path = public AS $$
  UPDATE notify_messages SET status = 'sent', sent_at = _now WHERE id = _message AND status = 'sending';
$$;

CREATE OR REPLACE FUNCTION public.notify_get_keys()
RETURNS TABLE (vapid_public text, vapid_private_jwk jsonb, run_secret text) LANGUAGE sql SET search_path = public AS $$
  SELECT vapid_public, vapid_private_jwk, run_secret FROM notify_keys WHERE id = 1;
$$;

CREATE OR REPLACE FUNCTION public.notify_init_keys(_public text, _private jsonb, _secret text)
RETURNS void LANGUAGE sql SET search_path = public AS $$
  INSERT INTO notify_keys (id, vapid_public, vapid_private_jwk, run_secret) VALUES (1, _public, _private, _secret)
  ON CONFLICT (id) DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION public.notify_set_email_optin(_user uuid, _email text, _on boolean, _adult boolean)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF _on THEN
    IF NOT coalesce(_adult, false) THEN RAISE EXCEPTION 'email updates need the 18+ confirmation'; END IF;
    INSERT INTO email_optins (user_id, email, adult_confirmed) VALUES (_user, _email, true)
    ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, adult_confirmed = true, opted_in_at = now(), unsubscribed_at = NULL;
  ELSE
    UPDATE email_optins SET unsubscribed_at = coalesce(unsubscribed_at, now()) WHERE user_id = _user;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.notify_email_unsubscribe(_token uuid)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE email_optins SET unsubscribed_at = coalesce(unsubscribed_at, now()) WHERE unsub_token = _token;
  RETURN FOUND;
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'notify_subscribe(text, text, text, text, uuid)', 'notify_unsubscribe(text)', 'notify_start_next(timestamptz)',
    'notify_claim_push(uuid, date, int)', 'notify_claim_email(uuid, date, int)', 'notify_mark(uuid, text, text, text, text)',
    'notify_push_result(uuid, boolean, boolean)', 'notify_record_results(uuid, text, jsonb)', 'notify_finish(uuid, timestamptz)',
    'notify_messages_lock_approved()', 'notify_get_keys()',
    'notify_init_keys(text, jsonb, text)', 'notify_set_email_optin(uuid, text, boolean, boolean)', 'notify_email_unsubscribe(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;
