# Verified release and boundaries

Seed7 / epoch15 /35 completed epochs; modelID `median-residual-seed7-epoch15-20261013-v1`; checkpoint SHA256 `4253e73515d8d2a3d4a4463065f8bfb2192c9454e161da560fd928a4051672c4`.

- Source study preserved and 577 sealed files verified.
- Seed7 calibration, matched targets and own development/later metrics independently checked against copied arrays.
- CPU and CUDA replay:12 historical cases each (72 forecast values), within0.02µg/m³ tolerance. See JSON for exact maximum differences and local timings.
- Runtime/API suite: 30 passed,0 errors/failures/skips. Includes private API auth, invalid input, ordering, golden reconstruction, independent risk and observed detector restart/idempotency.
- Separate Chapter4 results notebook executed with0 errors. It loads the exact chosen checkpoint and independently recomputes metrics; it does not train again or replace the master notebook.

CPU testing used this machine's CUDA-capable PyTorch wheel in CPU mode, not an independently tested fresh CPU-only wheel or every OS. Partners must run the self-test/tests on their deployment environment. SQL and TypeScript are drafts; no actual PWA build, Supabase integration, hardware or push delivery is claimed. The previous project-wide study run had194 passes and6 pre-existing failures; this release does not claim the legacy suite is fully green or repair those unrelated historical data-hash issues.

No model tuning, dataset modification, original-record rewrite, active artifact/master-notebook overwrite, manuscript edit or production deployment occurred. Hashes demonstrate matching bytes, not scientific generalization or publisher authenticity. Selection is explicitly post-review; no independent confirmation is claimed.
