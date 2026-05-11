-- ══════════════════════════════════════════════════════════════
-- Migration: Add theme, admin role, notepads support
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ══════════════════════════════════════════════════════════════

-- 1. Add 'theme' column to settings (stores color/blur preferences)
ALTER TABLE settings ADD COLUMN IF NOT EXISTS theme jsonb DEFAULT '{}'::jsonb;

-- 2. Add 'role' column to users ('admin' or 'user')
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';

-- 3. Set your account as admin (replace YOUR_USER_ID with your actual user id)
-- You can find your id by running: SELECT id, display_name FROM users;
-- Then uncomment and run:
-- UPDATE users SET role = 'admin' WHERE id = 'YOUR_USER_ID';

-- 4. Add 'notepads' column to settings
--    Stores array of up to 3 notepads, each with:
--    { key, name, emoji, theme: { bg, mainBg, rightBg, mainBlur, rightBlur, yearColor, weekColor, accountColor, textColor } }
ALTER TABLE settings ADD COLUMN IF NOT EXISTS notepads jsonb DEFAULT '[]'::jsonb;

-- 5. Add 'active_notepad' to ui_state (which notepad is currently selected)
ALTER TABLE ui_state ADD COLUMN IF NOT EXISTS active_notepad text DEFAULT NULL;

-- 6. Trees table: add 'notepad_key' so each notepad can have its own tree
--    The default/original tree has notepad_key = NULL
ALTER TABLE trees ADD COLUMN IF NOT EXISTS notepad_key text DEFAULT NULL;

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
--   SELECT id, display_name, seed_phrase FROM users;
--
-- Then:
--
--   UPDATE users SET role = 'admin' WHERE id = '<your-id-here>';
--
-- ══════════════════════════════════════════════════════════════
