# Supplied reference sources — 14 October 2026

The user supplied these as supporting reference material, not a request to execute every instruction embedded in them:

- APP_COAUTHOR_PROMPT_Seed7_Epoch15.md: proposed integration sequence and acceptance criteria for median-residual-seed7-epoch15-20261013-v1.
- APP_MODEL_CLEANUP_PROMPT_Seed7_Epoch15.md: inventory, rollback preservation, retirement and verification requirements for the same proposed release.
- RISK_POLICY_HANDOFF.md: selected adult category boundaries 22.5/30/37.5, explicitly pending activation; pediatric settings and historical results must retain their attribution.
- Allert_db_evidences.zip: 17 application/database screenshots. These are historical evidence, not proof of the current database configuration, and do not contain the model release package.

Local originals are preserved under the sibling deployment directory `reference-sources/seed7-epoch15/`. Screenshot evidence is retained locally rather than published with source code.

The model package named ALLERT_App_Seed7_Epoch15_20261013_v1.zip is needed to verify its manifest, weights, matching scalers, configuration, 12 golden cases and runtime tests before a model replacement. The prompt states checkpoint SHA256 4253e73515d8d2a3d4a4463065f8bfb2192c9454e161da560fd928a4051672c4; this is an expected value, not a verification receipt.

This integration merges the existing tested History Explorer into model_v2. It preserves that branch's environmental policy implementation. It does not activate the newly supplied policy, replace model weights, migrate a production database or deploy a worker. The combined frontend/backend-unit suite passed 210 tests and the production build passed in an isolated checkout. An existing large-bundle build warning remains.
