-- Retired local setup helper. Original retained in docs/archive/20261017/.
-- Existing production schedule is NOT cancelled by this file. Obtain cutover approval.
DO $$ BEGIN RAISE EXCEPTION 'Use the reviewed Modal seed7 deployment guide; do not install a second forecast scheduler.'; END $$;
