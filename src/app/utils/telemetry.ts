import { projectId, publicAnonKey } from "/utils/supabase/info";
import { getValidAuthToken, logout } from "./auth";

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
  const token = await getValidAuthToken();

  if (!token) throw new Error("Please sign in.");

  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-a473accf/sensor-telemetry`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: publicAnonKey,
      },
      cache: "no-store",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
    },
  );

  if (response.status === 401) logout();
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error(`Sensor endpoint returned HTTP ${response.status}. Check its deployment.`); }

  if (!response.ok) {
    throw new Error(data.error || "Unable to load sensor readings.");
  }

  if (!data || typeof data !== "object" || !Array.isArray(data.history) || data.history.length > 1000 ||
      !("latest" in data) || !("device" in data) ||
      (data.device !== null && (typeof data.device !== "object" || typeof data.device.device_id !== "string")) ||
      (data.latest !== null && (typeof data.latest !== "object" || typeof data.latest.timestamp !== "string"))) {
    throw new Error("Unexpected sensor response. Check that the deployed telemetry route matches the app.");
  }
  return data;
}