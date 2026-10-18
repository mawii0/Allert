-- Real delivery was explicitly approved. Run AFTER PRODUCTION-alert-caller.sql.
-- This resumes observed-PM delivery only, and preserves consent/quiet-hours/expiry.
BEGIN;
DO $$
DECLARE delivery_job bigint; job_count integer; secret_count integer; credential text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.allert_v2_settings WHERE id=1 AND enabled AND NOT forecast_enabled) THEN
    RAISE EXCEPTION 'Keep current processing enabled and neural forecasts disabled for this rollout.';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='allert-verified-forecasts' AND active) THEN
    RAISE EXCEPTION 'Pause the legacy forecast job before enabling observed delivery.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='allert-seed7-production' AND active) THEN
    RAISE EXCEPTION 'The production calculation schedule must be active.';
  END IF;
  IF position('without whitespace' in pg_catalog.pg_get_functiondef('public.request_allert_alert_tick()'::regprocedure))=0 THEN
    RAISE EXCEPTION 'Install PRODUCTION-alert-caller.sql first.';
  END IF;
  SELECT count(*),min(decrypted_secret) INTO secret_count,credential FROM vault.decrypted_secrets WHERE name='allert_alert_worker_token';
  IF secret_count<>1 OR credential IS NULL OR length(credential)<>64 OR credential !~ '^[0-9A-Fa-f]{64}$' THEN
    RAISE EXCEPTION 'The private alert worker token must be 64 hexadecimal characters without whitespace.';
  END IF;
  SELECT count(*),min(decrypted_secret) INTO secret_count,credential FROM vault.decrypted_secrets WHERE name='allert_alert_gateway_key';
  IF secret_count<>1 OR credential IS NULL OR length(credential)<20 OR credential ~ '[[:cntrl:]]' OR credential<>btrim(credential) THEN
    RAISE EXCEPTION 'The gateway key must not contain control characters or surrounding whitespace.';
  END IF;
  SELECT count(*),min(jobid) INTO job_count,delivery_job FROM cron.job WHERE jobname='allert-observed-anomalies';
  IF job_count<>1 THEN RAISE EXCEPTION 'Expected exactly one existing observed-delivery job.'; END IF;
  PERFORM cron.alter_job(delivery_job,
    schedule:='15 seconds',command:='SELECT public.request_allert_alert_tick();',active:=true);
END;
$$;
COMMIT;
-- Returns a request ID, never a secret. Eligible real notices may be sent now.
SELECT public.request_allert_alert_tick() AS request_id;
