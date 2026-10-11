# ALLERT acceptance test report

Tested 11 October 2026. The hardware-free workflow is usable: authenticated profiles, symptom diaries, cloud inference and stored historical model results. This report does **not** certify a complete live sensor or notification system.

## Results

| Check | Result | Evidence |
|---|---|---|
| App session, account validation and model snapshot regression tests | 52 passed | `npm test` |
| Deployed account API acceptance checks | 54 passed | `integration/evidence/deployed-account-tests.json` |
| Persistent deployed node authorization and repeated-login checks | 59 passed | `integration/evidence/deployed-node-access-tests.json` |
| Frozen runtime, cloud adapter and hosted startup tests | 32 passed | Python pytest suite; one dependency deprecation warning |
| Cloud model reference cases | All 12 passed; maximum error 0.0001481 µg/m³, below 0.02 tolerance | `integration/evidence/cloud-model-verification.json` |
| Cloud negative cases | 20 passed | `integration/evidence/cloud-negative-tests.json` |
| Vercel SPA route responses | 10 routes returned the app shell | HTTP checks, not proof of rendered feature behavior |
| Production browser | Forecast tabs, actual stored replay values, symptom sliders, history open/close/Escape, symptom carousel, Settings, hardware-pending navigation and all three labeled admin previews checked | No console errors in these checked flows |

The node-access regression also passed four fresh login/logout cycles, four token refreshes, distinct session identities and 20 concurrent reads without intermittent authorization failures. The production account's assignment is now persisted in the database. Its previous deployment-secret dependency was removed, and tests no longer replace production allowlists. An initial deployed regression failed before the final revision was verified; the final revision and full 59-case run passed. See `NODE_ACCESS.md`.

The deployed account suite exercises synthetic signup/login, token refresh, invalid credentials, missing authentication, profile persistence, user-ID spoofing, account isolation, invalid scores/notes/timestamps, all four symptom values, observation time, repeat requests, concurrent writes, conflicting concurrent retries, legacy diary compatibility and the latest 100 records. Disposable accounts and their own records were removed. Existing account records were not changed.

Cloud negative tests exercise private endpoint authentication, malformed JSON, oversized requests, wrong nodes, incomplete/short/duplicate history, invalid quality/timestamps, negative/string/Boolean PM values and invalid humidity.

## Corrections made

- Renew expiring sessions using rotated refresh tokens. Parallel requests share one refresh. Logout and account switching clear account-scoped browser state; late refreshes cannot restore a logged-out session. Old sessions without a refresh token require signing in again.
- Persist node assignments under stable Auth UUIDs. Read authorization independently of deployment secrets and deny self-assignment from ordinary authenticated clients.
- Load demographic selection from the saved profile after login. Protect onboarding, device setup and sample admin routes from unsigned-in navigation. Model authorization remains enforced by the backend.
- Validate profile and diary inputs; return HTTP 400 for malformed JSON. Keep private responses out of caches.
- Store each diary submission under an independent account-scoped key. Insert-once retry IDs prevent duplicate records and conflicting overwrites, including concurrent retries. Existing diary arrays remain readable.
- Preserve individual symptom scores and actual observation time. Correct TNSS labels to the existing four 0–3 sliders' total of 12. Label the legacy derived score as a symptom summary, not environmental risk or a probability.
- Remove invented Clinical correlations and Settings uptime/accuracy statistics. Show real model metadata and explicit unavailable states.
- Remove simulated Bluetooth/Wi-Fi pairing and random connection success. Device setup clearly shows the pending hardware integration and links to replay results.
- Disable unsupported push/location switches. Keep sample admin designs visibly labeled as previews.
- Validate snapshot tier cutpoints and five-minute alignment. Keep frozen model weights, scalers and calibration unchanged.
- Add keyboard labels and history dialog controls. Add GitHub Actions for `npm ci`, `npm test` and `npm run build`.

## Boundaries and remaining work

| Feature | Current status |
|---|---|
| Historical replay and six PM forecast outputs | Working and verified |
| User profiles and persistent symptom diaries | Working and tested with synthetic accounts |
| Live telemetry, hardware pairing and device credentials | Pending firmware/protocol and ingestion implementation |
| Continuous cloud worker, durable forecast history and observed-event pipeline | Pending implementation; the current bridge retains one snapshot per mode |
| 24-hour environmental charts and accumulation statistics | Awaiting measurement history; no fabricated curves |
| Push delivery and location mapping | Pending implementation; controls disabled |
| Admin search, investigation and administrative actions | Sample design previews; no live admin backend or role system |
| Clinical correlation analysis | Awaiting real matched data and an agreed symptom protocol |
| Browser signup/onboarding/save/logout end-to-end automation | Not completed: deployment-specific URL required Vercel login and local browser navigation timed out. These APIs and session logic were tested separately; existing-account browser reads were checked. |
| Offline UI, multi-browser/device behavior, long-running soak/load tests | Not certified by this run |
| Public signup readiness | Existing prototype auto-confirms email. Verified-email signup, abuse controls and retention policy still need a rollout decision. |

Render Free can sleep when idle. Passing inference checks does not establish uninterrupted availability or validate future hardware packets. Tests cannot guarantee absence of every defect.

## Repeat checks

From the app/repository root:

```powershell
npm ci
npm test
npm run build
```

The Python runtime is hosted in the separate private `allert-model` repository. With the partner runtime installed in the documented sibling folder, run:

```powershell
..\model\runtime\allert_model_partner_v1\.venv\Scripts\python.exe -m pytest ../model/runtime/allert_model_partner_v1/tests integration/test_cloud_publish.py integration/test_hosted_api.py -q
```

Deployed account tests need a private credentials file with `project_ref`, `anon_key`, and `service_role_key`. They create and remove only their synthetic accounts and records. Never commit or upload that file:

```powershell
py -3.13 integration/test_deployed_accounts.py --credentials PRIVATE_CREDENTIALS_FILE --report PRIVATE_REPORT_FILE
```
