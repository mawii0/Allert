-- Run privately. This upload credential is separate from the account-linking code.
-- Update the device ID for an administrator-registered node.
WITH generated AS MATERIALIZED (
  SELECT 'ALLERT-NODE-001'::text AS device_id,
    replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','') AS upload_token
), issued AS (
  INSERT INTO public.node_ingestion_credentials (device_id,token_hash)
  SELECT device_id,encode(sha256(convert_to(upload_token,'UTF8')),'hex') FROM generated
  ON CONFLICT (device_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,active=true,updated_at=clock_timestamp()
  RETURNING device_id
)
SELECT g.device_id,g.upload_token FROM generated g JOIN issued i USING(device_id);
-- Copy the token into your private node_secrets.h. Never commit the returned value.
-- Running this again invalidates the previous firmware's upload credential.
