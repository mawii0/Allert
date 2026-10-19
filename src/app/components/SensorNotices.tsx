import "../../styles/patient-actions.css";
import { RefreshCw } from "lucide-react";
import { usePrivateResource } from "../utils/usePrivateResource";
import { displayTime } from "../utils/environment";
import { sensorNoticeCopy, sensorMonitoringMessage } from "../utils/sensor-notice-copy.mjs";
export function SensorNotices() {
  const notices=usePrivateResource<any>("/analytics-events"),value=notices.data;
  return <section id="sensor-notices" className="allert-card rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 mt-6" aria-label="Sensor notices">
    <h2 className="font-semibold">Sensor notices</h2>
    <p className="text-xs text-zinc-400 mt-2">Sudden increases in particle levels recorded by your node. These are measurements, not forecasts.</p>
    {notices.loading?<p role="status" className="text-sm mt-3">Loading sensor notices…</p>:notices.error?<p role="alert" className="text-sm text-red-300 mt-3">{notices.error}</p>:<>
      <p className="text-xs text-zinc-400 mt-3">{sensorMonitoringMessage(value)}</p>
      {value?.device && !value.events?.length && <p className="text-sm mt-3">No stored sensor notices for this node.</p>}
      <div className="space-y-3 mt-3">{(value?.events || []).map((event:any)=>{const copy=sensorNoticeCopy(event.phase);return <article key={event.id} className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-4">
        <div className="sensor-notice-meta"><strong className="text-sm">{copy.title}</strong><span className="sensor-notice-status" data-recovered={copy.status==="Recovered"}>{copy.status}</span></div>
        <time className="block text-xs text-zinc-400 mt-2">{displayTime(event.observed_at)}</time>
        <p className="text-xs text-zinc-300 mt-3">{copy.description}</p>
        <p className="text-xs text-zinc-400 mt-2">Highest recorded PM2.5: {event.event?.peaks?.pm2_5?.toFixed(2) ?? "—"} · PM10: {event.event?.peaks?.pm10?.toFixed(2) ?? "—"} µg/m³</p>
      </article>;})}</div>
    </>}
    <button type="button" onClick={notices.retry} className="allert-action-link mt-3" disabled={notices.loading}><RefreshCw aria-hidden="true" />Refresh notices</button>
  </section>;
}
