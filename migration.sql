-- ══════════════════════════════════════════════════════════════

-- 8. Session heartbeat repair (run once).
-- Keeps the newest row for each user/device pair and prevents future duplicates.
-- The trigger is a compatibility layer for clients that still have an older
-- cached version of Tasker open while v2.0.13 rolls out.
BEGIN;

CREATE SCHEMA IF NOT EXISTS maintenance;
REVOKE ALL ON SCHEMA maintenance FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS maintenance.sessions_backup_20260730
AS TABLE public.sessions WITH DATA;
REVOKE ALL ON TABLE maintenance.sessions_backup_20260730 FROM PUBLIC, anon, authenticated;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, device_token
      ORDER BY last_seen DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS duplicate_rank
  FROM public.sessions
)
DELETE FROM public.sessions s
USING ranked r
WHERE s.id = r.id
  AND r.duplicate_rank > 1;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_user_device_key UNIQUE (user_id, device_token);

CREATE OR REPLACE FUNCTION public.tasker_merge_session_heartbeat()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.sessions
  SET last_seen = GREATEST(
    COALESCE(last_seen, '-infinity'::timestamptz),
    COALESCE(NEW.last_seen, now())
  )
  WHERE user_id = NEW.user_id
    AND device_token = NEW.device_token;

  IF FOUND THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sessions_merge_heartbeat_before_insert ON public.sessions;
CREATE TRIGGER sessions_merge_heartbeat_before_insert
BEFORE INSERT ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION public.tasker_merge_session_heartbeat();

COMMIT;

-- Verification:
-- SELECT count(*) AS rows,
--        count(DISTINCT (user_id, device_token)) AS device_pairs
-- FROM public.sessions;
-- Expected after the 2026-07-30 cleanup: both values are 26.
-- Migration: Add theme, admin role, notepads support, Google login mapping
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ══════════════════════════════════════════════════════════════

-- 1. Add 'theme' column to settings (stores color/blur preferences)
ALTER TABLE settings ADD COLUMN IF NOT EXISTS theme jsonb DEFAULT '{}'::jsonb;

-- 2. Add 'role' column to users ('admin' or 'user')
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';

-- 2b. Google login mapping.
-- Existing app data stays linked to users.id. Google Auth only proves the email,
-- then the browser loads the matching row from public.users.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id uuid;
ALTER TABLE users ALTER COLUMN seed_phrase DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_key ON users (auth_user_id) WHERE auth_user_id IS NOT NULL;

-- One-time manual account mapping for the two existing users.
-- Already run once; keep these as reference only:
--
--   SELECT id, display_name, seed_phrase, email FROM users;
--
-- UPDATE users SET email = 'kamran.lapp@gmail.com' WHERE id = 'c68df295-695a-4792-b2bf-90ed9854f8e6';
-- UPDATE users SET email = 'riosdanelia10@gmail.com' WHERE id = 'a0edaf89-f8d7-4f8c-ac8a-fdcc77f42614';
--
-- Leave auth_user_id NULL; the app fills it on the first successful Google login.

-- 2c. Row Level Security for Google-authenticated app users.
-- These policies rely on browser REST requests sending the Supabase Auth JWT.
CREATE OR REPLACE FUNCTION public.tasker_is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.tasker_can_access_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.tasker_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = target_user_id
        AND u.auth_user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.tasker_link_google_user(target_user_id uuid)
RETURNS TABLE (
  id uuid,
  email text,
  auth_user_id uuid,
  display_name text,
  role text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.users u
  SET
    auth_user_id = auth.uid(),
    email = lower(auth.jwt() ->> 'email')
  WHERE u.id = target_user_id
    AND u.auth_user_id IS NULL
    AND lower(u.email) = lower(auth.jwt() ->> 'email')
  RETURNING u.id, u.email, u.auth_user_id, u.display_name, u.role;
$$;

GRANT EXECUTE ON FUNCTION public.tasker_link_google_user(uuid) TO authenticated;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE trees ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ui_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_own_or_admin ON users;
DROP POLICY IF EXISTS users_link_google ON users;
DROP POLICY IF EXISTS users_admin_insert ON users;
DROP POLICY IF EXISTS users_admin_update ON users;
DROP POLICY IF EXISTS users_admin_delete ON users;

CREATE POLICY users_select_own_or_admin
ON users FOR SELECT TO authenticated
USING (
  public.tasker_is_admin()
  OR auth_user_id = auth.uid()
  OR (
    auth_user_id IS NULL
    AND lower(email) = lower(auth.jwt() ->> 'email')
  )
);

CREATE POLICY users_admin_insert
ON users FOR INSERT TO authenticated
WITH CHECK (public.tasker_is_admin());

CREATE POLICY users_admin_update
ON users FOR UPDATE TO authenticated
USING (public.tasker_is_admin())
WITH CHECK (public.tasker_is_admin());

CREATE POLICY users_admin_delete
ON users FOR DELETE TO authenticated
USING (public.tasker_is_admin());

DROP POLICY IF EXISTS trees_select_own_or_admin ON trees;
DROP POLICY IF EXISTS trees_insert_own_or_admin ON trees;
DROP POLICY IF EXISTS trees_update_own_or_admin ON trees;
DROP POLICY IF EXISTS trees_delete_own_or_admin ON trees;

CREATE POLICY trees_select_own_or_admin
ON trees FOR SELECT TO authenticated
USING (public.tasker_can_access_user(user_id));

CREATE POLICY trees_insert_own_or_admin
ON trees FOR INSERT TO authenticated
WITH CHECK (public.tasker_can_access_user(user_id));

CREATE POLICY trees_update_own_or_admin
ON trees FOR UPDATE TO authenticated
USING (public.tasker_can_access_user(user_id))
WITH CHECK (public.tasker_can_access_user(user_id));

CREATE POLICY trees_delete_own_or_admin
ON trees FOR DELETE TO authenticated
USING (public.tasker_can_access_user(user_id));

DROP POLICY IF EXISTS settings_select_own_or_admin ON settings;
DROP POLICY IF EXISTS settings_insert_own_or_admin ON settings;
DROP POLICY IF EXISTS settings_update_own_or_admin ON settings;
DROP POLICY IF EXISTS settings_delete_own_or_admin ON settings;

CREATE POLICY settings_select_own_or_admin
ON settings FOR SELECT TO authenticated
USING (public.tasker_can_access_user(user_id));

CREATE POLICY settings_insert_own_or_admin
ON settings FOR INSERT TO authenticated
WITH CHECK (public.tasker_can_access_user(user_id));

CREATE POLICY settings_update_own_or_admin
ON settings FOR UPDATE TO authenticated
USING (public.tasker_can_access_user(user_id))
WITH CHECK (public.tasker_can_access_user(user_id));

CREATE POLICY settings_delete_own_or_admin
ON settings FOR DELETE TO authenticated
USING (public.tasker_can_access_user(user_id));

DROP POLICY IF EXISTS ui_state_select_own_or_admin ON ui_state;
DROP POLICY IF EXISTS ui_state_insert_own_or_admin ON ui_state;
DROP POLICY IF EXISTS ui_state_update_own_or_admin ON ui_state;
DROP POLICY IF EXISTS ui_state_delete_own_or_admin ON ui_state;

CREATE POLICY ui_state_select_own_or_admin
ON ui_state FOR SELECT TO authenticated
USING (public.tasker_can_access_user(user_id));

CREATE POLICY ui_state_insert_own_or_admin
ON ui_state FOR INSERT TO authenticated
WITH CHECK (public.tasker_can_access_user(user_id));

CREATE POLICY ui_state_update_own_or_admin
ON ui_state FOR UPDATE TO authenticated
USING (public.tasker_can_access_user(user_id))
WITH CHECK (public.tasker_can_access_user(user_id));

CREATE POLICY ui_state_delete_own_or_admin
ON ui_state FOR DELETE TO authenticated
USING (public.tasker_can_access_user(user_id));

DROP POLICY IF EXISTS sessions_select_own_or_admin ON sessions;
DROP POLICY IF EXISTS sessions_insert_own_or_admin ON sessions;
DROP POLICY IF EXISTS sessions_update_own_or_admin ON sessions;
DROP POLICY IF EXISTS sessions_delete_own_or_admin ON sessions;

CREATE POLICY sessions_select_own_or_admin
ON sessions FOR SELECT TO authenticated
USING (public.tasker_can_access_user(user_id));

CREATE POLICY sessions_insert_own_or_admin
ON sessions FOR INSERT TO authenticated
WITH CHECK (public.tasker_can_access_user(user_id));

CREATE POLICY sessions_update_own_or_admin
ON sessions FOR UPDATE TO authenticated
USING (public.tasker_can_access_user(user_id))
WITH CHECK (public.tasker_can_access_user(user_id));

CREATE POLICY sessions_delete_own_or_admin
ON sessions FOR DELETE TO authenticated
USING (public.tasker_can_access_user(user_id));

-- 3. Set your account as admin (replace YOUR_USER_ID with your actual user id)
-- You can find your id by running: SELECT id, display_name FROM users;
-- Then uncomment and run:
-- UPDATE users SET role = 'admin' WHERE id = 'YOUR_USER_ID';

-- 4. Add 'notepads' column to settings
--    Stores array of up to 3 notepads, each with:
--    { key, name, emoji, kind: 'calendar'|'projects'|'text', content?, nodes, statuses,
--      theme: { bg, mainBg, rightBg, mainBlur, rightBlur, yearColor, weekColor, accountColor, textColor } }
ALTER TABLE settings ADD COLUMN IF NOT EXISTS notepads jsonb DEFAULT '[]'::jsonb;

-- 5. Add 'active_notepad' to ui_state (which notepad is currently selected)
ALTER TABLE ui_state ADD COLUMN IF NOT EXISTS active_notepad text DEFAULT NULL;

-- 6. Trees table: add 'notepad_key' so each notepad can have its own tree
--    The default/original tree has notepad_key = NULL
ALTER TABLE trees ADD COLUMN IF NOT EXISTS notepad_key text DEFAULT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS trees_user_main_key ON trees (user_id) WHERE notepad_key IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS trees_user_notepad_key ON trees (user_id, notepad_key) WHERE notepad_key IS NOT NULL;

-- 7. Drop the old unique constraint on trees (user_id only) and create a new one
--    that includes notepad_key, so each user can have multiple trees
--    First check what constraint exists:
--    SELECT constraint_name FROM information_schema.table_constraints 
--    WHERE table_name = 'trees' AND constraint_type = 'UNIQUE';
--
-- Then drop and recreate. Common constraint names - try both:
-- ALTER TABLE trees DROP CONSTRAINT IF EXISTS trees_user_id_key;
-- ALTER TABLE trees DROP CONSTRAINT IF EXISTS trees_pkey;
-- ALTER TABLE trees ADD CONSTRAINT trees_user_notepad_key UNIQUE (user_id, notepad_key);

-- ══════════════════════════════════════════════════════════════
-- IMPORTANT: After running the ALTER TABLEs above, you need to
-- find your user ID and set yourself as admin. Run:
--
--   SELECT id, display_name, email, seed_phrase FROM users;
--
-- Then:
--
--   UPDATE users SET role = 'admin' WHERE id = '<your-id-here>';
--
-- ══════════════════════════════════════════════════════════════
