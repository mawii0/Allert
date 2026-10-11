import { Activity, Wind, Thermometer, Droplets } from "lucide-react";
import { EnvironmentNotice } from "./EnvironmentNotice";
import { displayTime, useEnvironment } from "../utils/environment";
import "../../styles/model-screens.css";

export function EnvironmentalScreen() {
  const { snapshot, status, retry } = useEnvironment();
  const replay = snapshot?.mode === "historical_fixture";
  const metrics = [
    { label: "PM 2.5", value: snapshot?.current.pm2_5, unit: "µg/m³", icon: Wind, color: "#f59e0b" },
    { label: "PM 10", value: snapshot?.current.pm10, unit: "µg/m³", icon: Wind, color: "#f59e0b" },
    { label: "Temperature", value: snapshot?.current.temperature_c, unit: "°C", icon: Thermometer, color: "#60a5fa" },
    { label: "Humidity", value: snapshot?.current.humidity_percent, unit: "%", icon: Droplets, color: "#22d3ee" },
  ];
  return <div className="model-screen model-environment">
    <header><p className="eyebrow">Environmental Analytics</p><h1>Sensor Telemetry</h1><p className="subtitle">{replay ? "Historical air quality replay" : "Air quality monitoring"}</p></header>
    {!snapshot && <EnvironmentNotice status={status} retry={retry} />}
    <section className="model-card telemetry-notice"><Activity size={20}/><div><h2>{replay ? "Historical Replay" : status === "stale" ? "Stale Measurements" : snapshot ? "Stored Measurements" : "Measurements Unavailable"}</h2><p>{replay ? "Model results from recorded data. Live hardware is not connected yet." : status === "stale" ? "Current conditions are unknown." : snapshot ? "Observed-event monitoring is not connected yet." : "Waiting for authorized measurement data."}</p></div></section>
    {metrics.map(metric => <section className="model-card telemetry-card" key={metric.label}><div className="metric-heading"><div className="metric-icon" style={{ color: metric.color }}><metric.icon size={20}/></div><div><p>{metric.label}</p><strong>{metric.value === undefined ? "—" : metric.value.toFixed(1)}<small> {metric.unit}</small></strong></div><span className="metric-badge">{snapshot ? replay ? "Replay" : "Observed" : "Unavailable"}</span></div><div className="history-panel"><p>24-Hour Trend</p><div className="history-empty">History not connected yet</div></div></section>)}
    <section className="model-card patterns"><h2>Pollutant Accumulation Patterns</h2><dl><div><dt>Peak Hours</dt><dd>Awaiting history</dd></div><div><dt>Average Daily PM 2.5</dt><dd>Awaiting history</dd></div><div><dt>Data Quality</dt><dd className="quality">{snapshot?.current.quality || "Unavailable"}</dd></div></dl></section>
    {snapshot && <p className="model-note">{snapshot.node_id} · Block ended {displayTime(snapshot.current.block_end)} (Manila).</p>}
  </div>;
}
