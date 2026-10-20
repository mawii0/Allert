# Live forecast card

Home uses one LiveForecastCard for the selected 6, 12 or 24 hour horizon.
Verified PM2.5/PM10 values appear first, followed by two columns for adult and
pediatric forecast environmental indicators. Display scores use one decimal,
20px text and policy category colors. A target timestamp identifies the actual
future five-minute block. No replay fixtures or simulated values are imported.

The indicator values come only from the validated /risk-monitor response.
They are PM-only interpretations using reference weather (25 C and 60% humidity),
not predicted weather or symptom probabilities. Missing indicators remain
unavailable. Insufficient history never produces filled forecasts.

## Deployment

Merge and deploy the frontend patch. No Edge Function or database change is
included. Preserve the existing backend IDs, checkpoint and policy hashes.

To enable the existing reviewed PM-only interpretation on future worker results,
set ALLERT_FORECAST_PM_INDICATOR_ENABLED=true in the production model Vercel
project (allert-model-production), then redeploy that model project using its
currently approved source/settings. Do not change the 648-block guard or turn
on staging replay. Existing saved results are not rewritten by this switch;
verify a newly generated ready forecast after valid history is available.

If this flag is already true, no model redeployment is needed for the UI change.
Confirm both indicator populations in the authenticated risk-monitor response.
Use a clean release worktree so local Dashboard/Root simulation wiring is not
included in the frontend release.

Validation: node --test integration/seed7-dashboard.test.mjs; npm run typecheck;
npm run build. The local replay components are not part of this patch.
