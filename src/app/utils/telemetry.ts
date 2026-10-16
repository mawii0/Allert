import { privateApi } from "./private-api";

export interface SensorReading {
  id: number;
  device_id: string;
  timestamp: string;
  pm2_5: number | null;
  pm10: number | null;
  temperature: number | null;
  humidity: number | null;
  sample_count: number | null;
  expected_samples: number | null;
  pm25_stddev: number | null;
  data_quality_status: string | null;
}

export interface SensorTelemetry {
  device: {
    device_id: string;
    location_label: string | null;
    is_active: boolean;
  } | null;
  latest: SensorReading | null;
  history: SensorReading[];
}

export async function getSensorTelemetry(
  signal?: AbortSignal,
): Promise<SensorTelemetry> {
  signal?.throwIfAborted();
  const data = await privateApi<SensorTelemetry>("/sensor-telemetry", { signal });

  if (!data || typeof data !== "object" || !Array.isArray(data.history) || data.history.length > 1000 ||
      !("latest" in data) || !("device" in data) ||
      (data.device !== null && (typeof data.device !== "object" || typeof data.device.device_id !== "string")) ||
      (data.latest !== null && (typeof data.latest !== "object" || typeof data.latest.timestamp !== "string"))) {
    throw new Error("Unexpected sensor response. Check that the deployed telemetry route matches the app.");
  }
  return data;
}