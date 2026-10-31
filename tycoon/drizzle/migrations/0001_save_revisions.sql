ALTER TABLE public.player_saves ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1;

-- Conditional cloud save: succeeds only if the caller's expected revision matches (0 = first save).
-- Runs as the caller, so RLS owner isolation still applies.
CREATE OR REPLACE FUNCTION public.save_player_progress(_data jsonb, _expected_revision bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  new_rev bigint;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF _expected_revision = 0 THEN
    INSERT INTO public.player_saves(user_id, data, save_version, revision, updated_at)
    VALUES (uid, _data, COALESCE((_data->>'v')::int, 0), 1, now())
    ON CONFLICT (user_id) DO NOTHING
    RETURNING revision INTO new_rev;
  ELSE
    UPDATE public.player_saves
      SET data = _data, save_version = COALESCE((_data->>'v')::int, 0), revision = revision + 1, updated_at = now()
      WHERE user_id = uid AND revision = _expected_revision
      RETURNING revision INTO new_rev;
  END IF;
  IF new_rev IS NULL THEN RAISE EXCEPTION 'save conflict' USING ERRCODE = 'P0409'; END IF;
  RETURN new_rev;
END;
$$;
REVOKE ALL ON FUNCTION public.save_player_progress(jsonb, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_player_progress(jsonb, bigint) TO authenticated;