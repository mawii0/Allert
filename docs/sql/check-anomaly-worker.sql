-- Read-only operational checks. These queries do not expose keys or push endpoints.
SELECT last_finished_at,last_success_at,cursor_device,summary FROM public.allert_alert_worker WHERE id=1;
SELECT device_id,status,baseline_count,state->>'last_timestamp' AS last_observation,updated_at FROM public.allert_detector_state ORDER BY device_id;
SELECT id,device_id,observed_at,severity,classification FROM public.allert_anomaly_events ORDER BY observed_at DESC LIMIT 20;
SELECT status,count(*) FROM public.allert_alert_outbox GROUP BY status;
SELECT status,count(*) FROM public.allert_alert_deliveries GROUP BY status;
-- Supabase pg_net responses: a cron SQL success alone does not confirm an HTTP success.
SELECT id,status_code,timed_out,error_msg FROM net._http_response ORDER BY id DESC LIMIT 10;
