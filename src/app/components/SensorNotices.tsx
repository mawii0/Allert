import { usePrivateResource } from "../utils/usePrivateResource";
import { displayTime } from "../utils/environment";
export function SensorNotices() {
  const notices=usePrivateResource<any>("/analytics-events");
  const value=notices.data;
  return <section id="sensor-notices" className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 mt-6" aria-label="Sensor notices">
    <h2 className="font-semibold">Sensor notices</h2>
    <p className="text-xs text-zinc-400 mt-2">Observed particulate changes, separate from forecasts and personal allergy probabilities.</p>
    {notices.loading?<p role="status" className="text-sm mt-3">Loading sensor notices…</p>:notices.error?<p role="alert" className="text-sm text-red-300 mt-3">{notices.error}</p>:<>
      <p className="text-xs text-zinc-400 mt-3">{!value?.device?"Link a node to see its notices.":!value.processorReady?"Worker activity is not confirmed. Current conditions may be unknown.":!value.fresh?"Readings are stale; recovery cannot be confirmed.":`Observed PM monitoring: ${(value.detector?.decision?.state || "reference warmup").replaceAll("_"," ")}.`}</p>
      {value?.device && !value.events?.length && <p className="text-sm mt-3">No stored sensor notices for this node.</p>}
      <div className="space-y-3 mt-3">{(value?.events || []).map((event:any)=><article key={event.id} className="rounded-lg border border-zinc-800 p-3">
        <div className="flex justify-between gap-3 text-sm"><strong className="capitalize">{event.phase?.replaceAll("_"," ")} observed PM event</strong><time className="text-xs text-zinc-400">{displayTime(event.observed_at)}</time></div>
        <p className="text-xs text-zinc-400 mt-2">Peak PM2.5: {event.event?.peaks?.pm2_5?.toFixed(2) ?? "—"} · PM10: {event.event?.peaks?.pm10?.toFixed(2) ?? "—"} µg/m³</p>
        <p className="text-xs text-zinc-500 mt-1">Prior-hour median/MAD and rise rate, or high concentration. Recovery requires three valid clear blocks.</p>
      </article>)}</div>
    </>}
    <button type="button" onClick={notices.retry} className="text-xs text-emerald-400 underline mt-3" disabled={notices.loading}>Refresh notices</button>
  </section>;
}
