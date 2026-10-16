BEGIN;
CREATE OR REPLACE FUNCTION public.connect_allert_push(p_user_id uuid, p_subscription jsonb, p_vapid_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE connection public.allert_push_subscriptions;
BEGIN
  IF p_user_id IS NULL OR p_subscription IS NULL OR p_vapid_key IS NULL OR length(p_vapid_key) <> 87 OR
     p_subscription->>'endpoint' IS NULL OR p_subscription->>'endpoint' !~ '^https://(fcm[.]googleapis[.]com/(fcm/send|wp)/[A-Za-z0-9_:.-]+|updates[.]push[.]services[.]mozilla[.]com/wpush/v[12]/[A-Za-z0-9_=-]+|web[.]push[.]apple[.]com/[A-Za-z0-9_-]+)$' OR
     length(p_subscription->>'endpoint') > 2048 OR jsonb_typeof(p_subscription->'keys') IS DISTINCT FROM 'object' OR
     p_subscription->'keys'->>'auth' IS NULL OR p_subscription->'keys'->>'p256dh' IS NULL THEN
    RETURN jsonb_build_object('ok',false,'status',400,'error','Invalid browser subscription.');
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

COMMIT;
