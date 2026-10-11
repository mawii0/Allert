// Prefer actual sensor readings; replay is a separate, explicitly labeled source.
export function selectEnvironmentSource(telemetry, snapshot, status) {
  if (telemetry?.device && telemetry?.latest) {
    return { source: "sensor", device: telemetry.device, latest: telemetry.latest, history: telemetry.history ?? [] };
  }
  if (status === "historical_replay" && snapshot?.mode === "historical_fixture") {
    const current = snapshot.current;
    if (current?.node_id !== snapshot.node_id || !Number.isFinite(Date.parse(current?.block_end)) ||
        ![current?.pm2_5, current?.pm10, current?.temperature_c, current?.humidity_percent].every(Number.isFinite)) {
      return { source: "unavailable", device: null, latest: null, history: [] };
    }
    return {
      source: "historical_replay",
      device: { device_id: snapshot.node_id, location_label: "Historical model dataset", is_active: false },
      latest: {
        device_id: snapshot.node_id, timestamp: current.block_end,
        pm2_5: current.pm2_5, pm10: current.pm10,
        temperature: current.temperature_c, humidity: current.humidity_percent,
        data_quality_status: current.quality, sample_count: null, expected_samples: null,
      },
      history: (snapshot.history ?? []).map(block => ({
        device_id: snapshot.node_id, timestamp: block.block_end,
        pm2_5: block.pm2_5, pm10: block.pm10, temperature: block.temperature_c,
        humidity: block.humidity_percent, data_quality_status: block.quality,
      })),
    };
  }
  return { source: "unavailable", device: telemetry?.device ?? null, latest: null, history: [] };
}
