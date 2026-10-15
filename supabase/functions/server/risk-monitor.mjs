import { POLICY, classifyFraction } from "./environment-policy.mjs";
import { POLICY_HASH } from "./environment-policy-hash.mjs";
import { CHECKPOINT } from "./environment-validation.mjs";
const finite = value => typeof value === "number" && Number.isFinite(value);
export function validReading(r) {
  return !!r && Number.isFinite(Date.parse(r.timestamp)) &&
    [r.pm2_5,r.pm10,r.temperature,r.humidity].every(finite) && r.pm2_5>=0 && r.pm10>=0 &&
    r.temperature>=-10 && r.temperature<=60 && r.humidity>=0 && r.humidity<=100 &&
    ["VALID","ok","OK","ORIGINAL"].includes(r.data_quality_status) &&
    Number.isInteger(r.expected_samples) && r.expected_samples>0 &&
    Number.isInteger(r.sample_count) && r.sample_count>=r.expected_samples;
}
export function median(values) {
  if (!values.length) return null;
  const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
  return sorted.length%2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2;
}
export function indicator(pm25,pm10,temperature,humidity) {
  if (![pm25,pm10,temperature,humidity].every(finite) || pm25<0 || pm10<0 || humidity<0 || humidity>100) return null;
  const contribution=pm25*.0104+pm10*.0026+(temperature-25)*.012+(humidity-60)*-.004;
  const result={rule_id:POLICY.id,rule_sha256:POLICY_HASH,not_a_symptom_probability:true};
  for (const population of ["adult","pediatric"]) {
    const baseline=population==="adult" ? .20 : .22;
    const logit=Math.log(baseline/(1-baseline))+contribution;
    const value=logit>=0 ? 1/(1+Math.exp(-logit)) : Math.exp(logit)/(1+Math.exp(logit));

    result[population]={score_0_100:value*100,indicator_0_1:value,tier:classifyFraction(value,population)};
  }
  return result;
}
export function lastHour(readings, latest, now=Date.now()) {
  const end=Date.parse(latest?.timestamp);
  if (!Number.isFinite(end)) return [];
  const buckets=new Map();
  for (const r of readings) {
    const time=Date.parse(r.timestamp);
    if (!validReading(r) || r.device_id!==latest.device_id || time>end || time>end+60000 || time>now || time<=end-3600000) continue;
    const bucket=Math.floor(time/300000);
    if (!buckets.has(bucket) || Date.parse(buckets.get(bucket).timestamp)<time) buckets.set(bucket,r);
  }
  return [...buckets.values()].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
}
export function buildMonitor(telemetry, model=null, now=Date.now(), modelStatus="warming_up") {
  const latest=telemetry?.latest;
  if (!validReading(latest) || Date.parse(latest.timestamp)>now || latest.device_id!==telemetry?.device?.device_id)
    return {availability:"unavailable",device:telemetry?.device??null,current:null,baseline:null,forecasts:[],model_status:"invalid_or_missing_reading"};
  const age=now-Date.parse(latest.timestamp),stale=age>600000;
  const rows=lastHour([...(telemetry.history??[]),latest],latest,now);
  let weather={temperature:median(rows.map(r=>r.temperature)),humidity:median(rows.map(r=>r.humidity))};
  let baseline={pm2_5:median(rows.map(r=>r.pm2_5)),pm10:median(rows.map(r=>r.pm10)),...weather,
    reading_count:rows.length,expected_readings:12,available_minutes:rows.length*5,window_start:new Date(Date.parse(latest.timestamp)-3600000).toISOString(),window_end:latest.timestamp};
  const usableModel=!stale && validModelForecast(model,latest.device_id,now);
  if (usableModel && model.input_baseline) { baseline=model.input_baseline; weather={temperature:baseline.temperature,humidity:baseline.humidity}; }
  const forecasts=[6,12,24].map(hours=>{
    const values=usableModel ? model.forecasts.filter(f=>f.horizon_hours===hours) : null;
    const pm25=values ? values.find(v=>v.pollutant==="pm2_5").value : baseline.pm2_5;
    const pm10=values ? values.find(v=>v.pollutant==="pm10").value : baseline.pm10;
    const target=values ? values[0].target_block_end : new Date(Date.parse(latest.timestamp)+hours*3600000).toISOString();
    return {horizon_hours:hours,pm2_5:pm25,pm10,temperature:weather.temperature,humidity:weather.humidity,
      risk:indicator(pm25,pm10,weather.temperature,weather.humidity),method:usableModel?"model_adjusted":"median_only",
      weather_assumption:"last_hour_available_median",target_block_end:target,origin:usableModel?model.forecast_origin:latest.timestamp};
  });
  return {availability:stale?"stale":"ready",device:telemetry.device,current:{...latest,risk:indicator(latest.pm2_5,latest.pm10,latest.temperature,latest.humidity)},baseline,forecasts,
    model_status:stale?"stale_readings":usableModel?"ready":modelStatus,model_id:usableModel?model.model_id:null};
}
export function validModelForecast(model, deviceId, now) {
  if (!model || model.sensor_device_id!==deviceId || model.model_id!=="median-residual-single-v1" || model.checkpoint_sha256!==CHECKPOINT || model.mode!=="live" || model.node_id!=="node-1" || model.status!=="ok" || model.trained_or_recalibrated!==false || model.is_future_allergy_probability!==false) return false;
  const origin=Date.parse(model.forecast_origin);
  if (!Number.isFinite(origin) || origin>now || now-origin>1200000 || !Array.isArray(model.forecasts) || model.forecasts.length!==6) return false;
  const keys=new Set();
  for (const f of model.forecasts) {
    if (![6,12,24].includes(f.horizon_hours) || !["pm2_5","pm10"].includes(f.pollutant) || !finite(f.value) || f.value<0 || f.units!=="ug/m3" || Date.parse(f.target_block_end)!==origin+f.horizon_hours*3600000 || Date.parse(f.target_block_end)-Date.parse(f.target_block_start)!==300000) return false;
    keys.add(`${f.pollutant}:${f.horizon_hours}`);
  }
  return keys.size===6;
}
export function modelPayload(readings,origin,now) {
  if (new Set(readings.map(r=>r.device_id)).size!==1) return null;
  const normalized=new Map();
  for (const r of readings) {
    if (!validReading(r) || Date.parse(r.timestamp)>now || !Number.isFinite(Date.parse(r.created_at)) || Date.parse(r.created_at)>now) continue;
    const end=Math.floor(Date.parse(r.timestamp)/300000)*300000;
    if (end>origin || end<=origin-54*3600000) continue;
    if (normalized.has(end)) return null; // Never pad or merge duplicate blocks.
    normalized.set(end,{node_id:"node-1",block_start:new Date(end-300000).toISOString(),block_end:new Date(end).toISOString(),received_at:r.created_at,
      pm2_5:r.pm2_5,pm10:r.pm10,temperature_c:r.temperature,humidity_percent:r.humidity,quality:"OK"});
  }
  const history=[];
  for (let end=origin-54*3600000+300000;end<=origin;end+=300000) {
    if (!normalized.has(end)) return null;
    history.push(normalized.get(end));
  }
  return {node_id:"node-1",mode:"live",forecast_origin:new Date(origin).toISOString(),history};
}

export function modelInputStatus(readings, origin, now) {
  const slots = new Set();
  let missingReceipts = 0, duplicateBlocks = 0;
  for (const row of readings) {
    if (!validReading(row)) continue;
    const timestamp = Date.parse(row.timestamp);
    const end = Math.floor(timestamp / 300000) * 300000;
    if (timestamp > now || end > origin || end <= origin - 54 * 3600000) continue;
    const received = Date.parse(row.created_at);
    if (!Number.isFinite(received) || received > now) { missingReceipts++; continue; }
    if (slots.has(end)) duplicateBlocks++;
    slots.add(end);
  }
  return {
    status: missingReceipts ? "missing_server_receipt_times" : duplicateBlocks ? "duplicate_blocks" : slots.size < 648 ? "warming_up" : "input_ready",
    eligible_blocks: slots.size, required_blocks: 648,
    missing_receipts: missingReceipts, duplicate_blocks: duplicateBlocks,
  };
}
