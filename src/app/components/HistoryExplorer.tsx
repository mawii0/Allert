import { useState } from "react";
import type { SensorReading } from "../utils/telemetry";
import { historyRows, formatMeasurement, formatSampleTime, qualityPresentation } from "../utils/sample-history.mjs";

const metrics = [
  { key: "pm2_5", label: "PM2.5", unit: "μg/m³", color: "#f59e0b" },
  { key: "pm10", label: "PM10", unit: "μg/m³", color: "#fb923c" },
  { key: "temperature", label: "Temp", unit: "°C", color: "#60a5fa" },
  { key: "humidity", label: "Humidity", unit: "%", color: "#22d3ee" },
] as const;
export function HistoryExplorer({ readings, end, deviceId, replay=false }: {readings:SensorReading[];end:number;deviceId:string;replay?:boolean}) {
  const [metricIndex,setMetricIndex]=useState(0);
  const [hours,setHours]=useState(24);
  const [selectedTime,setSelectedTime]=useState<string|null>(null);
  const [details,setDetails]=useState(false);
  const [page,setPage]=useState(0);
  const metric=metrics[metricIndex];
  const rows:SensorReading[]=historyRows(readings,end,deviceId).filter((r:SensorReading)=>Date.parse(r.timestamp)>end-hours*3600000);
  const selected=rows.find(r=>r.timestamp===selectedTime)??rows[0];
  const valid=(r:SensorReading)=>qualityPresentation(r.data_quality_status).tone==="valid" && typeof r[metric.key]==="number" && Number.isFinite(r[metric.key]);
  const values=rows.filter(valid).map(r=>r[metric.key] as number).sort((a,b)=>a-b);
  const median=values.length ? (values[Math.floor((values.length-1)/2)]+values[Math.floor(values.length/2)])/2 : null;
  const low=values[0]??0, high=values.at(-1)??1, range=Math.max(high-low,1);
  const x=(r:SensorReading)=>40+(Date.parse(r.timestamp)-(end-hours*3600000))/(hours*3600000)*290;
  const y=(r:SensorReading)=>140-((r[metric.key] as number)-low)/range*110;
  const segments:string[]=[];
  let segment="", previous=0;
  for(const row of [...rows].reverse()) {
    const time=Date.parse(row.timestamp);
    if(!valid(row) || (previous && time-previous>450000)) {if(segment)segments.push(segment);segment="";}
    if(valid(row)) segment+=`${segment?" L":"M"}${x(row)},${y(row)}`;
    previous=time;
  }
  if(segment)segments.push(segment);
  const pages=Math.max(1,Math.ceil(rows.length/12));
  const currentPage=Math.min(page,pages-1);
  const button="min-h-10 rounded-lg px-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400";
  return <section className="mt-3 rounded-xl border border-emerald-900/60 bg-zinc-900/80 p-4" aria-label="Environmental history explorer">
    <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-zinc-100">{details?"Sample details":"History Explorer"}</h2><span className="text-xs text-emerald-300">{rows.length} {rows.length===1?"sample":"samples"}</span></div>
    <p className="mt-1 text-xs text-zinc-400">{replay?"Recorded replay samples":"Five-minute sensor history"} · Manila time</p>
    {details ? <>
      <button className={`${button} mt-3 bg-emerald-900/40 text-emerald-300`} onClick={()=>setDetails(false)}>← Back to chart</button>
      <p className="my-3 text-xs text-zinc-400">{hours}-hour window · Newest first · Page {currentPage+1} of {pages}</p>
      {rows.slice(currentPage*12,currentPage*12+12).map(r=><article key={r.timestamp} className="mb-2 rounded-lg border border-zinc-800 p-3">
        <p className="text-xs text-zinc-300">{formatSampleTime(r.timestamp)}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">{metrics.map(m=><p key={m.key} className="text-xs text-zinc-400">{m.label}: <span className="text-zinc-100">{formatMeasurement(r[m.key])} {m.unit}</span></p>)}</div>
        <Quality value={r.data_quality_status}/>
      </article>)}
      <div className="flex justify-between gap-2"><button className={`${button} bg-zinc-800 disabled:opacity-40`} disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Previous</button><button className={`${button} bg-zinc-800 disabled:opacity-40`} disabled={currentPage===pages-1} onClick={()=>setPage(currentPage+1)}>Next</button></div>
    </> : <>
      <div className="mt-4 grid grid-cols-4 gap-1" aria-label="History metric">{metrics.map((m,i)=><button key={m.key} aria-pressed={metricIndex===i} className={`${button} ${metricIndex===i?"bg-emerald-600 text-white":"bg-zinc-800 text-zinc-400"}`} onClick={()=>setMetricIndex(i)}>{m.label}</button>)}</div>
      <div className="mt-2 grid grid-cols-3 gap-1" aria-label="History window">{[1,6,24].map(h=><button key={h} aria-pressed={hours===h} className={`${button} ${hours===h?"bg-emerald-900/60 text-emerald-300":"text-zinc-400"}`} onClick={()=>{setHours(h);setSelectedTime(null);setPage(0);}}>{h===1?"Last hour":`${h} hours`}</button>)}</div>
      <p className="mt-3 text-xs text-zinc-400">{metric.label} ({metric.unit}) · Tap the chart to inspect a sample</p>
      {rows.length ? <>
        <svg viewBox="0 0 350 180" className="mt-2 w-full touch-pan-y" role="img" aria-label={`${metric.label} over the last ${hours} hours. Gaps indicate missing or unverified data.`} style={{touchAction:"pan-y"}} onClick={event=>{
          const box=event.currentTarget.getBoundingClientRect();const target=end-hours*3600000+(((event.clientX-box.left)/box.width*350-40)/290)*hours*3600000;
          const closest=rows.reduce((a,b)=>Math.abs(Date.parse(a.timestamp)-target)<Math.abs(Date.parse(b.timestamp)-target)?a:b);setSelectedTime(closest.timestamp);
        }}>
          {[30,85,140].map((line,i)=><g key={line}><line x1="40" x2="330" y1={line} y2={line} stroke="#27272a"/><text x="2" y={line+4} fill="#a1a1aa" fontSize="10">{formatMeasurement(low+range-i*range/2)}</text></g>)}
          {segments.map((d,i)=><path key={i} d={d} fill="none" stroke={metric.color} strokeWidth="2"/>)}
          {rows.length===1 && valid(rows[0]) && <circle cx={x(rows[0])} cy={y(rows[0])} r="3" fill={metric.color}/>}
          {selected && valid(selected) && <circle cx={x(selected)} cy={y(selected)} r="4" fill={metric.color} stroke="#fff"/>}
          <text x="40" y="170" fill="#a1a1aa" fontSize="10">−{hours}h</text><text x="315" y="170" fill="#a1a1aa" fontSize="10">End</text>
        </svg>
        {!values.length && <p className="text-xs text-amber-300">No verified values for this metric. Select a sample to inspect its quality.</p>}
        <label className="mt-2 block text-xs text-zinc-400">Inspect sample <input className="mt-2 w-full accent-emerald-500" type="range" min="0" max={Math.max(rows.length-1,0)} value={Math.max(0,rows.findIndex(r=>r.timestamp===selected?.timestamp))} onChange={event=>setSelectedTime(rows[Number(event.target.value)].timestamp)}/></label>
        <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3" aria-live="polite"><p className="text-xs text-zinc-300">{formatSampleTime(selected.timestamp)} (Manila)</p><div className="mt-2 grid grid-cols-2 gap-2">{metrics.map(m=><p key={m.key} className="text-xs text-zinc-400">{m.label} <span className="text-zinc-100">{formatMeasurement(selected[m.key])} {m.unit}</span></p>)}</div><Quality value={selected.data_quality_status}/></div>
        <div className="mt-3 grid grid-cols-3 gap-2">{[["Latest",valid(rows[0])?rows[0][metric.key]:null],["Median",median],["Highest",values.at(-1)]].map(([label,value])=><div key={label as string} className="rounded-lg bg-zinc-800/60 p-2"><p className="text-[10px] text-zinc-400">{label}</p><p className="text-sm text-zinc-100">{formatMeasurement(value)}</p></div>)}</div>
        <p className="mt-2 text-[10px] text-zinc-400">{values.length} verified values / {hours*12} expected five-minute samples. Summaries use verified values only; lines break across missing samples.</p>
      </> : <p className="py-10 text-center text-xs text-zinc-400">No five-minute samples in this window.</p>}
      <button className={`${button} mt-4 w-full border border-emerald-900 text-emerald-300`} onClick={()=>{setPage(0);setDetails(true);}}>View readings</button>
    </>}
  </section>;
}
function Quality({value}:{value:unknown}) {const q=qualityPresentation(value);return <p className={`mt-2 text-xs ${q.tone==="valid"?"text-emerald-300":q.tone==="invalid"?"text-red-300":"text-zinc-400"}`}>Quality: {q.label}</p>;}
