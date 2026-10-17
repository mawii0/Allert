> Historical component reference. Earlier experiment/notebook/test counts and research-repository paths below are not this release's verification or bundled files. The unchanged rule equations are background; current release checks are in `../05_RELEASE_VERIFICATION.md`.

# ALLERT observed PM rise and high-concentration alerts

Implemented October 10, 2026. This is a local, measurement-driven software
component with provisional engineering settings, not a certified smoke/fire
alarm, trained prediction head, or established event-detection accuracy result.

## Separation and scope

The BiLSTM continues to produce its original 6/12/24-hour concentration
forecasts. The observed detector uses only current and preceding valid
five-minute arithmetic-mean PM2.5 and PM10. It does not consume forecasts,
forecast residuals, weather-risk scores, symptoms, or CUSUM statistics.
No dataset, model checkpoint, feature scaler, model calibration or saved
forecast evaluation was changed for this implementation.

The obsolete `src/anomaly_detection.py`, `src/anomaly_calibration.py`, their
dedicated tests, settings and active entrypoints were removed. Recoverable
copies are under `tmp/observed_alert_migration_20261010/`. Existing version-1/2
alignment results remain historical evidence. They do not describe the new
detector. Current alignment evidence is version 3. Observed replay version 1
is intermediate evidence; version 2 fixes period attribution and adds episode
duration/high-level exposure counts and event-detail figures.

## Numerical rules

For each pollutant, B is the median of the twelve preceding eligible blocks;
MAD is their median absolute deviation about B. The current block is excluded.
The required excess is `T=max(A,k*1.4826*MAD)`. Sudden rise requires both
`C-B >= T` and `(C-C_previous)/elapsed_minutes >= r`. The high-level rule is
`C >= H_on`. Either pollutant and either entry reason can open an episode.

The MAD definition/scaling is supported by
[SciPy](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.median_abs_deviation.html).
It does not establish Gaussian PM, a false-alarm probability or a suitable
five-minute alert threshold. The proposed rule combination and settings are
engineering choices from the supplied research note, not a published,
validated ALLERT algorithm.

| Parameter | PM2.5 | PM10 |
|---|---:|---:|
| Reference | 60 min / 12 prior blocks | 60 min / 12 prior blocks |
| Absolute excess A | 10 µg/m³ | 20 µg/m³ |
| Variability multiplier k | 3 | 3 |
| Minimum rate r | 2 µg/m³/min | 4 µg/m³/min |
| High entry H_on | 50 µg/m³ | 100 µg/m³ |
| High exit H_off | 40 µg/m³ | 80 µg/m³ |
| Higher notification level | 100 µg/m³ | 200 µg/m³ |

The absolute floor prevents zero MAD from making tiny changes qualify.
These are not AQI categories or universal health/emergency thresholds.
Gradual increases below H_on can remain unflagged; the AND rule intentionally
targets rapid substantial block-level rises, not every cumulative increase.

## History, quality and timestamps

Online callers supply a nonempty `node_id`, timezone-aware `block_end` and
`received_at`, PM values, and available sensor/channel status. Units are
µg/m³ (`ug/m3` or `µg/m³` if supplied); no automatic unit conversion occurs.
History and state are separated per node and pollutant. Finite nonnegative
values are required; values above the configured measurement maximum or
non-ready/cleaning/fault statuses cannot supply normal alert or recovery
evidence. They remain explicit quality outcomes rather than clean-air zeros.
Missing PM10 does not suppress a valid PM2.5 trigger, and vice versa.

Actual elapsed block time determines rate. Candidate adjacency bounds are
4.5–7.5 minutes, rejecting a missing nominal five-minute block. Histories
are reset after gaps or invalid channels; the oldest reference must also be
within 60 minutes plus the configured 2.5-minute reference tolerance. This
prevents twelve arbitrarily old observations from forming a supposed hour.
High-level detection remains available during rise-reference warmup.

Live freshness is at most ten minutes after block end, with a one-minute
future-clock tolerance. Stale/future records do not notify or rewind accepted
live chronology and cannot maintain a recovery streak. Duplicate transport
retries ignore receipt-time differences. Conflicting same-time records and
out-of-order records are explicit outcomes, not silent replacements.

Replay uses raw source observations without interpolation. Its explicit
software convention treats naive timestamps as Asia/Manila block starts and
simulates receipt at start+5 minutes. Source interval/receipt metadata are
absent; this is not proof of actual interval semantics or measured network
latency. Known imputed/invalid records, when marked in supplied data, do not
provide alert evidence. Missing sample-count/device-status metadata remain
unverified assurances, not invented values.

## Episode lifecycle

1. First valid fresh rise/high entry creates one initial decision. Both
   pollutants/reasons can be combined in one node-level episode.
2. Two consecutive full-entry/persistently elevated blocks, including the
   initial block, confirm an episode. A second positive slope is unnecessary.
   Confirmation is recorded but does not create a redundant push payload.
3. The baseline and rise threshold are saved when a pollutant enters through
   rise. Ongoing elevation uses this saved reference, not the adapting median.
4. New pollutant/high-level reasons or material worsening generate escalation
   decisions even inside the 30-minute same-condition cooldown. Worsening
   requires both >=25% increase from last notified value and >=A absolute
   increase. Already-announced level crossings are not repeatedly escalated.
5. An episode remains held while an affected pollutant is at/above H_off or
   its saved-rise excess is at/above 0.5*T. Equality still holds the event.
6. All affected channels must provide three contiguous clear valid blocks
   to recover. Missing/invalid channels interrupt recovery and display UNKNOWN.
   Gaps interrupt confirmation/recovery streaks. Recovery creates one payload;
   a new episode starts a fresh notification lifecycle.
7. After recovery, the rise reference rewarms from new valid history. This
   deliberately conservative policy can miss a new sub-H_on rise during
   rewarm; the absolute high rule remains active. Test alternatives before
   changing it. End-of-record active episodes remain right-censored.

Repeated unchanged notices are suppressed even after cooldown: periodic
reminders are disabled and explicitly rejected if enabled in configuration.
Cooldown is therefore a minimum suppression/status policy, not an instruction
to send another message every thirty minutes.

Separate entry/exit and consecutive recovery have precedent in
[Pantelic et al.](https://www.nature.com/articles/s41598-024-69731-7), using
different sensors, two-minute reporting, and different intervention settings.
That study does not validate these ALLERT values or notification timing.

## Interface and durability

`ObservedPMAlerts.process(record)` produces quality outcomes, numerical scores,
state, episode changes and notification payloads. `snapshot()` provides a
JSON-serializable state; restoring requires the same configuration hash.
Each notification has an event ID and deterministic sequence/idempotency key.
No network messages are sent by this module or historical replay.

A delivery integration must atomically persist snapshot plus a pending
notification outbox, then deliver/retry by idempotency key. Saving state alone
before saving a notification can lose a notice after a crash. The library
does not claim transactional database or real push-delivery guarantees.
The caller must also run a freshness watchdog: if no records arrive at all,
there is no `process` call to update UI staleness. Absence of calls never
automatically recovers the stored episode.

## Reproduction and evidence

```powershell
.venv\Scripts\python.exe scripts/replay_observed_pm_alerts.py --compare --output results/my-new-alert-replay
.venv\Scripts\python.exe -m src.model_pipeline alerts --run-name my-new-alert-replay
.venv\Scripts\python.exe -m pytest tests -q -p no:cacheprovider --basetemp tmp/my-new-alert-tests
```

Output directories must be new and within project results; existing evidence
cannot be overwritten. The application command defaults to the original Node 1
source, not forecast targets. Replay writes configurations, scores, episodes,
notifications, final state, full-timeline and episode graphs, and source/code
hashes. Optional comparisons use ten fixed named policies and a limited
sensitivity study, not a Cartesian parameter search or automatic promotion.

Current evidence: `results/observed_pm_alerts/fixed_policy_v2/`. Earlier June–August
and reused September are reported separately based on the source block start.
Settings are fixed before replay and remain provisional afterward. Episode
counts, duration, peak five-minute values, confirmed/recovered status, measured
blocks above H_on and notifications per nominal monitored day quantify behavior
and burden. Counts above H_on use observed blocks, not imputed continuous
exposure during gaps. Without independent annotations, recall and precision
are explicitly unavailable. Synthetic unit fixtures are software tests only.

Verification passed 196 regression tests, including 55 detector/replay tests.
The updated master notebook executed all 37 code cells (73 cells total) and
contains 17 embedded PNGs, with no error outputs. Version-3 integration
checks passed and the original source, processed input, frozen model and
single-run checkpoint hashes remained intact. Machine-readable verification
and the regression record are under
`docs/research/evidence/observed_pm_review/`.

### Current replay results and interpretation

The fixed default evaluated 35,136 source blocks: 26,496 from June–August
and 8,640 from September. It opened six episodes, all later confirmed and
recovered, and generated 17 notification decisions: six initial, five
escalation and six recovery. Five episodes started in June–August and one
in September. No episode remained open at the end of this record.

| Fixed comparison | Episodes | Notification decisions |
|---|---:|---:|
| High-level only | 5 | 12 |
| Simple excess/rate plus high | 6 | 17 |
| Default robust excess/rate plus high | 6 | 17 |
| Robust, 30-minute reference | 6 | 17 |
| Robust, 120-minute reference | 7 | 20 |
| Robust, k=4 | 6 | 17 |
| Robust, doubled excess floor | 5 | 10 |
| Robust, lower rate | 6 | 17 |
| Robust, lower high levels (30/60) | 30 | 78 |
| Robust, higher high levels (75/150) | 3 | 10 |

These settings change alert burden, not a measured true/false event rate.
The MAD-based and simple policies have the same aggregate episode/notice
counts here; this does not establish identical timing or a measured
advantage for robustness. Lower high settings substantially increase burden;
larger floors suppress rise reasons. Do not select a setting merely to
manufacture many alerts or obtain a desired-looking result. The default
remains the pre-replay provisional setting, pending review/annotations.

The component cannot reconstruct within-block peaks or promise a universal
five-minute onset-to-alert delay. Its messages identify observed PM changes
and levels, not a source, a confirmed fire, a predicted allergy episode or
proof that air is safe following recovery.
