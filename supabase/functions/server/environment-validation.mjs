export const CHECKPOINT = "3cda9c28d98847f9be888ffa356a917c21d40c041b3ea75829919144de43b7f4";
export const RULE_HASH = "8840056cf287749544df0b1a3ed373370863258ab1d29bbb6b430f8740f5ad99";
const finite = x => typeof x === "number" && Number.isFinite(x);
const time = x => typeof x === "string" && /(Z|[+-]\d\d:\d\d)$/.test(x) && Number.isFinite(Date.parse(x));
const tier = (value, population) => value >= (population === "adult" ? .40 : .38) ? "very_high" : value >= (population === "adult" ? .25 : .23) ? "high" : value >= (population === "adult" ? .15 : .13) ? "moderate" : "low";
export function validSnapshot(s) {
  if (!s || !["live", "historical_fixture"].includes(s.mode)) return false;
  const c = s.current, f = s.forecast, r = s.risk;
  if (!c || !f || !r || s.node_id !== "node-1" || c.node_id !== s.node_id || f.node_id !== s.node_id || f.mode !== s.mode) return false;
  if (!["ok", "OK", "ORIGINAL"].includes(c.quality) || !time(c.block_start) || !time(c.block_end) || Date.parse(c.block_end) - Date.parse(c.block_start) !== 300000) return false;
  if (![c.pm2_5, c.pm10, c.temperature_c, c.humidity_percent].every(finite) || c.pm2_5 < 0 || c.pm10 < 0 || c.humidity_percent < 0 || c.humidity_percent > 100) return false;
  if (s.mode === "live" && (!time(c.received_at) || Date.parse(c.received_at) > Date.now() || Date.parse(c.block_end) > Date.now())) return false;
  if (f.model_id !== "median-residual-single-v1" || f.checkpoint_sha256 !== CHECKPOINT || f.status !== "ok" || f.is_future_allergy_probability !== false || f.trained_or_recalibrated !== false) return false;
  if (![f.forecast_origin, f.generated_at, f.input_last_block_end].every(time) || Date.parse(f.input_last_block_end) !== Date.parse(c.block_end) || Date.parse(c.block_end) > Date.parse(f.forecast_origin)) return false;
  if ([c.block_start, c.block_end, f.forecast_origin].some(value => Date.parse(value) % 300000 !== 0)) return false;
  if (s.mode === "live" && (Date.parse(f.forecast_origin) > Date.now() || Date.parse(f.generated_at) > Date.now() + 60000)) return false;
  if (r.rule_id !== "environmental-indicator-v1" || r.not_a_symptom_probability !== true || r.rule_sha256 !== RULE_HASH) return false;
  if (![r.adult, r.pediatric].every(v => v && finite(v.score_0_100) && v.score_0_100 >= 0 && v.score_0_100 <= 100 && finite(v.indicator_0_1) && Math.abs(v.score_0_100 - 100 * v.indicator_0_1) < 0.000001 && ["low", "moderate", "high", "very_high"].includes(v.tier))) return false;
  if (["adult", "pediatric"].some(population => r[population].tier !== tier(r[population].indicator_0_1, population))) return false;
  if (!Array.isArray(f.forecasts) || f.forecasts.length !== 6) return false;
  const keys = new Set();
  for (const v of f.forecasts) {
    if (!["pm2_5", "pm10"].includes(v.pollutant) || ![6, 12, 24].includes(v.horizon_hours) || !finite(v.value) || v.value < 0 || v.units !== "ug/m3" || !time(v.target_block_start) || !time(v.target_block_end)) return false;
    if (Date.parse(v.target_block_end) !== Date.parse(f.forecast_origin) + v.horizon_hours * 3600000 || Date.parse(v.target_block_end) - Date.parse(v.target_block_start) !== 300000) return false;
    keys.add(`${v.pollutant}:${v.horizon_hours}`);
  }
  if (s.history !== undefined) {
    if (!Array.isArray(s.history) || s.history.length < 2 || s.history.length > 288) return false;
    let previous = -Infinity;
    for (const b of s.history) {
      if (!b || b.node_id !== s.node_id || !time(b.block_start) || !time(b.block_end) ||
          Date.parse(b.block_end) - Date.parse(b.block_start) !== 300000 || Date.parse(b.block_end) % 300000 !== 0 ||
          ![b.pm2_5,b.pm10,b.temperature_c,b.humidity_percent].every(finite) || b.pm2_5 < 0 || b.pm10 < 0 || b.humidity_percent < 0 || b.humidity_percent > 100 ||
          !["ok","OK","ORIGINAL"].includes(b.quality) || Date.parse(b.block_end) <= previous ||
          Date.parse(b.block_end) <= Date.parse(c.block_end) - 86400000 || Date.parse(b.block_end) > Date.parse(c.block_end)) return false;
      previous = Date.parse(b.block_end);
    }
    const last = s.history[s.history.length - 1];
    if (["block_end","pm2_5","pm10","temperature_c","humidity_percent","quality"].some(key => last[key] !== c[key])) return false;
  }
  return keys.size === 6;
}
