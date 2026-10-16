import { usePrivateResource } from "../utils/usePrivateResource";
import { displayTime } from "../utils/environment";
export function SensorNotices() {
  const notices=usePrivateResource<any>("/alerts");
  const value=notices.data;
  return <section id="sensor-notices" className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 mt-6" aria-label="Sensor notices">
    <h2 className="font-semibold">Sensor notices</h2>
    <p className="text-xs text-zinc-400 mt-2">Observed particulate changes, separate from forecasts and personal allergy probabilities.</p>
    {notices.loading?<p role="status" className="text-sm mt-3">Loading sensor notices…</p>:notices.error?<p role="alert" className="text-sm text-red-300 mt-3">{notices.error}</p>:<>
      <p className="text-xs text-zinc-400 mt-3">{!value?.device?"Link a node to see its notices.":!value.processorReady?"Automatic processing is not confirmed active. Check its deployment and schedule.":value.detector?.status!=="ready"?`Detector warming up: ${value.detector?.baseline_count || 0} of 12 consecutive valid baseline blocks.`:"Automatic measurement monitoring is active."}</p>
      {value?.device && !value.events?.length && <p className="text-sm mt-3">No stored sensor notices for this node.</p>}
      <div className="space-y-3 mt-3">{(value?.events || []).map((event:any)=><article key={event.id} className="rounded-lg border border-zinc-800 p-3">
        <div className="flex justify-between gap-3 text-sm"><strong className="capitalize">{event.severity} measurement change</strong><time className="text-xs text-zinc-400">{displayTime(event.observed_at)}</time></div>
        <p className="text-xs text-zinc-400 mt-2">PM2.5: {event.reading?.pm2_5?.toFixed(2) ?? "—"} · PM10: {event.reading?.pm10?.toFixed(2) ?? "—"} µg/m³</p>
        <p className="text-xs text-zinc-500 mt-1">Review: {event.classification?.replaceAll("_"," ") || "unreviewed"}. Monitoring rule: {event.policy_version}.</p>
      </article>)}</div>
    </>}
    <button type="button" onClick={notices.retry} className="text-xs text-emerald-400 underline mt-3" disabled={notices.loading}>Refresh notices</button>
  </section>;
}
