BEGIN;
CREATE TABLE public.allert_push_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  quiet_enabled boolean NOT NULL DEFAULT false,
  quiet_start text NOT NULL DEFAULT '22:00' CHECK (quiet_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  quiet_end text NOT NULL DEFAULT '07:00' CHECK (quiet_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0 AND revision <= 1000000000),
  last_test_at timestamptz,
  CHECK (quiet_start <> quiet_end)
);
CREATE TABLE public.allert_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (length(endpoint) <= 2048),
  keys jsonb NOT NULL,
  vapid_key text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.allert_push_subscriptions(user_id);
CREATE TABLE public.allert_push_test_requests (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);
ALTER TABLE public.allert_push_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allert_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allert_push_test_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.allert_push_settings, public.allert_push_subscriptions, public.allert_push_test_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.allert_push_settings TO service_role;
GRANT SELECT, DELETE ON public.allert_push_subscriptions TO service_role;

CREATE FUNCTION public.set_allert_quiet_hours(p_user_id uuid, p_enabled boolean, p_start text, p_end text, p_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result public.allert_push_settings;
BEGIN
  IF p_user_id IS NULL OR p_enabled IS NULL OR p_start IS NULL OR p_end IS NULL OR p_revision IS NULL OR p_revision < 0 OR p_revision >= 1000000000 OR
    p_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR p_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR p_start = p_end THEN
    RETURN jsonb_build_object('ok',false,'status',400,'error','Invalid quiet hours.');
  END IF;
  INSERT INTO public.allert_push_settings(user_id) VALUES (p_user_id) ON CONFLICT DO NOTHING;
  UPDATE public.allert_push_settings SET quiet_enabled=p_enabled, quiet_start=p_start, quiet_end=p_end, revision=revision+1
    WHERE user_id=p_user_id AND revision=p_revision RETURNING * INTO result;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status',409,'error','Quiet hours changed in another tab. Refresh settings.'); END IF;
  RETURN jsonb_build_object('ok',true,'quietHours',jsonb_build_object('enabled',result.quiet_enabled,'start',result.quiet_start,'end',result.quiet_end,'revision',result.revision,'timezone','Asia/Manila'));
END;
$$;

CREATE FUNCTION public.connect_allert_push(p_user_id uuid, p_subscription jsonb, p_vapid_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE connection public.allert_push_subscriptions;
BEGIN
  IF p_user_id IS NULL OR p_subscription IS NULL OR p_vapid_key IS NULL OR length(p_vapid_key) <> 87 OR
     p_subscription->>'endpoint' IS NULL OR p_subscription->>'endpoint' !~ '^https://fcm[.]googleapis[.]com/(fcm/send|wp)/[A-Za-z0-9_:.-]+$' OR
     length(p_subscription->>'endpoint') > 2048 OR jsonb_typeof(p_subscription->'keys') IS DISTINCT FROM 'object' OR
     p_subscription->'keys'->>'auth' IS NULL OR p_subscription->'keys'->>'p256dh' IS NULL THEN
    RETURN jsonb_build_object('ok',false,'status',400,'error','Invalid Chrome subscription.');
  END IF;
  INSERT INTO public.allert_push_settings(user_id) VALUES (p_user_id) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM public.allert_push_settings WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO connection FROM public.allert_push_subscriptions WHERE endpoint=p_subscription->>'endpoint' FOR UPDATE;
  IF FOUND THEN
    IF connection.user_id <> p_user_id THEN RETURN jsonb_build_object('ok',false,'status',409,'error','Disconnect this browser and connect again to use this account.'); END IF;
    UPDATE public.allert_push_subscriptions SET keys=p_subscription->'keys',vapid_key=p_vapid_key,updated_at=now() WHERE id=connection.id;
  ELSE
    IF (SELECT count(*) FROM public.allert_push_subscriptions WHERE user_id=p_user_id) >= 5 THEN
      RETURN jsonb_build_object('ok',false,'status',409,'error','Five browsers are already connected. Disconnect an unused browser first.');
    END IF;
    INSERT INTO public.allert_push_subscriptions(user_id,endpoint,keys,vapid_key) VALUES(p_user_id,p_subscription->>'endpoint',p_subscription->'keys',p_vapid_key) RETURNING * INTO connection;
  END IF;
  RETURN jsonb_build_object('ok',true,'bindingId',connection.id);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok',false,'status',409,'error','Browser connection changed. Refresh and connect again.');
END;
$$;

CREATE FUNCTION public.reserve_allert_test_push(p_user_id uuid, p_binding_id uuid, p_request_id uuid, p_vapid_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE settings public.allert_push_settings; connection public.allert_push_subscriptions; preference jsonb; local_time text;
BEGIN
  IF p_user_id IS NULL OR p_binding_id IS NULL OR p_request_id IS NULL OR p_vapid_key IS NULL THEN RETURN jsonb_build_object('ok',false,'status',400,'error','Invalid test request.'); END IF;
  INSERT INTO public.allert_push_settings(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
  SELECT * INTO settings FROM public.allert_push_settings WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO connection FROM public.allert_push_subscriptions WHERE id=p_binding_id AND user_id=p_user_id AND vapid_key=p_vapid_key;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status',404,'error','Connect this browser again.'); END IF;
  SELECT value INTO preference FROM public.kv_store_a473accf WHERE key='notification-preferences:v1:' || p_user_id::text FOR UPDATE;
  IF preference->'enabled' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('ok',false,'status',403,'error','Turn on Push Notifications for your account first.'); END IF;
  local_time := to_char(now() AT TIME ZONE 'Asia/Manila','HH24:MI');
  IF settings.quiet_enabled AND ((settings.quiet_start < settings.quiet_end AND local_time >= settings.quiet_start AND local_time < settings.quiet_end) OR
    (settings.quiet_start > settings.quiet_end AND (local_time >= settings.quiet_start OR local_time < settings.quiet_end))) THEN
    RETURN jsonb_build_object('ok',true,'outcome','quiet_hours');
  END IF;
  DELETE FROM public.allert_push_test_requests WHERE user_id=p_user_id AND created_at < now()-interval '1 day';
  IF EXISTS (SELECT 1 FROM public.allert_push_test_requests WHERE user_id=p_user_id AND request_id=p_request_id) THEN
    RETURN jsonb_build_object('ok',true,'outcome','already_attempted');
  END IF;
  IF settings.last_test_at IS NOT NULL AND settings.last_test_at > now()-interval '60 seconds' THEN
    RETURN jsonb_build_object('ok',false,'status',429,'error','Wait 60 seconds between test notifications.');
  END IF;
  INSERT INTO public.allert_push_test_requests(user_id,request_id) VALUES(p_user_id,p_request_id);
  UPDATE public.allert_push_settings SET last_test_at=now() WHERE user_id=p_user_id;
  RETURN jsonb_build_object('ok',true,'outcome','reserved','subscription',jsonb_build_object('endpoint',connection.endpoint,'keys',connection.keys));
END;
$$;

REVOKE ALL ON FUNCTION public.set_allert_quiet_hours(uuid,boolean,text,text,integer), public.connect_allert_push(uuid,jsonb,text), public.reserve_allert_test_push(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_allert_quiet_hours(uuid,boolean,text,text,integer), public.connect_allert_push(uuid,jsonb,text), public.reserve_allert_test_push(uuid,uuid,uuid,text) TO service_role;
COMMIT;
