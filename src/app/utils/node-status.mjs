export function readingStatus(telemetry, loading, error, now = Date.now()) {
  if (error) return "Unable to check node";
  if (loading) return "Checking node…";
  if (!telemetry?.device) return "No assigned node";
  if (!telemetry.latest) return "Waiting for first reading";
  const time = Date.parse(telemetry.latest.timestamp);
  if (!Number.isFinite(time) || time > now + 60_000) return "Invalid reading time";
  return now - time <= 600_000 ? "Recent data" : "No recent data";
}
