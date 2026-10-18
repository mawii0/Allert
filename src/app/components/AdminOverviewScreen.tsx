import { useState } from "react";
import { useNavigate } from "react-router";
import { usePrivateResource } from "../utils/usePrivateResource";
import { AdminLoadState, AdminReadingChart, adminTime, formatNumber } from "./AdminLiveTools";
import {
  Activity,
  AlertTriangle,
  Bell,
  CloudLightning,
  Cpu,
  Database,
  MapPin,
  Radio,
  ShieldCheck,
  Signal,
} from "lucide-react";
import { AdminSearchBar } from "./AdminSearchBar";

const badgeStyles: Record<string, string> = {
  VALID: "bg-[#00c853]/10 text-[#00c853] border-[#00c853]/40",
  INTERPOLATED: "bg-[#ffd600]/10 text-[#ffd600] border-[#ffd600]/40",
  OFFLINE: "bg-[#ff1744]/10 text-[#ff1744] border-[#ff1744]/40",
  WATCH: "bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/40",
  WARNING: "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/40",
  CRITICAL: "bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/40",
};

function Badge({ label }: { label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
        badgeStyles[label] ?? "bg-white/5 text-white/70 border-white/10"
      }`}
    >
      {label}
    </span>
  );
}

const maximumMetric=(metrics:any,key:string)=>{const values=[metrics?.pm2_5?.[key],metrics?.pm10?.[key]].filter(Number.isFinite);return values.length?Math.max(...values):null;};
export function AdminOverviewScreen() {
  const resource=usePrivateResource<any>("/admin/overview"),navigate=useNavigate();
  const [search,setSearch]=useState("");
  const data=resource.data;
  const nodes=data?.nodes || [];
  const total=nodes.length,online=nodes.filter((node:any)=>node.online).length;
  const coverage=total && nodes.every((node:any)=>node.coverage!==null)?nodes.reduce((sum:number,node:any)=>sum+node.coverage,0)/total:null;
  const kpis=[
    {label:"Recent Sensors",value:data?`${online} / ${total}`:"—",subtext:"Recent valid PM readings · loaded nodes",accent:"#00c853",icon:Radio},
    {label:"Verified Blocks (24h)",value:coverage===null?"—":`${coverage.toFixed(1)}%`,subtext:"Receipt-verified coverage · loaded nodes",accent:"#00c853",icon:Database},
    {label:"Push Accepted (24h)",value:data?String(data.accepted_deliveries):"—",subtext:"Transport accepted; display is not confirmed",accent:"#ffd600",icon:Bell},
    {label:"Anomaly Events (24h)",value:data?String(data.anomaly_count):"—",subtext:"Stored measurement anomalies",accent:"#ff9100",icon:AlertTriangle},
  ];
  const sensors=nodes.filter((node:any)=>`${node.device.device_id} ${node.device.location_label}`.toLowerCase().includes(search.toLowerCase())).map((node:any)=>({
    id:node.device.device_id,location:node.device.location_label || "Home",lastSeen:adminTime(node.latest?.timestamp),
    quality:node.error?"UNAVAILABLE":!node.device.is_active?"DISABLED":node.online?node.latest.data_quality_status:"OFFLINE",status:node.online?"online":"offline",history:node.history,
    telemetry:[formatNumber(node.latest?.pm2_5,"µg/m³"),formatNumber(node.latest?.temperature,"°C"),formatNumber(node.latest?.humidity,"%"),formatNumber(node.latest?.pm10,"µg/m³")],
  }));
  const anomalies=(data?.events || []).filter((event:any)=>`${event.device_id} ${event.severity} ${event.classification}`.toLowerCase().includes(search.toLowerCase())).map((event:any)=>({
    id:event.id,time:adminTime(event.observed_at),node:event.device_id,type:(event.reading?.notice_kind || "historical").toUpperCase(),
    reference:formatNumber(maximumMetric(event.metrics,"baseline")),
    velocity:formatNumber(maximumMetric(event.metrics,"rate_ugm3_per_minute"),"µg/m³/min"),status:event.classification.replaceAll("_"," "),
  }));

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="flex">
        <aside className="hidden min-h-screen w-60 flex-col gap-6 border-r border-[#2a2a2a] bg-[#0f0f0f] px-5 py-6 lg:flex">
          <div className="flex items-center gap-3 text-lg font-semibold">
            <div className="h-9 w-9 rounded-xl bg-[#00bfa5]/20 text-[#00bfa5] flex items-center justify-center">
              <ShieldCheck className="h-5 w-5" />
            </div>
            ALLERT Admin
          </div>
          <nav className="space-y-2 text-sm text-[#b0b0b0]">
            <a href="/admin/overview" className="block rounded-xl bg-[#1e1e1e] px-3 py-2 text-white">Sensor Network</a>
            <div className="rounded-xl px-3 py-2 hover:bg-[#1e1e1e]">Node Detail · select a node below</div>
            <div className="rounded-xl px-3 py-2 hover:bg-[#1e1e1e]">Anomaly Review · select an event below</div>
            <div className="rounded-xl px-3 py-2 hover:bg-[#1e1e1e]">Calibration · not connected</div>
            <div className="rounded-xl px-3 py-2 hover:bg-[#1e1e1e]"><a href="/app/settings">System Health</a></div>
          </nav>
          <div className="mt-auto space-y-3 rounded-2xl border border-[#2a2a2a] bg-[#141414] p-4 text-xs text-[#b0b0b0]">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#00c853]" />
              <span className="text-white">{data ? "Live monitoring" : "Data unavailable"}</span>
            </div>
            <div className="font-mono">Last refresh: {adminTime(data?.generated_at)}</div>
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-[#00bfa5]" />
              Model status unavailable
            </div>
          </div>
        </aside>

        <main className="flex-1 px-6 py-6">
          <header className="flex flex-col gap-4 rounded-2xl border border-[#2a2a2a] bg-[#141414] px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#00bfa5]/20 text-[#00bfa5] flex items-center justify-center">
                <CloudLightning className="h-5 w-5" />
              </div>
              <div>
                <div className="text-lg font-semibold">Sensor Network Overview</div>
                <div className="text-xs text-[#b0b0b0]">Registered sensor network</div>
              </div>
            </div>
            <div className="flex flex-col gap-3 text-sm text-[#b0b0b0] lg:flex-row lg:items-center">
              <AdminSearchBar className="w-full lg:w-72" value={search} onChange={setSearch} placeholder="Search loaded nodes and events" />
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#00c853] animate-pulse" />
                  {resource.loading ? "Loading…" : resource.error ? "Unavailable" : "Live records"}
                </div>
                <div className="font-mono">Refreshed: {adminTime(data?.generated_at)}</div>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-[#1e1e1e] flex items-center justify-center">
                    <Signal className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-white">System Admin</div>
                    <div className="text-xs">Verified administrator</div>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className="mt-4"><AdminLoadState resource={resource} /><button type="button" onClick={resource.retry} disabled={resource.loading} className="text-xs text-[#00bfa5] underline mt-2">Refresh monitoring</button>{data?.truncated && <p className="text-xs text-amber-300 mt-2">Showing the first {nodes.length} of {data.total_nodes} registered nodes. Counts of recent sensors and coverage describe only loaded nodes.</p>}</div>
          <section className="mt-6 grid gap-4 lg:grid-cols-4">
            {kpis.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div
                  key={kpi.label}
                  className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-5 transition-colors hover:bg-[#1e1e1e]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#b0b0b0]">{kpi.label}</span>
                    <Icon className="h-4 w-4" style={{ color: kpi.accent }} />
                  </div>
                  <div className="mt-3 text-2xl font-semibold">{kpi.value}</div>
                  <div className="mt-1 text-xs text-[#b0b0b0]">{kpi.subtext}</div>
                </div>
              );
            })}
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {data && !sensors.length && <p className="text-sm text-zinc-400">No matching registered nodes.</p>}
              {sensors.map((sensor:any, index:number) => (
                <div
                  key={sensor.id}
                  className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-5"
                  style={
                    sensor.quality === "INTERPOLATED"
                      ? { borderColor: "#ffd600" }
                      : sensor.quality === "OFFLINE"
                      ? { borderColor: "#ff1744" }
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-sm">{sensor.id}</div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          sensor.status === "offline" ? "bg-[#ff1744]" : "bg-[#00c853]"
                        }`}
                      />
                      <Badge label={sensor.quality} />
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-[#b0b0b0]">
                    {sensor.location} - {sensor.lastSeen}
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2 text-xs text-[#b0b0b0]">
                    {sensor.telemetry.map((value, idx) => (
                      <div key={`${sensor.id}-${idx}`}>
                        <div className="text-white">{value}</div>
                        <div className="text-[10px]">
                          {idx === 0
                            ? "PM2.5"
                            : idx === 1
                            ? "Temp"
                            : idx === 2
                            ? "Humidity"
                            : "PM10"}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs">
                    <AdminReadingChart rows={sensor.history} small />
                    <button onClick={()=>navigate(`/admin/sensor-detail?node=${encodeURIComponent(sensor.id)}`)} className="text-[#00bfa5]">View Detail</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-5">
              <div className="mb-4 text-sm font-semibold">Anomaly Event Log</div>
              <div className="grid gap-3 overflow-x-auto text-xs text-[#b0b0b0]">
                <div className="min-w-[600px] grid grid-cols-[70px_90px_1fr_70px_90px_100px] gap-2 text-[11px] uppercase">
                  <span>Time</span>
                  <span>Node</span>
                  <span>Type</span>
                  <span>PM Median</span>
                  <span>Rise/min</span>
                  <span>Status</span>
                </div>
                {data && !anomalies.length && <p className="text-sm text-zinc-400">No matching stored anomaly events.</p>}
                {anomalies.map((entry:any) => (
                  <div
                    key={entry.id}
                    className="min-w-[600px] grid grid-cols-[70px_90px_1fr_70px_90px_100px] items-center gap-2 rounded-xl border border-transparent px-2 py-2 hover:border-[#2a2a2a] hover:bg-[#1e1e1e]"
                  >
                    <button onClick={()=>navigate(`/admin/anomaly-investigation?event=${entry.id}`)} className="font-mono text-[#00bfa5] underline text-left">{entry.time}</button>
                    <span className="font-mono">{entry.node}</span>
                    <Badge label={entry.type} />
                    <span>{entry.reference}</span>
                    <span>{entry.velocity}</span>
                    <span className="text-white">{entry.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm font-semibold">Calibration Drift Monitor</div>
              <div className="text-xs text-[#b0b0b0]">Reference measurements required</div>
            </div>
            <div className="relative h-60 w-full flex items-center justify-center text-sm text-zinc-400">No matched calibration/reference data has been recorded. Drift and MAE are unavailable.</div>
          </section>
        </main>
      </div>
    </div>
  );
}
