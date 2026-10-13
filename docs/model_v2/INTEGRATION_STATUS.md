# model_v2 development handoff

This branch contains the full existing application and the adult policy update. **The seed-7 model integration is pending its missing release.** Do not deploy this branch as a completed model replacement.

The user supplied three instruction documents and `Allert_db_evidences.zip`. Inspection of every archive entry found 17 PNG screenshots and no checkpoint, scaler, manifest or model runtime. Downloads contained the seed-7 instruction documents but no seed-7 release ZIP. The existing local partner bundle identifies `median-residual-single-v1`, checkpoint `3cda9c28d98847f9be888ffa356a917c21d40c041b3ea75829919144de43b7f4`; it is not the requested release.

Required replacement: `median-residual-seed7-epoch15-20261013-v1`, checkpoint `4253e73515d8d2a3d4a4463065f8bfb2192c9454e161da560fd928a4051672c4`, seed 7 / selected epoch 15 / 35 recorded epochs. Preserve its matched scalers, eight features, 576-row input, 648-block preparation and calibration `[0.025,0.025,0.025,0.025,0.225,0.15000000000000002]`. Read all release guides and verify its original manifest, 12 golden cases / 72 values and 30 runtime/API tests before replacing any active loader. Do not relabel old weights or historical results.

## Inventory and changes

| Path / role | Action | Reason / verification |
|---|---|---|
| `supabase/functions/server/risk-monitor.mjs` | Updated adult classification and metadata | Same continuous formula and weather-context forecast calculation; new canonical policy |
| `supabase/functions/server/environment-validation.mjs` | Versioned policy validation | New active policy; original ID/hash/tier checks retained for explicitly historical fixtures |
| `supabase/functions/server/environment-policy.mjs` | Added shared policy | Adult points 22.5/30/37.5, pediatric 13/23/38, unrounded classification |
| `src/app/utils/risk-monitor.ts` | Reject mismatched policy responses | No stale policy displayed as the new rule; fetch remains no-store |
| `src/app/components/DashboardScreen.tsx` | Adult advisories and rounding tooltip | One decimal display; server-calculated category remains authoritative |
| `src/app/utils/model-contract.ts` | Added new policy identity | Legacy identity retained for historical payloads |
| `integration/environment-policy.test.mjs` | Added boundary/regression tests | Independent fixed expected vectors, numerical tolerance and pediatric regression |
| `integration/check_environment_policy.py` | Added independent Python reference | Standard library calculation against the same fixed vectors |
| Existing model loaders, model IDs and frozen releases | Retained pending replacement | Missing release prevents safe replacement; no old model retirement |
| Observed-PM detector, auth, node assignment, symptom diaries, migrations, telemetry | Retained | No changes in this branch |

Baseline tree is preserved at Git commit `7648ffbf1067703c66560697c6f4eb17a19f3542`. New files are the policy module/hash, canonical artifact/vectors, exporter, reference check, tests and this handoff. No existing files were deleted or archived out of runtime.

## Policy and provenance

ID: `environmental-indicator-adult-22p5-30-37p5-20261014`.

SHA256: `e6dd0b1683ce5786d9e405697bfb9e98d04b0b7dc655cd1344b5f1237201d555`.

Canonical bytes are UTF-8 `JSON.stringify(POLICY)` in the declared insertion order, no indentation or trailing newline. SHA256 is over those exact bytes, not a reformatted JSON representation. Reproduce with `node integration/export-environment-policy.mjs`; tests verify artifact bytes and runtime hash match. These are newly constructed local artifacts from the supplied handoff, not the missing research team's artifact or a modified frozen release.

Adult equality enters the higher category. Score points and internal fractions have separate classifiers to avoid an epsilon or rounding alteration. All existing continuous parameters and pediatric fraction thresholds remain unchanged. The handoff reports pediatric 25/35/50 in historical manuscript/candidate records, while this application uses 13/23/38; this discrepancy was preserved.

The JavaScript and independent Python references use fixed expected categories and supplied analytical reference values with a score tolerance of 1e-9 points. This does not establish parity with the missing seed-7 partner adapter. The old frozen adapter still reports its original policy; only explicit historical payloads may use that old identity.

The four advisories are copied from the supplied risk-policy handoff. They are exposure-awareness guidance, not automatic medication instructions. The indicator is not AQI or personal illness probability. No clinical or source-validation claims were added.

## Limits and remaining integration

Verification: JavaScript suite **158 passed, 0 failed, 0 skipped**; independent Python policy reference **26 assertions passed, 0 failed**; cloud publisher unit suite **5 passed, 0 failed, 0 skipped**. Production Vite build passed (2,678 modules); existing bundle-size warning remains. Initial sandbox subprocess attempts failed with EPERM; authorized subprocess execution resolved this. Two initial module-load failures were resolved by `npm ci --offline --ignore-scripts` using the existing local cache (286 packages; no lockfile change). Pytest emitted cache-write warnings; its five tests passed. No standalone TypeScript checker or tsconfig exists in this project; a Vite build is not full typechecking. No CUDA or seed-7 forecast tests could run without that release.

The browser build contains only the logo, CSS, JS and HTML; no model weights, scalers or datasets are included. Source and built assets are both included because this repository already tracks `dist`.

No live service, database, deployment, notification or manuscript changes were performed. No live tests were run. No staging persisted end-to-end replay or screenshots were fabricated. Real node datasets and `selected_adult_22p5_30_37p5.json` are absent, so the supplied distribution counts cannot be independently recomputed here. The unchanged historical figures in the handoff are observations, not incidents or notifications.

After the actual seed-7 release arrives: verify it, implement its versioned adapter and active model identity end to end, provide private server deployment packaging, review durable job transactions/restart recovery and replay isolation, then execute the model and full integration gates. Do not mark the entire model integration complete from the current policy tests. This branch currently retains the prior model integration.

Deployment must pair the new frontend with the matching server policy; a frontend connected to the old server deliberately displays policy mismatch. Before production, verify the complete new model path in an authorized staging environment. No public exposure or database migration is implied by pushing this development branch.

## Rollback

Use the baseline commit on a separate branch or revert the policy commit; avoid destructive resets on a shared checkout. A Git archive of the baseline exists outside the app at `../backup/model_v2-baseline-7648ffbf.zip`, SHA256 `497e01b88cc9df768d6f1e97a3a967dff6512f201f37d0d3b2e4f5672babc80f`. This archive contains tracked source only, no deployment credentials or model assets. The older model package remains intact at its existing external location.
