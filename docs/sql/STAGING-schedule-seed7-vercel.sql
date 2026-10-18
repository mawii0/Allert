-- REVIEW FIRST. Use only the separate staging Supabase project and staging Vercel project.
-- Requires pg_net and pg_cron. Keep analytics flags disabled until replay acceptance.
-- Configure exactly one Vault secret each using the Dashboard (never commit values):
-- allert_seed7_vercel_origin = https://YOUR-STAGING-MODEL.vercel.app (no trailing slash)
-- allert_seed7_worker_token  = the same new random 64+ character ALLERT_WORKER_TOKEN
-- For protected Vercel deployments, also configure allert_seed7_vercel_bypass
-- to the project's Automation Bypass secret; otherwise omit that Vault entry.
-- This file installs a caller only. It DOES NOT schedule or invoke anything.
CREATE OR REPLACE FUNCTION public.request_allert_seed7_vercel_tick() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE origin text; token text; bypass text; n integer; headers jsonb;
BEGIN
 SELECT count(*),min(decrypted_secret) INTO n,origin FROM vault.decrypted_secrets WHERE name='allert_seed7_vercel_origin';
 IF n<>1 OR origin !~ '^https://[a-z0-9][a-z0-9-]*[.]vercel[.]app$' THEN RAISE EXCEPTION 'Configure one exact staging Vercel origin'; END IF;
 SELECT count(*),min(decrypted_secret) INTO n,token FROM vault.decrypted_secrets WHERE name='allert_seed7_worker_token';
 IF n<>1 OR length(token)<64 THEN RAISE EXCEPTION 'Configure one private seed7 worker token'; END IF;
 headers:=pg_catalog.jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token);
 SELECT count(*),min(decrypted_secret) INTO n,bypass FROM vault.decrypted_secrets WHERE name='allert_seed7_vercel_bypass';
 IF n>1 THEN RAISE EXCEPTION 'Duplicate Vercel bypass configuration'; END IF;
 IF n=1 THEN headers:=headers||pg_catalog.jsonb_build_object('x-vercel-protection-bypass',bypass); END IF;
 RETURN net.http_post(url:=origin||'/internal/tick',headers:=headers,body:='{}'::jsonb,timeout_milliseconds:=110000);
END;
$$;
REVOKE ALL ON FUNCTION public.request_allert_seed7_vercel_tick() FROM PUBLIC,anon,authenticated,service_role;

-- AFTER separate staging approval, run ONE manual tick as the postgres dashboard user:
-- SELECT public.request_allert_seed7_vercel_tick();
-- Verify net._http_response and allert_v2_worker; HTTP 200 alone is not model readiness.
-- AFTER staging acceptance, schedule at most one invocation per minute:
-- SELECT cron.schedule('allert-seed7-vercel','* * * * *','SELECT public.request_allert_seed7_vercel_tick();');
-- Rollback scheduler: SELECT cron.unschedule('allert-seed7-vercel');
-- Production cutover requires a separately approved copy with production-specific secrets.
