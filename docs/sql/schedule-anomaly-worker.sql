-- Run AFTER the three feature migrations, backend deployment, frontend checks,
-- and matching Vault/Edge Function worker token are configured.
-- Enable pg_cron and pg_net in the Supabase Dashboard first.
CREATE OR REPLACE FUNCTION public.request_allert_alert_tick() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE worker_token text; gateway_key text; secret_count integer;
BEGIN
  SELECT count(*),min(decrypted_secret) INTO secret_count,worker_token FROM vault.decrypted_secrets WHERE name='allert_alert_worker_token';
  IF secret_count<>1 OR worker_token IS NULL OR length(worker_token)<32 THEN RAISE EXCEPTION 'Configure exactly one private ALLERT worker token in Vault.'; END IF;
  SELECT count(*),min(decrypted_secret) INTO secret_count,gateway_key FROM vault.decrypted_secrets WHERE name='allert_alert_gateway_key';
  IF secret_count<>1 OR gateway_key IS NULL OR length(gateway_key)<20 THEN RAISE EXCEPTION 'Configure the public ALLERT gateway key in Vault.'; END IF;
  RETURN net.http_post(
    url:='https://fugziwuyiecvdopdnkmn.supabase.co/functions/v1/make-server-a473accf/alerts/process',
    headers:=pg_catalog.jsonb_build_object('Content-Type','application/json','apikey',gateway_key,'X-Allert-Worker-Token',worker_token),
    body:='{}'::jsonb,
    timeout_milliseconds:=45000
  );
END;
$$;
REVOKE ALL ON FUNCTION public.request_allert_alert_tick() FROM PUBLIC,anon,authenticated,service_role;
-- The dashboard's postgres user owns this function and the scheduled job.
SELECT cron.schedule('allert-observed-anomalies','15 seconds','SELECT public.request_allert_alert_tick();');
-- Optional initial invocation, returning only a request ID (never the worker token).
SELECT public.request_allert_alert_tick();
