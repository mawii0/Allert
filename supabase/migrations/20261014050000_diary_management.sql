BEGIN;

-- Serialize corrections/deletions on a single entry. A retained tombstone prevents
-- a delayed retry of the original POST from recreating a deleted diary entry.
CREATE OR REPLACE FUNCTION public.manage_allert_health_log(
  p_user_id uuid, p_entry_id text, p_expected_revision integer,
  p_action text, p_payload jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  entry_key text;
  entry jsonb;
  legacy jsonb;
  revision integer;
  changed jsonb;
BEGIN
  IF p_user_id IS NULL OR p_entry_id IS NULL OR p_entry_id !~ '^[a-zA-Z0-9-]{8,64}$'
     OR p_expected_revision IS NULL OR p_expected_revision < 1
     OR p_action IS NULL OR p_action NOT IN ('update', 'delete') THEN
    RETURN jsonb_build_object('ok', false, 'status', 400, 'error', 'Invalid diary operation.');
  END IF;
  entry_key := 'health-log:v2:' || p_user_id::text || ':' || p_entry_id;
  -- Lock legacy storage first consistently; deletion also removes its old copy.
  SELECT value INTO legacy FROM public.kv_store_a473accf
    WHERE key = 'health-logs:' || p_user_id::text FOR UPDATE;
  SELECT value INTO entry FROM public.kv_store_a473accf WHERE key = entry_key FOR UPDATE;
  IF entry IS NULL THEN
    -- Only import the requesting user's own legacy entry, preserving its original time.
    IF jsonb_typeof(legacy) = 'array' THEN
      SELECT item INTO entry FROM jsonb_array_elements(legacy) item WHERE item->>'id' = p_entry_id LIMIT 1;
    END IF;
    IF entry IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'status', 404, 'error', 'Entry not found.');
    END IF;
    entry := entry || jsonb_build_object('userId', p_user_id, 'revision', 1);
    INSERT INTO public.kv_store_a473accf(key, value) VALUES(entry_key, entry) ON CONFLICT(key) DO NOTHING;
    SELECT value INTO entry FROM public.kv_store_a473accf WHERE key = entry_key FOR UPDATE;
  END IF;
  IF entry->>'userId' IS DISTINCT FROM p_user_id::text THEN
    RETURN jsonb_build_object('ok', false, 'status', 404, 'error', 'Entry not found.');
  END IF;
  IF entry->>'deletedAt' IS NOT NULL THEN
    IF p_action = 'delete' THEN RETURN jsonb_build_object('ok', true, 'deleted', true); END IF;
    RETURN jsonb_build_object('ok', false, 'status', 410, 'error', 'This entry was deleted.');
  END IF;
  revision := COALESCE((entry->>'revision')::integer, 1);
  IF revision <> p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'status', 409, 'error', 'Entry changed. Refresh history before trying again.');
  END IF;
  IF p_action = 'delete' THEN
    changed := jsonb_build_object('id', p_entry_id, 'userId', p_user_id, 'date', entry->'date',
      'deletedAt', clock_timestamp(), 'revision', revision + 1);
    IF jsonb_typeof(legacy) = 'array' THEN
      UPDATE public.kv_store_a473accf SET value = (
        SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) FROM jsonb_array_elements(legacy) item
        WHERE item->>'id' IS DISTINCT FROM p_entry_id
      ) WHERE key = 'health-logs:' || p_user_id::text;
    END IF;
  ELSE
    IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
      RETURN jsonb_build_object('ok', false, 'status', 400, 'error', 'Invalid entry.');
    END IF;
    -- Identity, creation time, and revision always come from the stored record.
    changed := entry || (p_payload - ARRAY['id', 'userId', 'date', 'revision', 'deletedAt', 'updatedAt'])
      || jsonb_build_object('updatedAt', clock_timestamp(), 'revision', revision + 1);
  END IF;
  UPDATE public.kv_store_a473accf SET value = changed WHERE key = entry_key;
  RETURN jsonb_build_object('ok', true, 'deleted', p_action = 'delete', 'entry', changed);
END;
$$;
REVOKE ALL ON FUNCTION public.manage_allert_health_log(uuid,text,integer,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_allert_health_log(uuid,text,integer,text,jsonb) TO service_role;
COMMIT;
