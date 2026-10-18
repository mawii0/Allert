BEGIN;
CREATE TABLE public.allert_admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.allert_anomaly_reviews (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.allert_anomaly_events(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  revision integer NOT NULL,
  classification text NOT NULL,
  notes text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id,revision)
);
ALTER TABLE public.allert_anomaly_events ADD COLUMN classification text NOT NULL DEFAULT 'unreviewed';
ALTER TABLE public.allert_anomaly_events ADD COLUMN review_notes text NOT NULL DEFAULT '';
ALTER TABLE public.allert_anomaly_events ADD COLUMN review_revision integer NOT NULL DEFAULT 0;
ALTER TABLE public.allert_anomaly_events ADD COLUMN reviewed_at timestamptz;
ALTER TABLE public.allert_admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allert_anomaly_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.allert_admin_users,public.allert_anomaly_reviews FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.allert_admin_users,public.allert_anomaly_reviews TO service_role;
CREATE FUNCTION public.review_allert_anomaly(p_actor_id uuid,p_event_id uuid,p_revision integer,p_classification text,p_notes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result public.allert_anomaly_events;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM allert_admin_users WHERE user_id=p_actor_id AND active) THEN RETURN jsonb_build_object('ok',false,'status',403,'error','Administrator access required.'); END IF;
  IF p_revision IS NULL OR p_revision<0 OR p_classification IS NULL OR p_classification NOT IN ('investigating','confirmed_anomaly','false_positive','sensor_artifact','external_event') OR p_notes IS NULL OR length(p_notes)>500 THEN
    RETURN jsonb_build_object('ok',false,'status',400,'error','Invalid review.'); END IF;
  UPDATE allert_anomaly_events SET classification=p_classification,review_notes=p_notes,review_revision=review_revision+1,reviewed_at=clock_timestamp()
    WHERE id=p_event_id AND review_revision=p_revision RETURNING * INTO result;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status',409,'error','Event changed or no longer exists. Refresh before reviewing.'); END IF;
  INSERT INTO allert_anomaly_reviews(event_id,actor_id,revision,classification,notes) VALUES(result.id,p_actor_id,result.review_revision,p_classification,p_notes);
  RETURN jsonb_build_object('ok',true,'event',to_jsonb(result));
END; $$;
REVOKE ALL ON FUNCTION public.review_allert_anomaly(uuid,uuid,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.review_allert_anomaly(uuid,uuid,integer,text,text) TO service_role;
COMMIT;
