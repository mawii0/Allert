BEGIN;

-- Preferences are private KV records. Only a verified Edge Function can mutate them.
CREATE OR REPLACE FUNCTION public.set_allert_notification_preference(
  p_user_id uuid, p_enabled boolean, p_expected_revision integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  preference_key text;
  saved jsonb;
BEGIN
  IF p_user_id IS NULL OR p_enabled IS NULL OR p_expected_revision IS NULL
     OR p_expected_revision < 0 OR p_expected_revision >= 1000000000 THEN
    RETURN jsonb_build_object('ok', false, 'status', 400, 'error', 'Invalid notification preference.');
  END IF;
  preference_key := 'notification-preferences:v1:' || p_user_id::text;
  IF p_expected_revision = 0 THEN
    saved := jsonb_build_object('enabled', p_enabled, 'revision', 1, 'updatedAt', clock_timestamp());
    INSERT INTO public.kv_store_a473accf(key, value) VALUES(preference_key, saved)
      ON CONFLICT(key) DO NOTHING;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'status', 409, 'error', 'Notification settings changed. Refresh settings before trying again.');
    END IF;
  ELSE
    UPDATE public.kv_store_a473accf
      SET value = value || jsonb_build_object('enabled', p_enabled, 'revision', p_expected_revision + 1, 'updatedAt', clock_timestamp())
      WHERE key = preference_key AND (value->>'revision')::integer = p_expected_revision
      RETURNING value INTO saved;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'status', 409, 'error', 'Notification settings changed. Refresh settings before trying again.');
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'preferences', saved);
END;
$$;
REVOKE ALL ON FUNCTION public.set_allert_notification_preference(uuid,boolean,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_allert_notification_preference(uuid,boolean,integer) TO service_role;
COMMIT;
