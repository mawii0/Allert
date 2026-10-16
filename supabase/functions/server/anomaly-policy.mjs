// Versioned engineering monitoring rules, not validated clinical risk thresholds.
export const ANOMALY_POLICY = Object.freeze({ version: "observed-pm-v1", baseline: 12, sigmaFloor: 1,
  minRise: 5, zWatch: 3, zWarning: 4, zCritical: 5, cusumK: 0.5, cusumH: 5, velocityPerHour: 60 });
export const anomalyRank = value => ({ watch: 1, warning: 2, critical: 3 }[value] || 0);
export function validObservedBlock(row, deviceId, now) {
  return !!row && row.device_id === deviceId && row.data_quality_status === "VALID" && row.sample_count === 30 && row.expected_samples === 30 &&
    ["pm2_5", "pm10", "temperature", "humidity"].every(key => typeof row[key] === "number" && Number.isFinite(row[key])) &&
    row.pm2_5 >= 0 && row.pm2_5 <= 1000 && row.pm10 >= 0 && row.pm10 <= 1000 && row.temperature >= -40 && row.temperature <= 125 && row.humidity >= 0 && row.humidity <= 100 &&
    Number.isFinite(Date.parse(row.timestamp)) && Date.parse(row.timestamp) <= now + 60000 &&
    Number.isFinite(Date.parse(row.created_at)) && Date.parse(row.created_at) <= now + 60000;
}
export function detectObservedAnomalies(rows, device, previous = {}, now = Date.now()) {
  const epoch = device.owner_since || "1970-01-01T00:00:00.000Z";
  const buckets = new Map();
  for (const row of rows) {
    if (row.device_id !== device.device_id || Date.parse(row.timestamp) < Date.parse(epoch)) continue;
    const slot = Math.floor(Date.parse(row.timestamp) / 300000);
    if (!Number.isFinite(slot)) continue;
    buckets.set(slot, buckets.has(slot) ? null : row);
  }
  const ordered = [...buckets].sort((a,b) => a[0]-b[0]);
  const last = Date.parse(previous.last_timestamp || "") || 0;
  const state = { last_timestamp: previous.last_timestamp || null, cusum_pm2_5: previous.cusum_pm2_5 || 0, cusum_pm10: previous.cusum_pm10 || 0 };
  const events = [];
  let history = [], priorSlot = null, processed = 0;
  for (const [slot, row] of ordered) {
    const valid = validObservedBlock(row, device.device_id, now);
    const previousTime=history.length?Date.parse(history.at(-1).timestamp):null;
    const irregular=valid && previousTime!==null && Math.abs(Date.parse(row.timestamp)-previousTime-300000)>60000;
    if (!valid || irregular || (priorSlot !== null && slot !== priorSlot + 1)) {
      history = [];
      if (slot * 300000 > last) state.cusum_pm2_5 = state.cusum_pm10 = 0;
    }
    priorSlot = slot;
    if (!valid) continue;
    if (Date.parse(row.timestamp) <= last) { history.push(row); history = history.slice(-ANOMALY_POLICY.baseline); continue; }
    const continuousState = state.last_timestamp && Math.floor(Date.parse(state.last_timestamp)/300000) === slot - 1 && Math.abs(Date.parse(row.timestamp)-Date.parse(state.last_timestamp)-300000)<=60000;
    if (!continuousState) state.cusum_pm2_5 = state.cusum_pm10 = 0;
    const metrics = {};
    let rank = 0;
    if (history.length === ANOMALY_POLICY.baseline) {
      for (const key of ["pm2_5", "pm10"]) {
        const mean = history.reduce((sum, value) => sum + value[key], 0) / history.length;
        const sigma = Math.max(ANOMALY_POLICY.sigmaFloor, Math.sqrt(history.reduce((sum, value) => sum + (value[key]-mean)**2, 0)/(history.length-1)));
        const delta = row[key] - mean;
        const z = delta / sigma;
        const elapsed = (Date.parse(row.timestamp)-Date.parse(history.at(-1).timestamp))/3600000;
        const velocity = elapsed > 0 ? (row[key]-history.at(-1)[key])/elapsed : 0;
        const cusumKey = `cusum_${key}`;
        state[cusumKey] = Math.min(1000000, Math.max(0, state[cusumKey] + z - ANOMALY_POLICY.cusumK));
        const methods = [];
        if (delta >= ANOMALY_POLICY.minRise) {
          if (z >= ANOMALY_POLICY.zWatch) methods.push("z_score");
          if (state[cusumKey] >= ANOMALY_POLICY.cusumH) methods.push("cusum");
          if (velocity >= ANOMALY_POLICY.velocityPerHour && row[key]-history.at(-1)[key] >= ANOMALY_POLICY.minRise) methods.push("velocity");
        }
        if (methods.length) rank = Math.max(rank, z >= ANOMALY_POLICY.zCritical ? 3 : z >= ANOMALY_POLICY.zWarning || methods.includes("cusum") ? 2 : 1);
        metrics[key] = { mean, sigma, z, velocity, cusum: state[cusumKey], methods, baseline_count: history.length };
      }
      if (rank) events.push({ observed_at: row.timestamp, severity: [null,"watch","warning","critical"][rank], policy_version: ANOMALY_POLICY.version,
        metrics, reading: { timestamp:row.timestamp,created_at:row.created_at,pm2_5:row.pm2_5,pm10:row.pm10,temperature:row.temperature,humidity:row.humidity }, baseline: history.map(value => ({ timestamp:value.timestamp,pm2_5:value.pm2_5,pm10:value.pm10 })) });
    } else state.cusum_pm2_5 = state.cusum_pm10 = 0;
    state.last_timestamp = row.timestamp; processed++;
    history.push(row); history = history.slice(-ANOMALY_POLICY.baseline);
  }
  return { state, events, processed, baseline_count: history.length, status: history.length < ANOMALY_POLICY.baseline ? "warming_up" : "ready" };
}
