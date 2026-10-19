# Patient UI actions, trends and notices

Base: main 80203dc (the merged Home/header updates). Frontend only. No changes to model weights, calibration, indicator thresholds, forecasting requirements, event detection, notification delivery or database access.

## Included

- The current indicator category label uses its existing tier color: green for low, yellow for moderate, orange for high and red for very high. Missing categories remain neutral. Adult/Pediatric selection updates the same genuine result; it does not edit a profile.
- Clinical symptom trends retain real daily VAS/TNSS averages, with straight line segments, clearer strokes and a dark tooltip. A single recorded day is still a point, with an explanation that another day is needed for a line. No additional observations are invented.
- Correlation Insights briefly explains its purpose, VAS/TNSS scales, matching records and how to read the coefficient. Current-model comparisons remain unavailable until the agreed analysis method is implemented; older-model comparisons remain explicitly identified. The rewrite does not claim a new working current-model correlation.
- Device and family-sharing text actions use the same emerald emphasis, hover/focus treatment, icons where useful and 44px minimum touch targets. No underlines. Primary and destructive actions retain their existing confirmations and authorization.
- The node check is labeled Refresh readings. Its result explains that the node uploaded within the past 10 minutes, or tells the user that no recent upload was received. This is not a live hardware ping and does not prove the node is still powered at this instant.
- Notification browser controls use the surrounding card background and a subtle separator, removing the nested black panel. Existing connection, consent, quiet-hours and delivery behavior remains in place.
- Sensor notices use Sudden spike as the heading. Recovered stays visible as a separate status and explains that the earlier rise no longer triggers the alert. Other events are labeled Detected or Recorded, not claimed to be a current ongoing alarm. Stale readings still say current conditions are unknown. Back to Settings and Refresh notices use the shared inline-action style.

## Apply on PowerShell

Save ALLERT_patient_actions_notices.patch in the repository root. Since the prior Home/header PR is merged, start from updated main with no unrelated tracked changes:

```powershell
git status
git switch main
git pull --ff-only origin main
git switch -c feature/patient-actions-notices
git apply --check ALLERT_patient_actions_notices.patch
git apply ALLERT_patient_actions_notices.patch
npm test
npm run typecheck
npm run build
npm run dev
```

If you have uncommitted work, retain it and inspect the status before switching. Do not restore it or force an unsuccessful patch check.

## Verify on a phone

1. Tap Adult and Pediatric on Home. The category word must match its category color and the selected score. A missing result must not become a low result.
2. Open Clinical. With at least two recorded days, VAS and TNSS should have real connecting lines. With one day, a point and the short explanation are correct. Editing an entry must still preserve and reload its real values.
3. Read Correlation Insights. Verify the short explanation, older-model toggle and export/refresh controls. Do not interpret an unavailable current-model comparison as a new calculation failure.
4. In Settings and Node Setup, refresh readings. Confirm the displayed message describes when the last upload arrived, not direct contact with the device.
5. Check family-sharing refresh/copy and Wi-Fi setup links for visible interaction, no underlines and normal keyboard focus. Keep destructive confirmations. Do not reset real links or remove family members solely to inspect visual styling.
6. Confirm the notification panel has no black interior block. Permission settings, test notification and quiet hours should still work.
7. In Sensor notices, check both a detected and a recovered event if real records exist. Recovered must remain clearly ended. Do not create fake production sensor events just to fill the screen.

After local checks pass, commit only reviewed source/test/docs changes, open a PR, inspect the Vercel preview and merge. No Supabase backend or model deployment is needed. Browser verification uses isolated fixtures and sends no real email, push message or sensor event.
