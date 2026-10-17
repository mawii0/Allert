# ALLERT seed-7 integration guide

This is a step-by-step handoff for the app coauthors. The selected weights and runnable Python reference analytics ARE supplied. The group's PWA repository, database, worker host, device firmware and push subscriptions are NOT supplied or deployed by this package. The model is already trained; integration does not require retraining, an ensemble or Kubernetes.

## 1. Verify identity before implementing

Read `SELECTION_NOTE.md` and `MODEL_CARD.md`. Run `01_SETUP.md` and `python -m allert_runtime.cli verify`, then the CPU self-test and tests. This release is seed 7 / checkpoint 15 / 35 completed epochs, not the earlier seed-42 package. The six saved calibration values are part of the model. Hash verification detects changed bytes; it does not independently prove publisher identity or model validity. Verify the ZIP checksum through the researcher as well.

The app partner should inspect the actual code and schema. The supplied October 10 PWA description named React/Vite/TypeScript and a Supabase Deno/Hono function `make-server-a473accf`, with existing authentication, profiles and health logs and several demo environment panels. Confirm these facts in the actual repository. Do not rename the existing function, replace working account flows, or migrate diary fields based only on that document.

## 2. Assign the boundaries

```text
nodes → authenticated ingestion → Supabase telemetry + durable jobs
                                      ↓ outbound job polling
                             external Python analytics worker
                                      ↓ persisted results
                           authorized read API → ALLERT PWA
```

The worker imports and caches `ModelRuntime` from `allert_runtime.engine`. The same module exposes independent `risk()` and `observed()` calculations. It can use a verified CPU path; CUDA is optional for inference. The source training was on CUDA. The reference private FastAPI API is an alternative server-to-server boundary, not a public client backend or Supabase Auth substitute.

The recommendation to keep this Python/PyTorch runtime outside Edge Functions is an engineering choice based on runtime compatibility and resource constraints; it is not a claim that Edge cannot perform any ML. See [Supabase hosted Edge limits](https://supabase.com/docs/guides/functions/limits). Do not load these weights/joblib objects into React or assume a Deno deployment executes this ordinary Python runtime unchanged.

A thesis-scale always-running outbound-polling process is sufficient once it has durable jobs, restart handling and an explicit availability state. A cloud function's localhost is not the partner's laptop. Containerizing is optional; Docker is one deployment choice, and Kubernetes is not required by this model. See [FastAPI deployment options](https://fastapi.tiangolo.com/deployment/docker/). Hosting remains a group decision; a ZIP is not a deployment. An unattended host must remain online for analytics.

## 3. Confirm the device packet and timestamps

Before schema changes, agree the exact real packet format and aggregation with the firmware partner. Example conceptual fields: registered `node_id`, unique packet ID, `block_start`, `block_end`, PM2.5/PM10 in µg/m³, temperature °C, humidity %, and validity per channel. Each block must represent an actual five-minute mean, not an arbitrary raw sample renamed as a mean.

Use timezone-aware UTC on the wire/storage and Asia/Manila for display. `block_end=block_start+5 minutes`. The ingestion server sets immutable `received_at` and verifies per-device credentials, units, ranges, duplicates and chronology. Never invent measurements to complete a window. Preserve invalid/missing channels explicitly. Source CSVs are not the live database and must not be mutated by incoming packets.

## 4. Protect data and review the draft schema

Keep auth/profile/diary records intact. `contracts/supabase_schema_draft.sql` introduces new prefixed tables but still requires adaptation and reviewed transactional functions. It has NOT been applied. In staging implement node registration/access assignments, authenticated ingestion, telemetry-plus-job atomic insertion, leases/retries and result commits. Default-deny direct browser table access until intentional grants/policies or authorized read APIs are tested.

Server-only secret/service-role credentials must never be placed in Vite environment variables shipped to the browser, firmware or this ZIP. RLS and server-side node authorization are both important: privileged service-role operations can bypass RLS, so a privileged handler must still enforce user/node ownership. See [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Separate user JWT authentication, device credentials and worker/internal API authentication.

## 5. Isolate replay from live operations

Prefer a separate staging project for historical replay. If both streams share a database, namespace telemetry, jobs, detector snapshots, events, forecasts, caches and outbox deduplication by `(node_id, stream_id)` and relevant policy/model version. The draft detector-state primary key is only `node_id`; revise it before mixing streams. Its forecast/event/job keys also need explicit stream review. Do not pass a combined live/replay snapshot to the detector. Never send real push notifications from `historical_fixture` or replay jobs.

Register the actual source node; the runtime defaults to `node-1`. `ALLERT_VALIDATED_NODE_ID` maps that source identity to its agreed deployment registry ID; it is not permission to assert transfer to a different sensor/site. Nodes 2/3 have not had neural transfer validation. Do not enable `ALLERT_ALLOW_EXPERIMENTAL_NODES` just to suppress a validation error.

## 6. Implement the current-observation job independently

On each accepted five-minute record, process available current channels. The current environmental indicator needs valid PM2.5, PM10, temperature and humidity. Missing weather produces an unavailable indicator, NOT a fake value and NOT suppression of valid observed-PM detection.

For observed PM, load the authoritative previous snapshot for the node/stream/policy and pass it to `observed(record, snapshot, mode)`. The calculation returns a decision and updated snapshot; it does not write to Supabase or deliver notifications. Process records in order with one writer/lease or version compare-and-swap. Atomically commit the snapshot, event changes, notice outbox and job completion. On conflict/restart restore database state; do not advance an uncommitted local-only state.

The detector compares current PM to the median/MAD of 12 prior five-minute readings and the actual adjacent rise rate; a separate configured high-level rule can also trigger. It retains event confirmation, escalation, cooldown and valid-reading recovery. Missing data cannot confirm recovery. Do not recreate an empty detector on every record. Keep the supplied thresholds unchanged during integration. These are operational project settings, not official AQI breakpoints or validated smoke/fire labels.

## 7. Implement the 15-minute forecast job

Use a durable unique identity including node, stream, model ID and forecast origin. Claim a lease and freeze an actual availability cutoff BEFORE querying. Fetch only valid, available measurements for that node and stream, ending at origin−5 minutes; no future measurement blocks. A minimum 648 contiguous five-minute blocks (54 hours) provides causal 6-hour rolling-weather warmup for the first row of the 576-row neural window.

Provide the included runtime's exact wire fields from `02_API_CONTRACT.md`. Do not sort, pad, gap-fill, refit the scaler or add feature columns. For live mode provide actual server receipts and enforce processing-time freshness. If receipt is late relative to the nominal origin, retain the actual cutoff/generation time; never imply the prediction existed at the nominal origin before the input arrived. The adapter checks receipts against processing time, so the WORKER must freeze/enforce its own consistent as-of cutoff.

Cache the evaluation-mode network once. Each job produces six PM values at 6h/12h/24h. Store node/model/weight hash, actual generation time, nominal origin, input hash/last block, receipt cutoff and target intervals. The target is a SINGLE five-minute block `[origin+h−5min,origin+h)`, not a horizon average. Only after a successful result commit mark the leased job complete. Keep inference outside long-held DB transactions; protect commit/retries with uniqueness and the lease.

Insufficient, gapped, stale or bad input must produce `warming_up`, `insufficient_history`, `stale`, `invalid_input` or `unavailable` with a reason. No zero/demo fallback values. This startup restriction applies to neural forecasts; it must not prevent current observation display or PM high-level alerts.

## 8. Connect the PWA to stored authorized views

Implement typed current/history/forecast/event endpoints and hooks. `contracts/` proposes types and wrappers, not existing deployed routes. Paginate history and verify node authorization on all reads. Cache by user/node/model/stream and clear account-specific data on logout. Poll/refetch on focus first; if using Realtime, reconnect and re-read authoritative state rather than assuming every message was received.

| Existing conceptual area | Required displayed data |
|---|---|
| Dashboard / Now | Actual current readings and current indicator, node/time/freshness |
| 6h / 12h / 24h | PM2.5 and PM10 point forecasts, µg/m³, target intervals, model/version and availability |
| Environmental graph | Real timestamped history; separate forecast markers, no random/demo points |
| Observed alert banner | Persisted PM rise/high event, phase, observation time and notice status |
| Device/status/settings | Registered node, actual last-seen, consent and explicit worker/data offline states |
| Admin | Server-authorized views; no demo CUSUM/Z-score anomalies |

The adult/child selector affects the current environmental indicator only, not different neural PM forecasts. Do not turn future PM into future allergy percentages. The present score is indicator points, not AQI. The diary index is separate; preserve real instrument fields/missingness. Resolve VAS/NRS differences before actual association analysis. The model handoff supplies no participant/SUS/TAM results.

## 9. Notices and availability

Start with durable in-app notices. Push additionally requires consent, subscriptions, a service worker, a sender, expiry/deduplication and delivery/error receipts. Provider acceptance is not proof a person saw the notice. A UI dismissal does not mean PM recovered. Replay never pushes to real users. Five-minute averages can dilute short peaks; no guaranteed instantaneous hazard detection or emergency response is asserted.

When the worker stops, continue showing the last REAL telemetry with its timestamp and stale/unavailable status. Never manufacture normal air or a forecast. `/health` is liveness; authenticated `/v1/model` plus a self-test is the model check. Hosting, restarts, monitoring and staging-to-production approval are separate steps.

## 10. Acceptance gates

Read `04_ACCEPTANCE.md`. Prove hashes and 12 golden cases; test incorrect units, gaps, order, duplicates, stale/future timestamps, user/node access, worker restart/lease conflict, atomic detector commit and no duplicate notices. Include a missing-weather/valid-PM independence case and live/replay isolation test. Verify Node 2/3 neural inference is not silently enabled. Run actual frontend typecheck/build and backend tests. Demonstrate persisted end-to-end paths in staging, then report real telemetry/push tests separately if available.

No production DB changes, public API exposure, real push delivery, silent retraining or threshold changes are authorized merely by receiving this package. Obtain the group's explicit approval for those deployment actions. Return changed files, migration plan, environment-variable NAMES, run/restart commands, tested evidence and remaining work.
