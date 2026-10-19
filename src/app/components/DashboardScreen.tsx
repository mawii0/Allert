import { useState } from "react";
import { Shield } from "lucide-react";
import { EnvironmentNotice } from "./EnvironmentNotice";
import { displayTime } from "../utils/environment";
import "../../styles/model-screens.css";
import { useRiskMonitor } from "../utils/risk-monitor";
import { useProfilePopulation } from "../utils/useProfileSettings";

export function DashboardScreen() {
  const [horizon, setHorizon] = useState(6);
  const { data, status, retry } = useRiskMonitor();
  const current = data?.current;
  const selected = data?.forecasts.find(value => value.horizon_hours === horizon);
  const profilePopulation = useProfilePopulation();
  const [selectedPopulation, setSelectedPopulation] = useState<"adult" | "pediatric" | null>(null);
  const population = selectedPopulation ?? profilePopulation;
  const indicator = current?.risk?.[population];
  const adultIndicator = current?.risk?.adult;
  const pediatricIndicator = current?.risk?.pediatric;
  const forecastIndicator = selected?.forecast_pm_indicator?.[population];
  const values = selected ? [{pollutant:"pm2_5",value:selected.pm2_5},{pollutant:"pm10",value:selected.pm10}] : [];
  const tier = indicator?.tier || "low";
  const color = { low: "#6ee7b7", moderate: "#fde047", high: "#fb923c", very_high: "#f87171" }[tier];
  return <div className="model-screen model-home">
    <header><p className="eyebrow">Predictive Dashboard</p><h1>Risk Monitor</h1><p className="subtitle">{current ? `${data?.device?.device_id} - ${status === "stale" ? "Stale sensor reading" : "Current sensor readings"}` : status === "loading" ? "Loading measurements..." : "Measurements unavailable"}</p></header>
    {!current && <EnvironmentNotice status={status === "unavailable" ? "unavailable" : status} retry={retry} />}
    {status === "stale" && <section className="model-card p-4 mb-4" role="status"><p className="text-sm">Last sensor reading is older than 10 minutes. These values do not establish current conditions.</p></section>}
    <div className="model-gauge" aria-label="Current environmental indicator">
      <svg viewBox="0 0 256 256" aria-hidden="true">
        <circle cx="128" cy="128" r="110" fill="none" stroke="#090d0c" strokeWidth="12"/>
        <circle cx="128" cy="128" r="110" fill="none" stroke="#6ee7b7" strokeWidth="12" strokeLinecap="round" strokeDasharray={2 * Math.PI * 110} strokeDashoffset={2 * Math.PI * 110 * (1 - (adultIndicator?.score_0_100 || 0) / 100)} transform="rotate(-90 128 128)"/>
        <circle cx="128" cy="128" r="88" fill="none" stroke="#203040" strokeWidth="9"/>
        <circle cx="128" cy="128" r="88" fill="none" stroke="#38bdf8" strokeWidth="9" strokeLinecap="round" strokeDasharray={2 * Math.PI * 88} strokeDashoffset={2 * Math.PI * 88 * (1 - (pediatricIndicator?.score_0_100 || 0) / 100)} transform="rotate(-90 128 128)"/>
      </svg>
      <div className="gauge-center" role="status" aria-live="polite" aria-atomic="true"><strong title="Categories use the unrounded score; the display is rounded to one decimal place. A displayed 100 can reflect rounding or numerical saturation, not health certainty." style={{ color }}>{indicator ? indicator.score_0_100.toFixed(1) : "—"}<small> /100</small></strong><span>{indicator ? tier.replaceAll("_", " ") : "Unavailable"}</span><p>{population === "adult" ? "Adult" : "Pediatric"} · Current environmental indicator</p></div>
    </div>
    <div className="population-scores" role="group" aria-label="Choose the displayed environmental indicator">
      {([{key:"adult",label:"Adult",value:adultIndicator},{key:"pediatric",label:"Pediatric",value:pediatricIndicator}] as const).map(({key,label,value}) => <button type="button" key={key} aria-pressed={population === key} aria-label={`Show ${label.toLowerCase()} environmental indicator`} onClick={() => setSelectedPopulation(key)}>{label} <strong>{value ? value.score_0_100.toFixed(1) : "—"}</strong></button>)}
    </div>
    <h2 className="readings-title">Current readings</h2>
    <div className="quick-stats">{[["PM2.5", current?.pm2_5, "μg/m³"], ["PM10", current?.pm10, "μg/m³"], ["Temp", current?.temperature, "°C"], ["Humidity", current?.humidity, "%"]].map(([label, value, unit]) => <section className="model-card" key={label}><p>{label}</p><strong>{typeof value === "number" ? value.toFixed(1) : "—"}<small> {unit}</small></strong>{typeof value !== "number" && <span>Unavailable</span>}</section>)}</div>
    <section className="model-card timeline"><p className="subtitle">Forecast Timeline</p><div className="timeline-buttons">{[6, 12, 24].map(hour => <button key={hour} aria-pressed={hour === horizon} className={hour === horizon ? "selected" : ""} onClick={() => setHorizon(hour)}>{hour}h</button>)}</div></section>
    <section className="model-card forecast-card"><p className="forecast-eyebrow">Forecast · {horizon} hours ahead</p><h2>Particulate matter estimates</h2>{values.length ? values.map(value => <div className="forecast-row" key={value.pollutant}><span>{value.pollutant === "pm2_5" ? "Particulate matter 2.5" : "Particulate matter 10"}</span><strong>{value.value.toFixed(1)} <small>μg/m³</small></strong></div>) : <p className="subtitle">Particulate matter estimates unavailable.</p>}
      {forecastIndicator && <><div className="forecast-row"><span>Forecast particulate matter indicator</span><strong title="Categories use the unrounded score; displayed points are rounded.">{forecastIndicator.score_0_100.toFixed(1)} points</strong></div><p className="forecast-category">Category: {forecastIndicator.tier.replaceAll("_", " ")}</p></>}
      {selected ? <p className="model-note">Model-only estimate · {population} · target {displayTime(selected.target_block_start)} (Manila).</p> : current && <p className="model-note">{data?.model_status?.replaceAll("_", " ") || "Forecasts unavailable"}. Current measurements remain available.</p>}

    </section>
    <section className="model-card guidance"><div className="shield-icon"><Shield size={21}/></div><div><h2>Environmental Guidance</h2><p>{status === "stale" ? "Stored sensor readings are stale. Current conditions are unknown." : indicator ? `Current ${population} environmental indicator: ${tier.replaceAll("_", " ")}. This is not a personal symptom probability.` : "Valid completed sensor measurements will appear here when available."}</p></div></section>
    <p className="model-note guidance-disclaimer">Environmental estimates only—not a diagnosis or medical advice.{current && <> Last reading: {displayTime(current.timestamp)} (Iloilo local time).</>}</p>

  </div>;
}
