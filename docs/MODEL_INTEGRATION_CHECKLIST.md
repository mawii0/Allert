# ALLERT model integration checklist

## Completed locally

- [x] Read `../model/PARTNER_MESSAGE.txt` and the selected model handoff.
- [x] Check both ZIP SHA-256 values against the message and checksum sidecars.
- [x] Extract runtime into `../../model/runtime/allert_model_partner_v1` (relative to this document's folder).
- [x] Verify all 76 files listed in PACKAGE_MANIFEST.json with SHA-256.
- [x] Preserve seed 42 / epoch 15 `median-residual-single-v1`, checkpoint `3cda9c28d98847f9be888ffa356a917c21d40c041b3ea75829919144de43b7f4`.
- [x] Add typed model contracts and a polling frontend reader.
- [x] Replace dashboard demo probabilities with current environmental points and six PM outputs grouped by horizon.
- [x] Replace environmental random readings and fabricated event banner with stored measurements and explicit availability.
- [x] Add authenticated single-node read route and private worker publish route to the existing Edge function.
- [x] Isolate replay/live caches; replay requires an explicit server display setting and is labeled in both screens.
- [x] Add a Python adapter to verify/load the frozen model and publish one snapshot. Default invocation only prints JSON.
- [x] Ten snapshot contract tests pass, covering checkpoint/node identity, duplicate outputs, target intervals, quality, finite values and live receipt requirements.
- [x] Production Vite build passed (2,669 modules). Existing large-bundle warning remains; it does not prevent the build.

## Next: Python/model partner

- [x] Install Python **3.12.14** in a workspace-local environment.
- [x] Create the package `.venv` and install the exact CPU PyTorch build and pinned runtime/test requirements.
- [ ] From the extracted package directory run:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install torch==2.11.0 --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-test.txt
.\.venv\Scripts\python.exe -m allert_runtime.cli verify
.\.venv\Scripts\python.exe -m allert_runtime.cli self-test --device cpu
.\.venv\Scripts\python.exe -m pytest tests -q -p no:cacheprovider --basetemp=outputs/pytest
```

- [x] All 12 replay windows passed; maximum difference 0.0001481175422668457 µg/m³. Local evidence saved.
- [x] All 27 partner runtime/API regression tests passed.

## Next: staging vertical slice

The updated Edge function and Vercel frontend are now deployed. Existing Auth/profile/diary storage is preserved. Eleven deployed bridge checks passed, including real assigned/unassigned test-user sessions and exact forecast persistence. The temporary test account was removed. The active display mode is historical replay; real-device and durable-worker integration remain pending.

1. Deploy the updated `supabase/functions/server` through the existing project's deployment workflow.
2. Configure `ALLERT_WORKER_TOKEN` as a long random server secret and `ALLERT_NODE1_USER_IDS` as the permitted Auth user UUIDs. The read route denies unassigned users. Configure the same worker token in the Python process only.
3. For the first fixture demonstration set the Edge secret `ALLERT_DISPLAY_REPLAY=true`. Live is the default. Replay and live are stored separately.
4. In the worker terminal export `ALLERT_EDGE_BASE_URL`, `ALLERT_GATEWAY_KEY` (the project's gateway-compatible legacy anon JWT), and `ALLERT_WORKER_TOKEN`. See `integration/worker.env.example`. Do not paste secrets into source control or Vite variables. Do not disable user JWT checks to make publishing work. If the project's gateway does not accept this authentication configuration, resolve it in staging before continuing.
5. From the **outer** Allert-main folder, after the model tests pass:

```powershell
.\model\runtime\allert_model_partner_v1\.venv\Scripts\python.exe .\Allert-main\integration\publish_model.py --input .\model\runtime\allert_model_partner_v1\examples\forecast_case_01.json
# Add --publish after reviewing the printed result to store the fixture in staging.
```

6. Sign in as an assigned user. Check Now and +6/+12/+24h, both population profiles, replay labels, Manila timestamps and exact five-minute target blocks.
7. Confirm missing worker secret denies publication, a wrong user cannot read, no snapshot displays unavailable, and old live data displays stale. Test these against the deployed staging function; local contract tests do not establish deployed authorization.
8. Turn `ALLERT_DISPLAY_REPLAY=false` before the live demonstration. Supply a genuine runtime-contract live input with server receipt timestamps and approximately 54 hours of valid five-minute history. No demo padding or fabricated telemetry.

The bridge stores a single latest snapshot per mode in the existing KV store. It is a staging demonstration adapter: it does not ingest firmware, manage a durable queue, enforce chronological concurrent publication, retain forecast history, or deliver alerts. Use one publisher for this demonstration. Do not use it as the final worker architecture.

## Remaining before continuous live operation

| Owner | Work and completion evidence |
|---|---|
| Hardware | Confirm node-1 identity, units, five-minute aggregation, block time convention, UTC clock, quality flags, sample counts, buffering and server-verified device credentials. Produce a real packet. |
| Backend | Review the partner SQL draft in staging. Add versioned telemetry, assignments, jobs, forecast runs/values, detector state/events and outbox without deleting KV/profile/diary records. Verify RLS and every privileged route's node authorization. |
| Backend | Implement transactional telemetry + jobs; reject conflicting duplicates while permitting identical retries. Preserve valid high PM. Keep server receipt time distinct from device observation time. |
| Worker | Implement outbound polling with leases, retry identities and chronological per-node processing. Compute current indicators every valid block, forecasts initially every 15 minutes; cache model once. |
| Worker/backend | Commit detector state/version + events + outbox + job completion atomically. Restore persisted state on restart. Prove spike/plateau/recovery/retry/restart behavior, including gaps and missing readings. |
| Worker/backend | Retain all six forecast outputs and origin/model/input hashes with each run. Implement warming-up, insufficient-history, invalid-input, stale and worker-unavailable reasons. Reject future/imputed/cross-node history. Node 2 transfer remains disabled. |
| Frontend | Connect bounded measurement history, real node status/selection and persistent observed-event notices. DeviceConnection now shows the pending hardware state, Settings uses verified model metadata, and Admin screens are explicitly labeled design previews. Live device/admin features remain pending. |
| Auth/frontend | Refresh/expiry handling and account-scoped cleanup now have regression tests. Complete cross-browser and offline UI acceptance checks. |
| Research/diary | Resolve VAS versus integer NRS with the partner. Individual symptoms and observation times are now preserved. Resolve missingness and use real node/time-matched records for associations. |
| Push | Add consent, subscriptions, service worker, sender, expiration and delivery/error records. A detector decision is not a delivered notification. |
| Team | Run extracted `04_ACCEPTANCE.md`, record payload IDs, timestamps, rule/model hashes and measured delays. Validate offline/stale/recovery and browser-closed operation. Do not retrain or recalibrate from incoming telemetry. |

## Verification boundary

Archive and manifest integrity, ten JS contract tests, production deployment, twelve CPU golden cases, 27 partner tests, two hosted API startup tests and eleven deployed bridge checks passed. The Render Docker build and startup checks passed, followed by twelve golden cases against the deployed cloud API. A cloud-computed historical replay was published to Supabase and all eleven deployed bridge checks passed again. The temporary local service is stopped. Real telemetry, durable worker/database transactions and notifications remain unverified. Hardware is not ready. The optional research ZIP remains archived; it is not required by this runtime.
