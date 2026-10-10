import { useState } from "react";
import { Shield } from "lucide-react";
import { displayTime, useEnvironment } from "../utils/environment";
import "../../styles/model-screens.css";

export function DashboardScreen() {
  const [horizon, setHorizon] = useState(0);
  const { snapshot, status } = useEnvironment();
  const population = localStorage.getItem("allert_demographic") === "pediatric" ? "pediatric" : "adult";
  const indicator = snapshot?.risk[population];
  const values = snapshot?.forecast.forecasts.filter(value => value.horizon_hours === horizon) || [];
  const tier = indicator?.tier || "low";
  const color = { low: "#6ee7b7", moderate: "#fde047", high: "#fb923c", very_high: "#f87171" }[tier];
  const replay = snapshot?.mode === "historical_fixture";
  return <div className="model-screen model-home">
    <header><p className="eyebrow">Predictive Dashboard</p><h1>Risk Monitor</h1><p className="subtitle">{snapshot ? `Iloilo ${snapshot.node_id} · ${replay ? "Historical replay" : status.replaceAll("_", " ")}` : status === "loading" ? "Loading measurements…" : "Measurements unavailable"}</p></header>
    <div className="model-gauge" aria-label="Current environmental indicator">
      <svg viewBox="0 0 256 256" aria-hidden="true"><circle cx="128" cy="128" r="110" fill="none" stroke="#090d0c" strokeWidth="12"/><circle cx="128" cy="128" r="110" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={2 * Math.PI * 110} strokeDashoffset={2 * Math.PI * 110 * (1 - (indicator?.score_0_100 || 0) / 100)} transform="rotate(-90 128 128)"/></svg>
      <div className="gauge-center"><strong style={{ color }}>{indicator ? indicator.score_0_100.toFixed(1) : "—"}<small> /100</small></strong><span>{indicator ? tier.replaceAll("_", " ") : "Unavailable"}</span><p>Environmental indicator · Now</p></div>
    </div>
    <section className="model-card timeline"><p className="subtitle">Forecast Timeline</p><div className="timeline-buttons">{[0, 6, 12, 24].map(hour => <button key={hour} aria-pressed={hour === horizon} className={hour === horizon ? "selected" : ""} onClick={() => setHorizon(hour)}>{hour ? `+${hour}h` : "Now"}</button>)}</div></section>
    {horizon !== 0 && <section className="model-card forecast-card"><h2>PM forecasts · +{horizon}h</h2>{values.length ? values.map(value => <div className="forecast-row" key={value.pollutant}><span>{value.pollutant === "pm2_5" ? "PM2.5" : "PM10"}</span><strong>{value.value.toFixed(2)} <small>µg/m³</small></strong><p>Target: {displayTime(value.target_block_start)} – {displayTime(value.target_block_end)}</p></div>) : <p className="subtitle">Forecasts unavailable.</p>}<p className="model-note">Each forecast covers one five-minute block.</p></section>}
    <section className="model-card guidance"><div className="shield-icon"><Shield size={21}/></div><div><h2>Environmental Guidance</h2><p>{replay ? "Historical replay: use these results to explore the model. They do not describe current conditions." : status === "stale" ? "Stored readings are stale. Current conditions are unknown." : snapshot ? `Current ${population} environmental indicator: ${tier.replaceAll("_", " ")}. This is not a personal symptom probability.` : "Verified measurements will appear here when available."}</p></div></section>
    <div className="quick-stats">{[["PM 2.5", snapshot?.current.pm2_5, "µg/m³"], ["Temp", snapshot?.current.temperature_c, "°C"], ["Humidity", snapshot?.current.humidity_percent, "%"]].map(([label, value, unit]) => <section className="model-card" key={label}><p>{label}</p><strong>{typeof value === "number" ? value.toFixed(1) : "—"}<small> {unit}</small></strong><span>{snapshot ? replay ? "Replay" : "Observed" : "Unavailable"}</span></section>)}</div>
    <p className="model-note">Environmental points, not an allergy probability.{snapshot && <> Block ended {displayTime(snapshot.current.block_end)} (Manila).</>}</p>
  </div>;
}
