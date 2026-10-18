# Clinical correlation, ownership protections, and mobile installation

**Seed7 revision:** deployment and policy instructions below describe the previous implementation. See [the seed7 Vercel integration](model_seed7/VERCEL_SETUP.md) for the proposed replacement. The default correlation card now explains that a new forecast-to-symptom protocol is pending; prior-policy analysis remains available through an explicit historical option.

Historical implementation notes. Current deployment and acceptance status: [Release completion](RELEASE_COMPLETION.md).

Prepared against merged main `e5bfbcb3a2ec604d86536497aced91cb962009f9`.

## Delivered scope

1. **Clinical correlation:** actual Spearman coefficients of archived forecast environmental tier ranks against VAS /10 and TNSS /12; independent horizons, matched evidence CSV, insufficient-data and constant-value states.
2. **Ownership protections:** a final ownership/epoch check before returning telemetry, model results, notices, location, or correlation; rejection of a model cache predating ownership; shared account-safe requests for telemetry, Risk Monitor, and node mutations. Includes actual PostgreSQL unlink/relink tests and delayed-session regression tests.
3. **Mobile installation:** web manifest, icons using the existing unchanged logo, an installation action inside Settings, standalone detection, browser offline indication, and a generic offline navigation page. The existing service worker and browser-push bindings are retained.

The original login logo, diary slider/carousel, navigation, existing cards, firmware, model inference implementation, model secrets, and anomaly schedule are retained. Small feature sections are added inside the current screens. No dependency installation or package-lock update is required.

## Correlation protocol

Version: `prospective-tier-symptoms-v1`.

- VAS is the app's existing **0–10** scale; no historical score is silently converted to 0–100. TNSS remains **0–12**.
- The predictor is the canonical environmental tier: low=1, moderate=2, high=3, very_high=4. It is not the diary's symptom-derived `/50` summary and is not an allergy probability.
- Only verified live `model_adjusted` forecasts under the current policy hash qualify. Median fallback, stale, malformed and unverified outputs cannot be archived.
- Risk Monitor saves both adult and pediatric forecast indicators at the existing 6/12/24-hour horizons when it loads. The stored evidence is server-authored, append-only through a privileged RPC, and scoped to user, device and ownership epoch.
- Capture must occur at or after forecast origin, within 20 minutes of origin, and strictly before the target and paired symptom observation. Existing model configuration and the verified cache are reused. The release completion batch adds a separately enabled background collector.
- The original collection ran **on Risk Monitor load**. The release completion batch also collects prospectively while the app is closed, after its migration, feature flag and Cron are deployed.
- Reports require a genuine `observedAt`. Legacy creation time is never substituted. A report matches a forecast target within **±15 minutes**.
- Deterministically select one closest matched report per **Asia/Manila calendar day**, without reusing a forecast target. Corrections and deletions are reflected by reloading the canonical diary.
- Calculate Pearson correlation on **average ranks**, including ties. At least **7 matched days** are required. Constant predictors or outcomes return an unavailable value, never a fabricated zero.
- The selected current profile category determines which saved category series is analyzed. The screen labels that category. Different horizons are never pooled.
- Seven matched days is an operational display floor, not a validated clinical sample-size calculation. The matching tolerance and one-per-day rule must be documented in the research protocol. No p-values, significance claim, causality, diagnostic conclusion, or clinical validation is produced.
- The screen supports 7/30/90-day periods. It uses up to 500 canonical diary records and 18,001 bounded forecast records, with a partial-analysis flag if a bound is reached.
- CSV contains only the selected account's actual matched pairs, identifiers, times, tier, score and symptom values; notes and location coordinates are excluded. Spreadsheet formula prefixes and quotes are escaped.

**No historical forecasts are reconstructed.** An empty forecast archive is expected after installation. Feature completion today does not produce seven days of prospective clinical evidence today.

## Supabase website setup

1. Run only the new migration `supabase/migrations/20261016070000_forecast_evidence.sql` in SQL Editor once. Success with no rows is normal. Previous migrations must already be installed.
2. In Edge Functions → `make-server-a473accf` → Code, use local `supabase/functions/server/` files:
   - Replace active `index.tsx` and `app-feature-routes.mjs`.
   - Add `clinical-correlation.mjs`, `clinical-routes.mjs`, and `node-ownership.mjs` alongside the entrypoint.
3. Keep the other modules and the existing authentication setting. Deploy.
4. No changes to `sensor-ingest`, VAPID secrets, model secrets, worker token, or Cron are needed. The already running anomaly worker may remain enabled.
5. Publish the frontend through the usual feature branch PR and Vercel workflow.

Migration SQL is not a replacement for historical migrations. Do not rerun the previous batch's table-creation migrations.

## Verify locally

Run `npm test` and `npm run build`. The suite covers statistics, PostgreSQL permissions, evidence idempotency and timing, ownership/session races, install actions, offline behavior, and existing app regressions. A large-chunk warning remains a performance warning.

### Clinical

- Open Clinical/Symptom Tracker. Existing logging, notes, editing and deletion should retain their layout and behavior.
- The new Correlation insights card must initially show insufficient matched days, not a sample coefficient.
- Change period and horizon. Refresh and error handling must remain usable.
- When genuine evidence exists, export only its matched pairs. An empty series cannot export invented rows.
- Saving/correcting/deleting a diary entry refreshes the analysis. Switching accounts must clear a pending old response.
- With the model unavailable or returning fallback, Risk Monitor still works as before and correlation remains insufficient. This does not verify or change model hosting.

### Ownership

- Automated tests exercise real unlink/relink SQL, old-epoch capture denial, location clearing, revoked access, transfer during an actual telemetry request, and old-model-cache rejection.
- Automated tests also exercise a late 401 after token renewal, a late response after account switching, and logout/relogin to the same account.
- Physical/manual ownership testing is still required. Use an intended test node/account or an agreed maintenance window. Obtain a fresh private setup code through the existing workflow; do not commit or share it in chat.
- Verify account A's linked node and readings. Unlink after confirmation; account A must lose node access. Link to B with the fresh setup code; B must not see earlier household readings, position, notices, or forecast evidence. A must remain denied after reload.
- Confirm that an already-used setup code cannot transfer the node again and that a fresh code is required for a planned return transfer. A different account must never be able to unlink B's node.
- Do not report physical node transfer testing complete merely because the local automated suite passed.

### Mobile installation and offline behavior

- Open the Vercel app over HTTPS. In Settings, find Install ALLERT near the app information card.
- A supported browser's install event enables Install on this device. The prompt runs only after the button; dismissing it must not report success.
- If no install event is offered, the UI provides the browser menu/Add to Home Screen instructions. Installation availability is determined by the browser; absence of an in-app button is not an app authentication failure.
- Open the installed app and confirm its original login logo and navigation. Its start URL contains no account identifiers or credentials.
- On iPhone, use Safari's Share → Add to Home Screen. The release completion batch adds Apple Web Push provider support. Actual iPhone permission and delivery testing remains a release acceptance check.
- In an open app, browser offline mode shows the offline notice. An offline reload under the active service worker shows a generic offline page with a retry button.
- No app HTML, JavaScript, private API response, diary record, coordinate, or token is saved to a service-worker response cache. Offline navigation does not provide an offline private app or offline diary saves.
- Reconnect and reload, then verify ordinary sign-in, telemetry, diary persistence and the existing Chrome test push. Do not unregister the worker or clear all site storage to test installation; that would remove existing push bindings.

## Local verification and limits

The feature suite and full regression tests run against the actual implementation. PostgreSQL tests use PGlite; HTTP tests bundle the real backend entrypoint with fake Auth/storage clients and fake network transport. UI interactions use React's component renderer. No live model server, production household transfer, iPhone installation, or real mobile browser install was exercised by the patch author.

## Remaining release work

- Hosted FastAPI and FLASH-button setup reopening: implemented; the user reported fresh readings with the PC off and successful phone setup.
- Basic physical power-loss queue recovery and reconnection drain: verified by the user; repeat as a release smoke check after future firmware changes.
- Physical ownership and additional-node routing acceptance tests.
- Live anomaly detection and notification display on genuine sensor data.
- Teammate verification of model hosting and receipt-bearing input availability, plus deployment/acceptance of the scheduled forecast collector.
- Prospective collection and research evaluation of clinical correlation. Numeric availability cannot be forced by manufacturing historical predictions.
- iPhone push transport/permission acceptance testing.
- Production browser/device checks and owner review of duplicated dashboard backend files. This patch does not delete unknown dashboard files.

## Technical references

- SciPy Spearman rank correlation: https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.spearmanr.html
- SciPy tie-handling reference tests: https://github.com/scipy/scipy/blob/main/scipy/stats/tests/test_stats.py
- MDN PWA installation: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- MDN installation prompts: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt
