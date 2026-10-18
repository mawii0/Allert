# History table branch review — 13 October 2026

Reviewed `origin/feature/improve-table-history` at `be2da99` in an isolated checkout. The corrected app runs at http://127.0.0.1:5174/. Changes remain local; nothing was pushed or deployed during this review.

## Confirmed issues corrected

- Every quality label was green, including invalid readings. Valid readings now appear green, invalid readings red, and unknown quality neutral.
- Hidden scrollbars and an unfocusable scrolling container made offscreen columns difficult to discover and reach. The table now has visible scrollbars, keyboard focus, a named accessible region, scoped headers, and a scrolling hint.
- Direct numeric formatting could throw for malformed values. Missing, nonnumeric, and nonfinite measurements now show an em dash; zero remains a valid measurement.
- Duplicate timestamps could inflate sample counts. Equivalent timestamps are deduplicated per device, retaining the highest record ID. The window uses (start, end], filters the selected sensor, and sorts newest first without changing source data.
- Replay tables lacked sufficient recorded-data context. Replay headings and accessible labels now distinguish recorded samples.
- Dependency audit reported nine vulnerabilities, including one critical. Compatible router, Vite, and transitive dependency updates reduced the npm audit count to zero. No forced dependency upgrade was used.

## Verification

- All 169 automated tests passed. The suite includes actual React table rendering and 200 generated dataset trials within a property test.
- All 193 deployed API acceptance checks passed: 54 account checks, 59 node-access checks, and 80 telemetry checks. Temporary test accounts were removed. These checks exercised the existing backend shared by this frontend branch; no backend changes were deployed.
- Production build passed with Vite 6.4.4.
- The signed-in browser displayed actual sensor history. No browser console errors were observed at the final check.
- Keyboard horizontal and vertical scrolling passed. At a 390-pixel viewport, the page did not overflow horizontally; the table scrolled within its container and its header stayed sticky.
- Separate browser fixtures passed for empty history, malformed measurements, invalid quality, replay, and a full 288-sample day. Fixtures were explicitly labeled synthetic and did not write database records.
- Coverage includes window boundaries, device isolation, duplicate timestamps, timezone offsets, Manila date rollover, missing values, zero, unexpected quality strings, escaped markup, replay labels, and invalid window timestamps.

## Limits and follow-up

The build retains a large JavaScript bundle warning (approximately 924 kB before gzip). This is a performance follow-up, not a failing table test. This review is not a long-duration hardware soak test or a complete browser compatibility certification. Existing sensor data was used for the app preview; synthetic records were used only in isolated acceptance tests and labeled browser fixtures.

Evidence is saved in the parent deployment evidence directory as `table-history-account-tests.json`, `table-history-access-tests.json`, `table-history-telemetry-tests.json`, `table-history-audit-before.json`, `table-history-audit-after.json`, and `table-history-review.jpg`.
