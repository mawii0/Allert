-- New migration, not a reconstruction of historical database changes.
BEGIN;
ALTER TABLE public.sensor_devices ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.sensor_devices ADD COLUMN IF NOT EXISTS owner_since timestamptz;
-- Add receipt time WITHOUT stamping historical rows.
ALTER TABLE public.sensor_readings ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.sensor_readings ALTER COLUMN created_at SET DEFAULT clock_timestamp();
-- Fails safely if conflicting historical duplicates exist; review them, do not delete blindly.
CREATE UNIQUE INDEX IF NOT EXISTS sensor_readings_device_timestamp_unique ON public.sensor_readings(device_id,timestamp);
REVOKE ALL ON public.sensor_devices, public.sensor_readings,
  public.kv_store_a473accf FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sensor_devices, public.sensor_readings,
  public.kv_store_a473accf TO service_role;

CREATE TABLE IF NOT EXISTS public.node_ingestion_credentials (
  device_id text PRIMARY KEY REFERENCES public.sensor_devices(device_id),
  token_hash text CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  readings_table text NOT NULL DEFAULT 'sensor_readings'
    CHECK (readings_table ~ '^[a-z][a-z0-9_]{0,62}$'),
  active boolean NOT NULL DEFAULT true,
  model_node_id text,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO public.node_ingestion_credentials (device_id, model_node_id)
SELECT device_id, 'node-1' FROM public.sensor_devices WHERE device_id = 'ALLERT-NODE-001'
ON CONFLICT (device_id) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS node_model_assignment_unique ON public.node_ingestion_credentials(model_node_id) WHERE model_node_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.node_packet_receipts (
  device_id text REFERENCES public.sensor_devices(device_id),
  timestamp timestamptz NOT NULL,
  payload_hash text NOT NULL,
  readings_table text NOT NULL,
  reading_id bigint NOT NULL,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (device_id, timestamp)
);
CREATE TABLE IF NOT EXISTS public.node_setup_codes (
  device_id text PRIMARY KEY REFERENCES public.sensor_devices(device_id),
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_by uuid REFERENCES auth.users(id)
);
CREATE TABLE IF NOT EXISTS public.node_claim_attempts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL
);
ALTER TABLE public.node_ingestion_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.node_packet_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.node_setup_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.node_claim_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.node_ingestion_credentials, public.node_packet_receipts,
  public.node_setup_codes, public.node_claim_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.node_ingestion_credentials, public.node_packet_receipts,
  public.node_setup_codes, public.node_claim_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.ingest_allert_reading(
  p_device_id text, p_token_hash text, p_reading jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_config public.node_ingestion_credentials%ROWTYPE;
  v_receipt public.node_packet_receipts%ROWTYPE;
  v_timestamp timestamptz;
  v_record jsonb;
  v_hash text;
  v_existing jsonb;
  v_matches integer;
  v_id bigint;
BEGIN
  SELECT * INTO v_config FROM public.node_ingestion_credentials
    WHERE device_id = p_device_id FOR UPDATE;
  IF NOT FOUND OR NOT v_config.active OR v_config.token_hash IS NULL
      OR v_config.token_hash IS DISTINCT FROM p_token_hash THEN
    RETURN jsonb_build_object('ok', false, 'status', 401, 'error', 'Invalid device credential');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sensor_devices WHERE device_id=p_device_id AND is_active) THEN
    RETURN jsonb_build_object('ok', false, 'status', 403, 'error', 'Device disabled');
  END IF;
  IF pg_catalog.to_regclass(pg_catalog.format('public.%I', v_config.readings_table)) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 503, 'error', 'Reading table is not configured');
  END IF;
  BEGIN
    v_timestamp := (p_reading->>'timestamp')::timestamptz;
    v_record := jsonb_build_object(
      'pm2_5', (p_reading->>'pm2_5')::double precision,
      'pm10', (p_reading->>'pm10')::double precision,
      'temperature', (p_reading->>'temperature')::double precision,
      'humidity', (p_reading->>'humidity')::double precision,
      'sample_count', (p_reading->>'sample_count')::integer,
      'expected_samples', (p_reading->>'expected_samples')::integer,
      'pm25_stddev', (p_reading->>'pm25_stddev')::double precision,
      'data_quality_status', p_reading->>'data_quality_status');
    IF v_timestamp IS NULL OR v_timestamp > clock_timestamp()+interval '1 minute'
        OR v_timestamp < clock_timestamp()-interval '7 days'
        OR NOT (v_record->>'pm2_5')::double precision BETWEEN 0 AND 1000
        OR NOT (v_record->>'pm10')::double precision BETWEEN 0 AND 1000
        OR NOT (v_record->>'temperature')::double precision BETWEEN -40 AND 125
        OR NOT (v_record->>'humidity')::double precision BETWEEN 0 AND 100
        OR NOT (v_record->>'pm25_stddev')::double precision BETWEEN 0 AND 1000
        OR (v_record->>'expected_samples')::integer IS DISTINCT FROM 30
        OR NOT (v_record->>'sample_count')::integer BETWEEN 1 AND 30
        OR v_record->>'data_quality_status' NOT IN ('VALID','GAP_FLAGGED')
        OR (v_record->>'data_quality_status' = 'VALID' AND (v_record->>'sample_count')::integer <> 30)
        OR EXISTS (SELECT 1 FROM jsonb_each(v_record) WHERE value = 'null'::jsonb) THEN
      RETURN jsonb_build_object('ok', false, 'status', 400, 'error', 'Invalid sensor packet');
    END IF;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format OR numeric_value_out_of_range THEN
    RETURN jsonb_build_object('ok', false, 'status', 400, 'error', 'Invalid sensor packet');
  END;
  v_hash := encode(pg_catalog.sha256(pg_catalog.convert_to(v_record::text, 'UTF8')), 'hex');
  SELECT * INTO v_receipt FROM public.node_packet_receipts
    WHERE device_id=p_device_id AND timestamp=v_timestamp;
  IF FOUND THEN
    IF v_receipt.payload_hash <> v_hash THEN
      RETURN jsonb_build_object('ok', false, 'status', 409, 'error', 'Conflicting packet for this timestamp');
    END IF;
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;
  -- Protect the FastAPI-to-cloud cutover too: never overwrite an older accepted reading.
  EXECUTE pg_catalog.format(
    'SELECT count(*), (jsonb_agg(to_jsonb(r))->0) FROM public.%I r WHERE device_id=$1 AND timestamp=$2',
    v_config.readings_table) INTO v_matches, v_existing USING p_device_id, v_timestamp;
  IF v_matches > 1 THEN
    RETURN jsonb_build_object('ok', false, 'status', 409, 'error', 'Existing duplicate readings require review');
  ELSIF v_matches = 1 THEN
    IF v_existing @> v_record THEN
      v_id := (v_existing->>'id')::bigint;
    ELSE
      RETURN jsonb_build_object('ok', false, 'status', 409, 'error', 'Conflicting packet for this timestamp');
    END IF;
  ELSE
    EXECUTE pg_catalog.format(
      'INSERT INTO public.%I (device_id,timestamp,pm2_5,pm10,temperature,humidity,sample_count,expected_samples,pm25_stddev,data_quality_status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp()) RETURNING id',
      v_config.readings_table)
    INTO v_id USING p_device_id,v_timestamp,
      (v_record->>'pm2_5')::double precision,(v_record->>'pm10')::double precision,
      (v_record->>'temperature')::double precision,(v_record->>'humidity')::double precision,
      (v_record->>'sample_count')::integer,30,(v_record->>'pm25_stddev')::double precision,
      v_record->>'data_quality_status';
  END IF;
  INSERT INTO public.node_packet_receipts (device_id,timestamp,payload_hash,readings_table,reading_id)
  VALUES (p_device_id,v_timestamp,v_hash,v_config.readings_table,v_id);
  RETURN jsonb_build_object('ok', true, 'duplicate', v_matches = 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_allert_node(p_user_id uuid,p_device_id text,p_setup_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_device public.sensor_devices%ROWTYPE;
  v_code public.node_setup_codes%ROWTYPE;
  v_attempts integer;
  v_model_node text;
BEGIN
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id=p_user_id) THEN
    RETURN jsonb_build_object('ok', false,'status',401,'error','Unauthorized');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,0));
  INSERT INTO public.node_claim_attempts AS a VALUES (p_user_id,now(),1)
  ON CONFLICT (user_id) DO UPDATE SET
    window_started_at=CASE WHEN a.window_started_at < now()-interval '1 minute' THEN now() ELSE a.window_started_at END,
    attempts=CASE WHEN a.window_started_at < now()-interval '1 minute' THEN 1 ELSE a.attempts+1 END
  RETURNING attempts INTO v_attempts;
  IF v_attempts>5 THEN
    RETURN jsonb_build_object('ok',false,'status',429,'error','Too many attempts. Wait one minute.');
  END IF;
  IF p_device_id IS NULL OR p_device_id !~ '^ALLERT-NODE-[0-9]{3}$' OR p_setup_code IS NULL OR p_setup_code !~ '^[A-F0-9]{32}$' THEN
    RETURN jsonb_build_object('ok',false,'status',400,'error','Invalid node ID or setup code');
  END IF;
  SELECT * INTO v_device FROM public.sensor_devices WHERE device_id=p_device_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status',400,'error','Invalid node ID or setup code'); END IF;
  SELECT * INTO v_code FROM public.node_setup_codes WHERE device_id=p_device_id FOR UPDATE;
  IF NOT FOUND OR v_code.expires_at<=now() OR v_code.code_hash<>encode(pg_catalog.sha256(pg_catalog.convert_to(p_setup_code,'UTF8')),'hex') THEN
    RETURN jsonb_build_object('ok',false,'status',400,'error','Setup code is invalid or expired.');
  END IF;
  IF NOT v_device.is_active THEN
    RETURN jsonb_build_object('ok',false,'status',409,'error','Device disabled. Contact the project owner.');
  END IF;
  IF v_device.user_id IS NOT NULL AND v_device.user_id<>p_user_id THEN
    RETURN jsonb_build_object('ok',false,'status',409,'error','This node belongs to another account.');
  END IF;
  IF v_code.consumed_at IS NOT NULL AND (v_code.consumed_by IS DISTINCT FROM p_user_id OR v_device.user_id IS DISTINCT FROM p_user_id) THEN
    RETURN jsonb_build_object('ok',false,'status',409,'error','Setup code has already been used.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.sensor_devices WHERE user_id=p_user_id AND is_active AND device_id<>p_device_id) THEN
    RETURN jsonb_build_object('ok',false,'status',409,'error','Your account already has an active node.');
  END IF;
  UPDATE public.sensor_devices SET owner_since=CASE WHEN user_id IS NULL THEN clock_timestamp() ELSE owner_since END, user_id=p_user_id,is_active=true WHERE device_id=p_device_id;
  SELECT model_node_id INTO v_model_node FROM public.node_ingestion_credentials WHERE device_id=p_device_id;
  IF v_model_node IS NOT NULL THEN
    INSERT INTO public.kv_store_a473accf (key,value) VALUES (
      'node-assignment:v1:'||p_user_id::text||':'||v_model_node,
      jsonb_build_object('schema_version',1,'user_id',p_user_id::text,'node_id',v_model_node,'active',true))
    ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;
  END IF;
  UPDATE public.node_setup_codes SET consumed_at=coalesce(consumed_at,now()),consumed_by=p_user_id WHERE device_id=p_device_id;
  RETURN jsonb_build_object('ok',true,'device_id',p_device_id,'model_access_assigned',v_model_node IS NOT NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.unlink_allert_node(p_user_id uuid,p_device_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_device public.sensor_devices%ROWTYPE; v_model_node text;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('ok',false,'status',401,'error','Unauthorized'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,0));
  SELECT * INTO v_device FROM public.sensor_devices WHERE device_id=p_device_id FOR UPDATE;
  IF NOT FOUND OR v_device.user_id IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('ok',false,'status',403,'error','Only the node owner can unlink it.');
  END IF;
  UPDATE public.sensor_devices SET user_id=NULL WHERE device_id=p_device_id;
  UPDATE public.node_setup_codes SET expires_at=now() WHERE device_id=p_device_id;
  DELETE FROM public.kv_store_a473accf WHERE key='sensor-model:v1:'||p_device_id;
  SELECT model_node_id INTO v_model_node FROM public.node_ingestion_credentials WHERE device_id=p_device_id;
  IF v_model_node='node-1' THEN DELETE FROM public.kv_store_a473accf WHERE key='environment:v1:live'; END IF;
  IF v_model_node IS NOT NULL THEN
    DELETE FROM public.kv_store_a473accf WHERE key LIKE 'node-assignment:v1:%'
      AND value->>'node_id'=v_model_node;
  END IF;
  DELETE FROM public.kv_store_a473accf WHERE key LIKE 'sensor-share:v1:%' AND value->>'device_id'=p_device_id;
  RETURN jsonb_build_object('ok',true,'device_id',p_device_id);
END;
$$;
CREATE OR REPLACE FUNCTION public.register_allert_node_storage(p_device_id text,p_table_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_device_id IS NULL OR p_device_id !~ '^ALLERT-NODE-[0-9]{3}$'
      OR p_table_name IS NULL OR p_table_name !~ '^[a-z][a-z0-9_]{0,62}$' THEN
    RAISE EXCEPTION 'Invalid device ID or table name';
  END IF;
  INSERT INTO public.sensor_devices(device_id,is_active) VALUES(p_device_id,true) ON CONFLICT(device_id) DO NOTHING;
  IF pg_catalog.to_regclass(pg_catalog.format('public.%I',p_table_name)) IS NULL THEN
    EXECUTE pg_catalog.format('CREATE TABLE public.%I (LIKE public.sensor_readings INCLUDING ALL)',p_table_name);
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_attribute WHERE attrelid=pg_catalog.to_regclass(pg_catalog.format('public.%I',p_table_name))
      AND NOT attisdropped AND attname IN ('id','device_id','timestamp','pm2_5','pm10','temperature','humidity','sample_count','expected_samples','pm25_stddev','data_quality_status')) <> 11 THEN
    RAISE EXCEPTION 'Reading table lacks required columns';
  END IF;
  EXECUTE pg_catalog.format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I(device_id,timestamp)', 'allert_device_time_'||substr(md5('public.'||p_table_name),1,16),p_table_name);
  EXECUTE pg_catalog.format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_at timestamptz',p_table_name);
  EXECUTE pg_catalog.format('ALTER TABLE public.%I ALTER COLUMN created_at SET DEFAULT clock_timestamp()',p_table_name);
  EXECUTE pg_catalog.format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',p_table_name);
  EXECUTE pg_catalog.format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',p_table_name);
  EXECUTE pg_catalog.format('GRANT SELECT ON public.%I TO service_role',p_table_name);
  INSERT INTO public.node_ingestion_credentials(device_id,readings_table)
  VALUES(p_device_id,p_table_name) ON CONFLICT(device_id) DO UPDATE SET readings_table=EXCLUDED.readings_table,updated_at=clock_timestamp();
  RETURN jsonb_build_object('ok',true,'device_id',p_device_id,'readings_table',p_table_name);
END;
$$;
REVOKE ALL ON FUNCTION public.register_allert_node_storage(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_allert_node_storage(text,text) TO service_role;

REVOKE ALL ON FUNCTION public.ingest_allert_reading(text,text,jsonb),public.claim_allert_node(uuid,text,text),public.unlink_allert_node(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_allert_reading(text,text,jsonb),public.claim_allert_node(uuid,text,text),public.unlink_allert_node(uuid,text) TO service_role;
COMMIT;
