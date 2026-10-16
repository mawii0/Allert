-- Read-only. No keys, endpoints or account identities are returned.
SELECT device_id,status,last_attempt_at,last_finished_at,last_success_at,summary FROM public.allert_forecast_worker;
SELECT status,count(*) FROM public.allert_forecast_notices GROUP BY status;
SELECT status,http_status,count(*) FROM public.allert_forecast_deliveries GROUP BY status,http_status;
SELECT id,status_code,timed_out,error_msg FROM net._http_response ORDER BY id DESC LIMIT 12;
