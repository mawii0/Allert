# ALLERT Risk Policy and Forecast Interpretation Handoff

Updated 14 October 2026

This document aligns the adult and pediatric environmental categories, explains their calculation, and defines an optional combined PM-only indicator for the 6-hour, 12-hour, and 24-hour forecast cards. It contains the system, application, and manuscript prompts needed for implementation.

The Chapter 4 dataset analysis uses the selected adult and pediatric boundaries. The optional forecast indicator has been calculated and checked locally. Runtime configuration and application activation remain separate implementation steps. No model, readings, live database, or application deployment was changed by this document revision.

## 1 Selected category policy

Scores use points on a 0–100 scale. Equality enters the higher category. Classify the full-precision score before display rounding.

| Category | Adult score | Pediatric score |
|---|---|---|
| Low | 0 ≤ S < 22.5 | 0 ≤ S < 20.5 |
| Moderate | 22.5 ≤ S < 30 | 20.5 ≤ S < 28 |
| High | 30 ≤ S < 37.5 | 28 ≤ S < 35.5 |
| Very High | 37.5 ≤ S ≤ 100 | 35.5 ≤ S ≤ 100 |

Internal fractional cutoffs are adult 0 / 0.225 / 0.30 / 0.375 and pediatric 0 / 0.205 / 0.28 / 0.355.

Planned joint policy identity:
environmental-indicator-adult22p5-30-37p5-pediatric20p5-28-35p5-20261014

Create a canonical policy hash from the actual implemented settings. Do not describe this planned identity as an already deployed version.

### Existing and selected records

| Record | Adult boundaries | Pediatric boundaries | Status |
|---|---|---|---|
| Root configuration environmental_risk.yaml | 15 / 25 / 40 | 13 / 23 / 38 | Existing runtime file; unchanged by manuscript work |
| Earlier v3 candidate configuration | 25 / 35 / 50 | 25 / 35 / 50 | Historical candidate; unchanged |
| Earlier supplemented Chapter 4 | 22.5 / 30 / 37.5 | 25 / 35 / 50 | Historical manuscript copy |
| Current Chapter 4 and this handoff | 22.5 / 30 / 37.5 | 20.5 / 28 / 35.5 | Selected joint interpretation; app/runtime synchronization pending |

Both populations now have an explicit decision. The earlier adult-only instructions are superseded.

## 2 Current-reading indicator

The retained calculation is:

~~~text
C = 0.0104*PM2.5 + 0.0026*PM10
    + 0.012*(temperature_C - 25)
    - 0.004*(relative_humidity_percent - 60)

S = 100*sigmoid(log(p0/(1-p0)) + C)

p0_adult = 0.20
p0_pediatric = 0.22
~~~

PM inputs use µg/m³; temperature uses °C; relative humidity uses percent. The two population settings use the same observations, with their respective scale references and category boundaries.

The indicator combines particulate concentration and meteorological context in a bounded environmental score. The weights, references, and cutoffs are system parameters. The score is expressed in indicator points rather than an individual probability of symptoms.

### Verified dataset classifications

Counts use each node's stored observations; missing periods are not filled.

| Node and population | Records | Low | Moderate | High | Very High |
|---|---:|---:|---:|---:|---:|
| Node 1 adult | 35,136 | 11,891 (33.84%) | 22,523 (64.10%) | 681 (1.94%) | 41 (0.12%) |
| Node 1 pediatric | 35,136 | 0 (0.00%) | 29,495 (83.95%) | 5,336 (15.19%) | 305 (0.87%) |
| Node 2 adult | 34,741 | 12,933 (37.23%) | 21,211 (61.05%) | 594 (1.71%) | 3 (0.009%) |
| Node 2 pediatric | 34,741 | 0 (0.00%) | 28,296 (81.45%) | 6,353 (18.29%) | 92 (0.26%) |
| Node 3 adult | 34,883 | 2,188 (6.27%) | 30,423 (87.21%) | 2,229 (6.39%) | 43 (0.12%) |
| Node 3 pediatric | 34,883 | 0 (0.00%) | 19,075 (54.68%) | 14,815 (42.47%) | 993 (2.85%) |

Every recorded pediatric score exceeds 20.5 points. Moderate is the largest category in all three nodes. At zero PM and reference weather, the formula produces adult 20 points (Low) and pediatric 22 points (Moderate). Preserve these results rather than forcing a Low pediatric category.

| Calculation example | Adult | Pediatric |
|---|---|---|
| PM2.5 = 11, PM10 = 13, T = 35.6, RH = 92.8 | 22.41 / Low | 24.57 / Moderate |
| PM2.5 = 66.2, PM10 = 97.7, T = 35.9, RH = 86.8 | 39.65 / Very High | 42.57 / Very High |

These counts describe observations under the rule, not independent episodes or delivered notifications.

## 3 Optional combined PM-only forecast indicator

The user selected one combined score per horizon, not a separate category for each pollutant.

For each horizon h in 6, 12, and 24 hours, use the paired concentration forecasts issued for the same node, origin, model, and target horizon:

~~~text
C_PM,h = 0.0104*forecast_PM2.5,h + 0.0026*forecast_PM10,h

S_PM,h = 100*sigmoid(log(p0/(1-p0)) + C_PM,h)
~~~

Use the same adult and pediatric scale references and selected category boundaries above. Temperature and humidity do not enter this optional score; do not insert current weather as future weather or fabricate weather predictions. The calculation summarizes forecast particulate concentrations, while the current-reading indicator also includes measured weather context.

Suggested app label: **Forecast PM indicator**. Show both concentration values in µg/m³, one combined score in points, one category, the horizon, and the target time.

Planned separate identity:
forecast-pm-only-adult22p5-30-37p5-pediatric20p5-28-35p5-20261014

Keep the option disabled until implementation and app/backend parity checks are complete.

### Worked display examples

The following numbers are illustrative inputs, not forecasts from the model assessment.

| Horizon | PM2.5 µg/m³ | PM10 µg/m³ | Adult score and category | Pediatric score and category |
|---|---:|---:|---|---|
| 6 hours | 25 | 35 | 26.21 / Moderate | 28.60 / High |
| 12 hours | 35 | 45 | 28.80 / Moderate | 31.33 / High |
| 24 hours | 55 | 80 | 35.29 / High | 38.09 / Very High |

Both pollutant forecasts jointly determine the category. A PM2.5 forecast of 35 and PM10 forecast of 45 therefore remains Moderate under the adult formula; categories should follow the calculation, not an example label.

With nonnegative PM forecasts, the pediatric PM-only score is always at least 22 points. Consequently, it cannot enter Low under the selected 20.5-point boundary, even when both predicted concentrations are zero. The adult reference remains Low at 20 points. Changing this behaviour requires a separate decision on the pediatric scale reference or PM-only cutoffs; do not change either silently during implementation.

The score is a project-defined forecast interpretation. Its inputs are horizon-end concentration estimates, rather than the annual or 24-hour averages specified by WHO concentration guidance [6]. Published particulate research supports using PM information for exposure awareness [3]; it does not prescribe this particular equation or establish the forecast-score cutoffs.

### Small reference implementation

~~~javascript
const references = { adult: 0.20, pediatric: 0.22 };
const boundaries = {
  adult: [22.5, 30, 37.5],
  pediatric: [20.5, 28, 35.5]
};
const names = ["Low", "Moderate", "High", "Very High"];

function forecastPmIndicator(pm25, pm10, population = "adult") {
  if (!Object.prototype.hasOwnProperty.call(references, population)) {
    throw new Error("Unsupported population");
  }
  if (![pm25, pm10].every(v =>
      typeof v === "number" && Number.isFinite(v) && v >= 0)) {
    throw new Error("Both forecasts must be finite and nonnegative");
  }
  const contribution = 0.0104 * pm25 + 0.0026 * pm10;
  if (!Number.isFinite(contribution)) {
    throw new Error("Invalid particulate contribution");
  }
  const p0 = references[population];
  const z = Math.log(p0) - Math.log1p(-p0) + contribution;
  const score = z >= 0
    ? 100 / (1 + Math.exp(-z))
    : 100 * Math.exp(z) / (1 + Math.exp(z));
  const index = boundaries[population].filter(cut => score >= cut).length;
  return { score_points: score, category: names[index], population };
}
~~~

The backend should be the canonical calculation source. If the app also calculates a preview, verify it against the same configuration and full-precision test vectors.

### Payload and unavailable-state requirements

Retain existing forecast fields. Add optional fields without replacing the PM concentrations:

~~~json
{
  "forecast_pm_indicator": {
    "enabled": false,
    "policy_id": "forecast-pm-only-adult22p5-30-37p5-pediatric20p5-28-35p5-20261014",
    "population": "adult",
    "basis": "forecast_pm_only",
    "score_unit": "points",
    "horizon_hours": 6,
    "score_points": null,
    "category": null
  }
}
~~~

This is a proposed schema, not a captured service response. Include node identity, forecast origin, target time, model identity, forecast status, and policy hash in the surrounding record. Store one interpretation for each valid pollutant pair at each horizon.

- A missing, invalid, stale, or mismatched pair produces unavailable score/category fields, never zero or Low.
- A valid median-only fallback may be interpreted only with its fallback status clearly displayed; it must not be labelled a neural forecast.
- Switching population applies the matching scale reference and boundaries consistently.
- Display rounding does not change classification.
- The optional forecast score does not change forecast values, neural calibration, observed-PM event thresholds, or current-reading scores.
- Do not enable automatic notifications or medication instructions through this optional feature without separate approved behaviour and tests.

## 4 Research rationale and IEEE sources

Particulate research identifies associations involving PM2.5, PM10, and allergic rhinitis [3]. WHO guidance establishes concentration-based exposure-management references [6]. Meteorological research reports temperature and relative-humidity associations, with variation across conditions and study settings [10]. These sources support the environmental inputs and the interpretation context.

The system retains a weighted particulate contribution, centered weather adjustments, and a bounded logistic transformation. Adult category entries are 22.5, 30, and 37.5 points. Pediatric entries are two points lower at 20.5, 28, and 35.5. The optional forecast interpretation uses only the weighted particulate contribution.

The exact coefficients, scale references, category boundaries, and pediatric offset are implemented system choices, not numerical thresholds prescribed by these publications. An epidemiological coefficient for an odds ratio measured per increment follows ln(OR)/increment. Do not describe the existing weights as exact published odds-ratio conversions without that calculation and a matching exposure definition.

### Copy-ready manuscript wording

ALLERT's environmental interpretation combines particulate concentrations with temperature and relative humidity, based on particulate and meteorological research and general PM guidance [3], [6], [10]. Weighted particulate contributions and weather adjustments form a combined value, which a logistic transformation maps to a 0–100-point indicator. Adult scores enter Moderate, High, and Very High at 22.5, 30, and 37.5 points, respectively; the corresponding pediatric boundaries are 20.5, 28, and 35.5 points. These categories organize progressively elevated environmental conditions for exposure-awareness guidance.

Use the optional forecast paragraph as implemented Chapter 4 reporting only after its integration is verified:

The forecast cards present PM2.5 and PM10 estimates at 6-hour, 12-hour, and 24-hour horizons together with a combined forecast PM indicator. The indicator uses the paired particulate predictions for each horizon and classifies the resulting score under the selected population setting. Concentrations, target times, and forecast status remain visible alongside the category.

### Advisory wording

| Category | Suggested wording |
|---|---|
| Low | Continue usual activities while monitoring environmental conditions. |
| Moderate | Monitor changing readings and any symptoms. |
| High | Reduce exposure to elevated particulate conditions where practical. |
| Very High | Minimize exposure and follow an existing clinician-directed care plan. |

Clinical treatment decisions remain with the user's healthcare professional [71]. A category does not automatically authorize starting or changing medication.

[3] Z.-Q. Zhang et al., "Association between air pollution and allergic upper respiratory diseases: A meta-analysis," European Respiratory Review, vol. 34, no. 176, Art. no. 240266, 2025, doi: 10.1183/16000617.0266-2024. [Online]. Available: https://pubmed.ncbi.nlm.nih.gov/40562438/. Accessed: Oct. 14, 2026.

[6] World Health Organization, WHO Global Air Quality Guidelines: Particulate Matter (PM2.5 and PM10), Ozone, Nitrogen Dioxide, Sulfur Dioxide and Carbon Monoxide. Geneva, Switzerland: WHO, 2021. [Online]. Available: https://www.who.int/publications/i/item/9789240034228. Accessed: Oct. 14, 2026.

[10] Q. Li et al., "Association of meteorological factors with allergic rhinitis: A systematic review and meta-analysis," BMC Public Health, vol. 26, Art. no. 409, 2026, doi: 10.1186/s12889-025-26078-6. Published online Dec. 30, 2025. [Online]. Available: https://link.springer.com/article/10.1186/s12889-025-26078-6. Accessed: Oct. 14, 2026.

[71] M. S. Dykewicz et al., "Rhinitis 2020: A practice parameter update," Journal of Allergy and Clinical Immunology, vol. 146, no. 4, pp. 721–767, Oct. 2020, doi: 10.1016/j.jaci.2020.07.007. [Online]. Available: https://www.aaaai.org/Aaaai/media/Media-Library-PDFs/Allergist%20Resources/Statements%20and%20Practice%20Parameters/Rhinitis-2020-A-practice-parameter-update.pdf. Accessed: Oct. 14, 2026.

## 5 System implementation prompt

Implement and test the selected joint environmental policy in the ALLERT development project. Read repository instructions and this document first. Preserve unrelated changes. Do not retrain the model, edit telemetry, contact live services, write databases, deploy software, send notifications, or edit the manuscript as part of this development-code task.

1. Inspect the current configuration, risk engine, API serializers, tests, and package-export paths.
2. Set adult entry cutoffs to 22.5/30/37.5 points and pediatric entry cutoffs to 20.5/28/35.5. Preserve the continuous formula and references exactly. Maintain clear point-versus-fraction conversions.
3. Remove obsolete adult-only and pediatric-unchanged policy assumptions from the active development implementation. Keep historical experiment results labelled with their original policies.
4. Add an optional, disabled-by-default PM-only forecast interpretation using Section 3. Compute one score per same-node, same-origin pollutant pair at each horizon. Use a separate policy identity and basis label.
5. Preserve model weights, scalers, feature order, median support, horizon calibration, PM forecast units, and observed-PM episode settings.
6. Validate finite nonnegative inputs, supported populations, pair identity, status, freshness, and target times. Return unavailable rather than a fabricated Low category when inputs are unsuitable.
7. Test both populations at each boundary, immediately below/above, and at 0/100. Test rounding, invalid values, zero-PM references, monotonic PM effects, fallback labels, and unchanged full environmental scores.
8. Verify the new counts against the calculation record. Keep all-zero pediatric Low counts and the 22-point pediatric reference classification.
9. Run the relevant regression suite and export actual policy metadata, canonical hash, test vectors, and a concise change report. Report any blockers; do not claim deployment.

Calculation record: [joint policy and optional forecast verification](../../../results/risk_policy_joint_review_2026-10-14/selected_policy_and_pm_only_forecast.json).

## 6 Application implementation prompt

Synchronize ALLERT's application with the joint adult/pediatric policy and add an optional combined PM-only forecast display. Read this handoff and the canonical backend contract first. Work on development files only; do not change live services or databases.

Apply adult 22.5/30/37.5 and pediatric 20.5/28/35.5 consistently wherever category boundaries are used. Preserve distinct current-reading and forecast indicators. Obtain scores, categories, policy identity, and hash from the backend; verify any client-side preview against the same test vectors.

Each 6/12/24-hour card should display both PM predictions in µg/m³, its target time, forecast status, and, when enabled, one Forecast PM indicator score/category. Do not place separate category labels beside the two pollutants under this combined-score design. Do not populate future weather from current readings.

Keep the feature disabled until integration checks pass. Handle missing, stale, invalid, mismatched, and fallback responses explicitly. Population switching must update both score reference and cutoffs. Never classify the rounded display value. Preserve node authorization, observed-PM notices, separate VAS 0–10 and TNSS 0–12 fields, and the existing symptom workflow.

Provide tests for backend/app parity, boundary assignments, population switching, unavailable and fallback states, and 6/12/24-hour target mapping. Capture genuine development screenshots and matching sanitized requests/responses. Do not fabricate screen results or automatically enable new notification behaviour.

## 7 Manuscript revision prompt

Use the latest Chapter 4 copy:
C:/Users/USER/Codes/allert_rebuild/docs/thesis/manuscripts/ALLERT_CHAPTER_4_FINAL_STYLE_AND_POLICY_2026-10-14.docx

Write formal third-person implementation/results reporting. Preserve technical definitions and material findings, while removing repeated editing narration and obvious negative explanations. Missing implementation records belong in concise yellow italic [bracketed requirements]. Keep user/domain-expert evaluation and participant results unchanged.

Align every adult and pediatric table, equation, example, count, figure, and caption with Section 1. Figure 4.12a must show both populations and their corresponding boundaries. Retain the observed-PM replay as a separate analysis.

Keep the four historical architecture comparisons and their result context, current matched ARIMA comparison, six pollutant–horizon results, training history, calibration evidence, bias, underprediction, spread, rising/elevated subsets, and residual plots. Do not replace unfavourable findings with stronger claims.

The 0.025 neural multiplier comes from the earlier-block calibration-grid minimum. Verify the retained errors and multipliers in calibration_source.npz and the grid-search code. Cite grid-search and chronological evaluation sources for the method, not as publications prescribing the numerical value.

Document the optional forecast interpretation as a pending feature until backend/app evidence confirms implementation. After that confirmation, add its concise method, actual payload, and matching display under the existing application/results headings. Its example inputs in this handoff are not model evaluation results.

Render the edited DOCX, inspect every page, and verify captions, table continuity, figure legibility, reference links, and immutable data/model artifacts before delivery.

## 8 Verification record

The portable calculation record contains exact full-precision examples, both population rules, source hashes, boundary tests, invalid-input checks, formula-parity checks, and all six node/population distributions. It confirms calculation correctness for this proposal, not medical accuracy or completed app deployment.

Keep this handoff as the single policy/prompt document. Do not recreate obsolete prompt duplicates.
