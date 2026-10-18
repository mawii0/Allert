import { validPolicyIndicator } from "./environment-policy.mjs";
import { POLICY_HASH } from "./environment-policy-hash.mjs";

export const CORRELATION_PROTOCOL = Object.freeze({ version: "prospective-tier-symptoms-v1", minimum_pairs: 7, tolerance_minutes: 15, one_pair_per_manila_day: true });
const tiers = ["low", "moderate", "high", "very_high"];
const time = value => typeof value === "string" ? Date.parse(value) : NaN;
const day = value => new Date(value + 28800000).toISOString().slice(0, 10);
const finite = value => typeof value === "number" && Number.isFinite(value);

// Pearson correlation of average ranks handles ties in both tier and symptom scores.
export function averageRanks(values) {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = Array(values.length);
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && sorted[end].value === sorted[start].value) end++;
    const rank = (start + 1 + end) / 2;
    for (let at = start; at < end; at++) ranks[sorted[at].index] = rank;
    start = end;
  }
  return ranks;
}
export function spearman(x, y, minimum = CORRELATION_PROTOCOL.minimum_pairs) {
  if (x.length !== y.length || x.some(value => !finite(value)) || y.some(value => !finite(value))) return { rho: null, reason: "invalid_pairs", n: Math.min(x.length, y.length) };
  if (x.length < minimum) return { rho: null, reason: "insufficient_pairs", n: x.length };
  const a = averageRanks(x), b = averageRanks(y), mean = (x.length + 1) / 2;
  let covariance = 0, varianceA = 0, varianceB = 0;
  for (let i = 0; i < a.length; i++) { covariance += (a[i]-mean)*(b[i]-mean); varianceA += (a[i]-mean)**2; varianceB += (b[i]-mean)**2; }
  if (!varianceA || !varianceB) return { rho: null, reason: "constant_values", n: x.length };
  return { rho: Math.max(-1, Math.min(1, covariance / Math.sqrt(varianceA * varianceB))), reason: null, n: x.length };
}

// Only server-verified live model outputs qualify; fallback estimates are never archived.
export function forecastEvidence(monitor, now = Date.now()) {
  if (monitor?.availability !== "ready" || monitor.model_status !== "ready" || typeof monitor.model_id !== "string" || monitor.forecasts?.length !== 3) return [];
  const rows = [];
  for (const value of monitor.forecasts) {
    const origin = time(value.origin), target = time(value.target_block_end);
    if (value.method !== "model_adjusted" || ![6,12,24].includes(value.horizon_hours) || !Number.isFinite(origin) || origin > now || now-origin > 1200000 ||
        target !== origin + value.horizon_hours*3600000 || target <= now || !validPolicyIndicator(value.risk, POLICY_HASH)) return [];
    for (const population of ["adult", "pediatric"]) rows.push({ origin: value.origin, target: value.target_block_end, horizon: value.horizon_hours, population,
      score: value.risk[population].score_0_100, tier: value.risk[population].tier, policy_hash: POLICY_HASH, model_id: monitor.model_id });
  }
  return new Set(rows.map(row => `${row.horizon}:${row.population}`)).size === 6 ? rows : [];
}

export function correlateSymptoms(entries, forecasts, { deviceId, ownerEpoch, accessSince = ownerEpoch, population, horizon, days, now = Date.now() }) {
  const boundary = Math.max(time(ownerEpoch), time(accessSince), Date.parse(day(now)) - 28800000 - (days-1)*86400000);
  const evidence = forecasts.filter(row => row.device_id === deviceId && time(row.owner_epoch) === time(ownerEpoch) && row.population === population && row.horizon_hours === horizon &&
    row.policy_hash === POLICY_HASH && tiers.includes(row.tier) && finite(row.score) && row.score >= 0 && row.score <= 100 &&
    time(row.origin) >= time(ownerEpoch) && time(row.target) === time(row.origin)+horizon*3600000 && time(row.captured_at) >= time(row.origin) &&
    time(row.captured_at) < time(row.target) && time(row.target) <= now && time(row.target) >= boundary-900000);
  const candidates = [], seen = new Set();
  let missingObservation = 0, unmatched = 0;
  for (const entry of entries) {
    if (seen.has(entry.id) || entry.deletedAt) continue;
    seen.add(entry.id);
    const observed = time(entry.observedAt);
    if (!Number.isFinite(observed)) { missingObservation++; continue; }
    if (observed < boundary || observed > now) continue;
    if (!Number.isInteger(entry.vasScore) || entry.vasScore < 0 || entry.vasScore > 10 || !Number.isInteger(entry.tnssScore) || entry.tnssScore < 0 || entry.tnssScore > 12) continue;
    const matches = evidence.filter(row => Math.abs(time(row.target)-observed) <= 900000 && time(row.captured_at) < observed)
      .sort((a,b) => Math.abs(time(a.target)-observed)-Math.abs(time(b.target)-observed) || time(b.origin)-time(a.origin) || String(a.id).localeCompare(String(b.id)));
    if (!matches.length) { unmatched++; continue; }
    const match = matches[0];
    candidates.push({ day: day(observed), observed_at: entry.observedAt, entry_id: entry.id, forecast_id: match.id, forecast_origin: match.origin,
      forecast_target: match.target, captured_at: match.captured_at, tier: match.tier, tier_rank: tiers.indexOf(match.tier)+1, score: match.score,
      vas: entry.vasScore, tnss: entry.tnssScore, distance_minutes: Math.abs(time(match.target)-observed)/60000 });
  }
  candidates.sort((a,b) => a.distance_minutes-b.distance_minutes || time(a.observed_at)-time(b.observed_at) || a.entry_id.localeCompare(b.entry_id));
  const selectedDays = new Set(), selectedForecasts = new Set();
  const pairs = candidates.filter(pair => {
    const key = `${pair.forecast_origin}:${pair.forecast_target}`;
    if (selectedDays.has(pair.day) || selectedForecasts.has(key)) return false;
    selectedDays.add(pair.day); selectedForecasts.add(key); return true;
  }).sort((a,b) => a.day.localeCompare(b.day));
  return { protocol: CORRELATION_PROTOCOL, population, horizon, days, pairs,
    vas: spearman(pairs.map(pair=>pair.tier_rank),pairs.map(pair=>pair.vas)), tnss: spearman(pairs.map(pair=>pair.tier_rank),pairs.map(pair=>pair.tnss)),
    excluded: { missing_observation_time: missingObservation, no_matching_forecast: unmatched, extra_same_day_or_reused_forecast: candidates.length-pairs.length } };
}

export function correlationCsv(data) {
  const safe = value => '"'+String(value ?? "").replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')+'"';
  const fields = ["day","observed_at","entry_id","forecast_id","forecast_origin","forecast_target","captured_at","tier","tier_rank","score","vas","tnss","distance_minutes"];
  return "\uFEFF" + [fields.map(safe).join(","), ...data.pairs.map(pair=>fields.map(field=>safe(pair[field])).join(","))].join("\r\n");
}
