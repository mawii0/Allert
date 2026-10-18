# Prompt for the ALLERT app coauthor

Copy everything below into the coding session that has access to your actual PWA repository. Attach/extract `ALLERT_App_Seed7_Epoch15_20261013_v1.zip` and provide its path. Do not send credentials in the prompt.

---

Implement the approved ALLERT model and independent analytics in our existing PWA/Supabase system. Inspect the actual repository first: read its local instructions, package.json, frontend screens, authentication, Supabase functions, migrations, tables and tests. Preserve existing users, profiles, diary records, authentication and working features. The previously supplied system documentation is context, not proof that today's implementation is identical.

## Authoritative handoff

Read the extracted package's `00_START_HERE.md`, `MODEL_CARD.md`, `SELECTION_NOTE.md`, `01_SETUP.md`, `02_API_CONTRACT.md`, `03_SUPABASE_AND_PWA.md`, `04_ACCEPTANCE.md` and `PACKAGE_MANIFEST.json` before implementation. The guide identifies the tasks the package does NOT implement yet. SQL and TypeScript under `contracts/` are drafts, not completed database migrations or compiled PWA integration.

Use exactly this single network:

- Model ID: `median-residual-seed7-epoch15-20261013-v1`.
- Revised-data seed **7**, selected checkpoint **15**, **35** completed training epochs.
- Checkpoint SHA256: `4253e73515d8d2a3d4a4463065f8bfb2192c9454e161da560fd928a4051672c4`.
- Six calibration multipliers: `[0.025, 0.025, 0.025, 0.025, 0.225, 0.15000000000000002]`, in PM2.5/PM10 order at 6h, 12h, 24h.
- Included frozen training-only RobustScaler, identity target scaler, weights and architecture configuration are a matched set. Never refit or replace any of them.
- This is the researcher's post-review implementation choice, NOT the five-run study's predeclared stopping-loss winner. That earlier winner was seed 42. Do not rewrite the prior study selection or present this as independent confirmation.

Run package integrity verification, CPU golden self-test and all runtime/API tests before integration. Test CUDA too if the deployment host uses CUDA. Save exact versions and receipts. Stop on mismatched hashes or forecast replay failures; do not modify expected fixtures to make them pass. The historical examples are replay fixtures, not live sensor readings.

## Required system separation

Implement these as three independent functions, not one allergy-prediction model:

1. **Forecast:** 48-hour median-residual BiLSTM; six PM concentration point forecasts in µg/m³. A 54-hour fetch (648 contiguous five-minute blocks) initializes rolling weather features; the actual neural window is 576 rows × 8 features. Each output describes `[origin+h−5min, origin+h)`. It is NOT a 6/12/24-hour mean, maximum, full forecast path or probability. Keep `use_spike_head=false`.
2. **Current environmental indicator:** unchanged `config/environmental_risk.yaml`; independently calculate adult/pediatric indicator and tier from current valid PM2.5, PM10, temperature and humidity. Display indicator points, not AQI or an individual symptom probability. Do not substitute current weather to manufacture future risk from PM forecasts.
3. **Observed PM rise/high-concentration alerts:** unchanged `config/observed_pm_alerts.yaml`; prior-hour median/MAD plus rise rate, OR a high-concentration rule. Persist and restore ordered per-node detector state. This handles observed changes; it is not a neural spike head, CUSUM, or guaranteed early smoke/fire prediction. Valid PM can support this path even when weather is unavailable and the current indicator cannot be calculated.

Keep any symptom diary index and actual association analytics separate. Do not fabricate symptoms, correlations, user studies, accuracy percentages or notification delivery records.

## Implementation sequence

1. Report the actual architecture and file changes you propose. Confirm the firmware packet format, five-minute aggregation/timestamp semantics, registered node IDs, user/node access rules, worker host and staging project. Resolve missing consequential details before applying a migration or deployment. Do not invent an ESP32/BLE protocol from demo UI.
2. Implement server-authenticated device ingestion with explicit units, block start/end, quality per channel, immutable server receipt time and idempotent duplicate handling. Never put Supabase secret/service-role keys or the internal model token in firmware, React/Vite or browser storage. Preserve original telemetry; no invented gap fills, smoothing, resampling or silent overwrites.
3. Review non-destructive new tables in staging. Add reviewed transactions/RPCs for atomic telemetry-plus-job insertion, job leases/retries and ordered detector snapshot/event/outbox/job commits. Use proper user JWT authorization, node assignments and RLS. Privileged backend access must still explicitly enforce ownership. Do not weaken all user endpoints to accommodate device uploads.
4. Keep live and historical replay isolated: preferably separate staging/replay project; otherwise partition EVERY state, event, job, forecast and outbox identity by stream/mode and policy/model where relevant. The draft SQL has a node-only detector-state key and is not safe for mixed replay/live use without revision. Replay must never trigger real user notifications.
5. Implement an always-running external Python worker with outbound durable-job polling. Cache `ModelRuntime` once. Use the provided Python functions directly, or a properly authenticated private hosted API if approved. Do not try to load PyTorch/joblib in the browser or simply upload the ordinary Python runtime into a Deno Edge Function. A laptop localhost URL is not reachable from a cloud function.
6. Process current observations every five minutes independently of the 15-minute forecast jobs and neural history warmup. Freeze a forecast's actual availability cutoff before querying its history; query only the registered node and appropriate stream. Last measurement block ends at the nominal origin. Record actual generation time, receipt cutoff, input hash, model ID and checkpoint hash. If a late receipt is used, never backdate the forecast as if it existed before that receipt.
7. Store six forecast values with target intervals and availability/reason. Missing, stale, unordered, duplicate, invalid or insufficient history must produce an explicit unavailable state, not zero values or demo fallback predictions. Forecast transfer to Nodes 2/3 is unvalidated: do not enable it or the experimental-node flag without a separate approved evaluation.
8. Wire typed authorized PWA reads for current telemetry, indicator, forecast and observed events. Replace random/static forecast graphs and obsolete CUSUM/Z-score demo events. Preserve the diary and account flows. Show “Now” indicator separately from 6h/12h/24h PM forecasts; include units, node, observation/target times, freshness, model version and offline/unavailable states. Adult/child selection changes the indicator, not the PM network.
9. Implement persistent in-app notices first. If push is in scope, separately implement consent, service worker, subscriptions, durable sender, deduplication, expiry and delivery/error logs. Provider acceptance does not prove user receipt. Acknowledging a banner does not reset the pollution detector. Worker downtime/missing readings must never signal recovery.
10. Run frontend typecheck/build/tests, backend access-control/transaction tests, worker restarts/retries and a staged end-to-end replay followed by genuine telemetry where available. Report what was actually tested, remaining tasks and deployment steps. Obtain explicit approval before production migration, public exposure or real push delivery.

## Acceptance and deliverables

- Verify 12 golden forecast cases (72 values) against the supplied seed-7 checkpoint and tolerance. Return model metadata seed=7, epoch=15, recorded_epochs=35 and exact multipliers.
- Test invalid/missing history, stale/future timestamps, duplicate/conflicting packets, cross-node access denial, lost worker leases, transaction failure/restart, retry idempotency, live/replay separation and no real pushes from fixtures.
- Test that missing weather does not suppress a valid observed-PM alert, and that detector recovery requires valid observations.
- Demonstrate real persisted “current → job → stored six forecasts → authorized PWA view” and “observed PM → persistent event → in-app notice” paths in staging. Do not label a Python-only test as completed PWA deployment.
- Deliver migrations/RPCs, worker code, changed screens/hooks, environment-variable names WITHOUT values, setup/run/restart instructions, tests/receipts and a concise remaining-limitations report.
- Do not retrain, tune calibration/thresholds, add a spike head, change the dataset or select another seed as part of this integration.

Start by reporting repository findings and the staged implementation plan. Then implement the authorized local changes in that sequence. Stop for missing authority or material configuration decisions.
