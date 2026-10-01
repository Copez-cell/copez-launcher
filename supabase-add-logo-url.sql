-- Add logo_url to the shared games catalog so game logos are stored alongside
-- cover_url and banner_url.
--
-- Paste this into Supabase -> SQL Editor -> Run. Safe to run more than once.

ALTER TABLE games ADD COLUMN IF NOT EXISTS logo_url TEXT;