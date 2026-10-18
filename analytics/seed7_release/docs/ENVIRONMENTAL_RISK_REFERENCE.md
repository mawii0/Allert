> Historical component reference. Earlier experiment/notebook/test counts and research-repository paths below are not this release's verification or bundled files. The unchanged rule equations are background; current release checks are in `../05_RELEASE_VERIFICATION.md`.

# ALLERT current environmental indicator — retained specification

Status: research-informed, project-defined rule. This records implementation,
not a validated personal symptom probability or standardized AQI. Neither the
proposed relative-risk layer nor the AQI replacement was adopted. The separate
observed-PM sudden-rise detector remains unchanged.

## Mathematical contract

Current PM2.5 and PM10 are in µg/m³, temperature T in °C, and relative humidity
H in percentage points (70 means 70% RH).

\[
S=0.0104C_{25}+0.0026C_{10}+0.012(T-25)-0.004(H-60).
\]

\[
I=\frac{p\exp(S)}{1+p\{\exp(S)-1\}},\qquad Score=100I.
\]

The stable implementation is sigmoid(logit(p) + S). Legacy `p_risk` and
`environmental_indicator` fields contain normalized I on a 0–1 scale;
`score_0_100` contains display points. Inputs are observed PM/weather, not
forecasts, symptom-diary scores, or anomaly outputs.

## Parameter register

All values match `config/environmental_risk.yaml`. Their exact published derivations have
**not been verified** by this software audit. Retain them as project settings
until source estimates, increments, exposure periods, populations, outcomes
and transformations/attenuation are documented. This applies to every entry.

| Parameter | Value | Input scale / meaning |
|---|---:|---|
| PM2.5 coefficient | 0.0104 | Per µg/m³ |
| PM10 coefficient | 0.0026 | Per µg/m³ |
| Temperature coefficient | 0.012 | Per °C above reference |
| Temperature reference | 25°C | Centering condition, not optimum health temperature |
| Humidity coefficient | −0.004 | Per RH percentage point above reference |
| Humidity reference | 60% RH | Centering condition, not optimum health humidity |
| Adult nominal baseline p | 0.20 | Configured starting value |
| Pediatric nominal baseline p | 0.22 | Configured starting value |

The PM2.5 coefficient is four times the PM10 coefficient per unit in this rule,
not proof of a universal fourfold health effect. The humidity effect is likewise
a configured effect, not a universal protective rule. PM2.5 and PM10 overlap;
combining literature associations does not establish a jointly fitted model.

## Category contract

| Tier | Adult score points | Pediatric score points |
|---|---|---|
| Low | 0 ≤ score < 15 | 0 ≤ score < 13 |
| Moderate | 15 ≤ score < 25 | 13 ≤ score < 23 |
| High | 25 ≤ score < 40 | 23 ≤ score < 38 |
| Very High | 40 ≤ score ≤ 100 | 38 ≤ score ≤ 100 |

Cutpoints are project-defined, not DENR AQI breakpoints or clinical emergency
criteria. Equality belongs to the higher tier. Exports use the same classifier.
Invalid indicator values must not become a normal tier.

## Worked example and baseline

At PM2.5=20, PM10=40, T=30 and H=70, S=0.332. Adult score ≈25.8401 and
pediatric score ≈28.2181; both are High. These are points, not percentages of
personal symptom probability. At zero PM and reference weather S=0 and I=p:
adult=20 and pediatric=22 points, both Moderate. This is a consequence of the
nominal baselines, not a measured health outcome. The baseline and category
interpretations require explicit domain justification.

## Integration

- `src/risk_engine.py`: canonical current-observation formula and categories.
- `src/risk_sensitivity.py`: numerical setting perturbation; differences times
  100 are score-point differences. Legacy JSON `delta_*_pct` names are retained.
- `src/export_results.py`: compatibility export using the current configuration
  and classifier, not separate hard-coded cutpoints.
- `src/model_pipeline.py::current_risk()`: last recorded processed dataset
  row, not live telemetry. Local command:
  `.venv\Scripts\python.exe -m src.model_pipeline risk`.
- Master notebook: retrospective example separate from neural forecasts and
  observed-PM alert replay. No live app connection is established.
- Distributed-lag weighting: inactive; retained helper is compatibility only.
- Sudden-rise/high-concentration detector: independent of this score.
- Paper Section 3.2: independent environmental predictor, separate from the
  symptom-derived diary display and descriptive symptom association assessment.

Paper references [3] and [10] support factor relevance. This register does not
establish published derivations or validation of the combined rule, demographic
adjustments or cutpoints. Expert review can assess content/advisory suitability;
software tests cannot establish personal symptom calibration.

## Verification

Test literal settings, worked examples, exact/neighboring tier boundaries,
configured monotonic effects, invalid observations, legacy exports, display
units and independence from inference/lag. Compare both populations across
all retained rows with an independent formula and category assignment. Run
the regression tests; notebook execution is outside this risk-engine check.
Record fresh evidence separately;
preserve historical audits and verify unchanged dataset/model hashes.

This verifies local calculation and presentation consistency, not hardware,
live telemetry, databases, frontend rendering, notification delivery,
participant data, or health outcomes.
