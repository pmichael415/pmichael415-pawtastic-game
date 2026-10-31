-- Payments: refunds, failed/expired checkouts, and least-privilege grants.
-- Entitlements are still written only by the signed webhook (service role) through SECURITY DEFINER functions.

ALTER TABLE public.checkout_sessions ADD COLUMN IF NOT EXISTS payment_intent text;
ALTER TABLE public.checkout_sessions DROP CONSTRAINT IF EXISTS checkout_sessions_status_check;
ALTER TABLE public.checkout_sessions ADD CONSTRAINT checkout_sessions_status_check CHECK (status IN ('open','paid','failed','expired','refunded'));
CREATE UNIQUE INDEX IF NOT EXISTS checkout_sessions_payment_intent_key ON public.checkout_sessions (payment_intent) WHERE payment_intent IS NOT NULL;
ALTER TABLE public.entitlements ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE public.payment_events ADD COLUMN IF NOT EXISTS result text;

-- Grant (same checks as before) and remember the payment intent so a later refund can find the purchase.
DROP FUNCTION IF EXISTS public.grant_entitlement(text, text, uuid, text, int, text);
CREATE OR REPLACE FUNCTION public.grant_entitlement(_event_id text, _session_id text, _user_id uuid, _product_id text, _amount int, _currency text, _payment_intent text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sess public.checkout_sessions%ROWTYPE;
BEGIN
  INSERT INTO public.payment_events(event_id, type, result) VALUES (_event_id, 'grant', 'granted')
  ON CONFLICT (event_id) DO NOTHING;
  IF NOT FOUND THEN RETURN 'duplicate'; END IF;

  SELECT * INTO sess FROM public.checkout_sessions WHERE id = _session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown session'; END IF;
  IF sess.user_id <> _user_id OR sess.product_id <> _product_id OR sess.amount <> _amount OR lower(sess.currency) <> lower(_currency) THEN
    RAISE EXCEPTION 'session mismatch';
  END IF;
  IF sess.status = 'refunded' THEN RAISE EXCEPTION 'session refunded'; END IF;

  UPDATE public.checkout_sessions SET status = 'paid', payment_intent = COALESCE(_payment_intent, payment_intent) WHERE id = _session_id;
  INSERT INTO public.entitlements(user_id, product_id, source_event_id, checkout_session_id)
  VALUES (_user_id, _product_id, _event_id, _session_id)
  ON CONFLICT (user_id, product_id) DO UPDATE SET revoked_at = NULL, source_event_id = EXCLUDED.source_event_id, checkout_session_id = EXCLUDED.checkout_session_id
    WHERE public.entitlements.revoked_at IS NOT NULL;
  RETURN 'granted';
END;
$$;
REVOKE ALL ON FUNCTION public.grant_entitlement(text, text, uuid, text, int, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_entitlement(text, text, uuid, text, int, text, text) TO service_role;

-- Full refund of a paid purchase: the cosmetic is switched off (kept for audit). Idempotent per event.
CREATE OR REPLACE FUNCTION public.revoke_entitlement_for_refund(_event_id text, _payment_intent text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sess public.checkout_sessions%ROWTYPE;
BEGIN
  INSERT INTO public.payment_events(event_id, type, result) VALUES (_event_id, 'refund', 'revoked')
  ON CONFLICT (event_id) DO NOTHING;
  IF NOT FOUND THEN RETURN 'duplicate'; END IF;
  SELECT * INTO sess FROM public.checkout_sessions WHERE payment_intent = _payment_intent FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE public.payment_events SET result = 'unknown_payment' WHERE event_id = _event_id;
    RETURN 'unknown';
  END IF;
  UPDATE public.checkout_sessions SET status = 'refunded' WHERE id = sess.id;
  UPDATE public.entitlements SET revoked_at = now() WHERE checkout_session_id = sess.id AND revoked_at IS NULL;
  RETURN 'revoked';
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_entitlement_for_refund(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_entitlement_for_refund(text, text) TO service_role;

-- A checkout that failed (delayed payment declined) or expired: record it; nothing is granted. Idempotent.
CREATE OR REPLACE FUNCTION public.mark_checkout_closed(_event_id text, _session_id text, _status text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _status NOT IN ('failed', 'expired') THEN RAISE EXCEPTION 'bad status'; END IF;
  INSERT INTO public.payment_events(event_id, type, result) VALUES (_event_id, 'close', _status)
  ON CONFLICT (event_id) DO NOTHING;
  IF NOT FOUND THEN RETURN 'duplicate'; END IF;
  UPDATE public.checkout_sessions SET status = _status WHERE id = _session_id AND status = 'open';
  IF NOT FOUND THEN RETURN 'ignored'; END IF; -- already paid/refunded/closed, or unknown: nothing changes
  RETURN _status;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_checkout_closed(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_checkout_closed(text, text, text) TO service_role;

-- Least privilege: players may only read their own purchases; nothing else from the API roles.
REVOKE ALL ON public.payment_events FROM anon, authenticated;
REVOKE ALL ON public.entitlements FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.entitlements FROM authenticated;
REVOKE ALL ON public.checkout_sessions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.checkout_sessions FROM authenticated;
REVOKE ALL ON public.player_saves FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.player_saves FROM authenticated;

-- Restore = active (non-refunded) entitlements only.
DROP POLICY IF EXISTS "own entitlements select" ON public.entitlements;
CREATE POLICY "own entitlements select" ON public.entitlements FOR SELECT TO authenticated USING (auth.uid() = user_id AND revoked_at IS NULL);

-- Verified purchases / refunds by day (service role only).
CREATE OR REPLACE VIEW public.game_purchases_daily WITH (security_invoker = true) AS
SELECT (created_at AT TIME ZONE 'America/New_York')::date AS day, product_id,
       count(*) FILTER (WHERE status IN ('paid','refunded')) AS verified_purchases,
       count(*) FILTER (WHERE status = 'refunded') AS refunds,
       count(*) FILTER (WHERE status IN ('failed','expired')) AS failed_or_expired,
       sum(amount) FILTER (WHERE status = 'paid') AS net_cents_test_mode
FROM public.checkout_sessions GROUP BY 1, 2;
REVOKE ALL ON public.game_purchases_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.game_purchases_daily TO service_role;
