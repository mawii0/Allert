BEGIN;
CREATE TABLE public.allert_node_memberships (
  device_id text NOT NULL REFERENCES public.sensor_devices(device_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_epoch timestamptz NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  active boolean NOT NULL DEFAULT true,
  blocked boolean NOT NULL DEFAULT false,
  display_name text NOT NULL DEFAULT 'Family member' CHECK(length(display_name)<=100),
  PRIMARY KEY(device_id,user_id,owner_epoch)
);
CREATE INDEX ON public.allert_node_memberships(user_id) WHERE active;
CREATE TABLE public.allert_node_share_links (
  device_id text PRIMARY KEY REFERENCES public.sensor_devices(device_id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_epoch timestamptz NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE public.allert_share_attempts(user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,window_start timestamptz NOT NULL,attempts integer NOT NULL);
CREATE TABLE public.allert_alert_recipients (
  event_id uuid NOT NULL REFERENCES public.allert_anomaly_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_since timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(event_id,user_id)
);
CREATE INDEX ON public.allert_alert_recipients(next_attempt_at) WHERE status='pending';
ALTER TABLE public.allert_node_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allert_node_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allert_share_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allert_alert_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.allert_node_memberships,public.allert_node_share_links,public.allert_share_attempts,public.allert_alert_recipients FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.allert_node_memberships,public.allert_node_share_links,public.allert_alert_recipients TO service_role;

CREATE FUNCTION public.allert_share_attempt(p_user_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE attempts integer;
BEGIN
  INSERT INTO public.allert_share_attempts AS a VALUES(p_user_id,clock_timestamp(),1) ON CONFLICT(user_id) DO UPDATE SET
    window_start=CASE WHEN a.window_start<clock_timestamp()-interval '1 minute' THEN clock_timestamp() ELSE a.window_start END,
    attempts=CASE WHEN a.window_start<clock_timestamp()-interval '1 minute' THEN 1 ELSE a.attempts+1 END RETURNING a.attempts INTO attempts;
  RETURN attempts<=10;
END; $$;
CREATE FUNCTION public.set_allert_node_share_link(p_user_id uuid,p_device_id text,p_owner_epoch timestamptz,p_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE device public.sensor_devices; link public.allert_node_share_links;
BEGIN
  SELECT * INTO device FROM public.sensor_devices WHERE device_id=p_device_id FOR UPDATE;
  IF NOT FOUND OR NOT device.is_active OR device.user_id IS DISTINCT FROM p_user_id THEN RETURN jsonb_build_object('ok',false,'status',403,'error','Only the node owner can create or reset its private link.'); END IF;
  IF coalesce(device.owner_since,'epoch'::timestamptz) IS DISTINCT FROM p_owner_epoch THEN RETURN jsonb_build_object('ok',false,'status',409,'error','Node ownership changed. Refresh and check.'); END IF;
  IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid link hash'; END IF;
  INSERT INTO public.allert_node_share_links(device_id,owner_id,owner_epoch,token_hash) VALUES(p_device_id,p_user_id,coalesce(device.owner_since,'epoch'::timestamptz),p_hash)
  ON CONFLICT(device_id) DO UPDATE SET owner_id=excluded.owner_id,owner_epoch=excluded.owner_epoch,token_hash=excluded.token_hash,updated_at=clock_timestamp(),enabled=true RETURNING * INTO link;
  RETURN jsonb_build_object('ok',true,'updated_at',link.updated_at);
END; $$;
CREATE FUNCTION public.preview_allert_node_share(p_user_id uuid,p_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE link public.allert_node_share_links; device public.sensor_devices;
BEGIN
  IF NOT public.allert_share_attempt(p_user_id) THEN RETURN jsonb_build_object('ok',false,'status',429,'error','Too many attempts. Wait one minute.'); END IF;
  SELECT * INTO link FROM public.allert_node_share_links WHERE token_hash=p_hash AND enabled;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status',410,'error','This private link is unavailable. Ask the owner for the current link.'); END IF;
  SELECT * INTO device FROM public.sensor_devices WHERE device_id=link.device_id AND is_active AND user_id=link.owner_id AND coalesce(owner_since,'epoch'::timestamptz)=link.owner_epoch;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status',410,'error','This private link is unavailable. Ask the owner for the current link.'); END IF;
  RETURN jsonb_build_object('ok',true,'device_id',device.device_id,'location_label',device.location_label);
END; $$;
CREATE FUNCTION public.join_allert_node_share(p_user_id uuid,p_hash text,p_name text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE link public.allert_node_share_links; device public.sensor_devices; member public.allert_node_memberships;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,0));
  IF NOT public.allert_share_attempt(p_user_id) THEN RETURN jsonb_build_object('ok',false,'status',429,'error','Too many attempts. Wait one minute.'); END IF;
  SELECT * INTO link FROM public.allert_node_share_links WHERE token_hash=p_hash AND enabled;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status',410,'error','This private link is unavailable. Ask the owner for the current link.'); END IF;
  SELECT * INTO device FROM public.sensor_devices WHERE device_id=link.device_id FOR UPDATE;
  SELECT * INTO link FROM public.allert_node_share_links WHERE device_id=device.device_id FOR UPDATE;
  IF NOT link.enabled OR link.token_hash<>p_hash OR NOT device.is_active OR device.user_id IS DISTINCT FROM link.owner_id OR coalesce(device.owner_since,'epoch'::timestamptz) IS DISTINCT FROM link.owner_epoch THEN
    RETURN jsonb_build_object('ok',false,'status',410,'error','This private link is unavailable. Ask the owner for the current link.'); END IF;
  IF device.user_id=p_user_id THEN RETURN jsonb_build_object('ok',false,'status',409,'error','You already own this node.'); END IF;
  SELECT * INTO member FROM public.allert_node_memberships WHERE device_id=device.device_id AND user_id=p_user_id AND owner_epoch=link.owner_epoch;
  IF member.blocked THEN RETURN jsonb_build_object('ok',false,'status',403,'error','The owner removed your access. Ask them to allow you to join again.'); END IF;
  IF member.active THEN RETURN jsonb_build_object('ok',true,'device_id',device.device_id); END IF;
  IF EXISTS(SELECT 1 FROM public.sensor_devices WHERE user_id=p_user_id AND is_active) OR EXISTS(
    SELECT 1 FROM public.allert_node_memberships m JOIN public.sensor_devices d ON d.device_id=m.device_id AND d.user_id=m.owner_id AND coalesce(d.owner_since,'epoch'::timestamptz)=m.owner_epoch
    WHERE m.user_id=p_user_id AND m.active AND d.is_active AND m.device_id<>device.device_id) THEN
    RETURN jsonb_build_object('ok',false,'status',409,'error','Leave or unlink your current home before joining another.'); END IF;
  IF (SELECT count(*) FROM public.allert_node_memberships WHERE device_id=device.device_id AND owner_epoch=link.owner_epoch AND active)>=10 THEN
    RETURN jsonb_build_object('ok',false,'status',409,'error','This home already has ten family members.'); END IF;
  INSERT INTO public.allert_node_memberships(device_id,user_id,owner_id,owner_epoch,display_name) VALUES(device.device_id,p_user_id,device.user_id,link.owner_epoch,left(coalesce(nullif(trim(p_name),''),'Family member'),100))
    ON CONFLICT(device_id,user_id,owner_epoch) DO UPDATE SET active=true,blocked=false,joined_at=clock_timestamp(),display_name=excluded.display_name;
  RETURN jsonb_build_object('ok',true,'device_id',device.device_id);
END; $$;
CREATE FUNCTION public.manage_allert_node_share(p_actor uuid,p_device_id text,p_owner_epoch timestamptz,p_action text,p_target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE device public.sensor_devices;
BEGIN
  SELECT * INTO device FROM public.sensor_devices WHERE device_id=p_device_id FOR UPDATE;
  IF NOT FOUND OR NOT device.is_active THEN RETURN jsonb_build_object('ok',false,'status',403,'error','Node access is unavailable.'); END IF;
  IF coalesce(device.owner_since,'epoch'::timestamptz) IS DISTINCT FROM p_owner_epoch THEN RETURN jsonb_build_object('ok',false,'status',409,'error','Node ownership changed. Refresh and check.'); END IF;
  IF p_action='leave' THEN
    UPDATE public.allert_node_memberships SET active=false WHERE device_id=p_device_id AND user_id=p_actor AND owner_epoch=coalesce(device.owner_since,'epoch'::timestamptz) AND active;
    RETURN jsonb_build_object('ok',true);
  END IF;
  IF device.user_id IS DISTINCT FROM p_actor THEN RETURN jsonb_build_object('ok',false,'status',403,'error','Only the node owner can manage sharing.'); END IF;
  IF p_action='remove_member' THEN
    UPDATE public.allert_node_memberships SET active=false,blocked=true WHERE device_id=p_device_id AND user_id=p_target AND owner_epoch=coalesce(device.owner_since,'epoch'::timestamptz);
  ELSIF p_action='allow_member' THEN
    UPDATE public.allert_node_memberships SET blocked=false WHERE device_id=p_device_id AND user_id=p_target AND owner_epoch=coalesce(device.owner_since,'epoch'::timestamptz);
  ELSIF p_action='disable_link' THEN
    UPDATE public.allert_node_share_links SET enabled=false WHERE device_id=p_device_id AND owner_id=p_actor;
  ELSE RETURN jsonb_build_object('ok',false,'status',400,'error','Invalid sharing action.'); END IF;
  RETURN jsonb_build_object('ok',true);
END; $$;
CREATE FUNCTION public.reset_allert_household_sharing() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.owner_since IS DISTINCT FROM OLD.owner_since OR NEW.is_active AND NOT OLD.is_active THEN
    IF NEW.user_id IS NOT NULL THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.user_id::text,0));
      IF EXISTS(SELECT 1 FROM public.allert_node_memberships m JOIN public.sensor_devices d ON d.device_id=m.device_id AND d.user_id=m.owner_id AND coalesce(d.owner_since,'epoch'::timestamptz)=m.owner_epoch WHERE m.user_id=NEW.user_id AND m.active AND d.is_active AND m.device_id<>NEW.device_id) THEN
        RAISE EXCEPTION 'Leave the current shared home before owning another node'; END IF;
    END IF;
    UPDATE public.allert_node_memberships SET active=false WHERE device_id=OLD.device_id;
    UPDATE public.allert_node_share_links SET enabled=false WHERE device_id=OLD.device_id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER allert_reset_household_sharing BEFORE UPDATE OF user_id,owner_since,is_active ON public.sensor_devices FOR EACH ROW EXECUTE FUNCTION public.reset_allert_household_sharing();

CREATE FUNCTION public.queue_allert_family_alerts() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO public.allert_alert_recipients(event_id,user_id,access_since) VALUES(NEW.id,NEW.user_id,NEW.owner_epoch) ON CONFLICT DO NOTHING;
  INSERT INTO public.allert_alert_recipients(event_id,user_id,access_since)
    SELECT NEW.id,m.user_id,m.joined_at FROM public.allert_node_memberships m WHERE m.device_id=NEW.device_id AND m.owner_id=NEW.user_id AND m.owner_epoch=NEW.owner_epoch AND m.active AND m.joined_at<=NEW.observed_at ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER allert_queue_family_alerts AFTER INSERT ON public.allert_anomaly_events FOR EACH ROW EXECUTE FUNCTION public.queue_allert_family_alerts();
INSERT INTO public.allert_alert_recipients(event_id,user_id,access_since)
SELECT e.id,e.user_id,e.owner_epoch FROM public.allert_anomaly_events e JOIN public.allert_alert_outbox b ON b.event_id=e.id AND b.status='pending' ON CONFLICT DO NOTHING;

CREATE FUNCTION public.reserve_allert_family_push(p_event_id uuid,p_user_id uuid,p_vapid_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE event public.allert_anomaly_events; recipient public.allert_alert_recipients; device public.sensor_devices; settings public.allert_push_settings;
  preference jsonb; local_time text; rank integer; subscriptions jsonb;
BEGIN
  SELECT * INTO recipient FROM allert_alert_recipients WHERE event_id=p_event_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR recipient.status<>'pending' OR recipient.next_attempt_at>clock_timestamp() THEN RETURN jsonb_build_object('ok',true,'outcome','already_handled'); END IF;
  SELECT * INTO event FROM allert_anomaly_events WHERE id=p_event_id;
  SELECT * INTO device FROM sensor_devices WHERE device_id=event.device_id FOR UPDATE;
  IF NOT FOUND OR NOT device.is_active OR device.user_id IS DISTINCT FROM event.user_id OR coalesce(device.owner_since,'epoch'::timestamptz) IS DISTINCT FROM event.owner_epoch OR
     (p_user_id<>event.user_id AND NOT EXISTS(SELECT 1 FROM allert_node_memberships m WHERE m.device_id=device.device_id AND m.user_id=p_user_id AND m.owner_id=device.user_id AND m.owner_epoch=event.owner_epoch AND m.active AND m.joined_at=recipient.access_since AND m.joined_at<=event.observed_at)) THEN
    UPDATE allert_alert_recipients SET status='access_revoked' WHERE event_id=p_event_id AND user_id=p_user_id;RETURN jsonb_build_object('ok',true,'outcome','access_revoked'); END IF;
  IF event.observed_at<clock_timestamp()-interval '10 minutes' OR event.observed_at>clock_timestamp()+interval '1 minute' OR event.reading->>'created_at' IS NULL OR
    (event.reading->>'created_at')::timestamptz<clock_timestamp()-interval '10 minutes' OR (event.reading->>'created_at')::timestamptz>clock_timestamp()+interval '1 minute' THEN
    UPDATE allert_alert_recipients SET status='expired' WHERE event_id=p_event_id AND user_id=p_user_id;RETURN jsonb_build_object('ok',true,'outcome','expired'); END IF;
  INSERT INTO allert_push_settings(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
  SELECT * INTO settings FROM allert_push_settings WHERE user_id=p_user_id FOR UPDATE;
  SELECT value INTO preference FROM kv_store_a473accf WHERE key='notification-preferences:v1:'||p_user_id::text;
  IF preference->'enabled' IS DISTINCT FROM 'true'::jsonb THEN UPDATE allert_alert_recipients SET status='disabled' WHERE event_id=p_event_id AND user_id=p_user_id;RETURN jsonb_build_object('ok',true,'outcome','disabled'); END IF;
  local_time:=to_char(clock_timestamp() AT TIME ZONE 'Asia/Manila','HH24:MI');
  IF settings.quiet_enabled AND ((settings.quiet_start<settings.quiet_end AND local_time>=settings.quiet_start AND local_time<settings.quiet_end) OR (settings.quiet_start>settings.quiet_end AND (local_time>=settings.quiet_start OR local_time<settings.quiet_end))) THEN
    UPDATE allert_alert_recipients SET next_attempt_at=clock_timestamp()+interval '1 minute' WHERE event_id=p_event_id AND user_id=p_user_id;RETURN jsonb_build_object('ok',true,'outcome','quiet_hours'); END IF;
  rank:=CASE event.severity WHEN 'critical' THEN 3 WHEN 'warning' THEN 2 ELSE 1 END;
  IF settings.last_auto_at>clock_timestamp()-interval '15 minutes' AND rank<=settings.last_auto_rank THEN UPDATE allert_alert_recipients SET status='throttled' WHERE event_id=p_event_id AND user_id=p_user_id;RETURN jsonb_build_object('ok',true,'outcome','throttled'); END IF;
  WITH reserved AS (INSERT INTO allert_alert_deliveries(event_id,binding_id,user_id)
    SELECT event.id,s.id,p_user_id FROM allert_push_subscriptions s WHERE s.user_id=p_user_id AND s.vapid_key=p_vapid_key ON CONFLICT DO NOTHING RETURNING id,binding_id)
    SELECT coalesce(jsonb_agg(jsonb_build_object('deliveryId',r.id,'bindingId',r.binding_id,'subscription',jsonb_build_object('endpoint',s.endpoint,'keys',s.keys))),'[]'::jsonb) INTO subscriptions FROM reserved r JOIN allert_push_subscriptions s ON s.id=r.binding_id;
  UPDATE allert_alert_recipients SET status=CASE WHEN jsonb_array_length(subscriptions)>0 THEN 'attempted' ELSE 'no_subscription' END WHERE event_id=p_event_id AND user_id=p_user_id;
  IF NOT EXISTS(SELECT 1 FROM allert_alert_recipients WHERE event_id=p_event_id AND status='pending') THEN UPDATE allert_alert_outbox SET status='attempted' WHERE event_id=p_event_id; END IF;
  IF jsonb_array_length(subscriptions)>0 THEN UPDATE allert_push_settings SET last_auto_at=clock_timestamp(),last_auto_rank=rank WHERE user_id=p_user_id; END IF;
  RETURN jsonb_build_object('ok',true,'outcome','reserved','deliveries',subscriptions);
END; $$;


CREATE FUNCTION public.reserve_allert_family_event(p_event_id uuid,p_vapid_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE recipient record; result jsonb; deliveries jsonb:='[]'::jsonb;
BEGIN
  FOR recipient IN SELECT user_id FROM public.allert_alert_recipients WHERE event_id=p_event_id AND status='pending' AND next_attempt_at<=clock_timestamp() ORDER BY user_id LOOP
    result:=public.reserve_allert_family_push(p_event_id,recipient.user_id,p_vapid_key);
    IF result->>'outcome'='reserved' THEN deliveries:=deliveries || coalesce(result->'deliveries','[]'::jsonb); END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM public.allert_alert_recipients WHERE event_id=p_event_id AND status='pending') THEN UPDATE public.allert_alert_outbox SET status='processed' WHERE event_id=p_event_id; END IF;
  RETURN jsonb_build_object('ok',true,'outcome','reserved','deliveries',deliveries);
END; $$;
REVOKE ALL ON FUNCTION public.reserve_allert_family_event(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_allert_family_event(uuid,text) TO service_role;

REVOKE ALL ON FUNCTION public.allert_share_attempt(uuid),public.set_allert_node_share_link(uuid,text,timestamptz,text),public.preview_allert_node_share(uuid,text),public.join_allert_node_share(uuid,text,text),public.manage_allert_node_share(uuid,text,timestamptz,text,uuid),public.reset_allert_household_sharing(),public.queue_allert_family_alerts(),public.reserve_allert_family_push(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_allert_node_share_link(uuid,text,timestamptz,text),public.preview_allert_node_share(uuid,text),public.join_allert_node_share(uuid,text,text),public.manage_allert_node_share(uuid,text,timestamptz,text,uuid),public.reserve_allert_family_push(uuid,uuid,text) TO service_role;
-- Capture remains private to each account; membership authorizes only this node.
CREATE OR REPLACE FUNCTION public.record_allert_forecast_evidence(p_user_id uuid,p_device_id text,p_owner_epoch timestamptz,p_forecasts jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE device public.sensor_devices%ROWTYPE; item jsonb; received timestamptz:=clock_timestamp();
BEGIN
  SELECT * INTO device FROM public.sensor_devices WHERE device_id=p_device_id FOR SHARE;
  IF NOT FOUND OR NOT device.is_active OR (device.user_id IS DISTINCT FROM p_user_id AND NOT EXISTS(SELECT 1 FROM public.allert_node_memberships m WHERE m.device_id=p_device_id AND m.user_id=p_user_id AND m.owner_id=device.user_id AND m.owner_epoch=p_owner_epoch AND m.active AND m.joined_at<=received)) OR coalesce(device.owner_since,'1970-01-01'::timestamptz) IS DISTINCT FROM p_owner_epoch THEN
    RETURN jsonb_build_object('ok',false,'status',409);
  END IF;
  IF jsonb_typeof(p_forecasts) IS DISTINCT FROM 'array' OR jsonb_array_length(p_forecasts)<>6 THEN RAISE EXCEPTION 'Six verified forecast records are required'; END IF;
  IF (SELECT count(DISTINCT ((value->>'horizon') || ':' || (value->>'population'))) FROM jsonb_array_elements(p_forecasts))<>6 THEN RAISE EXCEPTION 'Duplicate forecast horizon or population'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_forecasts) LOOP
    IF (item->>'origin')::timestamptz>received OR received-(item->>'origin')::timestamptz>interval '20 minutes' OR (item->>'target')::timestamptz<=received THEN RAISE EXCEPTION 'Forecast must be recorded prospectively'; END IF;
    INSERT INTO public.allert_forecast_evidence(user_id,device_id,owner_epoch,origin,target,captured_at,horizon_hours,population,score,tier,policy_hash,model_id)
    VALUES(p_user_id,p_device_id,p_owner_epoch,(item->>'origin')::timestamptz,(item->>'target')::timestamptz,received,(item->>'horizon')::integer,item->>'population',(item->>'score')::double precision,item->>'tier',item->>'policy_hash',item->>'model_id')
    ON CONFLICT(user_id,device_id,owner_epoch,origin,horizon_hours,population,policy_hash) DO NOTHING;
  END LOOP;
  RETURN jsonb_build_object('ok',true);
END;
$$;


COMMIT;
