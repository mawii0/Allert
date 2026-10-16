BEGIN;
CREATE TABLE public.allert_forecast_evidence (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL REFERENCES public.sensor_devices(device_id),
  owner_epoch timestamptz NOT NULL,
  origin timestamptz NOT NULL,
  target timestamptz NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  horizon_hours integer NOT NULL CHECK(horizon_hours IN (6,12,24)),
  population text NOT NULL CHECK(population IN ('adult','pediatric')),
  score double precision NOT NULL CHECK(score>=0 AND score<=100),
  tier text NOT NULL CHECK(tier IN ('low','moderate','high','very_high')),
  policy_hash text NOT NULL CHECK(policy_hash ~ '^[a-f0-9]{64}$'),
  model_id text NOT NULL CHECK(length(model_id) BETWEEN 1 AND 100),
  CHECK(target=origin+make_interval(hours=>horizon_hours)),
  CHECK(captured_at>=origin AND captured_at<target AND origin>=owner_epoch),
  UNIQUE(user_id,device_id,owner_epoch,origin,horizon_hours,population,policy_hash)
);
CREATE INDEX ON public.allert_forecast_evidence(user_id,device_id,owner_epoch,horizon_hours,target DESC);
ALTER TABLE public.allert_forecast_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.allert_forecast_evidence FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.allert_forecast_evidence TO service_role;
CREATE OR REPLACE FUNCTION public.record_allert_forecast_evidence(p_user_id uuid,p_device_id text,p_owner_epoch timestamptz,p_forecasts jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE device public.sensor_devices%ROWTYPE; item jsonb; received timestamptz:=clock_timestamp();
BEGIN
  SELECT * INTO device FROM public.sensor_devices WHERE device_id=p_device_id FOR SHARE;
  IF NOT FOUND OR device.user_id IS DISTINCT FROM p_user_id OR NOT device.is_active OR coalesce(device.owner_since,'1970-01-01'::timestamptz) IS DISTINCT FROM p_owner_epoch THEN
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
REVOKE ALL ON FUNCTION public.record_allert_forecast_evidence(uuid,text,timestamptz,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_allert_forecast_evidence(uuid,text,timestamptz,jsonb) TO service_role;
COMMIT;
