import type { MonitorForecast } from "../utils/risk-monitor";
import { displayTime } from "../utils/environment";

const colors: Record<string, string> = {low:"#6ee7b7",moderate:"#fde047",high:"#fb923c",very_high:"#f87171"};

export function LiveForecastCard({ horizon, forecast, status, hasCurrent }: {
  horizon: number; forecast?: MonitorForecast; status?: string; hasCurrent: boolean;
}) {
  const indicators = forecast?.forecast_pm_indicator;
  return <section className="model-card forecast-card" aria-label="Live particulate forecast" aria-live="polite" aria-atomic="true">
    <p className="forecast-eyebrow">Forecast · {horizon} hours ahead</p>
    <h2>Particulate matter estimates</h2>
    {forecast && Date.parse(forecast.target_block_end)>Date.now() ? <>
      {forecast.update_delayed && <p className="model-note" role="status">Update delayed. Showing the last verified forecast.</p>}
      <p className="model-note">Forecast starting time: {displayTime(forecast.origin)} (Manila).{forecast.generated_at ? ` Calculated: ${displayTime(forecast.generated_at)} (Manila).` : ""}</p>
      <div className="forecast-row"><span>Particulate matter 2.5</span><strong>{forecast.pm2_5.toFixed(1)} <small>μg/m³</small></strong></div>
      <div className="forecast-row"><span>Particulate matter 10</span><strong>{forecast.pm10.toFixed(1)} <small>μg/m³</small></strong></div>
      <p className="model-note">Estimated levels for one five-minute period, {horizon} hours after the forecast starting time.</p>
      <div style={{marginTop:16,paddingTop:16,borderTop:"1px solid #3f3f46"}}>
        <h3 style={{fontSize:18,fontWeight:600,lineHeight:1.4}}>Forecast environmental indicators</h3>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:16,marginTop:16}}>
          {(["adult","pediatric"] as const).map(population=>{
            const indicator = indicators?.[population];
            return <div key={population} aria-label={`${population} forecast environmental indicator`} style={{minWidth:0}}>
              <p style={{fontSize:14}}>{population === "adult" ? "Adult" : "Pediatric"}</p>
              <p><strong style={{fontSize:20,lineHeight:1.4}}>{indicator ? indicator.score_0_100.toFixed(1) : "—"}</strong><small> /100</small></p>
              <p style={{fontSize:14,color:indicator ? colors[indicator.tier] : "#a1a1aa"}}>{indicator ? indicator.tier.replaceAll("_"," ") : "Unavailable"}</p>
            </div>;
          })}
        </div>
        <p className="model-note">{indicators ? "PM-based indicators use reference temperature (25°C) and humidity (60%); they are not symptom probabilities." : "Forecast indicators are not available from the verified model response yet."}</p>
      </div>
      <p className="model-note">Target: {displayTime(forecast.target_block_start)}–{displayTime(forecast.target_block_end)} (Manila).</p>
    </> : <>
      <p className="subtitle">Particulate matter estimates unavailable.</p>
      {hasCurrent && <p className="model-note">{status === "update_delayed" || forecast ? "This estimate has expired. Waiting for a new forecast" : status?.replaceAll("_"," ") || "Forecasts unavailable"}. Current measurements remain available.</p>}
    </>}
  </section>;
}
