-- Read-only status. No tokens, credential hashes or account IDs are returned.
SELECT d.device_id, d.is_active,
       coalesce(c.active, false) AND c.token_hash IS NOT NULL AS upload_credential_configured,
       c.readings_table
FROM public.sensor_devices d
LEFT JOIN public.node_ingestion_credentials c USING (device_id)
WHERE d.device_id = 'ALLERT-NODE-001';

-- Current NODE-001 default table. If the first query names a different mapped table,
-- use that administrator-registered table for this diagnostic instead.
SELECT timestamp AS observed_at, created_at AS received_at,
       round((extract(epoch FROM (clock_timestamp() - timestamp))/60)::numeric, 2) AS minutes_since_observation,
       round((extract(epoch FROM (clock_timestamp() - created_at))/60)::numeric, 2) AS minutes_since_receipt,
       sample_count, expected_samples, data_quality_status
FROM public.sensor_readings
WHERE device_id = 'ALLERT-NODE-001'
ORDER BY timestamp DESC
LIMIT 6;
