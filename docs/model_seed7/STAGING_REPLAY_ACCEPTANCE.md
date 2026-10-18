# One hosted seed7 forecast acceptance

This is an isolated historical replay in the existing `allert-staging` database.
It verifies CPU inference on Vercel, comparison with the supplied case-01 golden
values and the atomic Supabase forecast commit. It does not establish live
forecast readiness, clinical validity, an SLA, or transfer to another node.

The selected model, weights, scalers, calibration, original measurements,
measurement times and all 88 frozen release files remain unchanged. The supplied
fixture has no historical receipt times: its rows receive their actual staging
import time, with `mode=replay`. No backdated live receipts are invented.

## Apply and test

From the Windows ALLERT repository on `feature/seed7-vercel`:

```powershell
git status
git apply --check --whitespace=nowarn ALLERT_seed7_replay_acceptance.patch
git apply --whitespace=nowarn ALLERT_seed7_replay_acceptance.patch
$env:PYTHONPATH = "$PWD\analytics"
.\.venv-model\Scripts\python.exe -m pytest analytics/tests_vercel.py analytics/tests_replay_acceptance.py -q
```

These 32 API/control tests mock model execution and database access. Separately,
the delivery author executed a real CPU prediction from PostgreSQL fixture rows,
compared it with the golden values and committed it into a local PGlite database.
The next cloud steps are still necessary; local evidence is not a cloud result.

Commit only these files:

```powershell
git add -- analytics/app.py analytics/seed7_host/replay_acceptance.py analytics/tests_replay_acceptance.py scripts/prepare-seed7-replay.py docs/model_seed7/STAGING_REPLAY_ACCEPTANCE.md
git diff --cached --check
git commit -m "Add gated staging forecast replay acceptance"
git push origin feature/seed7-vercel
```

## Enable the staging-only acceptance route

In the separate Vercel `allert-model-staging` project, add:

| Variable | Value |
| --- | --- |
| `ALLERT_REPLAY_ACCEPTANCE_ENABLED` | `true` |
| `ALLERT_REPLAY_STAGING_PROJECT_REF` | The 20-character reference of **allert-staging**, matching its `SUPABASE_URL` |

Use the same environment scopes as the staging database variables. Leave the
existing worker token, staging database credentials and CPU settings unchanged.
Redeploy the new commit and wait for Ready. The route is disabled without these
settings and refuses the known production project reference. Its existing bearer
authentication, query/body restrictions and concurrency lock also apply. No caller
can choose a node, stream, checkpoint or readings.

## Load exactly one replay

Generate the SQL locally; it uses only the supplied verified fixture and contains
no passwords or API keys:

```powershell
.\.venv-model\Scripts\python.exe scripts/prepare-seed7-replay.py
```

Open the generated `analytics/outputs/STAGING_seed7_replay_case01.sql` in VS Code.
Copy it into the **allert-staging** SQL Editor and run it once. It checks for the
specific staging test account/node and the absence of push subscriptions. It
preserves the original September measurement timestamps, inserts 648 replay
blocks and creates exactly one replay forecast job. Automatically queued current
replay jobs are explicitly marked obsolete as forecast-only acceptance records;
no current replay indicators or detector state are fabricated. The SQL enables
the staging forecast gate after loading, without scheduling anything.

Expected: `replay_blocks=648`, `pending_replay_forecasts=1`.

The SQL refuses a second import. If the output file already exists locally, reuse
it; do not delete database rows or alter timestamps to retry a failed inference.
Database leases make a failed job retryable; a job already committed is not
processed again.

## Invoke the hosted model

```powershell
$allertToken = Read-Host "Paste your ALLERT_WORKER_TOKEN" -AsSecureString
try {
    $allertHeaders = @{
        Authorization = "Bearer " + [System.Net.NetworkCredential]::new("", $allertToken).Password
    }
    Invoke-RestMethod -Method Post `
        -Uri "https://allert-model-staging.vercel.app/internal/replay-forecast" `
        -Headers $allertHeaders -TimeoutSec 120 | ConvertTo-Json
}
finally {
    Remove-Variable allertToken, allertHeaders -ErrorAction SilentlyContinue
}
```

Expected: `status=replay_forecast_verified`, `processed=1`, `errors=0`,
`forecast_count=6`, `database_commit_verified=true`, and maximum absolute
difference below the frozen `0.02 ug/m3` tolerance. The response intentionally says
`live_forecast_readiness_verified=false`. A repeat call can return `no_replay_job`;
that does not represent another completed comparison.

Read back the actual saved row in staging:

```sql
SELECT mode, model_id, checkpoint_sha256, origin, receipt_cutoff,
       generated_at, committed_at, status, summary, input_hash,
       result->'forecasts' AS forecasts
FROM public.allert_v2_forecasts
WHERE stream_id='seed7-staging-acceptance-case01-v1'
ORDER BY committed_at DESC LIMIT 1;

SELECT count(*) AS live_alert_outbox_rows FROM public.allert_alert_outbox;
```

Expect one `mode=replay`, `status=ready` row with the six expected PM2.5/PM10
values at 6/12/24 hours, and zero live alert outbox rows in this isolated staging
project. The endpoint never calls the push sender or changes the live worker
heartbeat.

## Disable acceptance afterward

Set `ALLERT_REPLAY_ACCEPTANCE_ENABLED=false` in Vercel and redeploy. In staging:

```sql
UPDATE public.allert_v2_settings SET forecast_enabled=false WHERE id=1;
```

Preserve replay rows as evidence. Do not point production users, hardware,
ingestion or schedules at staging. Live activation still requires the real-node
mapping, 648 genuinely available contiguous valid blocks, matching database/
backend/frontend changes, and the reviewed production cutover.
