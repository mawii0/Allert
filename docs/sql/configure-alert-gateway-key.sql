-- Replace the placeholder with this project's PUBLIC publishable key or legacy anon key.
-- Never use the service_role/secret key here.
DO $$
DECLARE gateway_key text:='REPLACE_WITH_PUBLIC_PUBLISHABLE_OR_ANON_KEY'; existing_id uuid;
BEGIN
  IF gateway_key LIKE 'REPLACE_%' OR length(gateway_key)<20 THEN RAISE EXCEPTION 'Replace the gateway-key placeholder with the project public publishable/anon key.'; END IF;
  SELECT id INTO existing_id FROM vault.secrets WHERE name='allert_alert_gateway_key' LIMIT 1;
  IF existing_id IS NULL THEN
    PERFORM vault.create_secret(gateway_key,'allert_alert_gateway_key','Public gateway key for ALLERT scheduled calls');
  ELSE
    PERFORM vault.update_secret(existing_id,gateway_key);
  END IF;
END;
$$;
