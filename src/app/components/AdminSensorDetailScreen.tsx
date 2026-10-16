import { useState } from "react";
import { useSearchParams } from "react-router";
import { usePrivateResource } from "../utils/usePrivateResource";
import { metricTrend } from "../utils/telemetry-analysis.mjs";
import { AdminLoadState, AdminReadingChart, adminTime, formatNumber, downloadNodeCsv } from "./AdminLiveTools";
import {
  Clipboard,
  Download,
  Gauge,
  LineChart,
  MapPin,
  RefreshCw,
  Signal,
  Thermometer,
  Wifi,
} from "lucide-react";
import { AdminSearchBar } from "./AdminSearchBar";

type GaugeData={label:string;value:string;trend:string;status:string;color:string;icon:any};

function GaugeCard({
  label,
  value,
  trend,
  status,
  color,
  icon: Icon,
}: GaugeData) {
  return (
    <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#b0b0b0]">{label}</span>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="relative h-16 w-16">
          <svg viewBox="0 0 72 72" className="h-full w-full">
            <circle
              cx="36"
              cy="36"
              r="28"
              fill="none"
              stroke="#2a2a2a"
              strokeWidth="6"
            />
            <circle
              cx="36"
              cy="36"
              r="28"
              fill="none"
              stroke={color}
              strokeWidth="6"
              strokeDasharray="175"
              strokeDashoffset={value === "—" ? "175" : "0"}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold">
            {status}
          </div>
        </div>
        <div>
          <div className="text-lg font-semibold">{value}</div>
          <div className="text-xs text-[#b0b0b0]">{trend}</div>
        </div>
      </div>
    </div>
  );
}

export function AdminSensorDetailScreen() {
  const [params]=useSearchParams(),node=params.get("node");
  const resource=usePrivateResource<any>(node?`/admin/nodes/${encodeURIComponent(node)}`:null);
  const [search,setSearch]=useState("");
  const data=resource.data,current=data?.latest,history=data?.history || [];
  const end=Date.parse(data?.generated_at || "") || Date.now();
  const metadataSections=[
    {title:"Identity",items:[{label:"Node ID",value:data?.device.device_id || node || "Select a node"},{label:"Location",value:data?.device.location_label || "Not recorded"},{label:"Hardware Rev",value:"Not recorded"},{label:"Firmware",value:"Not reported"}]},
    {title:"Hardware",items:[{label:"SPS30 Serial",value:"Not reported"},{label:"SHT40 Serial",value:"Not reported"},{label:"Microcontroller",value:"Not reported by firmware"}]},
    {title:"Calibration",items:[{label:"Last Co-Location",value:"Not recorded"},{label:"R2 vs DENR-EMB",value:"Not calculated"},{label:"Post-cal MAE",value:"Not calculated"},{label:"Next Calibration",value:"Not scheduled"}]},
    {title:"Operational",items:[{label:"Uptime",value:"Not reported"},{label:"Readings shown (24h)",value:data?String(history.length):"—"},{label:"Last reading",value:adminTime(current?.timestamp)},{label:"WiFi signal",value:"Not reported"}]},
  ];
  const gauges=[
    {key:"pm2_5",label:"PM2.5",icon:Gauge,unit:"µg/m³"},{key:"pm10",label:"PM10",icon:Gauge,unit:"µg/m³"},
    {key:"temperature",label:"Temperature",icon:Thermometer,unit:"°C"},{key:"humidity",label:"Humidity",icon:LineChart,unit:"%"},
  ].filter(item=>item.label.toLowerCase().includes(search.toLowerCase())).map(item=>({label:item.label,value:formatNumber(current?.[item.key],item.unit),trend:metricTrend(history,item.key),status:current?"Observed":"Unavailable",color:"#3b82f6",icon:item.icon}));
  const forecastRows=[6,12,24].map(hour=>({horizon:`${hour}h`,mae:"—",rmse:"—",mape:"—",status:"Evaluation report unavailable",badge:"#6b7280"}));
  const qualityCounts=Array.from({length:24},(_,hour)=>new Set(history.filter((row:any)=>row.data_quality_status==="VALID" && row.sample_count===30 && row.expected_samples===30 && row.created_at && Date.parse(row.timestamp)>end-86400000+hour*3600000 && Date.parse(row.timestamp)<=end-86400000+(hour+1)*3600000).map((row:any)=>Math.floor(Date.parse(row.timestamp)/300000))).size);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col gap-6 px-6 py-6 lg:flex-row">
        <aside className="w-full shrink-0 rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6 lg:w-[360px]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-[#b0b0b0]">Sensor Detail</div>
              <div className="text-lg font-semibold">{node || "Select a node"}</div>
            </div>
            <div className="flex items-center gap-2 text-[#b0b0b0]">
              <MapPin className="h-4 w-4" />
              {data?.device.location_label || "Location not recorded"}
            </div>
          </div>

          <div className="mt-6 space-y-6">
            {metadataSections.map((section) => (
              <div key={section.title}>
                <div className="mb-3 text-sm font-semibold">{section.title}</div>
                <div className="space-y-2 text-sm text-[#b0b0b0]">
                  {section.items.map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span>{item.label}</span>
                      <span className="text-white">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-3">
            <button disabled title="Remote calibration is not connected" className="w-full disabled:opacity-40 rounded-xl bg-[#00bfa5] px-4 py-2 text-sm font-semibold text-[#0a0a0a]">
              Trigger Remote Calibration
            </button>
            <button disabled={!history.length} onClick={()=>downloadNodeCsv(node || "node",history)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#2a2a2a] px-4 py-2 text-sm disabled:opacity-40">
              <Download className="h-4 w-4" />
              Download Raw Data (CSV)
            </button>
            <button disabled title="Remote maintenance is not connected" className="flex w-full disabled:opacity-40 items-center justify-center gap-2 rounded-xl border border-[#ff1744]/40 bg-[#ff1744]/10 px-4 py-2 text-sm text-[#ff1744]">
              Flag for Maintenance
            </button>
          </div>
        </aside>

        <main className="flex-1 space-y-6">
          <header className="flex flex-col gap-3 rounded-2xl border border-[#2a2a2a] bg-[#141414] px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs text-[#b0b0b0]">Realtime Telemetry</div>
              <div className="text-lg font-semibold">{data ? data.online ? "Node Status · Recent verified reading" : "Node Status · No recent verified reading" : "Node Status · Unavailable"}</div>
            </div>
            <AdminSearchBar className="w-full lg:w-80" value={search} onChange={setSearch} placeholder="Filter current metrics" />
            <div className="flex items-center gap-3 text-xs text-[#b0b0b0]">
              <Wifi className="h-4 w-4" />
              Signal not reported
              <Signal className="h-4 w-4" />
              {data ? `${data.coverage.toFixed(1)}% receipt-verified coverage` : "Coverage unavailable"}
            </div>
          </header>

          <div><a href="/admin/overview" className="text-xs text-[#00bfa5] underline">Back to sensor network</a><AdminLoadState resource={resource} missing="Select a node using View Detail on the overview." /><button disabled={resource.loading || !node} onClick={resource.retry} className="text-xs text-[#00bfa5] underline mt-2">Refresh node</button>{data?.truncated && <p className="text-xs text-amber-300">This 24-hour result reached its 1,000-row limit.</p>}</div>
          <section className="grid gap-4 lg:grid-cols-4">
            {gauges.map((gauge) => (
              <GaugeCard key={gauge.label} {...gauge} />
            ))}
          </section>

          <section className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">24-Hour Trend</div>
                <div className="text-xs text-[#b0b0b0]">Recorded PM2.5 · µg/m³</div>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#b0b0b0]">
                <RefreshCw className="h-4 w-4" />
                Refreshed every minute
              </div>
            </div>
            <div className="mt-4 h-[320px] rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-4">
              <AdminReadingChart rows={history} width={680} height={250} end={end} />
            </div>
          </section>

          <section className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6">
            <div className="text-sm font-semibold">Data Quality Timeline</div>
            <div
              className="mt-4 grid gap-1"
              style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}
            >
              {Array.from({ length: 24 }).map((_, idx) => {
                const count=qualityCounts[idx];
                const color=count>=12?"bg-[#00c853]":count>0?"bg-[#ffd600]":"bg-zinc-700";
                return <div key={idx} title={`${count}/12 verified blocks`} className={`h-4 rounded-sm ${color}`} />;
              })}
            </div>
            <div className="mt-2 text-xs text-[#b0b0b0]">24h timeline, 1h segments · green: 12 verified blocks, amber: partial, gray: none</div>
          </section>

          <section className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6">
            <div className="mb-4 text-sm font-semibold">Forecast Accuracy Tracker</div>
            <div className="grid gap-2 overflow-x-auto text-xs text-[#b0b0b0]">
              <div className="min-w-[620px] grid grid-cols-[70px_120px_120px_120px_1fr] gap-2 text-[11px] uppercase">
                <span>Horizon</span>
                <span>MAE</span>
                <span>RMSE</span>
                <span>MAPE</span>
                <span>Status</span>
              </div>
              {forecastRows.map((row) => (
                <div
                  key={row.horizon}
                  className="min-w-[620px] grid grid-cols-[70px_120px_120px_120px_1fr] items-center gap-2 rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-2"
                >
                  <span className="font-mono text-white">{row.horizon}</span>
                  <span>{row.mae}</span>
                  <span>{row.rmse}</span>
                  <span>{row.mape}</span>
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: row.badge }}
                    />
                    {row.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
