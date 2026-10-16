BEGIN;
CREATE TABLE public.allert_forecast_worker (
 device_id text PRIMARY KEY REFERENCES public.sensor_devices(device_id),
 owner_epoch timestamptz NOT NULL,run_id uuid,lease_until timestamptz,last_attempt_at timestamptz,last_finished_at timestamptz,last_success_at timestamptz,
 status text NOT NULL DEFAULT 'not_started',summary jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.allert_forecast_notices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),device_id text NOT NULL REFERENCES public.sensor_devices(device_id),
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,owner_epoch timestamptz NOT NULL,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,access_since timestamptz NOT NULL,
 origin timestamptz NOT NULL,target timestamptz NOT NULL,horizon_hours integer NOT NULL CHECK(horizon_hours IN(6,12,24)),
 population text NOT NULL CHECK(population IN('adult','pediatric')),tier text NOT NULL CHECK(tier IN('low','moderate','high','very_high')),
 score double precision NOT NULL CHECK(score>=0 AND score<=100),policy_hash text NOT NULL,
 status text NOT NULL DEFAULT 'pending',next_attempt_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(device_id,owner_epoch,user_id,origin,policy_hash),CHECK(target=origin+make_interval(hours=>horizon_hours))
);
CREATE INDEX ON public.allert_forecast_notices(user_id,device_id,origin DESC);
CREATE INDEX ON public.allert_forecast_notices(next_attempt_at) WHERE status='pending';
CREATE TABLE public.allert_forecast_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL REFERENCES public.allert_forecast_notices(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,binding_id uuid NOT NULL,status text NOT NULL DEFAULT 'attempted',
 http_status integer,attempted_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,UNIQUE(event_id,binding_id)
);
ALTER TABLE public.allert_push_settings ADD COLUMN last_forecast_at timestamptz,ADD COLUMN last_forecast_rank integer NOT NULL DEFAULT 0;
ALTER TABLE public.allert_forecast_worker ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allert_forecast_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allert_forecast_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.allert_forecast_worker,public.allert_forecast_notices,public.allert_forecast_deliveries FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.allert_forecast_worker,public.allert_forecast_notices,public.allert_forecast_deliveries TO service_role;
CREATE FUNCTION public.begin_allert_forecast_run(p_device_id text,p_run_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE device public.sensor_devices; result public.allert_forecast_worker;
BEGIN
 SELECT * INTO device FROM public.sensor_devices WHERE device_id=p_device_id AND is_active AND user_id IS NOT NULL FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'outcome','no_active_owner'); END IF;
 INSERT INTO public.allert_forecast_worker(device_id,owner_epoch) VALUES(p_device_id,coalesce(device.owner_since,'epoch'::timestamptz)) ON CONFLICT DO NOTHING;
 UPDATE public.allert_forecast_worker SET run_id=p_run_id,lease_until=clock_timestamp()+interval '50 seconds',last_attempt_at=clock_timestamp(),
 status=CASE WHEN owner_epoch IS DISTINCT FROM coalesce(device.owner_since,'epoch'::timestamptz) THEN 'not_started' ELSE status END,
 summary=CASE WHEN owner_epoch IS DISTINCT FROM coalesce(device.owner_since,'epoch'::timestamptz) THEN '{}'::jsonb ELSE summary END,
 last_finished_at=CASE WHEN owner_epoch IS DISTINCT FROM coalesce(device.owner_since,'epoch'::timestamptz) THEN NULL ELSE last_finished_at END,
 last_success_at=CASE WHEN owner_epoch IS DISTINCT FROM coalesce(device.owner_since,'epoch'::timestamptz) THEN NULL ELSE last_success_at END,
 owner_epoch=coalesce(device.owner_since,'epoch'::timestamptz)
 WHERE device_id=p_device_id AND (owner_epoch IS DISTINCT FROM coalesce(device.owner_since,'epoch'::timestamptz) OR ((lease_until IS NULL OR lease_until<clock_timestamp()) AND (last_attempt_at IS NULL OR last_attempt_at<clock_timestamp()-interval '45 seconds'))) RETURNING * INTO result;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'outcome','busy'); END IF;
 RETURN jsonb_build_object('ok',true,'outcome','started','device',to_jsonb(device),'previous',result.summary);
END; $$;
CREATE FUNCTION public.finish_allert_forecast_run(p_device_id text,p_owner_epoch timestamptz,p_run_id uuid,p_status text,p_summary jsonb,p_forecasts jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE device public.sensor_devices; recipient record; item jsonb; chosen jsonb; profile jsonb; origin_time timestamptz; epoch timestamptz; recorded jsonb;
BEGIN
 SELECT * INTO device FROM public.sensor_devices WHERE device_id=p_device_id FOR UPDATE;
 epoch:=coalesce(device.owner_since,'epoch'::timestamptz);
 IF NOT FOUND OR NOT device.is_active OR device.user_id IS NULL OR epoch IS DISTINCT FROM p_owner_epoch THEN RETURN jsonb_build_object('ok',false,'status',409); END IF;
 PERFORM 1 FROM public.allert_forecast_worker WHERE device_id=p_device_id AND run_id=p_run_id AND lease_until>=clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status',409); END IF;
 IF p_status='ready' THEN
  IF jsonb_typeof(p_forecasts) IS DISTINCT FROM 'array' OR jsonb_array_length(p_forecasts)<>6 THEN RAISE EXCEPTION 'Six verified forecasts required'; END IF;
  origin_time:=(p_forecasts->0->>'origin')::timestamptz;
  IF origin_time<epoch OR origin_time>clock_timestamp() OR origin_time<clock_timestamp()-interval '20 minutes' THEN RAISE EXCEPTION 'Invalid forecast origin'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_forecasts) LOOP
   IF (item->>'origin')::timestamptz IS DISTINCT FROM origin_time OR item->>'policy_hash' IS DISTINCT FROM 'e6dd0b1683ce5786d9e405697bfb9e98d04b0b7dc655cd1344b5f1237201d555' OR item->>'model_id' IS DISTINCT FROM 'median-residual-single-v1' THEN RAISE EXCEPTION 'Unverified forecast policy'; END IF;
  END LOOP;
  FOR recipient IN SELECT device.user_id AS user_id,epoch AS access_since UNION
   SELECT m.user_id,m.joined_at FROM public.allert_node_memberships m WHERE m.device_id=p_device_id AND m.owner_id=device.user_id AND m.owner_epoch=epoch AND m.active AND m.joined_at<=clock_timestamp()
  LOOP
   recorded:=public.record_allert_forecast_evidence(recipient.user_id,p_device_id,epoch,p_forecasts);
   IF recorded->'ok' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Forecast access changed'; END IF;
   SELECT value INTO profile FROM public.kv_store_a473accf WHERE key='profile:'||recipient.user_id::text;
   IF profile->>'demographic' NOT IN('adult','pediatric') OR profile->>'demographic' IS NULL THEN CONTINUE; END IF;
   SELECT value INTO chosen FROM jsonb_array_elements(p_forecasts) WHERE value->>'population'=profile->>'demographic'
    ORDER BY CASE value->>'tier' WHEN 'very_high' THEN 4 WHEN 'high' THEN 3 WHEN 'moderate' THEN 2 ELSE 1 END DESC,(value->>'horizon')::integer LIMIT 1;
   INSERT INTO public.allert_forecast_notices(device_id,owner_id,owner_epoch,user_id,access_since,origin,target,horizon_hours,population,tier,score,policy_hash,status)
   VALUES(p_device_id,device.user_id,epoch,recipient.user_id,recipient.access_since,origin_time,(chosen->>'target')::timestamptz,(chosen->>'horizon')::integer,
    chosen->>'population',chosen->>'tier',(chosen->>'score')::double precision,chosen->>'policy_hash',
    CASE WHEN recipient.access_since>origin_time THEN 'joined_after_origin' WHEN chosen->>'tier' IN('high','very_high') THEN 'pending' ELSE 'below_threshold' END)
   ON CONFLICT DO NOTHING;
  END LOOP;
 END IF;
 UPDATE public.allert_forecast_worker SET lease_until=NULL,last_finished_at=clock_timestamp(),status=left(p_status,80),summary=p_summary,
 last_success_at=CASE WHEN p_status='ready' THEN clock_timestamp() ELSE last_success_at END WHERE device_id=p_device_id AND run_id=p_run_id;
 RETURN jsonb_build_object('ok',true);
END; $$;
CREATE FUNCTION public.reserve_allert_forecast_push(p_event_id uuid,p_vapid_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE event public.allert_forecast_notices; device public.sensor_devices; settings public.allert_push_settings; pref jsonb; profile jsonb; local_time text; rank integer; deliveries jsonb;
BEGIN
 SELECT * INTO event FROM public.allert_forecast_notices WHERE id=p_event_id FOR UPDATE;
 IF NOT FOUND OR event.status<>'pending' OR event.next_attempt_at>clock_timestamp() THEN RETURN jsonb_build_object('ok',true,'outcome','handled'); END IF;
 SELECT * INTO device FROM public.sensor_devices WHERE device_id=event.device_id FOR SHARE;
 IF NOT FOUND OR NOT device.is_active OR device.user_id IS DISTINCT FROM event.owner_id OR coalesce(device.owner_since,'epoch'::timestamptz) IS DISTINCT FROM event.owner_epoch OR
  (event.user_id<>device.user_id AND NOT EXISTS(SELECT 1 FROM public.allert_node_memberships m WHERE m.device_id=device.device_id AND m.user_id=event.user_id AND m.owner_id=device.user_id AND m.owner_epoch=event.owner_epoch AND m.active AND m.joined_at=event.access_since)) THEN
  UPDATE public.allert_forecast_notices SET status='access_revoked' WHERE id=p_event_id;RETURN jsonb_build_object('ok',true,'outcome','access_revoked'); END IF;
 IF event.origin<clock_timestamp()-interval '20 minutes' OR event.origin>clock_timestamp() OR event.target<=clock_timestamp() THEN
  UPDATE public.allert_forecast_notices SET status='expired' WHERE id=p_event_id;RETURN jsonb_build_object('ok',true,'outcome','expired'); END IF;
 SELECT value INTO profile FROM public.kv_store_a473accf WHERE key='profile:'||event.user_id::text;
 IF profile->>'demographic' IS DISTINCT FROM event.population THEN UPDATE public.allert_forecast_notices SET status='category_changed' WHERE id=p_event_id;RETURN jsonb_build_object('ok',true,'outcome','category_changed'); END IF;
 SELECT value INTO pref FROM public.kv_store_a473accf WHERE key='notification-preferences:v1:'||event.user_id::text;
 IF pref->'enabled' IS DISTINCT FROM 'true'::jsonb THEN UPDATE public.allert_forecast_notices SET status='disabled' WHERE id=p_event_id;RETURN jsonb_build_object('ok',true,'outcome','disabled'); END IF;
 INSERT INTO public.allert_push_settings(user_id) VALUES(event.user_id) ON CONFLICT DO NOTHING;
 SELECT * INTO settings FROM public.allert_push_settings WHERE user_id=event.user_id FOR UPDATE;
 local_time:=to_char(clock_timestamp() AT TIME ZONE 'Asia/Manila','HH24:MI');
 IF settings.quiet_enabled AND ((settings.quiet_start<settings.quiet_end AND local_time>=settings.quiet_start AND local_time<settings.quiet_end) OR (settings.quiet_start>settings.quiet_end AND (local_time>=settings.quiet_start OR local_time<settings.quiet_end))) THEN
  UPDATE public.allert_forecast_notices SET next_attempt_at=clock_timestamp()+interval '1 minute' WHERE id=p_event_id;RETURN jsonb_build_object('ok',true,'outcome','quiet_hours'); END IF;
 rank:=CASE event.tier WHEN 'very_high' THEN 4 ELSE 3 END;
 IF settings.last_forecast_at>clock_timestamp()-interval '1 hour' AND rank<=settings.last_forecast_rank THEN
  UPDATE public.allert_forecast_notices SET status='throttled' WHERE id=p_event_id;RETURN jsonb_build_object('ok',true,'outcome','throttled'); END IF;
 WITH reserved AS (INSERT INTO public.allert_forecast_deliveries(event_id,user_id,binding_id)
  SELECT event.id,event.user_id,s.id FROM public.allert_push_subscriptions s WHERE s.user_id=event.user_id AND s.vapid_key=p_vapid_key ON CONFLICT DO NOTHING RETURNING id,binding_id)
 SELECT coalesce(jsonb_agg(jsonb_build_object('deliveryId',r.id,'bindingId',r.binding_id,'subscription',jsonb_build_object('endpoint',s.endpoint,'keys',s.keys))),'[]'::jsonb)
 INTO deliveries FROM reserved r JOIN public.allert_push_subscriptions s ON s.id=r.binding_id;
 UPDATE public.allert_forecast_notices SET status=CASE WHEN jsonb_array_length(deliveries)>0 THEN 'attempted' ELSE 'no_subscription' END WHERE id=p_event_id;
 IF jsonb_array_length(deliveries)>0 THEN UPDATE public.allert_push_settings SET last_forecast_at=clock_timestamp(),last_forecast_rank=rank WHERE user_id=event.user_id; END IF;
 RETURN jsonb_build_object('ok',true,'outcome','reserved','deliveries',deliveries);
END; $$;
CREATE FUNCTION public.finish_allert_forecast_push(p_delivery_id uuid,p_http_status integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result public.allert_forecast_deliveries;
BEGIN
 UPDATE public.allert_forecast_deliveries SET http_status=p_http_status,completed_at=clock_timestamp(),status=CASE WHEN p_http_status BETWEEN 200 AND 299 THEN 'accepted' WHEN p_http_status IN(404,410) THEN 'expired' WHEN p_http_status IS NULL THEN 'uncertain' ELSE 'rejected' END
 WHERE id=p_delivery_id AND status='attempted' RETURNING * INTO result;
 IF FOUND AND p_http_status IN(404,410) THEN DELETE FROM public.allert_push_subscriptions WHERE id=result.binding_id AND user_id=result.user_id; END IF;
 RETURN jsonb_build_object('ok',FOUND);
END; $$;
REVOKE ALL ON FUNCTION public.begin_allert_forecast_run(text,uuid),public.finish_allert_forecast_run(text,timestamptz,uuid,text,jsonb,jsonb),public.reserve_allert_forecast_push(uuid,text),public.finish_allert_forecast_push(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_allert_forecast_run(text,uuid),public.finish_allert_forecast_run(text,timestamptz,uuid,text,jsonb,jsonb),public.reserve_allert_forecast_push(uuid,text),public.finish_allert_forecast_push(uuid,integer) TO service_role;
COMMIT;
