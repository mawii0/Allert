-- Run privately. An administrator must pre-register the device in sensor_devices.
WITH generated AS MATERIALIZED (
  SELECT 'ALLERT-NODE-001'::text AS device_id, upper(replace(gen_random_uuid()::text,'-','')) AS setup_code
), issued AS (
  INSERT INTO public.node_setup_codes(device_id,code_hash,expires_at,consumed_at,consumed_by)
  SELECT device_id,encode(sha256(convert_to(setup_code,'UTF8')),'hex'),now()+interval '7 days',NULL,NULL FROM generated
  ON CONFLICT(device_id) DO UPDATE SET code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at,consumed_at=NULL,consumed_by=NULL
  RETURNING device_id,expires_at
)
SELECT i.device_id,g.setup_code,i.expires_at FROM issued i JOIN generated g USING(device_id);
-- Rotation does not transfer ownership. Unlink first using the signed-in owner's app.
