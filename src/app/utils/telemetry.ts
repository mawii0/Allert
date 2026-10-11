import { projectId, publicAnonKey } from "/utils/supabase/info";
import { getAuthToken } from "./auth";

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
  const token = getAuthToken();

  if (!token) throw new Error("Please sign in.");

  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-a473accf/sensor-telemetry`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: publicAnonKey,
      },
      cache: "no-store",
      signal,
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Unable to load sensor readings.");
  }

  return data;
}