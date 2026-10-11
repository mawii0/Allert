import { test } from "node:test";
import assert from "node:assert/strict";
import { CHECKPOINT, RULE_HASH, validSnapshot } from "../supabase/functions/server/environment-validation.mjs";
function fixture() {
  const origin = "2026-09-12T20:45:00+00:00";
  const indicator = { score_0_100: 25, indicator_0_1: 0.25, tier: "high" };
  return { node_id: "node-1", mode: "historical_fixture",
    current: { node_id: "node-1", block_start: "2026-09-12T20:40:00+00:00", block_end: origin, quality: "ORIGINAL", pm2_5: 20, pm10: 40, temperature_c: 30, humidity_percent: 70 },
    risk: { rule_id: "environmental-indicator-v1", rule_sha256: RULE_HASH, not_a_symptom_probability: true, adult: indicator, pediatric: indicator },
    forecast: { status: "ok", model_id: "median-residual-single-v1", checkpoint_sha256: CHECKPOINT, node_id: "node-1", mode: "historical_fixture", forecast_origin: origin, input_last_block_end: origin, generated_at: origin, is_future_allergy_probability: false, trained_or_recalibrated: false,
      forecasts: [6,12,24].flatMap(h => ["pm2_5", "pm10"].map(p => ({ pollutant:p, horizon_hours:h, value:20, units:"ug/m3", target_block_start:new Date(Date.parse(origin)+h*3600000-300000).toISOString(), target_block_end:new Date(Date.parse(origin)+h*3600000).toISOString() }))) }
  };
}
test("accepts a correctly identified six-output replay", () => assert.equal(validSnapshot(fixture()), true));
for (const [label, mutate] of [
  ["another checkpoint", s => s.forecast.checkpoint_sha256 = "0".repeat(64)],
  ["another risk rule", s => s.risk.rule_sha256 = "0".repeat(64)],
  ["another node", s => s.node_id = "node-2"],
  ["duplicate output", s => s.forecast.forecasts[1] = s.forecast.forecasts[0]],
  ["wrong target time", s => s.forecast.forecasts[0].target_block_end = s.forecast.forecast_origin],
  ["nonfinite reading", s => s.current.pm2_5 = NaN],
  ["invalid quality", s => s.current.quality = "imputed"],
  ["missing live receipt", s => { s.mode = "live"; s.forecast.mode = "live"; }],
  ["probability claim", s => s.forecast.is_future_allergy_probability = true],
  ["incorrect tier", s => s.risk.adult = {...s.risk.adult, tier:"low"}],
  ["unaligned measurement", s => { s.current.block_start = "2026-09-12T20:40:01Z"; s.current.block_end = "2026-09-12T20:45:01Z"; }],
  ["future live forecast origin", s => { s.mode="live";s.forecast.mode="live";s.current.received_at=new Date().toISOString();s.forecast.forecast_origin=new Date(Date.now()+86400000).toISOString(); }],
]) test(`rejects ${label}`, () => { const s = fixture(); mutate(s); assert.equal(validSnapshot(s), false); });

function historyFixture() {
 const s=fixture();s.history=Array.from({length:288},(_,i)=>({...s.current,block_start:new Date(Date.parse(s.current.block_start)-(287-i)*300000).toISOString(),block_end:new Date(Date.parse(s.current.block_end)-(287-i)*300000).toISOString()}));s.history[287]={...s.current};return s;
}
test("accepts 24 hours of recorded measurement blocks",()=>assert.equal(validSnapshot(historyFixture()),true));
for(const [label,mutate] of [
 ["oversized history",s=>s.history.push(s.current)],
 ["duplicate timestamp",s=>s.history[1]=s.history[0]],
 ["wrong node",s=>s.history[0].node_id="node-2"],
 ["invalid humidity",s=>s.history[0].humidity_percent=101],
 ["future block",s=>s.history[0].block_end="2099-01-01T00:00:00Z"],
 ["mismatched latest",s=>s.history[287].pm2_5=999],
 ["nonfinite temperature",s=>s.history[0].temperature_c=NaN],
 ["invalid quality",s=>s.history[0].quality="made-up"],
]) test("rejects chart history: "+label,()=>{const s=historyFixture();mutate(s);assert.equal(validSnapshot(s),false);});
