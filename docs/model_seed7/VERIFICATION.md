# Seed7 integration verification

Local verification date: 16 October 2026. Proposed host: **Vercel**. No deployment, production SQL, real push or remote service shutdown was performed.

| Check | Result |
| --- | --- |
| Supplied release manifest | All 88 listed files match their original SHA256 values |
| Frozen CPU golden replay | 12 cases / 72 PM values pass; maximum absolute difference 0.0003003001213102152 µg/m³ |
| Original supplied runtime/API tests | 30 passed |
| Worker, joint-policy and Vercel adapter tests | 35 passed |
| JavaScript app regression suite | 636 passed, zero failures |
| Additional deployment settings checks | 2 passed, zero failures |
| Hosted sensor-ingestion tests | 23 passed |
| Active frontend TypeScript check | Passed |
| Production frontend build | Passed |
| Backend relative-import inventory | Passed; unused historical modules are explicitly identified |
| Separate, self-contained `analytics` directory build gate | Passed locally, including CPU model load and all 12 golden cases |
| Actual Vercel platform build / deployment | **Not performed**; account/project access is required |
| Deployed staging replay / live telemetry / browser screenshots | **Not performed** |

## Selected model and unchanged source

- Model ID: `median-residual-seed7-epoch15-20261013-v1`.
- Seed 7, checkpoint epoch 15, 35 recorded epochs; 225,671 parameters, no spike head.
- Checkpoint SHA256: `4253e73515d8d2a3d4a4463065f8bfb2192c9454e161da560fd928a4051672c4`.
- Original ZIP SHA256: `24ace2e77cbe949a82acace9f12e8917bd0ba33283e659df1737eb35e6975390`.
- Calibration: `[0.025, 0.025, 0.025, 0.025, 0.225, 0.15000000000000002]`.
- Frozen original indicator YAML SHA256: `8840056cf287749544df0b1a3ed373370863258ab1d29bbb6b430f8740f5ad99`.
- Frozen observed-PM YAML SHA256: `76486e7733f32d8e4d1ac61a03b35ef3108280f0140533d3a43312a863199b77`.
- The supplied weights, scaler, identity target scaler, calibration, training code, fixtures and old research-selection evidence were not edited. Unlisted compiled `.pyc` files were omitted from the deployment source copy.
- This seed7 deployment follows the researcher's **post-review choice**. It is not represented as the five-run study's predeclared validation-loss winner. The earlier seed42 selection history remains intact.
- A checksum proves byte identity, not independent publisher authenticity or clinical validation. Independent researcher confirmation of the original ZIP checksum and physical source-node mapping remains outstanding.

## Joint indicator policy

The updated 14 October handoff supersedes the earlier 13 October candidate prompts. The continuous environmental formula and population baselines remain unchanged; the adapter applies these full-precision entry cutoffs:

| Population | Moderate | High | Very high |
| --- | ---: | ---: | ---: |
| Adult | 22.5 | 30 | 37.5 |
| Pediatric | 20.5 | 28 | 35.5 |

Canonical policy SHA256: `03f97ad4b2737e85cfe01969fed8a059668dcf5e76c5508ee3279d1c5e6aa5c0`.

Equality enters the higher tier. Display rounding does not determine classification. At PM=0, temperature=25°C and humidity=60%, adult 20 is Low and pediatric 22 is Moderate. The worked 11/13 µg/m³ PM, 35.6°C, 92.8% example gives adult 22.407164/Low and pediatric 24.573939/Moderate.

Optional Forecast PM interpretation is versioned separately, off by default, and pairs the two PM pollutants for each horizon without future/current weather substitution. It does not create forecast allergy probabilities or new pushes. Clinical advice/validation is not inferred from numeric examples or researcher-attributed PM bands. The original full CSVs and manuscript were unavailable; no dataset counts or manuscript revisions were independently produced.

## Durable processing and access checks

Local PostgreSQL tests run the actual migration in PGlite. They cover transactional ingest/job insertion and rollback, immutable duplicate receipts, packet conflicts, lease exclusivity/expiry, frozen availability cutoff, atomic detector snapshot/event/notice/recipient outbox/job commit, replay isolation, owner transfer during processing, role denial and unavailable forecasts without invented values. Python tests additionally verify real frozen model inference, missing-weather observed PM, restart/failed commit behavior and stale observations without fabricated recovery. These are local component checks, not proof of deployed end-to-end delivery.

The active frontend reads stored results. It no longer chooses a different model/fallback or reclassifies previous evidence as the new policy. The current indicator is separate from the 6/12/24-hour neural PM cards. A target is one five-minute block, not a horizon mean. The old symptom correlation protocol remains accessible only as explicitly historical evidence; prospective correlation for the new PM contract needs researcher approval.

The server accepts a new independently qualified per-channel packet, but **no physical firmware changes are included**. Existing full packets remain supported and mirrored transactionally. Hardware sampling and queueing when only weather fails remains a separate firmware task.

## Runtime and deployment limits

Python 3.12.14; torch 2.11.0+cpu; numpy 2.5.2; pandas 3.0.5; scikit-learn 1.9.0; scipy 1.18.1; joblib 1.6.0; PyYAML 6.0.3; FastAPI 0.143.0; Uvicorn 0.54.0; pytest 9.1.1; httpx 0.28.1. The Render ingestion backend retains its separate dependency environment.

The local installed torch package contains approximately 709.06 MiB of file data before other dependencies, requiring Vercel's Large Functions path. The actual platform bundle, memory, cold start, project eligibility, scheduler timing and costs are unverified. Fast local replay timings are not a latency guarantee. The frozen test environment emits a Starlette TestClient/httpx deprecation warning; expected fixtures and ML pins were not changed to suppress it.

## Rollback and cleanup status

Before integration, tracked app source at `7063b25d3e6d6d29c8bc4e93b3f6d9b9f9e80ac5` was inventoried and archived. Archive SHA256: `39d97f7594299cbfd2b85fe00a5b5a9d49ee04a7112dc301d2f2044b55c9672c`.

The previous trained model weights were not present in the app repository, so this is **not** a backup of the old remote model or production database. The previous remote service remains untouched. No old telemetry, users, diaries, subscriptions, credentials, training data or recorded study outputs were deleted. Old model/CUSUM modules are retained as historical regression sources and are not wired into the active entrypoint; the original forecast scheduler SQL is archived. The unpublished Modal draft was replaced with the Vercel adapter.

The companion verification archive contains the source/changes inventory, exact versions, golden output, test receipts and import audit. Git-backed repository content is delivered through the patch rather than a second complete repository backup.

See [Vercel setup and staging acceptance](VERCEL_SETUP.md) before deployment. Production approval must follow staging acceptance, as required by the supplied source instructions.
