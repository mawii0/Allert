// Canonical development policy. Historical releases retain their original rules.
export const POLICY = Object.freeze({
  id: "environmental-indicator-adult-22p5-30-37p5-20261014",
  score_units: "indicator_points_0_100",
  classification: "unrounded; equality enters higher category",
  adult: [22.5, 30, 37.5],
  pediatric: [13, 23, 38],
  coefficients: { pm2_5: 0.0104, pm10: 0.0026, temperature: 0.012, humidity: -0.004 },
  reference: { temperature_c: 25, humidity_percent: 60, adult_p0: 0.20, pediatric_p0: 0.22 }
});
export function classifyScore(score, population = "adult") {
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100 || !["adult", "pediatric"].includes(population)) return null;
  const cuts = POLICY[population];
  return score >= cuts[2] ? "very_high" : score >= cuts[1] ? "high" : score >= cuts[0] ? "moderate" : "low";
}
export function classifyFraction(value, population = "adult") {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1 || !["adult", "pediatric"].includes(population)) return null;
  const cuts = POLICY[population].map(score => score / 100);
  return value >= cuts[2] ? "very_high" : value >= cuts[1] ? "high" : value >= cuts[0] ? "moderate" : "low";
}
export const ADVISORIES = Object.freeze({
  low: "Continue usual activities while monitoring environmental conditions.",
  moderate: "Monitor changing readings and any symptoms.",
  high: "Reduce exposure to elevated particulate conditions where practical.",
  very_high: "Minimize exposure and follow an existing clinician-directed care plan."
});
export function validPolicyIndicator(risk, expectedHash) {
  return !!risk && risk.rule_id === POLICY.id && risk.rule_sha256 === expectedHash && risk.not_a_symptom_probability === true &&
    ['adult', 'pediatric'].every(population => {
      const value = risk[population];
      return !!value && classifyScore(value.score_0_100, population) !== null &&
        classifyFraction(value.indicator_0_1, population) === value.tier &&
        Math.abs(value.score_0_100 - value.indicator_0_1 * 100) < 1e-6;
    });
}
