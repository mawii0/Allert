# Private model/analytics API contract

Base URL for local demonstration: `http://127.0.0.1:8000`.
Except `/health`, requests require a server-only internal bearer token. This is
not the PWA's Supabase user token; the Supabase API/worker must authenticate users,
check node access and call internal computation under its own trusted context.

| Route | Meaning | Persists/delivers? |
|---|---|---|
| `GET /health` | Process liveness; not a dependency readiness guarantee | No |
| `GET /v1/model` | Selected model identity/configuration/device | No |
| `POST /v1/forecast` | Six frozen-model PM forecasts from supplied history | No |
| `POST /v1/risk` | Current environmental-indicator calculation | No |
| `POST /v1/observed/evaluate` | Process one PM record with supplied prior snapshot | No; caller must save snapshot/event/outbox atomically |

The HTTP body limit is 2 MiB. POST requests need `Content-Length`; oversized
requests return 413. API authorization failures return 401, missing configured
service token returns 503, and validation errors return 422. Public hosting needs
additional proxy/TLS/rate limits. CORS is not enabled for arbitrary browsers;
PWA calls should go to the authorized Supabase API.

## Forecast request

Use `examples/forecast_case_01.json` for the first test. It has the full required
history; the fragment below only explains its shape:

```json
{
  "node_id": "node-1",
  "mode": "historical_fixture",
  "forecast_origin": "2026-09-12T20:45:00+00:00",
  "history": [
    {
      "node_id": "node-1",
      "block_start": "2026-09-10T14:45:00+00:00",
      "block_end": "2026-09-10T14:50:00+00:00",
      "pm2_5": 10.0,
      "pm10": 20.0,
      "temperature_c": 30.0,
      "humidity_percent": 70.0,
      "quality": "ORIGINAL"
    }
  ]
}
```

That abbreviated one-row fragment is intentionally NOT a valid request. Supply
648–4096 already chronological/unique/contiguous valid blocks; the final 648
must run from origin−54h through origin−5min. The neural tensor is still the
final 576×8 features. The last 12 PM observations form the median anchor.

The origin is on the original 15-minute grid and represents the end of the last
completed input block. Block timestamps must contain timezone information.
Live mode additionally requires per-row actual `received_at`, valid availability
and a fresh origin. Historical-fixture mode is exclusively declared replay and
must not be used to disguise an old packet as a live forecast.

Default enabled forecast node is `node-1`. The backend partner may map the actual
Node 1 registry ID via `ALLERT_VALIDATED_NODE_ID`; this changes an identifier,
not the model's scientific validation. Node 2 remains disabled unless a separate
explicit experimental-transfer decision enables it server-side.

## Forecast response

`status`, `model_id`, `node_id`, `mode`, `forecast_origin`, `generated_at`,
`input_last_block_end`, `device`, `checkpoint_sha256`, and `forecasts` are returned.
There are exactly six forecast rows:

```text
PM2.5 6h, PM10 6h, PM2.5 12h, PM10 12h, PM2.5 24h, PM10 24h
```

Each row contains `pollutant`, `horizon_hours`, `value`, `units='ug/m3'`,
`target_block_start` and `target_block_end`. A nominal h-hour target is the
five-minute block `[origin+h−5min, origin+h)`, not a period mean/max over h hours.
The values are particulate concentration forecasts, not probabilities, symptoms,
AQI, uncertainty bounds or smoke/fire predictions.

## Current-risk request

```json
{"pm2_5":20,"pm10":40,"temperature_c":30,"humidity_percent":70}
```

Expected: adult ≈25.8401 points and pediatric ≈28.2181 points, both `high`.
Response contains normalized/display scores, canonical tier and rule hash.
The API is a calculator, not a live-feed reader; worker/API integration must
choose the actual fresh telemetry row. Do not reuse the diary heuristic here.

## Observed-PM evaluation

```json
{
  "mode": "replay",
  "snapshot": null,
  "record": {
    "node_id": "node-1",
    "block_end": "2026-10-10T00:05:00Z",
    "received_at": "2026-10-10T00:05:00Z",
    "pm2_5": 70,
    "pm10": 100,
    "units": "ug/m3",
    "sensor_status": "ok"
  }
}
```

Replay timestamps above are illustrative only. For live mode use actual
timezone-aware block and server receipt times; a processing-age guard rejects
stale/future live records. Each successive request supplies the returned prior
snapshot. The response includes the decision and updated snapshot, explicitly
`persistence_performed=false` and `delivery_performed=false`.

Do not start a fresh detector for every packet. Persist the snapshot with the
event/outbox in one transaction, with node-level ordering/version protection.
Do not let arbitrary PWA clients submit/reset snapshots. In-app acknowledgment
does not close an event; valid clear readings determine recovery.

## Calling locally in PowerShell

In a terminal with the same securely configured token:

```powershell
$headers = @{Authorization = "Bearer $env:ALLERT_API_TOKEN"}
Invoke-RestMethod -Uri http://127.0.0.1:8000/v1/model -Headers $headers
$body = Get-Content examples/forecast_case_01.json -Raw
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/v1/forecast -Headers $headers -ContentType application/json -Body $body
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/v1/risk -Headers $headers -ContentType application/json -Body (Get-Content examples/risk_request.json -Raw)
```

## Model identity and security

Checkpoint SHA-256:
`4253e73515d8d2a3d4a4463065f8bfb2192c9454e161da560fd928a4051672c4`.
Keep the original feature scaler, target transform and six shrinkage multipliers.
There is no API to replace weights, train, tune or upload arbitrary model files.
Load only the trusted verified package; joblib/pickle-style artifacts are not
safe uploads from untrusted users.
