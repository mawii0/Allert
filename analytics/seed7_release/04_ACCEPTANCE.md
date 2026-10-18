# Partner acceptance and release gates

Do not say “integrated” because a model loads or an app builds. Keep package, staging, real telemetry and notification-delivery checks separate. Record host/dependency versions and model/rule/input hashes.

## 1. Supplied model/runtime acceptance

- Verify the ZIP/member hashes through the researcher's trusted channel.
- Run all 12 golden cases on the intended CPU/CUDA environment; the fixtures are historical, not live packets.
- Confirm model ID `median-residual-seed7-epoch15-20261013-v1`, **seed 7 / checkpoint 15 / 35 recorded epochs**, six output intervals and multipliers `[0.025,0.025,0.025,0.025,0.225,0.15000000000000002]`.
- Confirm weights SHA256 `4253e73515d8d2a3d4a4463065f8bfb2192c9454e161da560fd928a4051672c4`, input `[576,8]`, 648-block fetch, no spike head, fixed scaler/target transform/calibration, and no retraining.
- Run the partner runtime/API suite, including invalid input, ordered history, auth, risk boundaries, detector restart/duplicates and seed-specific identity. Never edit expected values to make a replay pass.
- See `05_RELEASE_VERIFICATION.md` and `evidence/`. These are local software/parity checks, not fresh testing on every OS/wheel, an untouched model assessment or actual PWA deployment.

## 2. Group staging end-to-end acceptance

1. Authenticated real packet → exactly one accepted telemetry row → correct authorized PWA measurement with original units/time and server receipt.
2. Duplicate retry → no duplicate job/event/notice; conflicting payload for the same identity is rejected/quarantined. Wrong units, invalid quality, out-of-order/future timestamps and nonfinite values never become normal readings.
3. Worker/node credentials stay server-side; unauthorized users cannot read another node/diary or write derived results. Test expired JWTs, cross-account reads and protected admin routes; do not rely on browser admin flags.
4. Current example 20/40 µg/m³,30°C,70% yields adult25.8401/pediatric28.2181 points, both High, with configured tier boundaries. This is an indicator, not AQI/probability.
5. Valid PM with missing weather can still trigger observed-PM detection; the current four-channel indicator/forecast may be unavailable. No pipeline-wide weather failure may silently suppress PM alerting.
6. Rise/high-level initial trigger, plateau confirmation, escalation, cooldown and valid clear-reading recovery match the frozen policy. Missing/invalid affected-channel readings cannot confirm recovery; banner dismissal cannot reset it.
7. A restart restores committed detector state. Per-node/stream ordering, lease/version conflict, transaction failure and retries neither lose an event nor advance state twice. Commit state, events, outbox and job completion atomically.
8. Live/replay data, state, jobs, events, forecasts, user notices and deduplication are isolated. Historical fixtures never generate real pushes or show as current telemetry. Adapt the draft's node-only state key before mixing streams.
9. Forecast queries freeze a real availability cutoff and only use that node/stream's prior observations. Record receipts, nominal origin, actual generation, input hash and six target intervals. Never backdate a forecast that used late receipts.
10. Real 54-hour fetch yields the 48-hour tensor; gaps, invalid/missing/stale data cause explicit unavailability, not padding, zeros or demo values. Current observations/alerts must operate during neural warmup. Nodes2/3 neural transfer stays disabled without approval.
11. The PWA reads stored forecasts, not per-screen neural calls. Show current indicator and future PM separately; use actual timestamps/units/model version and truthful stale/offline states. No random chart data, future-allergy percentages or obsolete CUSUM events.
12. Durable notices survive reconnects. Push consent/subscription/expiry/retry/provider results/client acknowledgment are tested separately; provider acceptance does not prove delivery to a person.
13. Preserve real diaries, observation/save times, instrument definitions and missing values. Do not invent VAS/NRS/TNSS fields or correlation/participant/SUS/TAM results.
14. Run actual frontend typecheck/build/tests, database auth/transaction tests and worker restart tests. List environmental limitations, unresolved deployment choices and exact run/restart commands. Keep fixed research CSVs and selected evidence unchanged.

## 3. Untested boundary and approval

This package author did not have the actual PWA repository, Supabase deployment, firmware, device credentials, worker host or push recipients. No cloud migration, hardware accuracy, live network latency or real notification delivery was verified. Complete these gates in staging. Obtain approval before production migrations, public API exposure or real push delivery. A ZIP is not an always-running deployment.
