# Small Home and Clinical layout update

Base: main 87a589c. This is a frontend-only patch; no database, Edge Function, Render or model deployment is required.

- Adult and Pediatric score labels are native buttons. Tap either to update the gauge's central score, tier, population label, guidance and optional PM forecast interpretation. The selected horizon and PM concentrations do not change. This is a display choice only; no profile update is sent. Initial display follows the existing profile default.
- The current-reading cards keep the two-column layout with smaller padding, shorter PM labels and no redundant Observed line. Missing measurements remain marked unavailable.
- Footer: “Environmental estimates only—not a diagnosis or medical advice.” The actual last-reading time remains visible.
- The Clinical observation-time input has a zero minimum intrinsic width, bounded border-box sizing, explicit date/time inner sizing and a 16px font on small screens. It stays within the card's existing padding while retaining the native picker, value, validation and diary-save behavior.

## Apply in PowerShell

Save ALLERT_home_compact_controls.patch in the Allert repository root. Start with no unrelated tracked changes.

```powershell
git status
git switch main
git pull --ff-only origin main
git switch -c feature/home-compact-controls
git apply --check ALLERT_home_compact_controls.patch
git apply ALLERT_home_compact_controls.patch
npm test
npm run typecheck
npm run build
npm run dev
```

If the patch check fails after a newer main update, stop and inspect the conflict rather than forcing it.

## Check before release

On Home, tap Pediatric, confirm its real current score/category appear in the center, then tap Adult. Changing 6h/12h/24h must preserve the chosen population. This selection must not edit a profile. Missing current indicators must display unavailable rather than a fabricated low score.

On a phone, open Clinical and check that observation time is inside its card with the same left/right padding as Notes. Open the native picker, choose a time, save an entry and reload. Also verify on a physical iPhone if that is the affected device; desktop browser viewport emulation does not reproduce every iOS native-control behavior.

After checks pass, commit the changed source/test/docs files, open a pull request and test the Vercel preview before merging. Do not commit generated dist files or downloaded patches. No Supabase backend redeployment is needed.
