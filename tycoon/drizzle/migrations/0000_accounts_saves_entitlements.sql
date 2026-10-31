CREATE TABLE public.player_saves (
  user_id uuid PRIMARY KEY,
  data jsonb NOT NULL,
  save_version int NOT NULL DEFAULT 3,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_saves TO authenticated;
GRANT ALL ON public.player_saves TO service_role;
ALTER TABLE public.player_saves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own save select" ON public.player_saves FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own save insert" ON public.player_saves FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own save update" ON public.player_saves FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own save delete" ON public.player_saves FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.checkout_sessions (
  id text PRIMARY KEY,
  user_id uuid NOT NULL,
  product_id text NOT NULL CHECK (product_id IN ('blue-ribbon-style','deluxe-daycare-decor')),
  amount int NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.checkout_sessions TO authenticated;
GRANT ALL ON public.checkout_sessions TO service_role;
ALTER TABLE public.checkout_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sessions select" ON public.checkout_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.payment_events (
  event_id text PRIMARY KEY,
  type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.payment_events TO service_role;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id text NOT NULL CHECK (product_id IN ('blue-ribbon-style','deluxe-daycare-decor')),
  source_event_id text NOT NULL UNIQUE,
  checkout_session_id text NOT NULL UNIQUE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);
GRANT SELECT ON public.entitlements TO authenticated;
GRANT ALL ON public.entitlements TO service_role;
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own entitlements select" ON public.entitlements FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Atomic, idempotent grant used only by the verified webhook (service role).
CREATE OR REPLACE FUNCTION public.grant_entitlement(_event_id text, _session_id text, _user_id uuid, _product_id text, _amount int, _currency text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sess public.checkout_sessions%ROWTYPE;
BEGIN
  INSERT INTO public.payment_events(event_id, type) VALUES (_event_id, 'checkout.session.completed')
  ON CONFLICT (event_id) DO NOTHING;
  IF NOT FOUND THEN RETURN 'duplicate'; END IF;

  SELECT * INTO sess FROM public.checkout_sessions WHERE id = _session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown session'; END IF;
  IF sess.user_id <> _user_id OR sess.product_id <> _product_id OR sess.amount <> _amount OR lower(sess.currency) <> lower(_currency) THEN
    RAISE EXCEPTION 'session mismatch';
  END IF;

  UPDATE public.checkout_sessions SET status = 'paid' WHERE id = _session_id;
  INSERT INTO public.entitlements(user_id, product_id, source_event_id, checkout_session_id)
  VALUES (_user_id, _product_id, _event_id, _session_id)
  ON CONFLICT (user_id, product_id) DO NOTHING;
  RETURN 'granted';
END;
$$;
REVOKE ALL ON FUNCTION public.grant_entitlement(text, text, uuid, text, int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_entitlement(text, text, uuid, text, int, text) TO service_role;