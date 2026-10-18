-- REVIEW/APPLY IN STAGING FIRST. No old telemetry, jobs, forecasts or users are removed.
BEGIN;
CREATE TABLE public.allert_v2_settings (
 id integer PRIMARY KEY CHECK(id=1), enabled boolean NOT NULL DEFAULT false, forecast_enabled boolean NOT NULL DEFAULT false,
 validated_device text NOT NULL DEFAULT 'ALLERT-NODE-001' CHECK(validated_device='ALLERT-NODE-001')
);
INSERT INTO public.allert_v2_settings(id) VALUES(1);
CREATE TABLE public.allert_v2_observations (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 device_id text NOT NULL REFERENCES public.sensor_devices(device_id),
 stream_id text NOT NULL CHECK(length(stream_id) BETWEEN 1 AND 80),
 mode text NOT NULL CHECK(mode IN ('live','replay')),
 owner_id uuid REFERENCES auth.users(id), owner_epoch timestamptz NOT NULL,
 block_start timestamptz NOT NULL, block_end timestamptz NOT NULL,
 received_at timestamptz NOT NULL, payload_hash text NOT NULL CHECK(length(payload_hash)=64),
 pm2_5 double precision, pm10 double precision, temperature double precision, humidity double precision,
 quality jsonb NOT NULL, source_table text NOT NULL,
 pm_units text NOT NULL DEFAULT 'ug/m3' CHECK(pm_units='ug/m3'),
 temperature_units text NOT NULL DEFAULT 'C' CHECK(temperature_units='C'),
 humidity_units text NOT NULL DEFAULT '%' CHECK(humidity_units='%'),
 UNIQUE(device_id,stream_id,block_end),
 CHECK((mode='live' AND stream_id='live') OR (mode='replay' AND stream_id<>'live')),
 CHECK(block_end=block_start+interval '5 minutes'),
 CHECK(extract(epoch FROM block_end)::numeric%300=0),
 CHECK(pm2_5 BETWEEN 0 AND 1000),CHECK(pm10 BETWEEN 0 AND 1000),
 CHECK(temperature BETWEEN -40 AND 125),CHECK(humidity BETWEEN 0 AND 100)
);
CREATE TABLE public.allert_v2_jobs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 device_id text NOT NULL REFERENCES public.sensor_devices(device_id),stream_id text NOT NULL,
 mode text NOT NULL CHECK(mode IN ('live','replay')),owner_id uuid REFERENCES auth.users(id),owner_epoch timestamptz NOT NULL,
 kind text NOT NULL CHECK(kind IN ('current','forecast')),version text NOT NULL,origin timestamptz NOT NULL,
 observation_id bigint REFERENCES public.allert_v2_observations(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','leased','done','failed','obsolete')),
 attempts integer NOT NULL DEFAULT 0,available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 lease_token uuid,lease_until timestamptz,receipt_cutoff timestamptz,finished_at timestamptz,result_status text,
 UNIQUE(device_id,stream_id,owner_epoch,kind,version,origin),
 CHECK((mode='live' AND stream_id='live') OR (mode='replay' AND stream_id<>'live'))
);
CREATE INDEX allert_v2_jobs_ready ON public.allert_v2_jobs(status,available_at,origin);
CREATE TABLE public.allert_v2_current (
 device_id text NOT NULL,stream_id text NOT NULL,owner_epoch timestamptz NOT NULL,policy_hash text NOT NULL,
 revision bigint NOT NULL DEFAULT 0,snapshot jsonb,decision jsonb,indicator jsonb,observation_id bigint,
 observed_at timestamptz,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(device_id,stream_id,owner_epoch,policy_hash)
);
-- Append-only indicator audit; changing a policy never relabels prior results.
CREATE TABLE public.allert_v2_indicators (
 job_id bigint PRIMARY KEY REFERENCES public.allert_v2_jobs(id),observation_id bigint NOT NULL REFERENCES public.allert_v2_observations(id),
 device_id text NOT NULL,stream_id text NOT NULL,owner_epoch timestamptz NOT NULL,
 policy_hash text NOT NULL,observed_at timestamptz NOT NULL,calculated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 status text NOT NULL,value jsonb,
 UNIQUE(observation_id,policy_hash)
);
CREATE TABLE public.allert_v2_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),device_id text NOT NULL,stream_id text NOT NULL,
 mode text NOT NULL CHECK(mode IN ('live','replay')),owner_epoch timestamptz NOT NULL,policy_hash text NOT NULL,
 external_id text NOT NULL,observed_at timestamptz NOT NULL,phase text NOT NULL,event jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(device_id,stream_id,owner_epoch,policy_hash,external_id)
);
CREATE TABLE public.allert_v2_notices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL REFERENCES public.allert_v2_events(id),
 device_id text NOT NULL,stream_id text NOT NULL,owner_epoch timestamptz NOT NULL,policy_hash text NOT NULL,
 key text NOT NULL,kind text NOT NULL,observed_at timestamptz NOT NULL,payload jsonb NOT NULL,
 UNIQUE(device_id,stream_id,owner_epoch,policy_hash,key)
);
CREATE TABLE public.allert_v2_forecasts (
 job_id bigint PRIMARY KEY REFERENCES public.allert_v2_jobs(id),device_id text NOT NULL,stream_id text NOT NULL,
 mode text NOT NULL,owner_epoch timestamptz NOT NULL,model_id text NOT NULL,checkpoint_sha256 text NOT NULL,
 origin timestamptz NOT NULL,receipt_cutoff timestamptz NOT NULL,generated_at timestamptz NOT NULL,committed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 input_hash text NOT NULL,status text NOT NULL,reason text,summary jsonb NOT NULL,result jsonb,forecast_pm_indicator jsonb,
 UNIQUE(device_id,stream_id,owner_epoch,model_id,origin)
);
CREATE TABLE public.allert_v2_worker (
 id integer PRIMARY KEY CHECK(id=1),last_finished_at timestamptz,summary jsonb NOT NULL DEFAULT '{}'
);
INSERT INTO public.allert_v2_worker(id)VALUES(1);

-- Canonical insert is inside the existing authenticated ingest transaction. A job failure
-- rolls back the observation AND old ingest, so firmware keeps/retries the packet.
CREATE FUNCTION public.queue_allert_v2_observation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.allert_v2_jobs(device_id,stream_id,mode,owner_id,owner_epoch,kind,version,origin,observation_id)
 VALUES(NEW.device_id,NEW.stream_id,NEW.mode,NEW.owner_id,NEW.owner_epoch,'current',
 '76486e7733f32d8e4d1ac61a03b35ef3108280f0140533d3a43312a863199b77',NEW.block_end,NEW.id)
 ON CONFLICT DO NOTHING;
 IF (SELECT forecast_enabled FROM public.allert_v2_settings WHERE id=1) AND NEW.device_id='ALLERT-NODE-001' AND extract(epoch FROM NEW.block_end)::numeric%900=0
 AND (NEW.mode='replay' OR NEW.block_end>=clock_timestamp()-interval '10 minutes') THEN
 INSERT INTO public.allert_v2_jobs(device_id,stream_id,mode,owner_id,owner_epoch,kind,version,origin)
 VALUES(NEW.device_id,NEW.stream_id,NEW.mode,NEW.owner_id,NEW.owner_epoch,'forecast',
 'median-residual-seed7-epoch15-20261013-v1',NEW.block_end) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER allert_v2_queue AFTER INSERT ON public.allert_v2_observations FOR EACH ROW EXECUTE FUNCTION public.queue_allert_v2_observation();
CREATE FUNCTION public.mirror_allert_v2_reading() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.sensor_devices%ROWTYPE; q text; receipt timestamptz;
BEGIN
 SELECT * INTO d FROM public.sensor_devices WHERE device_id=NEW.device_id FOR SHARE;
 -- Only registered tables; never mirror an arbitrary table or invent old receipt times.
 IF NOT EXISTS(SELECT 1 FROM public.node_ingestion_credentials WHERE device_id=NEW.device_id AND readings_table=TG_TABLE_NAME)
 OR NEW.created_at IS NULL OR extract(epoch FROM NEW.timestamp)::numeric%300<>0 THEN RETURN NEW; END IF;
 q:=CASE WHEN NEW.data_quality_status IN ('VALID','OK','ORIGINAL','ok') AND NEW.sample_count=30 AND NEW.expected_samples=30 THEN 'ok' ELSE 'invalid' END;
 INSERT INTO public.allert_v2_observations(device_id,stream_id,mode,owner_id,owner_epoch,block_start,block_end,received_at,payload_hash,pm2_5,pm10,temperature,humidity,quality,source_table)
 VALUES(NEW.device_id,'live','live',d.user_id,coalesce(d.owner_since,'1970-01-01Z'::timestamptz),NEW.timestamp-interval '5 minutes',NEW.timestamp,NEW.created_at,
 encode(sha256(convert_to((to_jsonb(NEW)-'created_at'-'id')::text,'UTF8')),'hex'),NEW.pm2_5,NEW.pm10,NEW.temperature,NEW.humidity,
 jsonb_build_object('pm2_5',q,'pm10',q,'temperature',q,'humidity',q),TG_TABLE_NAME) ON CONFLICT DO NOTHING;
 RETURN NEW;
END;$$;
-- Attach to exactly the already registered relations. New node registration requires the
-- same reviewed attachment; this does not alter the old register RPC or other relations.
DO $$DECLARE t text;BEGIN
 FOR t IN SELECT DISTINCT readings_table FROM public.node_ingestion_credentials LOOP
 IF to_regclass(format('public.%I',t)) IS NOT NULL THEN
 EXECUTE format('CREATE TRIGGER allert_v2_mirror AFTER INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.mirror_allert_v2_reading()',t);
 END IF;END LOOP;
END;$$;

CREATE FUNCTION public.claim_allert_v2_job(p_kind text,p_stream text DEFAULT 'live') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.allert_v2_jobs%ROWTYPE;
BEGIN
 IF NOT (SELECT enabled FROM public.allert_v2_settings WHERE id=1) THEN RETURN jsonb_build_object('outcome','disabled'); END IF;
 IF p_kind='forecast' AND NOT (SELECT forecast_enabled FROM public.allert_v2_settings WHERE id=1) THEN RETURN jsonb_build_object('outcome','forecast_disabled');END IF;
 UPDATE public.allert_v2_jobs SET status='done',finished_at=clock_timestamp(),result_status='stale' WHERE mode='live' AND kind='current' AND status IN ('pending','leased') AND origin<clock_timestamp()-interval '10 minutes';
 UPDATE public.allert_v2_jobs SET status='failed',finished_at=clock_timestamp(),result_status='attempts_exhausted' WHERE status='leased' AND attempts>=8 AND lease_until<clock_timestamp();
 -- Transfer/unlink invalidates pending old ownership jobs but preserves their audit rows.
 UPDATE public.allert_v2_jobs x SET status='obsolete',finished_at=clock_timestamp(),result_status='access_changed'
 WHERE x.status IN ('pending','leased') AND x.mode='live' AND NOT EXISTS
 (SELECT 1 FROM public.sensor_devices d WHERE d.device_id=x.device_id AND d.user_id=x.owner_id AND d.is_active AND coalesce(d.owner_since,'1970-01-01Z')=x.owner_epoch);
 SELECT * INTO j FROM public.allert_v2_jobs x WHERE kind=p_kind AND stream_id=p_stream
 AND ((status='pending' AND available_at<=clock_timestamp()) OR (status='leased' AND lease_until<clock_timestamp()))
 AND attempts<8 AND (kind<>'current' OR NOT EXISTS(SELECT 1 FROM public.allert_v2_jobs earlier
 WHERE earlier.device_id=x.device_id AND earlier.stream_id=x.stream_id AND earlier.owner_epoch=x.owner_epoch AND earlier.kind=x.kind AND earlier.version=x.version
 AND earlier.origin<x.origin AND earlier.status IN ('pending','leased')))
 ORDER BY origin,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('outcome','empty');END IF;
 UPDATE public.allert_v2_jobs SET status='leased',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes',
 receipt_cutoff=coalesce(receipt_cutoff,clock_timestamp()) WHERE id=j.id RETURNING * INTO j;
 RETURN jsonb_build_object('outcome','claimed','job',to_jsonb(j));
END;$$;
CREATE FUNCTION public.read_allert_v2_job(p_id bigint,p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.allert_v2_jobs%ROWTYPE; observations jsonb; st public.allert_v2_current%ROWTYPE;
BEGIN
 SELECT * INTO j FROM public.allert_v2_jobs WHERE id=p_id AND lease_token=p_token AND status='leased' AND lease_until>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'Lease lost';END IF;
 IF j.kind='current' THEN
 SELECT * INTO st FROM public.allert_v2_current WHERE device_id=j.device_id AND stream_id=j.stream_id AND owner_epoch=j.owner_epoch AND policy_hash=j.version;
 SELECT to_jsonb(o) INTO observations FROM public.allert_v2_observations o WHERE id=j.observation_id AND received_at<=j.receipt_cutoff;
 RETURN jsonb_build_object('observation',observations,'snapshot',st.snapshot,'revision',coalesce(st.revision,0));
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY block_end),'[]') INTO observations FROM public.allert_v2_observations o
 WHERE device_id=j.device_id AND stream_id=j.stream_id AND owner_epoch=j.owner_epoch AND mode=j.mode
 AND block_end>j.origin-interval '54 hours' AND block_end<=j.origin AND received_at<=j.receipt_cutoff;
 RETURN jsonb_build_object('history',observations);
END;$$;
CREATE FUNCTION public.fail_allert_v2_job(p_id bigint,p_token uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.allert_v2_jobs SET status=CASE WHEN attempts>=8 THEN 'failed' ELSE 'pending' END,
 available_at=clock_timestamp()+interval '1 minute',lease_until=NULL,lease_token=NULL,result_status='worker_error'
 WHERE id=p_id AND lease_token=p_token AND status='leased' AND lease_until>clock_timestamp();RETURN FOUND;
END;$$;
CREATE FUNCTION public.finish_allert_v2_job(p_id bigint,p_token uuid,p_output jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.allert_v2_jobs%ROWTYPE; d public.sensor_devices%ROWTYPE; old_revision bigint; o public.allert_v2_observations%ROWTYPE;
 ev jsonb; notice jsonb; eid uuid; nid uuid; v_status text; f jsonb; model_result jsonb; keys integer;
BEGIN
 SELECT * INTO j FROM public.allert_v2_jobs WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR j.status<>'leased' OR j.lease_token IS DISTINCT FROM p_token OR j.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'Lease lost';END IF;
 SELECT * INTO d FROM public.sensor_devices WHERE device_id=j.device_id FOR SHARE;
 IF j.mode='live' AND (NOT d.is_active OR d.user_id IS DISTINCT FROM j.owner_id OR coalesce(d.owner_since,'1970-01-01Z')<>j.owner_epoch) THEN RAISE EXCEPTION 'Ownership changed'; END IF;
 v_status:=p_output->>'status';
 IF v_status IS NULL OR v_status NOT IN ('ready','stale','warming_up','insufficient_history','invalid_input','unavailable','out_of_order','duplicate') THEN RAISE EXCEPTION 'Invalid result status';END IF;
 IF j.kind='current' THEN
 SELECT * INTO o FROM public.allert_v2_observations WHERE id=j.observation_id;
 INSERT INTO public.allert_v2_current(device_id,stream_id,owner_epoch,policy_hash)VALUES(j.device_id,j.stream_id,j.owner_epoch,j.version)ON CONFLICT DO NOTHING;
 SELECT revision INTO old_revision FROM public.allert_v2_current WHERE device_id=j.device_id AND stream_id=j.stream_id AND owner_epoch=j.owner_epoch AND policy_hash=j.version FOR UPDATE;
 IF jsonb_typeof(p_output->'revision') IS DISTINCT FROM 'number' OR old_revision IS DISTINCT FROM (p_output->>'revision')::bigint THEN RAISE EXCEPTION 'Snapshot revision conflict';END IF;
 IF p_output->'decision' IS NOT NULL AND p_output->'decision'<>'null'::jsonb AND
 ((p_output->'decision'->>'node_id') IS DISTINCT FROM j.device_id OR (p_output->'decision'->>'block_end')::timestamptz IS DISTINCT FROM j.origin
 OR (p_output->'decision'->>'mode') IS DISTINCT FROM j.mode) THEN RAISE EXCEPTION 'Wrong observation decision';END IF;
 IF p_output->'indicator'<>'null'::jsonb AND p_output->'indicator' IS NOT NULL AND
 p_output->'indicator'->>'rule_sha256' IS DISTINCT FROM '03f97ad4b2737e85cfe01969fed8a059668dcf5e76c5508ee3279d1c5e6aa5c0' THEN RAISE EXCEPTION 'Wrong indicator policy';END IF;
 INSERT INTO public.allert_v2_indicators(job_id,observation_id,device_id,stream_id,owner_epoch,policy_hash,observed_at,status,value)
 VALUES(j.id,o.id,j.device_id,j.stream_id,j.owner_epoch,'03f97ad4b2737e85cfe01969fed8a059668dcf5e76c5508ee3279d1c5e6aa5c0',j.origin,
 CASE WHEN p_output->'indicator' IS NULL OR p_output->'indicator'='null'::jsonb THEN 'unavailable' ELSE 'ready' END,p_output->'indicator');
 UPDATE public.allert_v2_current SET revision=revision+1,snapshot=p_output->'snapshot',decision=p_output->'decision',indicator=p_output->'indicator',
 observation_id=o.id,observed_at=j.origin,updated_at=clock_timestamp()
 WHERE device_id=j.device_id AND stream_id=j.stream_id AND owner_epoch=j.owner_epoch AND policy_hash=j.version
 AND (observed_at IS NULL OR observed_at<=j.origin);
 ev:=coalesce(nullif(p_output->'decision'->'event','null'::jsonb),nullif(p_output->'decision'->'closed_event','null'::jsonb));
 IF ev IS NOT NULL THEN
 INSERT INTO public.allert_v2_events(device_id,stream_id,mode,owner_epoch,policy_hash,external_id,observed_at,phase,event)
 VALUES(j.device_id,j.stream_id,j.mode,j.owner_epoch,j.version,ev->>'id',j.origin,ev->>'phase',ev)
 ON CONFLICT(device_id,stream_id,owner_epoch,policy_hash,external_id)DO UPDATE SET phase=EXCLUDED.phase,event=EXCLUDED.event,observed_at=EXCLUDED.observed_at,updated_at=clock_timestamp() RETURNING id INTO eid;
 FOR notice IN SELECT value FROM jsonb_array_elements(coalesce(p_output->'decision'->'notifications','[]'::jsonb)) LOOP
 INSERT INTO public.allert_v2_notices(event_id,device_id,stream_id,owner_epoch,policy_hash,key,kind,observed_at,payload)
 VALUES(eid,j.device_id,j.stream_id,j.owner_epoch,j.version,notice->>'idempotency_key',notice->>'kind',j.origin,notice)
 ON CONFLICT DO NOTHING RETURNING id INTO nid;
 -- Existing, tested consent/quiet-hours/family delivery queue is reused ONLY for live,
 -- genuinely fresh notices. Replay/late processing cannot enter its push outbox.
 IF nid IS NOT NULL AND j.mode='live' AND j.stream_id='live' AND j.origin>=clock_timestamp()-interval '10 minutes' THEN
 INSERT INTO public.allert_anomaly_events(id,device_id,user_id,owner_epoch,observed_at,severity,policy_version,metrics,reading,baseline)
 VALUES(nid,j.device_id,j.owner_id,j.owner_epoch,j.origin,'watch','observed-pm-v1:76486e77:'||(notice->>'kind'),notice->'observations',
 jsonb_build_object('pm2_5',o.pm2_5,'pm10',o.pm10,'created_at',o.received_at,'phase',ev->>'phase','notice_kind',notice->>'kind'),'[]')ON CONFLICT DO NOTHING;
 INSERT INTO public.allert_alert_outbox(event_id)VALUES(nid)ON CONFLICT DO NOTHING;
 END IF;
 END LOOP;
 END IF;
 ELSE
 IF j.device_id<>'ALLERT-NODE-001' OR j.version<>'median-residual-seed7-epoch15-20261013-v1' THEN RAISE EXCEPTION 'Unvalidated model assignment';END IF;
 model_result:=p_output->'result';
 IF v_status='ready' THEN
 IF jsonb_typeof(model_result) IS DISTINCT FROM 'object' OR jsonb_typeof(model_result->'forecasts') IS DISTINCT FROM 'array' OR
 model_result->>'generated_at' IS NULL OR model_result->>'forecast_origin' IS NULL OR model_result->>'input_last_block_end' IS NULL OR
 (model_result->>'input_last_block_end')::timestamptz IS DISTINCT FROM j.origin OR
 model_result->'is_future_allergy_probability' IS DISTINCT FROM 'false'::jsonb OR model_result->'trained_or_recalibrated' IS DISTINCT FROM 'false'::jsonb OR
 coalesce(p_output->>'input_hash','') !~ '^[a-f0-9]{64}$' OR model_result->>'model_id' IS DISTINCT FROM j.version OR model_result->>'checkpoint_sha256' IS DISTINCT FROM '4253e73515d8d2a3d4a4463065f8bfb2192c9454e161da560fd928a4051672c4'
 OR model_result->>'node_id' IS DISTINCT FROM j.device_id OR model_result->>'mode' IS DISTINCT FROM (CASE WHEN j.mode='live' THEN 'live' ELSE 'historical_fixture' END)
 OR (model_result->>'forecast_origin')::timestamptz IS DISTINCT FROM j.origin OR model_result->>'status' IS DISTINCT FROM 'ok'
 OR (model_result->>'generated_at')::timestamptz<j.receipt_cutoff OR (model_result->>'generated_at')::timestamptz>clock_timestamp()+interval '1 minute'
 OR jsonb_array_length(model_result->'forecasts')<>6 OR length(p_output->>'input_hash')<>64 THEN RAISE EXCEPTION 'Unverified forecast result';END IF;
 SELECT count(DISTINCT (x->>'pollutant')||':'||(x->>'horizon_hours')) INTO keys FROM jsonb_array_elements(model_result->'forecasts') x;
 IF keys<>6 THEN RAISE EXCEPTION 'Duplicate forecast channels';END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(model_result->'forecasts') LOOP
 IF jsonb_typeof(f->'value') IS DISTINCT FROM 'number' OR f->>'pollutant' IS NULL OR f->>'horizon_hours' IS NULL OR f->>'units' IS NULL OR f->>'target_block_end' IS NULL OR f->>'target_block_start' IS NULL OR f->>'pollutant' NOT IN ('pm2_5','pm10') OR (f->>'horizon_hours')::integer NOT IN (6,12,24) OR f->>'units'<>'ug/m3'
 OR NOT ((f->>'value')::double precision>=0 AND (f->>'value')::double precision<'Infinity'::double precision)
 OR (f->>'target_block_end')::timestamptz<>j.origin+make_interval(hours=>(f->>'horizon_hours')::integer)
 OR (f->>'target_block_start')::timestamptz<>(f->>'target_block_end')::timestamptz-interval '5 minutes' THEN RAISE EXCEPTION 'Invalid forecast channel';END IF;
 END LOOP;
 END IF;
 INSERT INTO public.allert_v2_forecasts(job_id,device_id,stream_id,mode,owner_epoch,model_id,checkpoint_sha256,origin,receipt_cutoff,generated_at,input_hash,status,reason,summary,result,forecast_pm_indicator)
 VALUES(j.id,j.device_id,j.stream_id,j.mode,j.owner_epoch,j.version,'4253e73515d8d2a3d4a4463065f8bfb2192c9454e161da560fd928a4051672c4',
 j.origin,j.receipt_cutoff,CASE WHEN v_status='ready' THEN (model_result->>'generated_at')::timestamptz ELSE clock_timestamp() END,coalesce(p_output->>'input_hash',''),v_status,p_output->>'reason',coalesce(p_output->'summary','{}'),CASE WHEN v_status='ready' THEN model_result ELSE NULL END,p_output->'forecast_pm_indicator');
 END IF;
 UPDATE public.allert_v2_jobs SET status='done',finished_at=clock_timestamp(),result_status=v_status,lease_until=NULL WHERE id=j.id;
 RETURN jsonb_build_object('ok',true);
END;$$;
-- Versioned packet path accepts independent channel quality. Original full packets
-- continue through ingest_allert_reading and the transactional mirror trigger.
CREATE FUNCTION public.ingest_allert_v2_packet(p_device_id text,p_token_hash text,p_packet jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg public.node_ingestion_credentials%ROWTYPE; d public.sensor_devices%ROWTYPE;
 t timestamptz; start_at timestamptz; h text; old_hash text; q jsonb; k text; v double precision;
BEGIN
 SELECT * INTO cfg FROM public.node_ingestion_credentials WHERE device_id=p_device_id FOR UPDATE;
 IF NOT FOUND OR NOT cfg.active OR cfg.token_hash IS DISTINCT FROM p_token_hash OR cfg.token_hash IS NULL THEN RETURN jsonb_build_object('ok',false,'status',401);END IF;
 SELECT * INTO d FROM public.sensor_devices WHERE device_id=p_device_id FOR SHARE;
 IF NOT FOUND OR NOT d.is_active THEN RETURN jsonb_build_object('ok',false,'status',403);END IF;
 BEGIN
 t:=(p_packet->>'block_end')::timestamptz;start_at:=(p_packet->>'block_start')::timestamptz;q:=p_packet->'quality';
 IF t IS NULL OR start_at IS NULL OR t-start_at<>interval '5 minutes' OR extract(epoch FROM t)::numeric%300<>0
 OR t>clock_timestamp()+interval '1 minute' OR t<clock_timestamp()-interval '7 days'
 OR p_packet->'units' IS DISTINCT FROM '{"pm":"ug/m3","temperature":"C","humidity":"%"}'::jsonb
 OR p_packet->>'packet_version' IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'Invalid block';END IF;
 FOREACH k IN ARRAY ARRAY['pm2_5','pm10','temperature','humidity'] LOOP
 IF q->>k IS NULL OR q->>k NOT IN ('ok','missing','invalid') THEN RAISE EXCEPTION 'Invalid quality';END IF;
 IF q->>k='ok' THEN
 IF jsonb_typeof(p_packet->k) IS DISTINCT FROM 'number' OR (p_packet->'sample_counts'->>k)::integer IS DISTINCT FROM 30 THEN RAISE EXCEPTION 'Invalid complete channel';END IF;
 v:=(p_packet->>k)::double precision;
 IF NOT(v>'-Infinity'::double precision AND v<'Infinity'::double precision) OR
 (k IN ('pm2_5','pm10') AND NOT(v BETWEEN 0 AND 1000)) OR (k='temperature' AND NOT(v BETWEEN -40 AND 125)) OR (k='humidity' AND NOT(v BETWEEN 0 AND 100)) THEN RAISE EXCEPTION 'Invalid value';END IF;
 ELSIF p_packet->k IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Unavailable channel must be null';END IF;
 END LOOP;
 EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'status',400);END;
 -- Hash only the normalized server-allowlisted payload; receipt and ownership are not supplied.
 h:=encode(sha256(convert_to(p_packet::text,'UTF8')),'hex');
 SELECT payload_hash INTO old_hash FROM public.allert_v2_observations WHERE device_id=p_device_id AND stream_id='live' AND block_end=t;
 IF FOUND THEN
 IF old_hash<>h THEN RETURN jsonb_build_object('ok',false,'status',409);END IF;
 RETURN jsonb_build_object('ok',true,'duplicate',true);END IF;
 INSERT INTO public.allert_v2_observations(device_id,stream_id,mode,owner_id,owner_epoch,block_start,block_end,received_at,payload_hash,pm2_5,pm10,temperature,humidity,quality,source_table)
 VALUES(p_device_id,'live','live',d.user_id,coalesce(d.owner_since,'1970-01-01Z'),start_at,t,clock_timestamp(),h,
 (p_packet->>'pm2_5')::double precision,(p_packet->>'pm10')::double precision,(p_packet->>'temperature')::double precision,(p_packet->>'humidity')::double precision,q,'packet_v2');
 RETURN jsonb_build_object('ok',true,'duplicate',false);
END;$$;
REVOKE ALL ON FUNCTION public.ingest_allert_v2_packet(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_allert_v2_packet(text,text,jsonb) TO service_role;

-- Explicit reviewed bootstrap; it copies original receipt times and measurements only.
-- It does NOT reconstruct old forecasts. Old current jobs expire without recovery signals.
CREATE FUNCTION public.backfill_allert_v2_history() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg record; d public.sensor_devices%ROWTYPE; row record; q text; n integer:=0; added integer;
BEGIN
 FOR cfg IN SELECT * FROM public.node_ingestion_credentials WHERE active LOOP
 SELECT * INTO d FROM public.sensor_devices WHERE device_id=cfg.device_id;
 FOR row IN EXECUTE format('SELECT * FROM public.%I WHERE device_id=$1 AND timestamp>$2 AND timestamp>$3 AND created_at IS NOT NULL ORDER BY timestamp',cfg.readings_table)
 USING cfg.device_id,clock_timestamp()-interval '54 hours',coalesce(d.owner_since,'1970-01-01Z') LOOP
 IF extract(epoch FROM row.timestamp)::numeric%300<>0 THEN CONTINUE;END IF;
 q:=CASE WHEN row.data_quality_status='VALID' AND row.sample_count=30 AND row.expected_samples=30 THEN 'ok' ELSE 'invalid' END;
 INSERT INTO public.allert_v2_observations(device_id,stream_id,mode,owner_id,owner_epoch,block_start,block_end,received_at,payload_hash,pm2_5,pm10,temperature,humidity,quality,source_table)
 VALUES(cfg.device_id,'live','live',d.user_id,coalesce(d.owner_since,'1970-01-01Z'),row.timestamp-interval '5 minutes',row.timestamp,row.created_at,
 encode(sha256(convert_to((to_jsonb(row)-'created_at'-'id')::text,'UTF8')),'hex'),row.pm2_5,row.pm10,row.temperature,row.humidity,
 jsonb_build_object('pm2_5',q,'pm10',q,'temperature',q,'humidity',q),cfg.readings_table)ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS added=ROW_COUNT;n:=n+added;
 END LOOP;END LOOP;RETURN n;
END;$$;
REVOKE ALL ON FUNCTION public.backfill_allert_v2_history() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_allert_v2_history() TO service_role;

-- No direct browser access; privileged readers still perform explicit user/node checks.
DO $$DECLARE t text; f record;BEGIN
 FOREACH t IN ARRAY ARRAY['allert_v2_settings','allert_v2_observations','allert_v2_jobs','allert_v2_current','allert_v2_indicators','allert_v2_events','allert_v2_notices','allert_v2_forecasts','allert_v2_worker'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 EXECUTE format('GRANT SELECT ON public.%I TO service_role',t);
 END LOOP;
 GRANT UPDATE ON public.allert_v2_worker TO service_role;
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND
 p.proname IN ('queue_allert_v2_observation','mirror_allert_v2_reading','claim_allert_v2_job','read_allert_v2_job','fail_allert_v2_job','finish_allert_v2_job') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 IF f.signature::text NOT LIKE '%observation()' AND f.signature::text NOT LIKE '%reading()' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature); END IF;
 END LOOP;
END;$$;
COMMIT;
