# Deploying ALLERT: Vercel frontend, Supabase backend, Python model

Deploying the current React/Vite app to Vercel does not execute PyTorch or start the Python publisher. The website can display model results after the Supabase function is deployed and a verified Python process publishes them. A single saved result proves the display path, not continuous live operation.

Latest status (October 11, 2026): the app is deployed at https://allert-ten.vercel.app and the private cloud model API is deployed on Render Free at https://allert-model.onrender.com. All twelve external cloud golden cases, authorization checks and the indicator example passed. A cloud-computed historical snapshot was published to the app's Supabase bridge. Python 3.12.14 CPU replay passed locally, the partner suite passed 27 tests and the deployed bridge passed 11 checks. The laptop model service is stopped. Hardware is not ready, and continuous telemetry/jobs/detector/push integration remains pending. Render Free sleeps when idle; this deployment establishes the cloud replay path, not continuous production operation.

## Architecture

```text
Device → authenticated ingestion → Supabase telemetry + jobs
                                      ↓
                         continuously running Python worker
                                      ↓
                       Supabase stored indicators/forecasts/events
                                      ↓
                    authorized Edge read API → Vercel app
```

Vercel hosts the interface. Supabase stores data, authenticates users and serves authorized reads. An always-running Python host loads the selected model and processes jobs. CPU is an available inference path, subject to passing the package self-test; a GPU is not required for the first demonstration.

Vercel supports Python functions, but functions have bundle and execution-duration limits. The current code has no Vercel Python function or automatic model deployment. For this package's polling-worker architecture, use a continuously running service, such as a VM/container or a background worker. Render's background workers are one option; selecting that service does not implement the missing queue loop. See [Vercel function limits](https://vercel.com/docs/functions/limitations) and [Render background workers](https://render.com/docs/background-workers).

## What currently works and what remains

| Component | Current state |
|---|---|
| Frontend build | Passed locally |
| Model package integrity | Both archive checksums and all 76 manifest-listed files passed |
| Selected model | Frozen single run, seed 42, epoch 15; model ID median-residual-single-v1 |
| Python inference on this machine | Python 3.12.14 installed locally; all 12 golden cases passed |
| Publisher | Implemented: verifies package, computes one forecast/current indicator snapshot, optionally publishes, then exits |
| Edge model routes | Deployed; 11 authorization/persistence checks passed |
| Vercel site | Production ready at allert-ten.vercel.app; app shell/deep links verified |
| Live ingestion/durable worker/alerts | Still require implementation and end-to-end tests |

The current snapshot publisher requires a complete valid model history before publishing anything, including its current indicator. In the final worker, current measurement/risk processing must operate independently of forecast warm-up or forecast failure.

## Stage 1: prove the model itself works

Install Python 3.12 using the official installer for your platform. On Windows, confirm `py -3.12 --version` works. Do not substitute 3.13 and claim release equivalence.

Open PowerShell in:

```text
C:\Users\PC\Desktop\Allert-main\model\runtime\allert_model_partner_v1
```

Run the supplied setup and checks:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install torch==2.11.0 --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-test.txt
.\.venv\Scripts\python.exe -m allert_runtime.cli verify
.\.venv\Scripts\python.exe -m allert_runtime.cli self-test --device cpu
.\.venv\Scripts\python.exe -m pytest tests -q -p no:cacheprovider --basetemp=outputs/pytest
.\.venv\Scripts\python.exe -m allert_runtime.cli forecast --input examples/forecast_case_01.json --device cpu
```

Success means:

- Verification reports `package_hashes_verified`.
- Self-test reports `passed_selected_model_golden_replay`, 12 cases and maximum difference below 0.02 µg/m³.
- The package tests pass without failures. Save the actual result, rather than assuming the partner's receipt applies to this host.
- Forecast JSON contains six finite nonnegative outputs: PM2.5 and PM10 at 6, 12 and 24 hours, units `ug/m3`, the selected checkpoint and correct five-minute target intervals.

If a pinned dependency wheel is unavailable, retain the installation error and resolve it with the model partner. Do not silently change versions or retrain.

These checks establish software reproduction. They do not establish predictive accuracy on future real measurements. Assess that later by comparing predictions with actual readings at each target block, retaining all forecasts rather than selecting successful examples.

## Stage 2: deploy the Supabase staging bridge

Use a staging project first. The app currently references Supabase project `fugziwuyiecvdopdnkmn` in `utils/supabase/info.tsx`. Decide whether that is the intended project. A separate staging project requires the frontend project ID/public key, deployment target, existing KV schema and user accounts to agree.

Install the Supabase CLI using its official instructions, then work in the **inner app folder**:

```powershell
Set-Location C:\Users\PC\Desktop\Allert-main\Allert-main
supabase login
supabase init
supabase link --project-ref YOUR_PROJECT_REF
```

Run `init` only if there is no existing config; merge settings into an existing config rather than replacing it.

The source folder is `supabase/functions/server`, while the frontend calls a deployed function named `make-server-a473accf`. Preserve that deployed name by adding this custom entrypoint to `supabase/config.toml`:

```toml
[functions.make-server-a473accf]
entrypoint = "./functions/server/index.tsx"
verify_jwt = true
```

The CLI supports custom `.tsx` entrypoints. See [function configuration](https://supabase.com/docs/guides/functions/function-configuration).

In Supabase Dashboard → Edge Functions → Secrets, set:

| Secret | Value |
|---|---|
| ALLERT_WORKER_TOKEN | Long random secret shared only by the publishing process and Edge function |
| ALLERT_NODE1_USER_IDS | Comma-separated UUIDs of permitted users from Supabase Auth |
| ALLERT_DISPLAY_REPLAY | `true` for the first historical demonstration |

Supabase normally supplies `SUPABASE_URL` and legacy keys to Edge Functions; confirm the keys used by this project's existing handlers are available. Verify the existing `kv_store_a473accf` table exists. A new project needs this existing app schema and deny-by-default client access to the KV table; deploying a function does not create database tables or migrate user/profile/diary data. See [Edge environment variables](https://supabase.com/docs/guides/functions/secrets).

Deploy:

```powershell
supabase functions deploy make-server-a473accf
```

Do not deploy under `server` while leaving the frontend URL unchanged. Do not disable gateway verification on all routes to fix a 401. This bridge was written for the project's existing legacy JWT/anon-key arrangement. If moving to new `sb_*` keys or new signing-key configuration, adapt gateway and handler authentication deliberately and test signup/login, user reads and worker publishing independently. See [Supabase key migration](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).

## Stage 3: publish one verified historical snapshot

In a private PowerShell terminal, export the following process variables. The token must match the Supabase secret:

```powershell
$env:ALLERT_EDGE_BASE_URL = "https://YOUR_PROJECT_REF.supabase.co/functions/v1/make-server-a473accf"
$env:ALLERT_GATEWAY_KEY = "YOUR_PROJECT_LEGACY_ANON_JWT"
$env:ALLERT_WORKER_TOKEN = "YOUR_PRIVATE_WORKER_TOKEN"
Set-Location C:\Users\PC\Desktop\Allert-main
```

The publisher does not load `.env` automatically. These values belong to the Python process; the worker token and service-role keys must never be added to Vercel frontend variables or browser code.

First inspect a computed result without publishing:

```powershell
.\model\runtime\allert_model_partner_v1\.venv\Scripts\python.exe .\Allert-main\integration\publish_model.py --input .\model\runtime\allert_model_partner_v1\examples\forecast_case_01.json
```

Then publish the same fixture to staging:

```powershell
.\model\runtime\allert_model_partner_v1\.venv\Scripts\python.exe .\Allert-main\integration\publish_model.py --input .\model\runtime\allert_model_partner_v1\examples\forecast_case_01.json --publish
```

Expected response: `status: stored`, `mode: historical_fixture`. Check the KV row `environment:v1:historical_fixture` and compare its six values with the printed result. The route rejects another model/checkpoint/risk-rule hash, malformed outputs and another node.

This script exits after publishing. There is no scheduler, telemetry fetch loop or queue consumer hidden behind it. The reference FastAPI `/health` similarly reports a running process only; it does not prove inference or Supabase persistence works.

## Stage 4: deploy the interface to Vercel

Upload/push the app source using your normal deployment workflow. The Vercel build root must be the folder containing the app's `package.json`, not the outer folder containing `model`.

| Setting | Value |
|---|---|
| Framework | Vite |
| Root directory | `Allert-main` if your repository starts at the outer workspace; `.` if the repository already starts at the inner app |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |

The current frontend reads its Supabase project configuration from source; adding unused Vercel environment variables does not redirect it to another project.

For browser-route refreshes such as `/app/dashboard`, put `vercel.json` beside the app's `package.json`:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

See [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite). Deploy the site, sign in as an assigned user, then open `/app/dashboard`.

Success means:

1. Browser DevTools → Network shows the `/environment` request returning 200.
2. Response availability is `historical_replay`, and both screens explicitly label historical replay.
3. Now shows the fixture's exact measurements and the correct adult/pediatric environmental points.
4. +6/+12/+24h show the exact saved PM values, target intervals, origin and selected model ID.
5. Refreshing a deep link works, and unassigned users receive 403 rather than someone else's data.

This completes a historical end-to-end demonstration. It does not establish a live worker or validate the remaining prototype screens.

## Stage 5: implement and host continuous live processing

Before choosing a start command for a cloud worker, implement the queue consumer. Neither `publish_model.py` nor the supplied FastAPI service provides it. Running the publisher once on Render or a VM will still produce only one snapshot.

Required work, in order:

1. Confirm the real device packet: node-1, units, UTC block start/end, five-minute means, quality/sample counts and per-device authentication. Assign actual receipt time on the server.
2. Review the supplied SQL draft in staging and implement transactional ingestion + durable jobs, node assignments and protected reads. Keep existing users/profiles/diaries. Test identical retries and conflicting duplicates.
3. Implement an outbound Python job loop. Cache one `ModelRuntime`, claim leased jobs, fetch only the correct node's available history, retry failures and commit results under unique job/run identities.
4. Process current risk and observed PM decisions for valid blocks independently of the forecast path. Persist detector snapshot/version, events, outbox and completion atomically; restore state after restart.
5. Initially schedule forecasts at 15-minute origins. Retrieve approximately 54 hours of real five-minute history for the final 48-hour network input. Missing/invalid history must produce an explicit availability reason; never pad with fixtures.
6. Replace the staging latest-snapshot cache with the durable read model. Preserve run origin/generated times, six target intervals, model/checkpoint/input identity and freshness. Keep current measurements available during forecast warm-up.
7. Deploy this worker on an always-running host with explicit Python 3.12 and pinned dependencies. Upload the app integration code **and** the extracted sibling model runtime/bundle; Vercel's `dist` does not contain the model. Keep the same directory layout or deliberately update its path.
8. On that host rerun package verification, all 12 golden cases and regression tests before enabling jobs. Configure least-privilege backend credentials, restart supervision, logs and heartbeat monitoring. Measure RAM and inference/job time under your actual workload before choosing capacity.
9. Set `ALLERT_DISPLAY_REPLAY=false`. Confirm a genuine device packet becomes a stored reading, a processed job and a correctly timed model result on the Vercel app. Never relabel fixture dates as live.
10. Implement user-session refresh, real device status/selection, protected admin screens and measured history. Add push subscriptions/consent, sender, expiration and delivery records separately if background alerts are required.

For an initial local live test, the worker may run on your laptop using outbound Supabase connections. Your laptop must remain awake and online. Supabase cloud functions cannot reach that laptop by calling their own localhost. For unattended operation, move the tested worker to the continuously running host; the browser does not need to stay open.

## How to know it is functioning properly

| Check | Evidence required |
|---|---|
| Model execution | 12-case golden replay passes on the actual deployed host |
| Current indicator | Input PM2.5 20, PM10 40, temperature 30, humidity 70 returns adult 25.8401 and pediatric 28.2181 points, both High, with supplied rules |
| Data pipeline | A real packet's identity, values and observation/receipt timestamps survive ingestion through dashboard display |
| Continuous processing | New valid forecast origins/jobs appear without manually executing a script |
| Forecast semantics | Exactly six PM values with correct target blocks; no future-allergy percentages |
| Worker restart | Pending jobs resume; persisted detector state is restored; no duplicate event/notice |
| Browser closed | Ingestion and processing continue; reopening reads the latest stored state |
| Worker stopped | Data becomes explicitly stale/unavailable rather than displaying live/Low risk |
| Access isolation | Missing/expired credentials fail; an unassigned account cannot read node data |
| Future predictive performance | Saved predictions are matched with later actual target-block observations and assessed over a representative period |

The current staging read route marks live snapshot observations stale after 15 minutes; the browser polls every 60 seconds and on focus. These are staging settings, not a guaranteed detection or delivery latency. Displayed PM predictions do not need to match observations exactly to prove execution; the golden fixture test has a different purpose from real-world forecast evaluation.

## Troubleshooting

| Symptom | First checks |
|---|---|
| Vercel loads but dashboard unavailable | Was the Edge function deployed? Did publishing succeed? Is replay mode configured consistently? |
| 401 | Missing/expired user JWT, wrong worker token, wrong legacy gateway key or incompatible gateway/signing configuration |
| 403 | Logged-in user's Auth UUID is absent from ALLERT_NODE1_USER_IDS |
| 404 on API | Wrong project or deployed function name; frontend expects make-server-a473accf |
| 404 refreshing /app/dashboard | Missing Vercel SPA rewrite |
| 400 publishing | Inspect snapshot identity, six unique outputs, risk/checkpoint hashes, node-1, quality and timestamp contract |
| KV/database error | Confirm existing KV table and service-role environment; inspect Edge logs without logging secrets |
| Model rejects live request | Check origin freshness, chronological five-minute continuity, correct node, quality and genuine receipt timestamps |
| Numbers never update | Current publisher is one-shot; implement/start the continuous worker and inspect job backlog |
| Model unavailable after host restart | Verify process supervision, environment, model files and startup replay checks |

Complete the package's `04_ACCEPTANCE.md` and the local `MODEL_INTEGRATION_CHECKLIST.md` before describing the system as fully functional with live telemetry and alerts.
