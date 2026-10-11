import { useEffect, useState } from "react";
import { Wind, Thermometer, Droplets } from "lucide-react";
import {
  getSensorTelemetry,
  type SensorTelemetry,
  type SensorReading,
} from "../utils/telemetry";

const metrics = [
  { key: "pm2_5", label: "PM2.5", unit: "μg/m³", icon: Wind },
  { key: "pm10", label: "PM10", unit: "μg/m³", icon: Wind },
  { key: "temperature", label: "Temperature", unit: "°C", icon: Thermometer },
  { key: "humidity", label: "Humidity", unit: "%", icon: Droplets },
] as const;

// Uses actual timestamps; long gaps break the chart line.
function ReadingChart({
  readings,
  field,
  now,
}: {
  readings: SensorReading[];
  field: (typeof metrics)[number]["key"];
  now: number;
}) {
  const start = now - 24 * 60 * 60 * 1000;
  const points = readings.flatMap((reading) => {
    const value = reading[field];
    const time = Date.parse(reading.timestamp);

    return typeof value === "number" &&
      Number.isFinite(value) &&
      time >= start &&
      time <= now
      ? [{ value, time }]
      : [];
  });

  if (points.length < 2) {
    return <p className="text-sm text-zinc-500">Waiting for more readings.</p>;
  }

  const min = Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));
  const range = max - min || 1;

  const path = points.map((point, index) => {
    const x = ((point.time - start) / (now - start)) * 300;
    const y = 55 - ((point.value - min) / range) * 45;
    const gap = index > 0 &&
      point.time - points[index - 1].time > 10 * 60 * 1000;

    return `${index === 0 || gap ? "M" : "L"} ${x},${y}`;
  }).join(" ");

  return (
    <svg
      viewBox="0 0 300 65"
      className="w-full h-20 text-cyan-400"
      role="img"
      aria-label={`${field} readings over the last 24 hours`}
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function EnvironmentalScreen() {
  const [telemetry, setTelemetry] = useState<SensorTelemetry | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;

    async function refresh() {
      try {
        const result = await getSensorTelemetry(controller.signal);

        if (!controller.signal.aborted) {
          setTelemetry(result);
          setError("");
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Unable to load readings.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setNow(Date.now());
          timer = setTimeout(refresh, 30_000);
        }
      }
    }

    void refresh();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  const latest = telemetry?.latest;
  const age = latest ? now - Date.parse(latest.timestamp) : null;
  const recent = age !== null && age >= 0 && age <= 10 * 60 * 1000;

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-8">
      <div className="mb-6">
        <p className="text-sm text-zinc-400">Environmental Analytics</p>
        <h1 className="text-2xl font-bold">Sensor Telemetry</h1>
        <p className="text-sm text-zinc-400 mt-2">
          Five-minute averaged readings · Refreshes every 30 seconds
        </p>
      </div>

      {loading && <p className="text-zinc-400">Loading sensor readings…</p>}

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-red-950 p-4 text-red-200">
          {error} {telemetry ? "Previously fetched data is shown below." : ""}
        </p>
      )}

      {telemetry && !telemetry.device && (
        <p className="text-zinc-400">No active sensor node is assigned to your account.</p>
      )}

      {telemetry?.device && (
        <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <p className="font-semibold">{telemetry.device.device_id}</p>
          <p className="text-sm text-zinc-400">
            {telemetry.device.location_label || "Home"}
          </p>
          <p className="mt-2 text-sm">
            {error
              ? "Connection check failed"
              : latest
                ? recent ? "Recent data" : "No recent data"
                : "Waiting for the first reading"}
          </p>
          {latest && (
            <p className="text-sm text-zinc-400 mt-1">
              Last reading: {new Date(latest.timestamp).toLocaleString("en-PH", {
                timeZone: "Asia/Manila",
              })} (Philippine time)
            </p>
          )}
        </div>
      )}

      {latest && (
        <>
          <div className="space-y-4">
            {metrics.map(({ key, label, unit, icon: Icon }) => (
              <div
                key={key}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5"
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-cyan-400" />
                  <div>
                    <p className="text-sm text-zinc-400">{label}</p>
                    <p className="text-2xl font-bold">
                      {latest[key]?.toFixed(2) ?? "—"}{" "}
                      <span className="text-sm font-normal text-zinc-500">{unit}</span>
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-xs text-zinc-500">Last 24 hours · Philippine time</p>
                <ReadingChart
                  readings={telemetry?.history ?? []}
                  field={key}
                  now={now}
                />
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>24 hours ago</span>
                  <span>Now</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
  <h2 className="font-semibold mb-4">
    Pollutant Accumulation Patterns
  </h2>

  <dl>
    <div className="flex justify-between gap-4 py-3 border-b border-zinc-800">
      <dt className="text-sm text-zinc-400">Peak Hours</dt>
      <dd className="text-sm">Awaiting history analysis</dd>
    </div>

    <div className="flex justify-between gap-4 py-3 border-b border-zinc-800">
      <dt className="text-sm text-zinc-400">Average Daily PM2.5</dt>
      <dd className="text-sm">Awaiting history analysis</dd>
    </div>

    <div className="flex justify-between gap-4 py-3">
      <dt className="text-sm text-zinc-400">Data Quality</dt>
      <dd className="text-sm">
        {latest.data_quality_status ?? "Unavailable"}
      </dd>
    </div>
  </dl>

  <p className="text-xs text-zinc-500 mt-2">
    Samples: {latest.sample_count ?? "—"} /{" "}
    {latest.expected_samples ?? "—"}
  </p>
</div>

<p className="mt-4 text-xs text-zinc-400">
  {latest.device_id} · Block ended{" "}
  {new Date(latest.timestamp).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
  })} (Manila).
</p>
        </>
      )}
    </div>
  );
}
