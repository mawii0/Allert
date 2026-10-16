import { useSearchParams } from "react-router";
import { usePrivateResource } from "../utils/usePrivateResource";
import { useAdminReview } from "../utils/useAdminReview";
import { AdminLoadState, AdminReadingChart, adminTime, formatNumber } from "./AdminLiveTools";
import {
  AlertTriangle,
  CalendarClock,
  Clipboard,
  FileText,
  MapPin,
  ShieldAlert,
} from "lucide-react";
import { AdminSearchBar } from "./AdminSearchBar";

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold"
      style={{ borderColor: color, color }}
    >
      {label}
    </span>
  );
}

export function AdminAnomalyInvestigationScreen() {
  const [params]=useSearchParams(),eventId=params.get("event");
  const resource=usePrivateResource<any>(eventId?`/admin/anomalies/${encodeURIComponent(eventId)}`:null);
  const event=resource.data?.event,review=useAdminReview(resource,eventId);
  const metrics=event?.metrics || {};
  const maximum=(key:string)=>event?Math.max(metrics.pm2_5?.[key] || 0,metrics.pm10?.[key] || 0):null;
  const metadata=[
    {label:"Anomaly ID",value:event?.id || "Select an event"},{label:"Timestamp",value:adminTime(event?.observed_at)},
    {label:"Triggering Node",value:event?.device_id || "—"},{label:"Detection Method",value:event?[...new Set(Object.values(metrics).flatMap((value:any)=>value.methods || []))].join(" + ") || "Recorded rule": "—"},
    {label:"Z-Score",value:formatNumber(maximum("z")),badge:"#ef4444"},{label:"Velocity",value:formatNumber(maximum("velocity"),"µg/m³/h"),badge:"#ef4444"},
    {label:"CUSUM Score",value:formatNumber(maximum("cusum")),badge:"#f59e0b"},{label:"Risk Output",value:"Observed measurement anomaly; no symptom probability",badge:"#6b7280"},
  ];
  const comparisonRows=[{metric:"PM2.5",key:"pm2_5",unit:"µg/m³"},{metric:"PM10",key:"pm10",unit:"µg/m³"},{metric:"Temperature",key:"temperature",unit:"°C"},{metric:"Humidity",key:"humidity",unit:"%"}].map(item=>({
    metric:item.metric,forecast:formatNumber(metrics[item.key]?.mean,item.unit),observed:formatNumber(event?.reading?.[item.key],item.unit),
    deviation:typeof metrics[item.key]?.mean==="number"?formatNumber(event.reading[item.key]-metrics[item.key].mean,item.unit):"—",color:"#b0b0b0",
  }));
  const history=event?[...(event.baseline || []),{...event.reading,timestamp:event.observed_at}]:[];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-[1200px] space-y-6 px-6 py-8">
        <header className="flex flex-col gap-4 rounded-2xl border border-[#2a2a2a] bg-[#141414] px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs text-[#b0b0b0]">Anomaly Investigation</div>
            <div className="text-lg font-semibold">{event ? `${event.severity.toUpperCase()} measurement event` : "Select an anomaly event"}</div>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <a href="/admin/overview" className="text-xs text-[#00bfa5] underline">Back to sensor network</a>
            <div className="flex items-center gap-3 text-xs text-[#b0b0b0]">
              <CalendarClock className="h-4 w-4" />
              {adminTime(event?.observed_at)} · Manila
            </div>
          </div>
        </header>

        <div><AdminLoadState resource={resource} missing="Select an event from the overview." /><button disabled={resource.loading || !eventId || review.busy} onClick={resource.retry} className="text-xs text-[#00bfa5] underline">Refresh event</button></div>
        <section className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6">
          <div className="mb-4 text-sm font-semibold">Event Metadata</div>
          <div className="grid gap-3 md:grid-cols-2">
            {metadata.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] px-4 py-3 text-sm"
              >
                <span className="text-[#b0b0b0]">{item.label}</span>
                <span className="flex items-center gap-2">
                  {item.badge ? <Badge label={item.value} color={item.badge} /> : item.value}
                  {item.label === "Anomaly ID" && (
                    <Clipboard className="h-4 w-4 text-[#b0b0b0]" />
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6">
            <div className="mb-4 text-sm font-semibold">Baseline vs Observed</div>
            <div className="grid gap-2 text-sm text-[#b0b0b0]">
              <div className="grid grid-cols-[120px_1fr_1fr_1fr] gap-2 text-[11px] uppercase">
                <span>Metric</span>
                <span>Baseline mean</span>
                <span>Observed</span>
                <span>Deviation</span>
              </div>
              {comparisonRows.map((row) => (
                <div
                  key={row.metric}
                  className="grid grid-cols-[120px_1fr_1fr_1fr] items-center gap-2 rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-2"
                >
                  <span className="text-white">{row.metric}</span>
                  <span>{row.forecast}</span>
                  <span>{row.observed}</span>
                  <span style={{ color: row.color }}>{row.deviation}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6">
            <div className="mb-4 text-sm font-semibold">Temporal Context</div>
            <div className="h-[260px] rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-4">
              <AdminReadingChart rows={history} height={190} lookback={65*60000} end={Date.parse(event?.observed_at || "") || Date.now()} />
              <div className="mt-2 text-xs text-[#b0b0b0]">Observed PM2.5 with preceding baseline blocks. No forecast overlay is connected.</div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6">
            <div className="mb-4 text-sm font-semibold">Cross-Sensor Correlation</div>
            <div className="h-[240px] rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-4">
              <p className="text-sm text-zinc-400">Matched cross-sensor data is not connected. No correlation has been calculated.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6">
            <div className="mb-4 text-sm font-semibold">DENR-EMB Reference Overlay</div>
            <div className="h-[240px] rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-4">
              <p className="text-sm text-zinc-400">DENR-EMB reference data is not connected. No reference overlay is available.</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <ShieldAlert className="h-4 w-4 text-[#ff1744]" />
            Manual Classification
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="text-xs text-[#b0b0b0]">Classification</div>
              <select aria-label="Anomaly classification" value={review.classification} disabled={review.busy || !event} onChange={change=>review.setClassification(change.target.value)} className="w-full rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-3 text-sm">
                {["investigating","confirmed_anomaly","false_positive","sensor_artifact","external_event"].map(option=><option key={option} value={option}>{option.replaceAll("_"," ")}</option>)}
              </select>
              <p className="text-xs text-zinc-400">Classification is saved with the authenticated administrator and a revision history.</p>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-[#b0b0b0]">Notes</div>
                <textarea
                  className="mt-2 h-[140px] w-full rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-3 text-sm text-white"
                  aria-label="Investigation notes" value={review.notes} maxLength={500} disabled={review.busy || !event} onChange={change=>review.setNotes(change.target.value)}
                  placeholder="Add investigation notes (max 500 chars)"
                />
              </div>
              <div>
                <div className="text-xs text-[#b0b0b0]">Attachments</div>
                <div className="mt-2 flex items-center justify-between rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] px-4 py-3 text-sm">
                  <div className="flex items-center gap-2 text-[#b0b0b0]">
                    <FileText className="h-4 w-4" />
                    Attachments are not connected
                  </div>
                  <button disabled className="rounded-lg border border-[#2a2a2a] px-3 py-1 text-xs opacity-40">
                    Browse
                  </button>
                </div>
              </div>
              <button disabled={!review.canSave} onClick={()=>{void review.save();}} className="w-full disabled:opacity-40 rounded-xl bg-[#00bfa5] px-4 py-2 text-sm font-semibold text-[#0a0a0a]">
                {review.busy ? "Saving…" : "Save Classification"}
              </button>
              <button disabled={review.busy} onClick={review.cancel} className="text-xs text-[#00bfa5] underline">Cancel and reload review</button>
              {review.error && <p role="alert" className="text-xs text-red-300">{review.error}</p>}{review.message && <p role="status" className="text-xs text-emerald-300">{review.message}</p>}
              {(resource.data?.reviews || []).map((item:any)=><p key={item.revision} className="text-xs text-zinc-400">Revision {item.revision}: {item.classification.replaceAll("_"," ")} · {adminTime(item.created_at)} · {item.notes}</p>)}
            </div>
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#2a2a2a] bg-[#141414] px-6 py-4 text-xs text-[#b0b0b0]">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            {event?.device_id || "No event selected"}
          </div>
          <div className="flex items-center gap-2">
            <Clipboard className="h-4 w-4" />
            Delivery: {(resource.data?.deliveries || []).map((item:any)=>item.status).join(", ") || "No browser delivery recorded"}
          </div>
        </section>
      </div>
    </div>
  );
}
