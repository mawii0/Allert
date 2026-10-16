BEGIN;
CREATE TABLE public.allert_node_locations (
  device_id text PRIMARY KEY REFERENCES public.sensor_devices(device_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_epoch timestamptz NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  captured_at timestamptz,
  revision integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((NOT enabled AND latitude IS NULL AND longitude IS NULL AND accuracy IS NULL AND captured_at IS NULL) OR
    (enabled AND latitude IS NOT NULL AND longitude IS NOT NULL AND accuracy IS NOT NULL AND captured_at IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 AND accuracy BETWEEN 0 AND 1000000))
);
ALTER TABLE public.allert_node_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.allert_node_locations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.allert_node_locations TO service_role;
CREATE FUNCTION public.save_allert_node_location(p_user_id uuid,p_device_id text,p_owner_epoch timestamptz,p_revision integer,p_location jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE device public.sensor_devices; saved public.allert_node_locations; label text; v_enabled boolean; lat double precision; lng double precision; v_accuracy double precision; captured timestamptz;
BEGIN
  SELECT * INTO device FROM sensor_devices WHERE device_id=p_device_id FOR UPDATE;
  IF NOT FOUND OR NOT device.is_active OR device.user_id IS DISTINCT FROM p_user_id OR coalesce(device.owner_since,'epoch'::timestamptz) IS DISTINCT FROM p_owner_epoch THEN RETURN jsonb_build_object('ok',false,'status',403,'error','Node is no longer assigned to this account.'); END IF;
  SELECT * INTO saved FROM allert_node_locations WHERE device_id=p_device_id AND user_id=p_user_id AND owner_epoch=p_owner_epoch;
  label:=btrim(p_location->>'label');
  IF p_user_id IS NULL OR p_revision IS NULL OR p_revision<0 OR p_revision>=1000000000 OR label IS NULL OR length(label)<1 OR length(label)>100 OR
    jsonb_typeof(p_location->'enabled') IS DISTINCT FROM 'boolean' THEN RETURN jsonb_build_object('ok',false,'status',400,'error','Invalid location.'); END IF;
  v_enabled:=(p_location->>'enabled')::boolean;
  IF v_enabled THEN
    BEGIN
      lat:=(p_location->>'latitude')::double precision;lng:=(p_location->>'longitude')::double precision;
      v_accuracy:=(p_location->>'accuracy')::double precision;captured:=(p_location->>'capturedAt')::timestamptz;
      IF lat IS NULL OR lng IS NULL OR v_accuracy IS NULL OR captured IS NULL OR NOT lat BETWEEN -90 AND 90 OR NOT lng BETWEEN -180 AND 180 OR NOT v_accuracy BETWEEN 0 AND 1000000 OR
        captured>clock_timestamp()+interval '1 minute' OR (captured<clock_timestamp()-interval '10 minutes' AND NOT coalesce(saved.enabled AND saved.latitude=lat AND saved.longitude=lng AND saved.accuracy=v_accuracy AND saved.captured_at=captured,false)) THEN RAISE EXCEPTION 'Invalid capture'; END IF;
    EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'status',400,'error','Capture a fresh valid position before saving.'); END;
  END IF;
  INSERT INTO allert_node_locations(device_id,user_id,owner_epoch) VALUES(p_device_id,p_user_id,coalesce(device.owner_since,'epoch'::timestamptz)) ON CONFLICT DO NOTHING;
  UPDATE allert_node_locations SET enabled=v_enabled,latitude=CASE WHEN v_enabled THEN round(lat::numeric,4)::double precision END,
    longitude=CASE WHEN v_enabled THEN round(lng::numeric,4)::double precision END,accuracy=CASE WHEN v_enabled THEN v_accuracy END,
    captured_at=CASE WHEN v_enabled THEN captured END,revision=revision+1,updated_at=clock_timestamp()
    WHERE device_id=p_device_id AND user_id=p_user_id AND owner_epoch=coalesce(device.owner_since,'epoch'::timestamptz) AND revision=p_revision RETURNING * INTO saved;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status',409,'error','Location changed in another tab. Refresh before saving.'); END IF;
  UPDATE sensor_devices SET location_label=label WHERE device_id=p_device_id;
  RETURN jsonb_build_object('ok',true,'location',to_jsonb(saved)||jsonb_build_object('label',label));
END; $$;
CREATE FUNCTION public.clear_allert_location_on_transfer() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.owner_since IS DISTINCT FROM OLD.owner_since THEN
    DELETE FROM public.allert_node_locations WHERE device_id=OLD.device_id;
    NEW.location_label:='Home';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER allert_clear_transferred_location BEFORE UPDATE OF user_id,owner_since ON public.sensor_devices
  FOR EACH ROW EXECUTE FUNCTION public.clear_allert_location_on_transfer();
REVOKE ALL ON FUNCTION public.save_allert_node_location(uuid,text,timestamptz,integer,jsonb),public.clear_allert_location_on_transfer() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_allert_node_location(uuid,text,timestamptz,integer,jsonb) TO service_role;
COMMIT;
