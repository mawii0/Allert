-- Run in the Supabase SQL Editor. Keep the displayed token private.
-- Vault is used so the scheduled job never contains the literal worker credential.
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='allert_alert_worker_token') THEN
    PERFORM vault.create_secret(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),'allert_alert_worker_token','ALLERT observed anomaly worker');
  END IF;
END;
$$;
-- Copy this value into the Edge Function secret ALLERT_ALERT_WORKER_TOKEN.
-- Do not post this query's result in chat or commit it to Git.
SELECT decrypted_secret AS private_worker_token FROM vault.decrypted_secrets WHERE name='allert_alert_worker_token';
