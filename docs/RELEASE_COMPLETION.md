# ALLERT release completion

Prepared against merged `main` commit `3d8c7d5954fc7d61d030699bd94aec0e10c63643`.

This batch adds scheduled verified forecasts and forecast notices, personal delivery diagnostics, Apple/Mozilla Web Push provider support, route loading on demand, and deployment inventory checks. Existing account, diary, family-sharing, telemetry, location and admin features remain in place. A request cancellation fallback supports browsers without `AbortSignal.any()` (including Safari before 17.4). Existing layouts and logo assets are retained; small forecast-status sections are added to Settings and Environmental.

## What is already verified

The user reported successful hosted FastAPI uploads while the PC was completely off, phone-based Wi-Fi setup through the running ESP8266's FLASH button, and queued blocks surviving a power cycle before draining after reconnection. Those basic hardware checks are complete. The Render FastAPI service stays in the architecture.

This release does not change the firmware, FastAPI service, node credentials, model checkpoint, model equations, clinical matching protocol, or existing anomaly schedule. There is no need to reflash the node for this batch.

## How the new collector works

- A separate authenticated worker checks the explicitly assigned model sensor once per minute. Existing anomaly processing continues separately.
- Forecast origins remain on the existing 15-minute grid. Eligible input requires 648 genuine five-minute blocks over 54 hours, valid quality, receipt timestamps, and the current ownership period. Missing blocks are never padded.
- Current verified cached forecasts are reused. Otherwise eligible input is sent to the existing hosted model endpoint with a bounded timeout. Model identity, checkpoint, live mode, origin, horizons, units and targets must pass the existing validators.
- Both adult and pediatric evidence are captured prospectively for each current household account. No diary or symptom information is shared.
- Each account's current category selects the notice. The highest tier across 6/12/24 hours is selected; ties use the earliest horizon. Only high and very high tiers can notify. Lower tiers remain visible in history.
- One notification round per account per hour is allowed; a higher tier may escalate sooner. Each browser binding has at most one reserved transport attempt per notice. Unknown outcomes are recorded as uncertain rather than retried blindly. Provider 404/410 removes the expired binding.
- Push preferences, Manila quiet hours, current ownership, membership and membership period are checked before reservation. A new family member does not receive a forecast originating before their access. Old pending notices expire after 20 minutes, including those deferred by quiet hours.
- Lock-screen content is generic and fixed locally. Push messages contain no score, patient name, coordinates, diary content or private link.
- A successful collection heartbeat means a forecast was verified and archived. Provider acceptance is displayed separately and does not prove that a device displayed the notification.
- Only one model sensor is currently explicitly mapped to the trained `node-1` contract. Additional physical sensors can use the existing ingestion path, but require a separately validated model assignment before claiming their own model forecasts.

## Step 1 — Apply locally

Save `ALLERT_release_completion.patch` in the ALLERT repository root. Start from updated `main`.

```powershell
git status
git switch main
git pull --ff-only origin main
git switch -c feature/app-release-completion
git apply --check --ignore-space-change --ignore-whitespace ALLERT_release_completion.patch
```

No output from the last command means the check passed. If there are source changes or conflicts, stop and retain them; do not overwrite your work. If the only tracked changes are regenerated `dist` files, restore that generated directory with `git restore -- dist` before checking the patch again. Downloaded untracked patch files can remain.

Then:

```powershell
git apply --ignore-space-change --ignore-whitespace ALLERT_release_completion.patch
npm test
npm run build
npm run audit:release
```

No new dependency installation or package-lock change is required. App checks should show 595 passing tests. The existing Python checks remain available:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -v
py integration/test_firmware_logic.py
```

The patch intentionally removes tracked generated `dist` artifacts and ignores future build output. Vercel already uses `npm run build` and `dist` as its output directory. Source logos remain in `src/imports` and `public/icons`; the local build regenerates the deployed assets.

## Step 2 — Supabase website: database

Use the existing project `fugziwuyiecvdopdnkmn` → SQL Editor. Run the full contents of each new migration **once**, in this order:

1. `supabase/migrations/20261017010000_scheduled_forecast_alerts.sql`
2. `supabase/migrations/20261017020000_browser_push_providers.sql`

“Success. No rows returned” is expected. Earlier migrations, including family sharing and forecast evidence, must already exist. Do not rerun historical table-creation migrations. The new tables have RLS and service-only mutation functions; browser clients cannot directly modify them.

## Step 3 — Supabase website: complete backend files

Open Edge Functions → **make-server-a473accf** → Code. Keep the currently active entrypoint and adjacent modules together.

Add:

- `forecast-worker.mjs`
- `forecast-routes.mjs`

Replace with the patched local versions:

- `index.tsx`
- `push-policy.mjs`
- `push-delivery.mjs`
- `push-routes.mjs`
- `clinical-routes.mjs`

Every file above comes from local `supabase/functions/server/`. Keep `node-ownership.mjs` and all other imported modules. Add all files before deploying so the entrypoint never imports a missing module or export. Then deploy the function.

Keep the existing `verify_jwt = false` setting; the handlers enforce user authentication or the private worker token. Do not change or redeploy `sensor-ingest` for this batch. No Render deployment is required.

`npm run audit:release` prints the local backend import inventory and abbreviated content hashes. Compare it with the website editor when resolving duplicated files. It flags the old, unimported local `node-claim-validation.mjs` for review; the current entrypoint uses `node-link-validation.mjs`. This audit cannot inspect your dashboard remotely or prove which extra dashboard copies are safe to delete. Keep unknown copies until their references and the active entrypoint are checked.

## Step 4 — Supabase website: enable the collector

In Edge Functions → Secrets, add:

```text
ALLERT_FORECAST_ALERTS_ENABLED=true
```

Keep existing values for:

```text
ALLERT_FORECAST_SENSOR_ID
ALLERT_MODEL_BASE_URL
ALLERT_MODEL_API_TOKEN
ALLERT_ALERT_WORKER_TOKEN
ALLERT_VAPID_PUBLIC_KEY
ALLERT_VAPID_PRIVATE_KEY
ALLERT_VAPID_SUBJECT
```

`ALLERT_FORECAST_SENSOR_ID` should be the intended existing model sensor, currently `ALLERT-NODE-001`. The model URL must use HTTPS and the existing model API contract. Your teammate still needs to confirm reachability and the model settings; the presence of secret names is not proof that the service is hosted or working.

Do not paste private values in chat, frontend files, the SQL schedule text or Git. Do not regenerate working VAPID keys; doing so invalidates existing subscriptions. These are Supabase Edge Function secrets, separate from Render's server settings.

## Step 5 — Supabase website: schedule and inspect

Run `docs/sql/schedule-forecast-worker.sql` in SQL Editor. It reuses the already configured Vault entries `allert_alert_worker_token` and `allert_alert_gateway_key`, creates the private scheduler wrapper, installs the named one-minute job, and queues one immediate request. It does not replace the anomaly job. A numeric request ID means queued, not completed.

Wait about 1–2 minutes and run `docs/sql/check-forecast-worker.sql`.

Expected:

- Recent HTTP responses for the worker should be 200 when processing completed without an operational error.
- `last_finished_at` advances. `status` describes model/input readiness.
- `warming_up` with fewer than 648 eligible blocks is valid. The required continuous window is 54 hours; a software deployment cannot shorten it.
- `missing_server_receipt_times` or `duplicate_blocks` requires correcting ingestion/data quality, not inventing timestamps or padding rows.
- `model_not_configured`, `model_service_error`, `model_output_unverified` or `service_unavailable` requires investigation. Do not label these working hosted predictions.
- `ready` and a recent `last_success_at` mean verified forecasts were captured.
- Zero accepted notifications is normal when forecasts stay below threshold, preferences are off, quiet hours apply, no browser is connected, or delivery has been throttled.

Recent pg_net response rows can also include the existing anomaly requests. If the new worker has no heartbeat, inspect the Cron job, its run details, Edge Function logs and the Vault configuration; a different worker's 200 response is not proof that this one ran.

To pause only the new collector, set `ALLERT_FORECAST_ALERTS_ENABLED=false`. To remove only its schedule:

```sql
SELECT cron.unschedule('allert-verified-forecasts');
```

Keep archived evidence and the existing anomaly job. Re-enable the flag and rerun the schedule script when ready.

## Step 6 — Frontend and real-device acceptance

Run the local app and check the existing login logo, dashboard, diary slider/layout, save/edit/delete persistence, profile editing, recovery, family link, location and admin access. Check the new Forecast alerts section in Settings and Environmental. Refresh must show real progress or errors, never fabricated healthy status.

After the branch is reviewed and merged, the Vercel owner should deploy the new source. Open the deployed app and reload; its service worker and manifest have revalidation headers. Existing push bindings remain in place. Larger route files load on demand. A failed route load offers an explicit reload instead of silently discarding unsaved work.

Browser push support now accepts the standard Google FCM, Mozilla Autopush and Apple Web Push providers. This is not a promise that every browser/provider works. On iPhone, use iOS 16.4 or later, open ALLERT in Safari, choose Share → Add to Home Screen, launch that icon, sign in, enable the account's Push Notifications, then tap Connect this browser. Permission is requested by the connect button, never by merely opening Settings. Send a test and confirm its actual display. Installation by itself does not enable push.

For each tested device, record: browser/OS, install state, permission, connected status, test accepted, actual displayed, notification click destination, quiet-hour suppression and sign-out cleanup. Chrome desktop was previously verified by the user. Apple/Mozilla encrypted payload generation is covered locally, but real provider/device delivery still needs acceptance testing.

A genuine automatic forecast push additionally needs eligible input, an available verified model and a qualifying forecast. Do not modify real sensor values, forecasts or production thresholds to force an alert. Test fixtures already cover the trigger and refusal paths. Genuine anomaly alerts require fresh qualifying measurements under the existing detector.

## Remaining acceptance work

| Item | Current state | Finish condition |
| --- | --- | --- |
| PC-independent uploads | User verified | Keep the node on a separate supply and confirm fresh deployed readings after later releases. |
| Phone Wi-Fi reopening | User verified on this node | FLASH GPIO0 is configured privately; hold 3 seconds after boot. Keep FLASH released during reset/power-on. Users do not need Arduino IDE for routine setup after firmware installation. |
| Basic queued power-loss recovery | User verified | Original observation times, later receipt times and one persisted copy were checked. Longer outages and queue-full behavior remain endurance checks. |
| Model hosting/settings | Teammate-controlled | Confirm HTTPS service, contract, checkpoint and receipt-bearing input. No model files or equations were changed here. |
| Automatic forecast notices | Implemented in this batch | Deploy migrations/files/flag/Cron, then verify a genuine qualifying forecast and device display. |
| Anomaly push | Existing implementation and healthy worker reported | Verify a genuine anomaly event and real device display; test push alone does not prove detection. |
| Ownership transfer | Automated protections pass | Perform a planned A → unlink → B → return test with fresh setup codes; confirm A and former family members lose access and B gets no previous household history. |
| Second physical node | Multi-device ingestion tests pass | Register its own device ID, upload token and routing; use a separate household/account and verify isolation. Model assignment must be separately validated. |
| Location | Implemented and prior checks passed | On the deployed phone, test allow/deny, save/reload, disable, owner-only edits and the correct node; coordinates are saved at capture, not continuous background tracking. |
| Clinical correlation | Implemented; real evidence required | Collect at least seven genuine matched days with varying tiers and symptom values. Numeric availability and clinical validation cannot be completed today with invented history. |
| Admin and production release | Live admin screens implemented | Test an admin and non-admin account, real node statistics/events, source inventory and deployed frontend routes. |
| Mobile push | Provider support implemented | Perform real iPhone Home Screen and intended Android/browser acceptance. |

## Commit and PR after local checks

```powershell
git add -- .gitignore docs integration package.json public src supabase/functions/server supabase/migrations scripts vercel.json
git add -u -- dist
git --no-pager diff --cached --stat
git diff --cached --check
git status
```

The generated `dist` deletions are intentional in this release. Real node secrets, TLS headers, backend `.env`, downloaded patch files and virtual environments must not be staged.

Then:

```powershell
git commit -m "Add scheduled verified forecast alerts and release diagnostics"
git push -u origin feature/app-release-completion
```

Create a PR into `main`, have the owner review and merge it, and verify the deployed frontend. A conflict-free PR is not a substitute for tests and deployment checks.

## Local verification

- 595 app tests: database permissions, prospective capture, ownership/membership changes, expired leases, input validity, model verification, worker authentication, account-scoped diagnostics, independent preferences, quiet hours, escalation limits, delivery idempotency, provider allowlists, service-worker privacy and UI states, plus all existing regression checks.
- 20 FastAPI tests passed. Its existing Starlette/httpx deprecation warning does not fail the tests; dependencies were not changed in this batch.
- Existing firmware queue/time/retry/endpoint logic checks passed. No firmware source changes or new ESP8266 compilation are required by this patch.
- Deno encrypted Web Push round trips passed for the fixed forecast payload through Google, Apple and Mozilla endpoint shapes using a fake transport. No live push was sent by these checks.
- Production build passed. Main JS is approximately 262.9 KB (85.7 KB gzip); individual screens are separate chunks, with the largest around 438.7 KB. These are build measurements, not an internet-speed benchmark.
- Source import audit passed and the patch was checked on clean and Windows-style CRLF checkouts.

## Primary platform references

- Apple/WebKit iPhone Home Screen Web Push: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- Safari 17.4 request cancellation support: https://webkit.org/blog/15063/webkit-features-in-safari-17-4/
- Apple sending Web Push: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- Mozilla Autopush endpoint documentation: https://mozilla-services.github.io/autopush-rs/http.html
- ESP8266 boot selection and GPIO0: https://docs.espressif.com/projects/esptool/en/latest/esp8266/advanced-topics/boot-mode-selection.html
