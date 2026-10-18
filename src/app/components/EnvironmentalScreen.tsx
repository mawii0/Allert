import { ForecastNotices } from "./ForecastNotices";
import { SensorNotices } from "./SensorNotices";
import { useEffect, useState } from "react";
import { Wind, Thermometer, Droplets, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  getSensorTelemetry,
  type SensorTelemetry,
  type SensorReading,
} from "../utils/telemetry";

import { displayTime } from "../utils/environment";
import { EnvironmentNotice } from "./EnvironmentNotice";

import { summarizeHistory, metricTrend } from "../utils/telemetry-analysis.mjs";

const metrics = [
  { key: "pm2_5", label: "PM2.5", unit: "μg/m³", icon: Wind, color: "#ff9800" },
  { key: "pm10", label: "PM10", unit: "μg/m³", icon: Wind, color: "#ff9800" },
  { key: "temperature", label: "Temperature", unit: "°C", icon: Thermometer, color: "#60a5fa" },
  { key: "humidity", label: "Humidity", unit: "%", icon: Droplets, color: "#22d3ee" },
] as const;

// Uses actual timestamps; long gaps break the chart line.
function ReadingChart({
  readings,
  field,
  now,
  color,
}: {
  readings: SensorReading[];
  field: (typeof metrics)[number]["key"];
  now: number;
  color: string;
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
      className="w-full h-20"
      style={{ color }}
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
  const status = "unavailable";
  const [attempt, setAttempt] = useState(0);
  const [telemetry, setTelemetry] = useState<SensorTelemetry | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let revision = 0;
    let pending = false;
    setTelemetry(null);
    setLoading(true);
    setError("");

    async function refresh() {
      if (pending || controller.signal.aborted) return;
      pending = true;
      const requestRevision = revision;
      clearTimeout(timer);
      try {
        const result = await getSensorTelemetry(controller.signal);

        if (!controller.signal.aborted && revision === requestRevision) {
          setTelemetry(result);
          setError("");
        }
      } catch (err) {
        if (!controller.signal.aborted && revision === requestRevision) {
          setError(err instanceof Error ? err.message : "Unable to load readings.");
        }
      } finally {
        pending = false;
        if (!controller.signal.aborted && revision !== requestRevision) { void refresh(); }
        else if (!controller.signal.aborted) {
          setLoading(false);
          setNow(Date.now());
          timer = setTimeout(refresh, 30_000);
        }
      }
    }

    const reset = () => { revision++; setTelemetry(null); setError(""); setLoading(true); void refresh(); };
    window.addEventListener("storage", reset);
    window.addEventListener("allert-session-changed", reset);
    window.addEventListener("allert-node-changed", reset);
    window.addEventListener("allert-location-changed", reset);
    window.addEventListener("focus", refresh);
    void refresh();

    return () => {
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener("storage", reset);
      window.removeEventListener("allert-session-changed", reset);
      window.removeEventListener("allert-node-changed", reset);
      window.removeEventListener("allert-location-changed", reset);
      window.removeEventListener("focus", refresh);
    };
  }, [attempt]);

  const view = {source:"sensor",latest:telemetry?.latest ?? null,history:telemetry?.history ?? [],device:telemetry?.device ?? null};
  const replay = false;
  const latest = view.latest;
  const retryAll = () => { setAttempt(value => value + 1); };
  const age = latest ? now - Date.parse(latest.timestamp) : null;
  const recent = age !== null && age >= 0 && age <= 10 * 60 * 1000;

  const chartEnd = replay && latest ? Date.parse(latest.timestamp) : now;
  const summary = summarizeHistory(view.history, chartEnd);
  const hourLabel = (hour: number) => `${hour % 12 || 12}${hour < 12 ? "AM" : "PM"}`;
  const historyRows = view.history
    .filter((reading) => {
      const timestamp = Date.parse(reading.timestamp);
      return timestamp >= chartEnd - 24 * 60 * 60 * 1000 && timestamp <= chartEnd;
    })
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const sampleTime = (timestamp: string) => new Date(timestamp).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return (
    <div className="min-h-screen bg-zinc-950 px-5 py-6 pb-24">
      <header className="mb-5">
        <p className="text-xs text-zinc-400">Environmental Analytics</p>
        <h1 className="text-xl font-bold mt-1">Sensor Telemetry</h1>
        <p className="text-xs text-zinc-400 mt-1">{replay ? "Recorded air quality monitoring" : "Real-time air quality monitoring"}</p>
      </header>
      {loading && !replay && <p className="text-sm text-zinc-400 mb-4">Loading sensor readings...</p>}
      {error && <section role="alert" className="mb-4 rounded-xl border border-red-900 bg-red-950/40 p-3 text-xs text-red-200">
        <p>{error} {latest ? "Previously verified readings are shown below." : ""}</p>
        <button className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-white" onClick={retryAll}>Retry Sensor Connection</button>
      </section>}
      {replay && <section role="status" className="mb-4 rounded-xl border border-emerald-800 bg-emerald-950/30 px-3 py-3">
        <h2 className="text-sm font-semibold text-emerald-300">Historical Replay</h2>
        <p className="mt-1 text-xs text-zinc-400">Recorded measurements, not current conditions. Hardware is not connected yet.</p>
      </section>}
      {!loading && !latest && <section className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900 p-3">
        <p className="text-sm text-zinc-300">{view.device ? "Waiting for the first hardware reading." : "Live hardware is not connected yet."}</p>
        <EnvironmentNotice status={status} retry={retryAll} />
      </section>}
      {view.device && !replay && <section className="mb-4 text-xs text-zinc-400">
        {view.device.location_label || view.device.device_id} - {error ? "Connection check failed" : latest ? recent ? "Recent data" : "No recent data" : "Waiting for readings"}
      </section>}
      {latest && <>
        <div className="space-y-3">
          {metrics.map(({key,label,unit,icon:Icon,color}) => {
            const trend=metricTrend(view.history,key);
            const TrendIcon=trend==="Rising" ? TrendingUp : trend==="Falling" ? TrendingDown : Minus;
            return <section key={key} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="flex items-center gap-2 mb-3">
                <div className="rounded-full bg-zinc-800 p-2"><Icon className="h-4 w-4" style={{color}} /></div>
                <div className="flex-1">
                  <h2 className="text-xs text-zinc-400">{label}</h2>
                  <p className="text-lg font-bold leading-tight">{latest[key]?.toFixed(1) ?? "—"}<span className="ml-1 text-xs font-normal text-zinc-500">{unit}</span></p>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-1 text-[10px]" style={{color:trend==="Stable" ? "#a1a1aa" : color}}>
                  <TrendIcon className="h-3 w-3" />{trend}
                </span>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2">
                <p className="text-[10px] text-zinc-500 mb-1">24-Hour Trend{replay ? " - Recorded" : ""}</p>
                <ReadingChart readings={view.history} field={key} now={chartEnd} color={color} />
              </div>
            </section>;
          })}
        </div>
        <section className="history-table-card mt-3 overflow-hidden rounded-xl border border-emerald-900/60 bg-gradient-to-br from-emerald-950/40 via-zinc-900/90 to-zinc-900/70">
          <div className="border-b border-emerald-900/50 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Wind className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-zinc-100">24-Hour Sample History</h2>
                  <p className="mt-0.5 text-[10px] text-zinc-400">Five-minute environmental samples</p>
                </div>
              </div>
              <span className="rounded-full border border-emerald-800/70 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-300">
                {historyRows.length} samples
              </span>
            </div>
          </div>
          <div className="px-3 pb-3 pt-3">
            <div className="history-table-scroll max-h-80 overflow-auto rounded-lg border border-zinc-800/80 bg-zinc-950/40">
              {historyRows.length ? (
                <table className="min-w-[620px] w-full text-left text-[11px]" aria-label="Environmental samples from the last 24 hours">
                  <thead className="sticky top-0 z-10 bg-zinc-800/95 text-zinc-400 backdrop-blur-sm">
                    <tr>
                      <th scope="col" className="px-3 py-2.5 font-medium">Time <span className="font-normal text-zinc-600">· Manila</span></th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">PM2.5 <span className="font-normal text-zinc-600">μg/m³</span></th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">PM10 <span className="font-normal text-zinc-600">μg/m³</span></th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">Temp.</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">Humidity</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">Quality</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80">
                    {historyRows.map((reading) => (
                      <tr key={`${reading.timestamp}-${reading.id}`} className="text-zinc-300 transition-colors hover:bg-emerald-950/30">
                        <th scope="row" className="whitespace-nowrap px-3 py-2.5 font-normal text-zinc-400">{sampleTime(reading.timestamp)}</th>
                        <td className="px-3 py-2.5 text-right font-medium text-zinc-200">{reading.pm2_5?.toFixed(1) ?? "—"}</td>
                        <td className="px-3 py-2.5 text-right">{reading.pm10?.toFixed(1) ?? "—"}</td>
                        <td className="px-3 py-2.5 text-right">{reading.temperature?.toFixed(1) ?? "—"}°C</td>
                        <td className="px-3 py-2.5 text-right">{reading.humidity?.toFixed(1) ?? "—"}%</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="inline-block rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
                            {reading.data_quality_status ?? "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-3 py-8 text-center text-xs text-zinc-500">
                  No five-minute samples are available for this 24-hour window.
                </p>
              )}
            </div>
          </div>
        </section>
        <section className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-4">
          <h2 className="text-sm font-semibold mb-2">Pollutant Accumulation Patterns</h2>
          <dl className="text-xs">
            <div className="flex justify-between gap-3 py-3 border-b border-zinc-800"><dt className="text-zinc-400">Peak Hours</dt><dd>{summary.coverage >= 95 ? summary.peaks.map(hourLabel).join(", ") : "Awaiting full history"}</dd></div>
            <div className="flex justify-between gap-3 py-3 border-b border-zinc-800"><dt className="text-zinc-400">{summary.coverage >= 95 ? "Average Daily PM2.5" : "Available History PM2.5"}</dt><dd>{summary.average === null ? "Unavailable" : `${summary.average.toFixed(1)} μg/m³`}</dd></div>
            <div className="flex justify-between gap-3 pt-3"><dt className="text-zinc-400">History Coverage</dt><dd className="text-emerald-400">{summary.coverage.toFixed(1)}%</dd></div>
          </dl>
          <p className="mt-3 text-[10px] text-zinc-500">Peak hours use recorded hourly averages (Manila). Coverage is available five-minute blocks out of 288.</p>
        </section>
        <p className="mt-3 text-[10px] text-zinc-500">{latest.device_id} - {replay ? "Recorded window ended" : "Last reading"} {displayTime(latest.timestamp)} (Manila).</p>
      </>}
      <ForecastNotices />
      <SensorNotices />
    </div>
  );
}
