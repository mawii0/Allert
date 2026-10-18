BEGIN;
CREATE TABLE public.allert_detector_state (
  device_id text NOT NULL REFERENCES public.sensor_devices(device_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_epoch timestamptz NOT NULL,
  revision integer NOT NULL DEFAULT 0,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'warming_up',
  baseline_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(device_id,user_id,owner_epoch)
);
CREATE TABLE public.allert_anomaly_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL REFERENCES public.sensor_devices(device_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_epoch timestamptz NOT NULL,
  observed_at timestamptz NOT NULL,
  severity text NOT NULL CHECK(severity IN ('watch','warning','critical')),
  policy_version text NOT NULL,
  metrics jsonb NOT NULL,
  reading jsonb NOT NULL,
  baseline jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(device_id,user_id,owner_epoch,observed_at,policy_version)
);
CREATE INDEX ON public.allert_anomaly_events(user_id,observed_at DESC);
CREATE INDEX ON public.allert_anomaly_events(observed_at DESC);
CREATE TABLE public.allert_alert_outbox (
  event_id uuid PRIMARY KEY REFERENCES public.allert_anomaly_events(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  next_attempt_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.allert_alert_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.allert_anomaly_events(id) ON DELETE CASCADE,
  binding_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'attempted',
  http_status integer,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(event_id,binding_id)
);
CREATE INDEX ON public.allert_alert_outbox(next_attempt_at) WHERE status='pending';
CREATE INDEX ON public.allert_alert_deliveries(attempted_at) WHERE status='accepted';
CREATE TABLE public.allert_alert_worker (
  id integer PRIMARY KEY CHECK(id=1),
  run_id uuid,
  lease_until timestamptz,
  cursor_device text NOT NULL DEFAULT '',
  last_finished_at timestamptz,
  last_success_at timestamptz,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb
);
INSERT INTO public.allert_alert_worker(id) VALUES(1);
ALTER TABLE public.allert_push_settings ADD COLUMN last_auto_at timestamptz;
ALTER TABLE public.allert_push_settings ADD COLUMN last_auto_rank integer NOT NULL DEFAULT 0;
ALTER TABLE public.allert_detector_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allert_anomaly_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allert_alert_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allert_alert_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allert_alert_worker ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.allert_detector_state,public.allert_anomaly_events,public.allert_alert_outbox,public.allert_alert_deliveries,public.allert_alert_worker FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.allert_detector_state,public.allert_anomaly_events,public.allert_alert_outbox,public.allert_alert_deliveries,public.allert_alert_worker TO service_role;

CREATE FUNCTION public.begin_allert_alert_run(p_run_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result public.allert_alert_worker;
BEGIN
  UPDATE allert_alert_worker SET run_id=p_run_id,lease_until=clock_timestamp()+interval '50 seconds'
  WHERE id=1 AND (lease_until IS NULL OR lease_until<clock_timestamp()) RETURNING * INTO result;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'outcome','busy'); END IF;
  RETURN jsonb_build_object('ok',true,'outcome','started','cursor',result.cursor_device);
END; $$;
CREATE FUNCTION public.finish_allert_alert_run(p_run_id uuid,p_cursor text,p_summary jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  UPDATE allert_alert_worker SET lease_until=NULL,cursor_device=left(coalesce(p_cursor,''),200),last_finished_at=clock_timestamp(),
    last_success_at=CASE WHEN coalesce((p_summary->>'errors')::integer,1)=0 THEN clock_timestamp() ELSE last_success_at END,
    summary=p_summary WHERE id=1 AND run_id=p_run_id;
  RETURN jsonb_build_object('ok',FOUND);
END; $$;
CREATE FUNCTION public.record_allert_detection(p_device_id text,p_user_id uuid,p_owner_epoch timestamptz,p_revision integer,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE device public.sensor_devices; previous public.allert_detector_state; event jsonb; event_id uuid; added integer:=0;
BEGIN
  SELECT * INTO device FROM sensor_devices WHERE device_id=p_device_id FOR UPDATE;
  IF NOT FOUND OR NOT device.is_active OR device.user_id IS DISTINCT FROM p_user_id OR coalesce(device.owner_since,'epoch'::timestamptz) IS DISTINCT FROM p_owner_epoch THEN
    RETURN jsonb_build_object('ok',false,'status',409,'error','Node ownership changed.'); END IF;
  IF jsonb_typeof(p_result->'events') IS DISTINCT FROM 'array' OR jsonb_array_length(p_result->'events')>100 OR
     jsonb_typeof(p_result->'state') IS DISTINCT FROM 'object' OR p_result->>'status' NOT IN ('warming_up','ready') THEN
    RETURN jsonb_build_object('ok',false,'status',400,'error','Invalid detection result.'); END IF;
  INSERT INTO allert_detector_state(device_id,user_id,owner_epoch) VALUES(p_device_id,p_user_id,p_owner_epoch) ON CONFLICT DO NOTHING;
  SELECT * INTO previous FROM allert_detector_state WHERE device_id=p_device_id AND user_id=p_user_id AND owner_epoch=p_owner_epoch FOR UPDATE;
  IF previous.revision<>p_revision THEN RETURN jsonb_build_object('ok',false,'status',409,'error','Detection state changed.'); END IF;
  IF previous.state->>'last_timestamp' IS NOT NULL AND (p_result->'state'->>'last_timestamp')::timestamptz < (previous.state->>'last_timestamp')::timestamptz THEN
    RETURN jsonb_build_object('ok',false,'status',409,'error','Old detection result.'); END IF;
  FOR event IN SELECT value FROM jsonb_array_elements(p_result->'events') LOOP
    IF (event->>'observed_at')::timestamptz<p_owner_epoch OR (event->>'observed_at')::timestamptz>clock_timestamp()+interval '1 minute' THEN
      RAISE EXCEPTION 'Invalid event timestamp'; END IF;
    INSERT INTO allert_anomaly_events(device_id,user_id,owner_epoch,observed_at,severity,policy_version,metrics,reading,baseline)
      VALUES(p_device_id,p_user_id,p_owner_epoch,(event->>'observed_at')::timestamptz,event->>'severity',event->>'policy_version',event->'metrics',event->'reading',event->'baseline')
      ON CONFLICT DO NOTHING RETURNING id INTO event_id;
    IF FOUND THEN
      INSERT INTO allert_alert_outbox(event_id,status) VALUES(event_id,CASE WHEN (event->>'observed_at')::timestamptz<clock_timestamp()-interval '10 minutes' THEN 'expired' ELSE 'pending' END);
      added:=added+1;
    END IF;
  END LOOP;
  UPDATE allert_detector_state SET state=p_result->'state',status=p_result->>'status',baseline_count=(p_result->>'baseline_count')::integer,revision=revision+1,updated_at=clock_timestamp()
    WHERE device_id=p_device_id AND user_id=p_user_id AND owner_epoch=p_owner_epoch;
  RETURN jsonb_build_object('ok',true,'added',added);
END; $$;
CREATE FUNCTION public.reserve_allert_anomaly_push(p_event_id uuid,p_vapid_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE event public.allert_anomaly_events; settings public.allert_push_settings; device public.sensor_devices;
  box public.allert_alert_outbox; preference jsonb; local_time text; rank integer; subscriptions jsonb;
BEGIN
  SELECT * INTO box FROM allert_alert_outbox WHERE event_id=p_event_id FOR UPDATE;
  IF NOT FOUND OR box.status<>'pending' OR box.next_attempt_at>clock_timestamp() THEN RETURN jsonb_build_object('ok',true,'outcome','already_handled'); END IF;
  SELECT * INTO event FROM allert_anomaly_events WHERE id=p_event_id;
  SELECT * INTO device FROM sensor_devices WHERE device_id=event.device_id FOR UPDATE;
  IF NOT FOUND OR NOT device.is_active OR device.user_id IS DISTINCT FROM event.user_id OR coalesce(device.owner_since,'epoch'::timestamptz) IS DISTINCT FROM event.owner_epoch THEN
    UPDATE allert_alert_outbox SET status='ownership_changed' WHERE event_id=p_event_id;RETURN jsonb_build_object('ok',true,'outcome','ownership_changed'); END IF;
  IF event.observed_at<clock_timestamp()-interval '10 minutes' OR event.observed_at>clock_timestamp()+interval '1 minute' OR event.reading->>'created_at' IS NULL OR
    (event.reading->>'created_at')::timestamptz<clock_timestamp()-interval '10 minutes' OR (event.reading->>'created_at')::timestamptz>clock_timestamp()+interval '1 minute' THEN
    UPDATE allert_alert_outbox SET status='expired' WHERE event_id=p_event_id;RETURN jsonb_build_object('ok',true,'outcome','expired'); END IF;
  INSERT INTO allert_push_settings(user_id) VALUES(event.user_id) ON CONFLICT DO NOTHING;
  SELECT * INTO settings FROM allert_push_settings WHERE user_id=event.user_id FOR UPDATE;
  SELECT value INTO preference FROM kv_store_a473accf WHERE key='notification-preferences:v1:'||event.user_id::text;
  IF preference->'enabled' IS DISTINCT FROM 'true'::jsonb THEN
    UPDATE allert_alert_outbox SET status='disabled' WHERE event_id=p_event_id;RETURN jsonb_build_object('ok',true,'outcome','disabled'); END IF;
  local_time:=to_char(clock_timestamp() AT TIME ZONE 'Asia/Manila','HH24:MI');
  IF settings.quiet_enabled AND ((settings.quiet_start<settings.quiet_end AND local_time>=settings.quiet_start AND local_time<settings.quiet_end) OR
    (settings.quiet_start>settings.quiet_end AND (local_time>=settings.quiet_start OR local_time<settings.quiet_end))) THEN
    UPDATE allert_alert_outbox SET next_attempt_at=clock_timestamp()+interval '1 minute' WHERE event_id=p_event_id;
    RETURN jsonb_build_object('ok',true,'outcome','quiet_hours'); END IF;
  rank:=CASE event.severity WHEN 'critical' THEN 3 WHEN 'warning' THEN 2 ELSE 1 END;
  IF settings.last_auto_at>clock_timestamp()-interval '15 minutes' AND rank<=settings.last_auto_rank THEN
    UPDATE allert_alert_outbox SET status='throttled' WHERE event_id=p_event_id;RETURN jsonb_build_object('ok',true,'outcome','throttled'); END IF;
  WITH reserved AS (
    INSERT INTO allert_alert_deliveries(event_id,binding_id,user_id)
    SELECT event.id,s.id,event.user_id FROM allert_push_subscriptions s WHERE s.user_id=event.user_id AND s.vapid_key=p_vapid_key
    ON CONFLICT DO NOTHING RETURNING id,binding_id
  ) SELECT coalesce(jsonb_agg(jsonb_build_object('deliveryId',r.id,'bindingId',r.binding_id,'subscription',jsonb_build_object('endpoint',s.endpoint,'keys',s.keys))),'[]'::jsonb)
    INTO subscriptions FROM reserved r JOIN allert_push_subscriptions s ON s.id=r.binding_id;
  UPDATE allert_alert_outbox SET status=CASE WHEN jsonb_array_length(subscriptions)>0 THEN 'attempted' ELSE 'no_subscription' END WHERE event_id=p_event_id;
  IF jsonb_array_length(subscriptions)>0 THEN UPDATE allert_push_settings SET last_auto_at=clock_timestamp(),last_auto_rank=rank WHERE user_id=event.user_id; END IF;
  RETURN jsonb_build_object('ok',true,'outcome','reserved','deliveries',subscriptions);
END; $$;
CREATE FUNCTION public.finish_allert_anomaly_push(p_delivery_id uuid,p_http_status integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result public.allert_alert_deliveries;
BEGIN
  UPDATE allert_alert_deliveries SET http_status=p_http_status,completed_at=clock_timestamp(),status=CASE
    WHEN p_http_status BETWEEN 200 AND 299 THEN 'accepted' WHEN p_http_status IN (404,410) THEN 'expired' WHEN p_http_status IS NULL THEN 'uncertain' ELSE 'rejected' END
    WHERE id=p_delivery_id AND status='attempted' RETURNING * INTO result;
  IF FOUND AND p_http_status IN (404,410) THEN DELETE FROM allert_push_subscriptions WHERE id=result.binding_id AND user_id=result.user_id; END IF;
  RETURN jsonb_build_object('ok',FOUND);
END; $$;
REVOKE ALL ON FUNCTION public.begin_allert_alert_run(uuid),public.finish_allert_alert_run(uuid,text,jsonb),public.record_allert_detection(text,uuid,timestamptz,integer,jsonb),public.reserve_allert_anomaly_push(uuid,text),public.finish_allert_anomaly_push(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_allert_alert_run(uuid),public.finish_allert_alert_run(uuid,text,jsonb),public.record_allert_detection(text,uuid,timestamptz,integer,jsonb),public.reserve_allert_anomaly_push(uuid,text),public.finish_allert_anomaly_push(uuid,integer) TO service_role;
COMMIT;
