"""Create a one-time staging SQL fixture; no network, credentials or model changes."""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'analytics'))
from seed7_host.identity import RELEASE, verify_bytes

verify_bytes()
fixture = json.loads((RELEASE / 'examples/forecast_case_01.json').read_text())
assert len(fixture['history']) == 648
payload = json.dumps(fixture, separators=(',', ':'), allow_nan=False)
assert '$seed7_case01$' not in payload
output = ROOT / 'analytics/outputs/STAGING_seed7_replay_case01.sql'
output.parent.mkdir(parents=True, exist_ok=True)
sql = '''-- ONLY allert-staging. Original fixture times/values are unchanged.
-- received_at records the ACTUAL staging import, not an invented historical receipt.
-- One forecast-only replay; existing live observations and jobs are unchanged.
BEGIN;
DO $guard$
BEGIN
 IF (SELECT count(*) FROM public.sensor_devices) <> 1 OR NOT EXISTS (
   SELECT 1 FROM public.sensor_devices d JOIN auth.users u ON u.id=d.user_id
   WHERE d.device_id='ALLERT-NODE-001' AND d.location_label='STAGING TEST ONLY'
     AND u.email='allert-staging-owner@example.com'
 ) OR EXISTS (SELECT 1 FROM public.allert_push_subscriptions) THEN
   RAISE EXCEPTION 'Expected the isolated staging smoke-test database.';
 END IF;
 IF (SELECT forecast_enabled FROM public.allert_v2_settings WHERE id=1)
    OR EXISTS (SELECT 1 FROM public.allert_v2_observations WHERE stream_id='seed7-staging-acceptance-case01-v1') THEN
   RAISE EXCEPTION 'Replay is already configured or loaded. Do not rerun.';
 END IF;
END;
$guard$;
INSERT INTO public.allert_v2_observations
 (device_id,stream_id,mode,owner_id,owner_epoch,block_start,block_end,received_at,
  payload_hash,pm2_5,pm10,temperature,humidity,quality,source_table)
SELECT d.device_id,'seed7-staging-acceptance-case01-v1','replay',d.user_id,d.owner_since,
 (r->>'block_start')::timestamptz,(r->>'block_end')::timestamptz,clock_timestamp(),
 encode(sha256(convert_to(r::text,'UTF8')),'hex'),
 (r->>'pm2_5')::double precision,(r->>'pm10')::double precision,
 (r->>'temperature_c')::double precision,(r->>'humidity_percent')::double precision,
 '{"pm2_5":"ok","pm10":"ok","temperature":"ok","humidity":"ok"}'::jsonb,
 'seed7_fixture_case01_import'
FROM public.sensor_devices d CROSS JOIN jsonb_array_elements(
 $seed7_case01$''' + payload + '''$seed7_case01$::jsonb->'history') AS item(r)
WHERE d.device_id='ALLERT-NODE-001';
-- This acceptance tests neural forecasting only. Keep the automatic current jobs
-- as explicit obsolete audit records; no detector state or live notices are generated.
UPDATE public.allert_v2_jobs SET status='obsolete',result_status='forecast_only_fixture',finished_at=clock_timestamp()
WHERE stream_id='seed7-staging-acceptance-case01-v1' AND mode='replay' AND kind='current' AND status='pending';
INSERT INTO public.allert_v2_jobs
 (device_id,stream_id,mode,owner_id,owner_epoch,kind,version,origin)
SELECT device_id,'seed7-staging-acceptance-case01-v1','replay',user_id,owner_since,
 'forecast','median-residual-seed7-epoch15-20261013-v1',
 ''' + "'" + fixture['forecast_origin'] + "'" + '''::timestamptz
FROM public.sensor_devices WHERE device_id='ALLERT-NODE-001';
UPDATE public.allert_v2_settings SET enabled=true,forecast_enabled=true WHERE id=1;
COMMIT;
SELECT (SELECT count(*) FROM public.allert_v2_observations
 WHERE stream_id='seed7-staging-acceptance-case01-v1') AS replay_blocks,
 (SELECT count(*) FROM public.allert_v2_jobs WHERE stream_id='seed7-staging-acceptance-case01-v1'
 AND kind='forecast' AND status='pending') AS pending_replay_forecasts;
'''
with output.open('x', encoding='utf-8', newline='\n') as f:
    f.write(sql)
print('Created:', output)
print('Expected result: replay_blocks=648, pending_replay_forecasts=1.')
print('Run ONLY in allert-staging. This file is intentionally ignored by Git.')
