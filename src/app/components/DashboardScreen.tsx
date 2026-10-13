import { ADVISORIES } from "../../../supabase/functions/server/environment-policy.mjs";
import { useState } from "react";
import { Shield } from "lucide-react";
import { EnvironmentNotice } from "./EnvironmentNotice";
import { displayTime } from "../utils/environment";
import "../../styles/model-screens.css";
import { useRiskMonitor } from "../utils/risk-monitor";

export function DashboardScreen() {
  const [horizon, setHorizon] = useState(0);
  const { data, status, retry } = useRiskMonitor();
  const current = data?.current;
  const selected = data?.forecasts.find(value => value.horizon_hours === horizon);
  const population = localStorage.getItem("allert_demographic") === "pediatric" ? "pediatric" : "adult";
  const indicator = horizon === 0 ? current?.risk[population] : selected?.risk[population];
  const values = selected ? [{pollutant:"pm2_5",value:selected.pm2_5},{pollutant:"pm10",value:selected.pm10}] : [];
  const tier = indicator?.tier || "low";
  const color = { low: "#6ee7b7", moderate: "#fde047", high: "#fb923c", very_high: "#f87171" }[tier];
  const medianOnly = selected?.method === "median_only";
  return <div className="model-screen model-home">
    <header><p className="eyebrow">Predictive Dashboard</p><h1>Risk Monitor</h1><p className="subtitle">{current ? `${data?.device?.device_id} - ${status === "stale" ? "Stale sensor reading" : "Sensor measurements"}` : status === "loading" ? "Loading measurements..." : "Measurements unavailable"}</p></header>
    {!current && <EnvironmentNotice status={status === "unavailable" ? "unavailable" : status} retry={retry} />}
    {status === "stale" && <section className="model-card p-4 mb-4" role="status"><p className="text-sm">Last sensor reading is older than 10 minutes. These values do not establish current conditions.</p></section>}
    <div className="model-gauge" aria-label={horizon ? `Environmental indicator estimate at +${horizon} hours` : "Current environmental indicator"}>
      <svg viewBox="0 0 256 256" aria-hidden="true"><circle cx="128" cy="128" r="110" fill="none" stroke="#090d0c" strokeWidth="12"/><circle cx="128" cy="128" r="110" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={2 * Math.PI * 110} strokeDashoffset={2 * Math.PI * 110 * (1 - (indicator?.score_0_100 || 0) / 100)} transform="rotate(-90 128 128)"/></svg>
      <div className="gauge-center"><strong title="Category uses the unrounded score; the displayed score is rounded to one decimal place." style={{ color }}>{indicator ? indicator.score_0_100.toFixed(1) : "—"}<small> /100</small></strong><span>{indicator ? tier.replaceAll("_", " ") : "Unavailable"}</span><p>{horizon ? `${medianOnly ? "Median estimate" : "Model forecast"} +${horizon}h` : "Environmental indicator - Now"}</p></div>
    </div>
    <section className="model-card timeline"><p className="subtitle">Forecast Timeline</p><div className="timeline-buttons">{[0, 6, 12, 24].map(hour => <button key={hour} aria-pressed={hour === horizon} className={hour === horizon ? "selected" : ""} onClick={() => setHorizon(hour)}>{hour ? `+${hour}h` : "Now"}</button>)}</div></section>
    {horizon !== 0 && <section className="model-card forecast-card"><h2>PM {medianOnly ? "estimates" : "forecasts"} - +{horizon}h</h2>{values.length ? values.map(value => <div className="forecast-row" key={value.pollutant}><span>{value.pollutant === "pm2_5" ? "PM2.5" : "PM10"}</span><strong>{value.value.toFixed(2)} <small>μg/m³</small></strong></div>) : <p className="subtitle">Forecasts unavailable.</p>}
      {selected && <><p className="model-note">Target block ends: {displayTime(selected.target_block_end)} (Manila).</p><p className="model-note">{medianOnly ? `Median-only estimate - ${data?.model_status === "warming_up" ? "model warming up" : data?.model_status?.replaceAll("_"," ")}. No neural adjustment yet; all three horizons use the same baseline.` : "Frozen model adjusted the last-hour median for this horizon."}</p><p className="model-note">Available last hour: {data?.baseline?.reading_count} of 12 five-minute readings ({data?.baseline?.available_minutes} minutes of measurements). Missing readings are not padded.</p><p className="model-note">Forecast score and tier assume temperature and humidity stay at their available last-hour medians. They are environmental estimates, not symptom probabilities.</p></>}
    </section>}
    <section className="model-card guidance"><div className="shield-icon"><Shield size={21}/></div><div><h2>Environmental Guidance</h2><p>{status === "stale" ? "Stored sensor readings are stale. Current conditions are unknown." : indicator ? `${horizon ? "Estimated" : "Current"} ${population} environmental indicator: ${tier.replaceAll("_", " ")}. This is not a personal symptom probability. ${population === "adult" ? ADVISORIES[tier] : ""}` : "Valid completed sensor measurements will appear here when available."}</p></div></section>
    <div className="quick-stats">{[["PM 2.5", horizon ? selected?.pm2_5 : current?.pm2_5, "μg/m³"], ["Temp", horizon ? selected?.temperature : current?.temperature, "°C"], ["Humidity", horizon ? selected?.humidity : current?.humidity, "%"]].map(([label, value, unit]) => <section className="model-card" key={label}><p>{label}</p><strong>{typeof value === "number" ? value.toFixed(1) : "—"}<small> {unit}</small></strong><span>{horizon ? "Estimated" : current ? "Observed" : "Unavailable"}</span></section>)}</div>
    <p className="model-note">Environmental points, not an allergy probability.{current && <> Last completed sensor block: {displayTime(current.timestamp)} (Manila).</>}</p>

  </div>;
}
