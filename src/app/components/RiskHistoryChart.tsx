import type { SensorReading } from "../utils/telemetry";
import { historyRows, qualityPresentation } from "../utils/sample-history.mjs";
import { currentIndicator } from "../../../supabase/functions/server/seed7-policy.mjs";

export function riskHistoryPoints(readings: SensorReading[], end: number, deviceId: string) {
  return historyRows(readings, end, deviceId).flatMap((reading: SensorReading) => {
    if (qualityPresentation(reading.data_quality_status).tone !== "valid") return [];
    const indicator = currentIndicator(reading.pm2_5, reading.pm10, reading.temperature, reading.humidity);
    return indicator ? [{ time: Date.parse(reading.timestamp), adult: indicator.adult.score_0_100, pediatric: indicator.pediatric.score_0_100 }] : [];
  }).reverse();
}

export function RiskHistoryChart({ readings, end, deviceId }: { readings: SensorReading[]; end: number; deviceId: string }) {
  const points = riskHistoryPoints(readings, end, deviceId);
  const start = end - 24 * 60 * 60 * 1000;
  const scores = points.flatMap(point => [point.adult, point.pediatric]);
  const minimum = scores.length ? Math.max(0, Math.floor((Math.min(...scores) - 2) / 5) * 5) : 0;
  const maximum = scores.length ? Math.min(100, Math.ceil((Math.max(...scores) + 2) / 5) * 5) : 100;
  const range = Math.max(maximum - minimum, 5);
  const x = (time: number) => 32 + ((time - start) / (end - start)) * 304;
  const y = (score: number) => 142 - ((score - minimum) / range) * 112;
  const path = (population: "adult" | "pediatric") => points.map((point, index) =>
    `${index === 0 || point.time - points[index - 1].time > 10 * 60 * 1000 ? "M" : "L"}${x(point.time).toFixed(1)},${y(point[population]).toFixed(1)}`
  ).join(" ");
  return <section className="mt-3 rounded-xl border border-emerald-900/60 bg-zinc-900/80 p-4" aria-label="Adult and pediatric historical trend">
    <h2 className="text-sm font-semibold">Historical environmental trend</h2>
    <p className="mt-1 text-xs text-zinc-400">Adult and pediatric indicator · last 24 hours · observed score range</p>
    <div className="mt-3 flex gap-4 text-xs"><span className="text-emerald-300">● Adult</span><span className="text-sky-400">● Pediatric</span></div>
    {points.length ? <svg viewBox="0 0 350 165" className="mt-2 w-full" role="img" aria-label="Verified adult and pediatric environmental indicator scores over the last 24 hours; gaps indicate missing readings">
      {[30, 86, 142].map((line, index) => <g key={line}><line x1="32" x2="336" y1={line} y2={line} stroke="#3f3f46"/><text x="1" y={line + 4} fill="#a1a1aa" fontSize="10">{(maximum - index * range / 2).toFixed(range % 2 ? 1 : 0)}</text></g>)}
      <path d={path("adult")} fill="none" stroke="#6ee7b7" strokeWidth="2.5"/>
      <path d={path("pediatric")} fill="none" stroke="#38bdf8" strokeWidth="2.5"/>
      {points.length === 1 && <><circle cx={x(points[0].time)} cy={y(points[0].adult)} r="3" fill="#6ee7b7"/><circle cx={x(points[0].time)} cy={y(points[0].pediatric)} r="3" fill="#38bdf8"/></>}
      <text x="32" y="160" fill="#a1a1aa" fontSize="10">−24h</text><text x="313" y="160" fill="#a1a1aa" fontSize="10">Now</text>
    </svg> : <p className="py-8 text-center text-xs text-zinc-400">Waiting for verified readings with all four measurements.</p>}
    <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">Calculated from verified historical sensor measurements using the current environmental indicator policy. This is not a personal symptom probability.</p>
  </section>;
}
