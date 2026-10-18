import { useEffect, useRef, useState } from "react";
import { usePrivateResource } from "../utils/usePrivateResource";
import { correlationCsv } from "../../../supabase/functions/server/clinical-correlation.mjs";

type Statistic = {rho:number|null;reason:string|null;n:number};
type Correlation = {device:{device_id:string}|null;analysis:null|{population:string;horizon:number;days:number;pairs:any[];vas:Statistic;tnss:Statistic;excluded:Record<string,number>};historical?:boolean;history_truncated?:boolean;collection?:string};
const resultLabel = (stat:Statistic) => stat.rho===null ? stat.reason==="constant_values"?"Unavailable: values do not vary.":"Insufficient matched days (minimum 7)." : `ρ = ${stat.rho.toFixed(3)}`;
export function ClinicalCorrelation({ diaryRevision }: {diaryRevision?:string}) {
  const [days,setDays]=useState(30),[horizon,setHorizon]=useState(6),[historical,setHistorical]=useState(false);
  const resource=usePrivateResource<Correlation>(`/clinical-correlation?days=${days}&horizon=${horizon}${historical?"&historical=1":""}`);
  const previousDiary=useRef(diaryRevision);
  useEffect(()=>{if(previousDiary.current!==diaryRevision){previousDiary.current=diaryRevision;resource.retry();}},[diaryRevision]);
  const value=resource.data,analysis=value?.analysis;
  function download(){
    if(!analysis?.pairs.length)return;
    const url=URL.createObjectURL(new Blob([correlationCsv(analysis)],{type:"text/csv;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download=`ALLERT_correlation_${horizon}h_${days}days.csv`;document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section aria-labelledby="clinical-correlation-title" className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-6 mt-6 border border-zinc-800 shadow-xl">
    <h2 id="clinical-correlation-title" className="font-semibold">Correlation insights</h2>
    <p className="text-xs text-zinc-400 mt-2">Your VAS /10 and TNSS /12 remain separate from environmental measurements. PM concentration forecasts are not future allergy tiers.</p>
    <label className="flex gap-2 mt-3 text-xs text-zinc-400"><input type="checkbox" checked={historical} onChange={e=>setHistorical(e.target.checked)} />Show historical prior-policy analysis</label>
    <div className="flex flex-wrap gap-3 mt-4">
      <label className="text-xs text-zinc-400">Period<select aria-label="Correlation period" value={days} onChange={e=>setDays(Number(e.target.value))} className="block bg-zinc-800 rounded-lg p-2 mt-1 text-white">{[7,30,90].map(value=><option key={value} value={value}>{value} days</option>)}</select></label>
      <label className="text-xs text-zinc-400">Forecast horizon<select aria-label="Correlation forecast horizon" value={horizon} onChange={e=>setHorizon(Number(e.target.value))} className="block bg-zinc-800 rounded-lg p-2 mt-1 text-white">{[6,12,24].map(value=><option key={value} value={value}>{value} hours</option>)}</select></label>
    </div>
    {resource.loading?<p role="status" className="text-sm text-zinc-400 mt-4">Loading matched records…</p>:resource.error?<p role="alert" className="text-sm text-red-300 mt-4">{resource.error}</p>:!value?.device?<p className="text-sm text-zinc-400 mt-4">Link a node to build a matched history.</p>:analysis&&<>
      <p className="text-xs text-zinc-400 mt-4">{analysis.pairs.length} matched days · {analysis.population} · {value.device.device_id}</p>
      <dl className="grid grid-cols-1 gap-3 mt-3"><div><dt className="text-sm">Historical forecast tier ↔ VAS</dt><dd className="text-sm text-emerald-300">{resultLabel(analysis.vas)}</dd></div><div><dt className="text-sm">Historical forecast tier ↔ TNSS</dt><dd className="text-sm text-emerald-300">{resultLabel(analysis.tnss)}</dd></div></dl>
      <p className="text-xs text-zinc-500 mt-4">One closest matched report per Manila day, within 15 minutes of its forecast target. Only verified forecasts saved before the observation qualify. Legacy entries without observation times and median fallback estimates are excluded.</p>
      <p className="text-xs text-zinc-500 mt-2">{analysis.excluded.no_matching_forecast} reports have no matching forecast; {analysis.excluded.missing_observation_time} lack an observation time. No significance test or clinical validation is implied.</p>
      <p className="text-xs text-zinc-500 mt-2">{value.collection}</p>
      {value.history_truncated&&<p className="text-xs text-amber-300 mt-2">History is limited to loaded records; this is a partial analysis.</p>}
    </>}
    {!resource.loading && !resource.error && value?.device && !analysis && <p role="status" className="text-xs text-zinc-400 mt-4">{value.collection}</p>}
    <div className="flex flex-wrap gap-4 mt-4"><button type="button" onClick={resource.retry} disabled={resource.loading} className="allert-text-action disabled:opacity-50">Refresh correlation</button><button type="button" onClick={download} disabled={resource.loading||!!resource.error||!analysis?.pairs.length} className="allert-text-action disabled:opacity-50">Export matched pairs</button></div>
  </section>;
}
