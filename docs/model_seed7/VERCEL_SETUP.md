# ALLERT seed7 model on Vercel

Prepared against `main` commit `7063b25d3e6d6d29c8bc4e93b3f6d9b9f9e80ac5`.
This is a reviewable local implementation, not a completed cloud deployment.

## Hosting arrangement

| Component | Host / responsibility |
| --- | --- |
| Existing ALLERT web app | Existing Vercel frontend project |
| Sensor ingestion | Existing Render FastAPI service; PC remains unnecessary |
| Selected seed7 CPU model and observed-PM worker | **Separate Vercel project**, Root Directory `analytics` |
| Observations, jobs, detector state, forecasts, notices | Supabase PostgreSQL |
| Minute trigger | Supabase pg_cron → authenticated Vercel `/internal/tick` |
| Push subscriptions and delivery | Existing Edge Function and recipient outbox; consent, quiet hours and account access still apply |

Vercel supports FastAPI/Python, but functions are bounded invocations. The worker drains a bounded batch and stores all durable state in PostgreSQL. No browser screen runs inference. Warm instances reuse the network; a restart reloads committed state. Database leases, unique keys and compare-and-swap protect overlapping invocations and retries.

The frozen CPU PyTorch installation alone measured approximately 709 MiB on the local test machine, above the ordinary 500 MB Python function limit. **Enable Fluid Compute with Active CPU and Large Functions** (`VERCEL_SUPPORT_LARGE_FUNCTIONS=1`). Current Vercel documentation permits up to 5 GB for eligible Large Functions in beta. The final Vercel build, account eligibility, memory use, cold starts and usage charges must still be checked. No platform build or hosting claim is inferred from the local tests.

Vercel Hobby cron runs only daily. This implementation therefore has no Vercel `crons` entry. Supabase invokes the authenticated function every minute; current jobs follow actual five-minute observations and forecast jobs issue on the fifteen-minute grid. It does not keep an idle Python loop running. The Vercel invocation limit is 120 seconds; the batch has a 45-second soft budget with bounded database requests. Unfinished or terminated leases can retry.

## 1. Apply locally first

Download `ALLERT_seed7_vercel.patch` into the Windows `Allert` folder. Preserve any existing work; do not restore firmware or clear local secrets to make a patch apply.

```powershell
git status
git switch -c feature/seed7-vercel
git apply --check --whitespace=nowarn --ignore-space-change --ignore-whitespace ALLERT_seed7_vercel.patch
```

The supplied release preserves original line endings through its own `.gitattributes`. `--whitespace=nowarn` suppresses first-application CRLF warnings; do not use `--whitespace=fix`, which would change frozen hashes. If the check has no output, apply it:

```powershell
git apply --whitespace=nowarn --ignore-space-change --ignore-whitespace ALLERT_seed7_vercel.patch
npm ci
npm run typecheck
npm test
npm run build
npm run audit:release
```

The patch does not edit your `.ino`, `node_secrets.h`, TLS roots or local `.env`. Keep those private. Do not add virtual environments, output receipts, patches, or secrets to a commit. The app keeps the original logo, layout classes and navigation. The Risk Monitor semantics change as described below.

For reproducible model checks, use Python 3.12 and a separate model environment:

```powershell
py -3.12 -m venv .venv-model
.\.venv-model\Scripts\python.exe -m pip install -r analytics/requirements.txt
.\.venv-model\Scripts\python.exe -m pip install pytest==9.1.1
.\.venv-model\Scripts\python.exe scripts/verify-seed7.py
```

`scripts/verify-seed7.py` checks exact runtime versions, all 88 release hashes, 12 golden cases, 30 original tests and 35 adapter/Vercel tests. It does not contact Supabase or deliver push. Its source fixture node alias is deliberately isolated from the app's registered node alias. It never edits expected fixtures. A Starlette TestClient deprecation warning is recorded; the supplied ML environment is intentionally retained.

The existing Render backend uses its own environment:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -v
```

## 2. Review and provision staging

Use a **separate Supabase staging project** with a reviewed schema-only copy of the app's existing base tables, functions and migrations. Do not copy production accounts, diaries, coordinates, tokens or push subscriptions. The repository's incremental migrations assume existing base tables, so running only the new migration on an empty project is insufficient.

After the base schema is verified, run this new migration once in the **staging** SQL Editor:

`supabase/migrations/20261017030000_seed7_analytics.sql`

It creates the canonical v2 tables and privileged RPCs, attaches ingestion mirror triggers to already registered reading tables, and leaves both worker/forecast settings disabled. It does not delete old records. A failure in canonical insertion or job creation rolls back the original upload, so the node retains the packet. New device registrations require a reviewed mirror-trigger attachment or the v2 ingestion RPC; neural forecasting remains restricted to the validated source node.

Verify with the researcher that physical `ALLERT-NODE-001` is the training Node 1 sensor/site. Do not enable its neural forecast flag until that mapping is confirmed. Additional nodes can use telemetry/current observed-PM processing; neural transfer to them is not validated.

## 3. Create the separate Vercel model project

After the branch has been reviewed and pushed, use Vercel's website:

1. **Add New → Project → import the same `mawii0/Allert` repository.** A teammate with repository/Vercel team access may need to import it.
2. Give it a distinct staging name, for example `allert-model-staging`.
3. Select the reviewed feature branch for staging deployment. Set **Root Directory = `analytics`** and **Framework Preset = FastAPI**. The existing frontend Vercel project stays separate.
4. Keep Python **3.12** (`analytics/.python-version`). Build Command is **`python build.py`** from `analytics/vercel.json`. Do not set the frontend's `npm run build` or `dist` output directory for this project. Do not add a persistent Uvicorn start command.
5. Enable Fluid Compute with Active CPU and add `VERCEL_SUPPORT_LARGE_FUNCTIONS=1`. Verify Large Functions is available to this project before proceeding.
6. Configure the following **private server environment variables**, scoped to the intended staging deployment. Never put these in `VITE_` variables, firmware, public files or chat.

| Name | Staging value / purpose |
| --- | --- |
| `SUPABASE_URL` | Staging project's HTTPS origin |
| `SUPABASE_SECRET_KEY` | Staging private server secret, or legacy service-role key |
| `ALLERT_WORKER_TOKEN` | New random private token, at least 64 characters; shared only with the staging Vault caller |
| `ALLERT_ANALYTICS_ENABLED` | `false` initially |
| `ALLERT_VALIDATED_NODE_ID` | `ALLERT-NODE-001`, subject to researcher confirmation |
| `ALLERT_DEVICE` | `cpu` |
| `ALLERT_ALLOW_EXPERIMENTAL_NODES` | `false` |
| `ALLERT_FORECAST_PM_INDICATOR_ENABLED` | `false` initially; optional interpretation policy |
| `VERCEL_SUPPORT_LARGE_FUNCTIONS` | `1` |

Generate a worker token locally without committing it. It is separate from the node upload token, Supabase service key and old Edge worker token. If Vercel Deployment Protection is enabled, configure an Automation Bypass secret for the Supabase caller; keep protection enabled and keep the application's bearer authentication too.

Deploy only the reviewed staging project. The build gate loads the exact CPU checkpoint, verifies the policy mirror and runs all 12 frozen golden cases. Failure stops the build. This step has **not** been performed by the patch author.

## 4. Check the deployed model service

The actual model URL comes from the **new Vercel project → Deployment → Visit**, for example `https://allert-model-staging.vercel.app`. Do not substitute the frontend's URL or Render's sensor API URL.

| Request | Expected meaning |
| --- | --- |
| `GET /health` | Process liveness, selected model ID; explicitly does not claim database readiness |
| `GET /internal/readiness` with private bearer token | Exact checkpoint and policy hashes; runtime loaded; still not an end-to-end database test |
| `POST /internal/tick` with private bearer token and empty body or `{}` | Bounded live job processing; initially disabled |
| Internal request without valid bearer token | 401, or 503 if worker authentication has not been configured |

There is no public prediction/upload endpoint, Swagger page, static model download or browser CORS access. The deployed wrapper cannot accept caller-selected nodes, streams, model files or arbitrary readings. Inference consumes only authenticated server-side jobs. A public health response alone does not prove forecasts are working.

## 5. Deploy the matching staging Edge Function and frontend

In the staging Supabase website, open the `make-server-a473accf` Edge Function. Use **all matching local files** from `supabase/functions/server/`, including these additions:

- `indicator-policy.json`
- `indicator-policy-hash.mjs`
- `seed7-policy.mjs`
- `seed7-read-routes.mjs`
- `observed-dispatch.mjs`

Replace the matching changed `index.tsx`, `admin-monitoring.mjs`, `app-feature-routes.mjs`, `clinical-routes.mjs`, and `push-routes.mjs`. Keep their unchanged dependencies, including household/authentication, node ownership, policy and push modules. `npm run audit:release` prints the complete actual import graph and hashes. Compare it with the website editor before deployment; don't paste only the entrypoint or delete unknown duplicated dashboard files blindly.

Authentication stays enforced inside the handlers; keep the existing project's `verify_jwt=false` handler configuration. Health revision should be `seed7-joint-policy-durable-v1`. Retired standalone model publishers and old forecast/CUSUM workers are no longer installed by the entrypoint. Historical modules and old results remain for audit/regression.

For a separate local/staging frontend, supply **both public settings** from `.env.example`:

- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_PUBLIC_KEY`

Use the staging project reference and its public publishable/anon key. Private/service-role keys are rejected. Use a separate staging origin or browser profile to avoid crossing existing production sessions. Without overrides, the original production project defaults remain; do not run staging checks against that default accidentally.

Keep the observed-push sender feature flag **off** during replay. Do not copy real browser subscriptions. Tests and historical fixtures must never deliver real push.

## 6. Install the staging scheduler caller

Use the Dashboard's Vault UI to create exactly one staging value for each:

- `allert_seed7_vercel_origin`: exact new staging model Vercel origin, no trailing slash.
- `allert_seed7_worker_token`: matches the new `ALLERT_WORKER_TOKEN`.
- Optional `allert_seed7_vercel_bypass`: the staging project's Automation Bypass secret.

Review `docs/sql/STAGING-schedule-seed7-vercel.sql`. It installs only the private `request_allert_seed7_vercel_tick()` caller; invocation and minute schedule are commented out deliberately. It never embeds a token in the cron command. Enable pg_net/pg_cron if absent. Verify the target project before running any staging SQL.

After staging approval, set the Vercel `ALLERT_ANALYTICS_ENABLED=true` and redeploy it; in the staging SQL Editor enable current processing only:

```sql
UPDATE public.allert_v2_settings SET enabled=true WHERE id=1;
```

An authorized staging operator can then invoke the private caller once and inspect `net._http_response`, `allert_v2_worker`, jobs and committed current state. Transport 200 is insufficient: confirm `summary.enabled=true`, errors zero, actual processed jobs and matching state/observation timestamps. Only then activate the single minute schedule shown in the SQL file. Database jobs are durable if the trigger host pauses; stale observations are not treated as fresh recovery evidence.

After source-node confirmation and replay acceptance, enable the separate staging forecast flag:

```sql
UPDATE public.allert_v2_settings SET forecast_enabled=true WHERE id=1;
```

New aligned observations create forecast jobs. Each requires **648 contiguous, valid, receipt-bearing five-minute blocks** (54 hours including feature warmup). The network itself consumes 576 rows/48 hours. Gaps, invalid weather, missing receipts and duplicate times do not become fabricated inputs. No median fallback is used. If suitable historical rows already exist, the reviewed `backfill_allert_v2_history()` can preserve their **original** receipts; it never invents receipts or past predictions. Otherwise genuine collection takes at least 54 hours. Do not edit timestamps to bypass warmup.

## 7. Acceptance before production

- Replay genuine supplied fixtures in an isolated staging stream/project. Compare all six raw values, checkpoint, input hash, origin, target intervals and receipt cutoff with the frozen outputs. Confirm restart/retry does not double-insert notices or advance uncommitted state. Local unit tests cover these components separately; a deployed end-to-end replay is still required.
- With real staging telemetry, prove observations arrive through hosted ingestion, server receipts remain immutable, and current jobs commit independently of forecast warmup. Test valid PM with missing weather: observed-PM processing continues, the current all-channel indicator becomes unavailable, and the neural forecast does not manufacture weather. The new v2 HTTP/RPC path supports this; **the existing physical firmware still requires a separate per-channel sampling/queue update and hardware test**.
- Confirm the original logo/navigation/diary controls, account/session changes, household removal, ownership epoch isolation, admin roles, consent and quiet hours in actual browsers.
- Risk Monitor's gauge is the **current** environmental indicator. The 6/12/24-hour cards show neural PM2.5/PM10 for one target five-minute block, not a whole-horizon average or future weather/allergy probability. Switching population does not change the six PM forecasts.
- Optional Forecast PM indicator is **off by default**. If separately enabled, it produces one combined PM-only score per horizon with the new policy hash, no substituted temperature/humidity and no new push behavior.
- A low rounded display does not override the full-precision classification. Neutral PM/weather reference produces adult 20/Low and pediatric 22/Moderate under the supplied joint handoff.
- The symptom diary remains usable. The prior forecast-tier/Spearman protocol remains available only as explicitly historical analysis. A new prospective PM-to-symptom association protocol is pending researcher review; no coefficients or historical evidence are invented.
- Real push delivery requires a separately approved staging recipient and sender enablement. Provider acceptance is not proof a notification appeared on the device. Replay streams never enter the live recipient outbox.
- Confirm Vercel final bundle size, cold start, memory/timeout behavior, scheduling delay and usage costs on the actual account. Large Functions is beta; local CPU timings are not a service guarantee.

## Production cutover and rollback

Obtain explicit approval after staging acceptance before applying production migrations, exposing the new service or delivering real push, as required by the supplied integration instructions. No production SQL, cloud deployment, endpoint, push, service shutdown or user-data change has been performed here.

Coordinate the matching migration, model worker, Edge Function and frontend in one reviewed cutover window. The new frontend/backend contract must ship together; deploying only one can produce unavailable analytics. Keep the previous Render model service running until rollback acceptance. The separate Render **sensor ingestion service stays in use**.

Before cutover, back up the actual database and record current deployment IDs, enabled schedules and secret **names**, without printing values. The app-source rollback commit is `7063b25...`; a verified local Git archive was created before retirement changes (SHA256 `39d97f7594299cbfd2b85fe00a5b5a9d49ee04a7112dc301d2f2044b55c9672c`). That archive is not a backup of unavailable remote model weights or the production database.

Rollback disables the new schedule/worker and restores matching previous frontend/Edge deployment IDs. Preserve v2 observations/state/jobs/forecasts for audit. Do not drop tables, delete users, purge storage/subscriptions or fabricate old model weights. The only archived scheduler file is `docs/archive/20261017/schedule-forecast-worker-v1.sql`; restoring it requires deliberate review, not concurrent execution with the new model collector.

## References checked for this change

- [Vercel Python runtime](https://vercel.com/docs/functions/runtimes/python)
- [FastAPI on Vercel](https://vercel.com/docs/frameworks/backend/fastapi)
- [Vercel function limits / Large Functions](https://vercel.com/docs/functions/limitations)
- [Vercel cron usage and plan limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- Frozen source guide and identity: `analytics/seed7_release/00_START_HERE.md`, `MODEL_CARD.md`, `SELECTION_NOTE.md`, `02_API_CONTRACT.md`, `04_ACCEPTANCE.md`, `PACKAGE_MANIFEST.json`.
- Updated joint policy: `RISK_POLICY_HANDOFF.md` supplied by the researcher, updated 14 October 2026; copied for reference into this directory with final blank lines normalized. The original supplied attachment remains authoritative.
