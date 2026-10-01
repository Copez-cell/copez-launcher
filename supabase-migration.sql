-- ============================================================
-- COPEZ Supabase Schema — Run in Supabase SQL Editor
-- Complete + idempotent. Safe to re-run.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. Tables
-- ============================================================

-- 1a. Profiles (mirrors auth.users)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  banner_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 1b. Shared games catalog
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  cover_url TEXT,
  banner_url TEXT,
  logo_url TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE games ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE games ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- 1c. Per-player stats for a catalog game.
--     NOTE: total_hours is a misnomer -- it stores SECONDS.
CREATE TABLE IF NOT EXISTS user_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  total_hours DOUBLE PRECISION DEFAULT 0,
  is_platinum BOOLEAN DEFAULT false,
  average_rating NUMERIC,
  historical_playtime JSONB DEFAULT '{}'::jsonb,
  first_played TIMESTAMPTZ,
  last_played TIMESTAMPTZ,
  date_finished DATE,
  UNIQUE(user_id, game_id)
);

ALTER TABLE user_games ADD COLUMN IF NOT EXISTS average_rating NUMERIC;

-- 1d. Full library snapshot (games + collections as jsonb).
--     One row per player; upserted on every library push.
CREATE TABLE IF NOT EXISTS user_libraries (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  games JSONB DEFAULT '[]'::jsonb,
  collections JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1e. Creator Mode config (never queried directly by the client)
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- ============================================================
-- 2. Row Level Security
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_libraries ENABLE ROW LEVEL SECURITY;

-- app_config is only ever touched by SECURITY DEFINER functions
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- users
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='Profiles readable by all users') THEN
    CREATE POLICY "Profiles readable by all users" ON users FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='Profiles editable only by owner') THEN
    CREATE POLICY "Profiles editable only by owner" ON users FOR ALL USING (id = auth.uid());
  END IF;

  -- games
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='games' AND policyname='Games catalog readable by all') THEN
    CREATE POLICY "Games catalog readable by all" ON games FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='games' AND policyname='Games catalog insertable by users') THEN
    CREATE POLICY "Games catalog insertable by users" ON games FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='games' AND policyname='Games catalog updatable by users') THEN
    CREATE POLICY "Games catalog updatable by users" ON games FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;

  -- user_games
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_games' AND policyname='User games readable by all') THEN
    CREATE POLICY "User games readable by all" ON user_games FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_games' AND policyname='User games editable only by owner') THEN
    CREATE POLICY "User games editable only by owner" ON user_games FOR ALL USING (user_id = auth.uid());
  END IF;

  -- user_libraries
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_libraries' AND policyname='Libraries readable by all') THEN
    CREATE POLICY "Libraries readable by all" ON user_libraries FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_libraries' AND policyname='Libraries editable only by owner') THEN
    CREATE POLICY "Libraries editable only by owner" ON user_libraries FOR ALL USING (user_id = auth.uid());
  END IF;
END $$;

-- ============================================================
-- 3. Triggers
-- ============================================================

-- 3a. Auto-create a profile on signup. Username defaults to the email prefix,
--     de-duplicated so two players sharing a prefix never collide on UNIQUE.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_base TEXT;
  v_name TEXT;
BEGIN
  v_base := COALESCE(NULLIF(btrim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1));
  IF v_base IS NULL OR v_base = '' THEN
    v_base := 'player';
  END IF;

  v_name := v_base;
  WHILE EXISTS (SELECT 1 FROM public.users u WHERE u.username = v_name) LOOP
    v_name := v_base || '-' || substr(md5(random()::text), 1, 4);
  END LOOP;

  INSERT INTO public.users (id, username, avatar_url, created_at)
  VALUES (new.id, v_name, NULL, now())
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3b. Drop the catalog row when its LAST user_games reference disappears.
CREATE OR REPLACE FUNCTION public.on_user_game_deleted()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_games ug WHERE ug.game_id = OLD.game_id) THEN
    DELETE FROM public.games WHERE id = OLD.game_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_game_deleted ON public.user_games;
CREATE TRIGGER trg_user_game_deleted
  AFTER DELETE ON public.user_games
  FOR EACH ROW EXECUTE FUNCTION public.on_user_game_deleted();

-- 3c. Manual orphan sweep (title-only catalog rows are shared and kept).
CREATE OR REPLACE FUNCTION public.cleanup_orphan_games()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  deleted integer;
BEGIN
  DELETE FROM public.games g
  WHERE NOT EXISTS (SELECT 1 FROM public.user_games ug WHERE ug.game_id = g.id);
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_orphan_games() TO authenticated;

-- ============================================================
-- 4. Creator Mode: global admin password + catalog management
-- ============================================================

CREATE OR REPLACE FUNCTION public.creator_is_configured()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  SELECT value INTO v_hash FROM public.app_config WHERE key = 'creator_password';
  RETURN v_hash IS NOT NULL AND v_hash <> '';
END;
$$;

CREATE OR REPLACE FUNCTION public.creator_verify_password(p_password TEXT)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  SELECT value INTO v_hash FROM public.app_config WHERE key = 'creator_password';
  RETURN v_hash IS NOT NULL AND v_hash <> '' AND v_hash = crypt(p_password, v_hash);
END;
$$;

-- Returns 'ok' | 'need-current' | 'wrong-current' | 'too-short'
CREATE OR REPLACE FUNCTION public.creator_set_password(p_current TEXT, p_new TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  IF p_new IS NULL OR length(p_new) < 4 THEN
    RETURN 'too-short';
  END IF;

  SELECT value INTO v_hash FROM public.app_config WHERE key = 'creator_password';

  IF v_hash IS NULL OR v_hash = '' THEN
    INSERT INTO public.app_config (key, value)
    VALUES ('creator_password', crypt(p_new, gen_salt('bf')))
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
    RETURN 'ok';
  END IF;

  IF p_current IS NULL OR v_hash <> crypt(p_current, v_hash) THEN
    RETURN 'wrong-current';
  END IF;

  UPDATE public.app_config SET value = crypt(p_new, gen_salt('bf')) WHERE key = 'creator_password';
  RETURN 'ok';
END;
$$;

-- Returns 'ok' | 'bad-password' | 'not-found' | 'title-exists'
CREATE OR REPLACE FUNCTION public.creator_rename_game(p_game_id TEXT, p_new_title TEXT, p_password TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  SELECT value INTO v_hash FROM public.app_config WHERE key = 'creator_password';
  IF v_hash IS NULL OR p_password IS NULL OR v_hash <> crypt(p_password, v_hash) THEN
    RETURN 'bad-password';
  END IF;

  IF p_new_title IS NULL OR btrim(p_new_title) = '' THEN
    RETURN 'title-exists';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.games
    WHERE id <> p_game_id AND lower(title) = lower(btrim(p_new_title))
  ) THEN
    RETURN 'title-exists';
  END IF;

  UPDATE public.games SET title = btrim(p_new_title) WHERE id = p_game_id;
  IF NOT FOUND THEN
    RETURN 'not-found';
  END IF;
  RETURN 'ok';
END;
$$;

-- Soft delete: keeps every player's user_games row intact (stats preserved).
-- Returns 'ok' | 'bad-password'
CREATE OR REPLACE FUNCTION public.creator_delete_game(p_game_id TEXT, p_password TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  SELECT value INTO v_hash FROM public.app_config WHERE key = 'creator_password';
  IF v_hash IS NULL OR p_password IS NULL OR v_hash <> crypt(p_password, v_hash) THEN
    RETURN 'bad-password';
  END IF;

  UPDATE public.games SET is_deleted = true WHERE id = p_game_id AND is_deleted = false;
  RETURN 'ok';
END;
$$;

-- Verifies the admin password and blanks stale catalog cover/banner URLs.
-- Returns 'ok' | 'bad-password'
CREATE OR REPLACE FUNCTION public.creator_purge_artwork(p_password TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  SELECT value INTO v_hash FROM public.app_config WHERE key = 'creator_password';
  IF v_hash IS NULL OR p_password IS NULL OR v_hash <> crypt(p_password, v_hash) THEN
    RETURN 'bad-password';
  END IF;

  UPDATE public.games SET cover_url = NULL, banner_url = NULL
  WHERE cover_url IS NOT NULL OR banner_url IS NOT NULL;
  RETURN 'ok';
END;
$$;

GRANT EXECUTE ON FUNCTION public.creator_is_configured() TO authenticated;
GRANT EXECUTE ON FUNCTION public.creator_verify_password(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.creator_set_password(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.creator_rename_game(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.creator_delete_game(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.creator_purge_artwork(TEXT) TO authenticated;

-- ============================================================
-- 5. Storage: avatars + artwork buckets
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('artwork', 'artwork', true)
ON CONFLICT (id) DO NOTHING;

-- avatars: public read
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'avatars');

-- avatars: owner-scoped write
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can update their own avatars" ON storage.objects;
CREATE POLICY "Users can update their own avatars"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- avatars: owner-scoped delete (used by the profile cleanup sweep)
DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;
CREATE POLICY "Users can delete their own avatars"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- artwork: list + delete for the Creator Mode purge routine
DROP POLICY IF EXISTS "Artwork readable by all" ON storage.objects;
CREATE POLICY "Artwork readable by all"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'artwork');

DROP POLICY IF EXISTS "Artwork deletable by authenticated" ON storage.objects;
CREATE POLICY "Artwork deletable by authenticated"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'artwork');