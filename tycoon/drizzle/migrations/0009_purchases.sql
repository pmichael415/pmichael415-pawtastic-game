-- In-game purchases, phase 1 (docs/superpowers/specs/2026-11-02-in-game-purchases-design.md).
-- Every payment row carries its mode; production reads only 'live' (rows from before go-live were test purchases).
-- Consumables become `deliveries`, reserved for one account and one installation before a game adds them to its
-- save, confirmed afterwards; refunds void them, or reverse them on the installation that holds them.

-- ---------- payment mode ----------
ALTER TABLE public.checkout_sessions ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'live';
ALTER TABLE public.checkout_sessions ADD CONSTRAINT checkout_sessions_mode_check CHECK (mode IN ('test','live'));
UPDATE public.checkout_sessions SET mode = 'test' WHERE id NOT LIKE 'cs\_live\_%';

ALTER TABLE public.entitlements ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'live';
ALTER TABLE public.entitlements ADD CONSTRAINT entitlements_mode_check CHECK (mode IN ('test','live'));
UPDATE public.entitlements SET mode = 'test' WHERE checkout_session_id NOT LIKE 'cs\_live\_%';
ALTER TABLE public.entitlements DROP CONSTRAINT IF EXISTS entitlements_user_id_product_id_key;
ALTER TABLE public.entitlements ADD CONSTRAINT entitlements_user_product_mode_key UNIQUE (user_id, product_id, mode);

-- ---------- products (src/lib/catalog.ts) ----------
ALTER TABLE public.checkout_sessions DROP CONSTRAINT IF EXISTS checkout_sessions_product_id_check;
ALTER TABLE public.checkout_sessions ADD CONSTRAINT checkout_sessions_product_id_check CHECK (product_id IN (
  'coins-2500','coins-8000','coins-20000','coins-50000','coins-150000',
  'shield-starts-5','extra-lives-5','power-pack','runner-looks','blue-ribbon-style','deluxe-daycare-decor'));
ALTER TABLE public.entitlements DROP CONSTRAINT IF EXISTS entitlements_product_id_check;
ALTER TABLE public.entitlements ADD CONSTRAINT entitlements_product_id_check CHECK (product_id IN (
  'runner-looks','blue-ribbon-style','deluxe-daycare-decor'));

-- ---------- deliveries ----------
CREATE TABLE public.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL CHECK (mode IN ('test','live')),
  user_id uuid NOT NULL,
  game text NOT NULL CHECK (game IN ('daycare-next','recess')),
  source text NOT NULL CHECK (source IN ('purchase','reversal')),
  source_ref text NOT NULL,
  contents jsonb NOT NULL CHECK (jsonb_typeof(contents) = 'object'),
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','reserved','delivered','void')),
  reserved_by uuid,
  reserved_at timestamptz,
  delivered_at timestamptz,
  reverses uuid REFERENCES public.deliveries(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_ref)
);
CREATE INDEX deliveries_owner_idx ON public.deliveries (mode, user_id, game, status);
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.deliveries TO service_role;

-- ---------- grant (verified webhook only) ----------
-- Same checks as before plus the mode. Permanent purchases become entitlements, consumables a ready delivery.
CREATE OR REPLACE FUNCTION public.grant_purchase(_event_id text, _session_id text, _user_id uuid, _product_id text, _amount int, _currency text, _payment_intent text, _mode text, _entitle boolean, _game text, _contents jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sess public.checkout_sessions%ROWTYPE;
BEGIN
  IF _mode IS NULL OR _mode NOT IN ('test','live') THEN RAISE EXCEPTION 'invalid mode'; END IF;
  INSERT INTO public.payment_events(event_id, type, result) VALUES (_event_id, 'grant', 'granted')
  ON CONFLICT (event_id) DO NOTHING;
  IF NOT FOUND THEN RETURN 'duplicate'; END IF;

  SELECT * INTO sess FROM public.checkout_sessions WHERE id = _session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown session'; END IF;
  IF sess.user_id <> _user_id OR sess.product_id <> _product_id OR sess.amount <> _amount
     OR lower(sess.currency) <> lower(_currency) OR sess.mode <> _mode THEN
    RAISE EXCEPTION 'session mismatch';
  END IF;
  IF sess.status = 'refunded' THEN RAISE EXCEPTION 'session refunded'; END IF;

  UPDATE public.checkout_sessions SET status = 'paid', payment_intent = COALESCE(_payment_intent, payment_intent) WHERE id = _session_id;
  IF _entitle THEN
    INSERT INTO public.entitlements(user_id, product_id, source_event_id, checkout_session_id, mode)
    VALUES (_user_id, _product_id, _event_id, _session_id, _mode)
    ON CONFLICT (user_id, product_id, mode) DO UPDATE SET revoked_at = NULL, source_event_id = EXCLUDED.source_event_id, checkout_session_id = EXCLUDED.checkout_session_id
      WHERE public.entitlements.revoked_at IS NOT NULL;
  END IF;
  IF _contents IS NOT NULL THEN
    IF _game IS NULL THEN RAISE EXCEPTION 'delivery without game'; END IF;
    INSERT INTO public.deliveries(mode, user_id, game, source, source_ref, contents)
    VALUES (_mode, _user_id, _game, 'purchase', _session_id, _contents)
    ON CONFLICT (source, source_ref) DO NOTHING;
  END IF;
  RETURN 'granted';
END;
$$;

-- ---------- reserve: every ready delivery of this account and game goes to this installation ----------
-- Returns everything reserved for this installation and not yet confirmed (the retry path). Rows reserved by
-- another installation are never returned or taken over.
CREATE OR REPLACE FUNCTION public.reserve_deliveries(_user_id uuid, _installation uuid, _game text, _mode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _mode IS NULL OR _mode NOT IN ('test','live') OR _installation IS NULL OR _user_id IS NULL THEN RAISE EXCEPTION 'invalid request'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hub-delivery:' || _mode || ':' || _user_id::text, 0));
  UPDATE public.deliveries SET status = 'reserved', reserved_by = _installation, reserved_at = now()
   WHERE mode = _mode AND user_id = _user_id AND game = _game AND status = 'ready';
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', id, 'contents', contents, 'reverses', reverses) ORDER BY created_at, id)
      FROM public.deliveries
     WHERE mode = _mode AND user_id = _user_id AND game = _game AND status = 'reserved' AND reserved_by = _installation
  ), '[]'::jsonb);
END;
$$;

-- ---------- confirm: only the installation that holds a delivery can confirm it ----------
CREATE OR REPLACE FUNCTION public.ack_deliveries(_user_id uuid, _installation uuid, _ids uuid[], _mode text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  UPDATE public.deliveries SET status = 'delivered', delivered_at = now()
   WHERE mode = _mode AND user_id = _user_id AND status = 'reserved' AND reserved_by = _installation AND id = ANY(_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ---------- refund (full): switch off looks; void or reverse consumables ----------
CREATE OR REPLACE FUNCTION public.refund_purchase(_event_id text, _payment_intent text, _mode text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sess public.checkout_sessions%ROWTYPE;
  d public.deliveries%ROWTYPE;
BEGIN
  INSERT INTO public.payment_events(event_id, type, result) VALUES (_event_id, 'refund', 'revoked')
  ON CONFLICT (event_id) DO NOTHING;
  IF NOT FOUND THEN RETURN 'duplicate'; END IF;
  SELECT * INTO sess FROM public.checkout_sessions WHERE payment_intent = _payment_intent AND mode = _mode FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE public.payment_events SET result = 'unknown_payment' WHERE event_id = _event_id;
    RETURN 'unknown';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hub-delivery:' || _mode || ':' || sess.user_id::text, 0));
  UPDATE public.checkout_sessions SET status = 'refunded' WHERE id = sess.id;
  UPDATE public.entitlements SET revoked_at = now() WHERE checkout_session_id = sess.id AND mode = _mode AND revoked_at IS NULL;
  SELECT * INTO d FROM public.deliveries WHERE source = 'purchase' AND source_ref = sess.id AND mode = _mode FOR UPDATE;
  IF FOUND THEN
    IF d.status = 'ready' THEN
      UPDATE public.deliveries SET status = 'void' WHERE id = d.id;
    ELSIF d.status IN ('reserved', 'delivered') THEN
      INSERT INTO public.deliveries(mode, user_id, game, source, source_ref, contents, status, reserved_by, reserved_at, reverses)
      VALUES (_mode, d.user_id, d.game, 'reversal', d.id::text,
              (SELECT jsonb_object_agg(k, -((v #>> '{}')::numeric)) FROM jsonb_each(d.contents) AS e(k, v)),
              'reserved', d.reserved_by, now(), d.id)
      ON CONFLICT (source, source_ref) DO NOTHING;
    END IF;
  END IF;
  RETURN 'revoked';
END;
$$;

-- ---------- older callers: same signatures, mode taken from the checkout row ----------
CREATE OR REPLACE FUNCTION public.grant_entitlement(_event_id text, _session_id text, _user_id uuid, _product_id text, _amount int, _currency text, _payment_intent text DEFAULT NULL)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.grant_purchase(_event_id, _session_id, _user_id, _product_id, _amount, _currency, _payment_intent,
    coalesce((SELECT mode FROM public.checkout_sessions WHERE id = _session_id), 'live'), true, NULL, NULL);
$$;
CREATE OR REPLACE FUNCTION public.revoke_entitlement_for_refund(_event_id text, _payment_intent text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.refund_purchase(_event_id, _payment_intent,
    coalesce((SELECT mode FROM public.checkout_sessions WHERE payment_intent = _payment_intent LIMIT 1), 'live'));
$$;

REVOKE ALL ON FUNCTION public.grant_purchase(text, text, uuid, text, int, text, text, text, boolean, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_purchase(text, text, uuid, text, int, text, text, text, boolean, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.reserve_deliveries(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_deliveries(uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.ack_deliveries(uuid, uuid, uuid[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ack_deliveries(uuid, uuid, uuid[], text) TO service_role;
REVOKE ALL ON FUNCTION public.refund_purchase(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_purchase(text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.grant_entitlement(text, text, uuid, text, int, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_entitlement(text, text, uuid, text, int, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.revoke_entitlement_for_refund(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_entitlement_for_refund(text, text) TO service_role;

-- ---------- measurement: purchases by day, per mode ----------
DROP VIEW IF EXISTS public.game_purchases_daily;
CREATE VIEW public.game_purchases_daily WITH (security_invoker = true) AS
SELECT (created_at AT TIME ZONE 'America/New_York')::date AS day, mode, product_id,
       count(*) FILTER (WHERE status IN ('paid','refunded')) AS verified_purchases,
       count(*) FILTER (WHERE status = 'refunded') AS refunds,
       count(*) FILTER (WHERE status IN ('failed','expired')) AS failed_or_expired,
       sum(amount) FILTER (WHERE status = 'paid') AS net_cents
FROM public.checkout_sessions GROUP BY 1, 2, 3;
REVOKE ALL ON public.game_purchases_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.game_purchases_daily TO service_role;
