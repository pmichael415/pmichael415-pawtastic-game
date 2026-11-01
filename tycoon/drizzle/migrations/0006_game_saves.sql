-- One cloud save per game per player: Daycare Tycoon, Recess Rush and Graduation Day are saved and loaded
-- separately, so loading or keeping one game's progress never touches another's.
-- Free progress only (paid ownership lives in server-written entitlements). Players can read only their own rows;
-- every write goes through save_game_progress, which succeeds only if the caller's device had seen the latest
-- revision of that game's save (0 = first save), so a stale phone can't overwrite newer progress.
CREATE TABLE IF NOT EXISTS public.game_saves (
  user_id uuid NOT NULL,
  game text NOT NULL CHECK (game IN ('daycare', 'recess', 'graduation')),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object' AND octet_length(data::text) <= 100000),
  revision bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game)
);
ALTER TABLE public.game_saves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.game_saves FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.game_saves TO authenticated;
GRANT ALL ON public.game_saves TO service_role;
DROP POLICY IF EXISTS "own game saves select" ON public.game_saves;
CREATE POLICY "own game saves select" ON public.game_saves FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.save_game_progress(_game text, _data jsonb, _expected_revision bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  new_rev bigint;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF _game IS NULL OR _game NOT IN ('daycare', 'recess', 'graduation') THEN RAISE EXCEPTION 'unknown game'; END IF;
  IF _data IS NULL OR jsonb_typeof(_data) <> 'object' OR octet_length(_data::text) > 100000 THEN RAISE EXCEPTION 'invalid save'; END IF;
  IF _expected_revision = 0 THEN
    INSERT INTO public.game_saves(user_id, game, data, revision, updated_at)
    VALUES (uid, _game, _data, 1, now())
    ON CONFLICT (user_id, game) DO NOTHING
    RETURNING revision INTO new_rev;
  ELSE
    UPDATE public.game_saves
      SET data = _data, revision = revision + 1, updated_at = now()
      WHERE user_id = uid AND game = _game AND revision = _expected_revision
      RETURNING revision INTO new_rev;
  END IF;
  IF new_rev IS NULL THEN RAISE EXCEPTION 'save conflict' USING ERRCODE = 'P0409'; END IF;
  RETURN new_rev;
END;
$$;
REVOKE ALL ON FUNCTION public.save_game_progress(text, jsonb, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_game_progress(text, jsonb, bigint) TO authenticated;
