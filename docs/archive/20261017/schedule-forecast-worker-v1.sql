-- After release migration/backend deployment. Reuses the existing private Vault worker token and gateway key.
CREATE OR REPLACE FUNCTION public.request_allert_forecast_tick() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE worker_token text; gateway_key text; secret_count integer;
BEGIN
 SELECT count(*),min(decrypted_secret) INTO secret_count,worker_token FROM vault.decrypted_secrets WHERE name='allert_alert_worker_token';
 IF secret_count<>1 OR worker_token IS NULL OR length(worker_token)<32 THEN RAISE EXCEPTION 'Configure exactly one private ALLERT worker token in Vault.'; END IF;
 SELECT count(*),min(decrypted_secret) INTO secret_count,gateway_key FROM vault.decrypted_secrets WHERE name='allert_alert_gateway_key';
 IF secret_count<>1 OR gateway_key IS NULL OR length(gateway_key)<20 THEN RAISE EXCEPTION 'Configure the public ALLERT gateway key in Vault.'; END IF;
 RETURN net.http_post(url:='https://fugziwuyiecvdopdnkmn.supabase.co/functions/v1/make-server-a473accf/forecasts/process',
 headers:=pg_catalog.jsonb_build_object('Content-Type','application/json','apikey',gateway_key,'X-Allert-Worker-Token',worker_token),body:='{}'::jsonb,timeout_milliseconds:=45000);
END; $$;
REVOKE ALL ON FUNCTION public.request_allert_forecast_tick() FROM PUBLIC,anon,authenticated,service_role;
SELECT cron.schedule('allert-verified-forecasts','* * * * *','SELECT public.request_allert_forecast_tick();');
SELECT public.request_allert_forecast_tick();
