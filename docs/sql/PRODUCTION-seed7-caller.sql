-- Approved production rollout: original Supabase project fugziwuyiecvdopdnkmn.
-- Installs a private caller only. Does not invoke it, change processing flags,
-- pause existing jobs, schedule a recurring job, or deliver notifications.
-- Vault entries: allert_seed7_production_origin and allert_seed7_production_worker_token.
-- Optional protection bypass: allert_seed7_production_bypass.
-- Save in the repository as docs/sql/PRODUCTION-seed7-caller.sql for the release record.

BEGIN;

CREATE OR REPLACE FUNCTION public.request_allert_seed7_production_tick()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  origin text;
  worker_token text;
  bypass text;
  n integer;
  request_headers jsonb;
BEGIN
  SELECT count(*), min(decrypted_secret) INTO n, origin
  FROM vault.decrypted_secrets
  WHERE name = 'allert_seed7_production_origin';
  IF n <> 1 OR origin IS DISTINCT FROM 'https://allert-model-production.vercel.app' THEN
    RAISE EXCEPTION 'Configure exactly one matching production model origin';
  END IF;

  SELECT count(*), min(decrypted_secret) INTO n, worker_token
  FROM vault.decrypted_secrets
  WHERE name = 'allert_seed7_production_worker_token';
  IF n <> 1 OR worker_token IS NULL OR worker_token !~ '^[0-9A-Fa-f]{64}$' THEN
    RAISE EXCEPTION 'Configure one 64-character hexadecimal worker token without whitespace';
  END IF;

  request_headers := pg_catalog.jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || worker_token
  );

  SELECT count(*), min(decrypted_secret) INTO n, bypass
  FROM vault.decrypted_secrets
  WHERE name = 'allert_seed7_production_bypass';
  IF n > 1 OR (n = 1 AND (
    bypass IS NULL OR length(bypass) = 0
    OR bypass ~ '[[:cntrl:]]'
    OR bypass IS DISTINCT FROM btrim(bypass)
  )) THEN
    RAISE EXCEPTION 'Invalid production deployment protection bypass configuration';
  END IF;
  IF n = 1 THEN
    request_headers := request_headers || pg_catalog.jsonb_build_object(
      'x-vercel-protection-bypass', bypass
    );
  END IF;

  RETURN net.http_post(
    url := origin || '/internal/tick',
    headers := request_headers,
    body := '{}'::jsonb,
    timeout_milliseconds := 110000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_allert_seed7_production_tick()
FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
