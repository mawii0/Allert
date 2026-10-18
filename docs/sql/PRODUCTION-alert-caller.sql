-- Preparation only: defines the private caller; sends nothing and changes no schedules.
-- Run as postgres after the current production backend has been verified.
BEGIN;
CREATE OR REPLACE FUNCTION public.request_allert_alert_tick() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE worker_token text; gateway_key text; secret_count integer;
BEGIN
  SELECT count(*),min(decrypted_secret) INTO secret_count,worker_token
  FROM vault.decrypted_secrets WHERE name='allert_alert_worker_token';
  IF secret_count<>1 OR worker_token IS NULL OR
     length(worker_token)<>64 OR worker_token !~ '^[0-9A-Fa-f]{64}$' THEN
    RAISE EXCEPTION 'Configure exactly one 64-character hexadecimal worker token without whitespace.';
  END IF;
  SELECT count(*),min(decrypted_secret) INTO secret_count,gateway_key
  FROM vault.decrypted_secrets WHERE name='allert_alert_gateway_key';
  IF secret_count<>1 OR gateway_key IS NULL OR length(gateway_key)<20 OR
     gateway_key ~ '[[:cntrl:]]' OR gateway_key<>btrim(gateway_key) THEN
    RAISE EXCEPTION 'Configure exactly one gateway key without control characters or surrounding whitespace.';
  END IF;
  RETURN net.http_post(
    url:='https://fugziwuyiecvdopdnkmn.supabase.co/functions/v1/make-server-a473accf/alerts/process',
    headers:=pg_catalog.jsonb_build_object('Content-Type','application/json',
      'apikey',gateway_key,'X-Allert-Worker-Token',worker_token),
    body:='{}'::jsonb,
    timeout_milliseconds:=45000
  );
END;
$$;
REVOKE ALL ON FUNCTION public.request_allert_alert_tick() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;

-- Activation requires explicit real-push approval. Neither command runs here.
-- First: SELECT public.request_allert_alert_tick();
-- After checking its HTTP response and delivery records, resume the existing
-- allert-observed-anomalies job. Keep allert-verified-forecasts paused.
