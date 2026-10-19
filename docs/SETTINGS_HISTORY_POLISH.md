# Settings actions and environmental history wording

Frontend-only follow-up to main 87a589c. Apply on your current UI branch; this patch does not replace the earlier Home population buttons, compact reading cards, Pediatric border color, neutral forecast card, or mobile observation-time fix. No Supabase, Render, database or model changes are required.

## Changes

- Node-location actions use equal-width buttons with consistent 12px corners, 10px gaps, padding, focus outlines and minimum 44px touch targets. Save uses the ALLERT green primary style; Cancel, Refresh and optional recapture use a neutral secondary style. Existing save/cancel/refresh/capture functions and permissions remain in place.
- Historical environmental trend explains that the graph shows adult and pediatric environmental scores over the past day. The short note distinguishes environmental conditions from symptom severity.
- History Explorer explains what to choose, how to select a reading and why lines can have gaps. Removed the technical expected-sample footer. Median is labeled Middle value. Empty and previously recorded-data states remain explicit.
- Pollutant Accumulation Patterns uses Hours with highest PM2.5, Average PM2.5 and Data available. Its short explanation describes peak readings and the recorded fraction of the past day. Calculations, the 95% completeness gate and missing-data handling are unchanged.
- History cards share 16px padding/gaps on phones and 20px padding on larger screens. Sensor cards use 16px padding. Description colors and selected metric controls have stronger contrast.

## Apply

Save ALLERT_settings_history_polish.patch in your repository root. Stay on your current UI branch so the earlier Home edits are retained.

```powershell
git status
git branch --show-current
git apply --check ALLERT_settings_history_polish.patch
git apply ALLERT_settings_history_polish.patch
npm test
npm run typecheck
npm run build
npm run dev
```

If the check reports conflicts, stop and share the output rather than restoring or overwriting existing work.

## Verify

On a phone, confirm Save node location, Cancel changes and Refresh node location are aligned, evenly spaced and easy to tap. Save a label and reload; cancel a draft and verify the saved label returns; refresh without changing the saved value. Position capture still requires explicit confirmation near the node.

In Environmental, inspect the adult/pediatric trend, History Explorer and accumulation card. Switch measurements and time windows, select readings with the graph or slider, and open the reading details. Missing data must remain missing. Check the same screens on desktop.

After checks pass, commit reviewed source/test/docs files and verify the Vercel preview before merging. Do not commit dist outputs, downloaded patch files or private credentials. No backend deployment is needed.
