# Seed-7 selection and identity

The researcher explicitly selected **seed 7, checkpoint epoch 15, 35 completed epochs** after reviewing the completed five-run study. This new app handoff adopts that request. It does not alter the historical selection: the predeclared minimum-stopping-loss rule selected seed 42, epoch 1, loss 2.0856454331299354. Seed 7's minimum stopping loss is 2.110111390722209. It is NOT the predeclared validation winner or a fresh independent confirmation.

Model ID: `median-residual-seed7-epoch15-20261013-v1`. Checkpoint SHA256: `4253e73515d8d2a3d4a4463065f8bfb2192c9454e161da560fd928a4051672c4`.

All displayed training curves, calibration and assessment predictions in this release belong to this exact revised-data seed-7 run. No earlier seed-42/ensemble scores or curves are substituted. All 35 epochs are retained. No minimum selected epoch was imposed, and no retraining/calibration is performed during packaging.

`bundle/selection_decision.json` records the current choice. `historical_seed42_selection_lock.json` and the original evaluation files remain unchanged. Their `selected=false` flags correctly describe the PRIOR study selection; the current handoff is recorded separately. Do not edit those historical flags to pretend seed 7 won the original rule.

The previous active artifacts, master notebook, original study, previous ZIPs and manuscript are preserved. This release is a handoff, not live app deployment. Chapter 4 should pair the new model with its own results and disclose the post-review choice; it must not claim that checkpoint 15 alone proves fitness.
