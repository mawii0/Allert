# Clinical and Settings refresh

Base: GitHub main 40311e723b307bffcbb06d01f34ba8624abb035a (18 October 2026).

The dark ALLERT palette and emerald accents remain. Clinical keeps the VAS /10,
TNSS /12 carousel, notes, chosen observation time, history, edits, deletion,
exports and account isolation. Direct symptom shortcuts show all four scores;
Save now appears before analysis. Daily trend values also have a table.

Settings groups profile, home node, notifications, location and app details.
The duplicated device summary is consolidated. All existing hooks, permission
requests, saves, notification consent, quiet hours and sign-out remain connected.
Technical details are expandable; stale/unavailable states are not colored as
successful operation. Login branding/assets, models, thresholds and data routes
are unchanged.

Accessibility work includes scoped keyboard focus, larger controls, readable
secondary text, labeled navigation, score labels alongside color, and safe-area
spacing. Automated checks are not a complete accessibility certification or a
substitute for usability testing with participants.

## Apply and validate locally

Start from a clean, updated main and create feature/clinical-settings-ui.
Apply ALLERT_clinical_settings_ui.patch after its git apply --check succeeds.
Run npm test, npm run typecheck and npm run build.
Review at phone width: diary save/edit/cancel/delete confirmation/history/export;
profile save/cancel; notifications/quiet hours; location; node navigation; Logout.
Do not commit generated dist files or local credentials.

## Approved observed-push activation (Supabase website)

Real push delivery was explicitly approved on 18 October 2026. Production backend
must already be the verified seed7 revision. No backend redeployment or new keys
are required by this patch.

1. In the production Supabase SQL Editor, run the complete contents of
   docs/sql/PRODUCTION-alert-caller.sql. It defines the guarded caller only;
   installation makes no HTTP request and changes no schedule.
2. Run docs/sql/PRODUCTION-enable-observed-push.sql. It validates the existing
   credentials and schedules, resumes only allert-observed-anomalies, and returns
   an initial request ID. Existing expiry, consent, quiet-hour, ownership and
   deduplication checks still determine eligibility. Old notices may expire.
3. Wait about 20 seconds, then inspect net._http_response for that exact ID.
   Report status_code, timed_out, error_msg and content. HTTP 200 with
   outcome=disabled means the existing Edge secret ALLERT_ANOMALY_ALERTS_ENABLED
   still needs to be true; no successful delivery should be claimed from that.
4. Confirm the delivery worker heartbeat and accepted/error records. Provider
   acceptance does not prove device receipt. In Settings, use Send test
   notification on the connected browser and confirm an actual notification.
   Quiet hours apply to tests too. Do not fabricate pollutant readings/events.

Keep allert-verified-forecasts paused and forecast_enabled=false. Activation
does not prove the live neural forecast history is ready.

To pause delivery again, run in SQL Editor:

```sql
SELECT cron.alter_job(jobid, active := false)
FROM cron.job WHERE jobname = 'allert-observed-anomalies';
```

The pause preserves events and delivery audit records.

## Local verification

- Final full JavaScript suite: 644 passed, 0 failed.
- Three rollout SQL tests passed, including malformed credentials,
  wrong processing flags, paused production schedule, and legacy forecast guard.
- TypeScript typecheck and production Vite build passed.
- Browser checks used local fixture data, without contacting production or
  sending notifications: Clinical and Settings at 320, 390 and 768 pixels,
  profile editing and the history dialog. No horizontal document overflow or
  automated WCAG A/AA violations were detected in those states. Escape closed
  history and returned focus to its trigger. These checks do not establish full
  accessibility conformance or real push receipt.
- Accessibility reference: https://www.w3.org/TR/WCAG22/ (focus, labels, contrast,
  reflow and target size). Manual usability review is still required.
