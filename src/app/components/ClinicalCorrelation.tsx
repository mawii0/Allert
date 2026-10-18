import { useEffect, useRef, useState } from "react";
import { usePrivateResource } from "../utils/usePrivateResource";
import { correlationCsv } from "../../../supabase/functions/server/clinical-correlation.mjs";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
    <div className="flex flex-wrap gap-5 mt-4">
      <label className="text-xs text-zinc-400">Period<select aria-label="Correlation period" value={days} onChange={e=>setDays(Number(e.target.value))} className="block min-w-28 bg-zinc-800 rounded-lg px-3 py-2 mt-2 text-white">{[7,30,90].map(value=><option key={value} value={value}>{value} days</option>)}</select></label>
      <label className="text-xs text-zinc-400">Forecast horizon<select aria-label="Correlation forecast horizon" value={horizon} onChange={e=>setHorizon(Number(e.target.value))} className="block min-w-28 bg-zinc-800 rounded-lg px-3 py-2 mt-2 text-white">{[6,12,24].map(value=><option key={value} value={value}>{value} hours</option>)}</select></label>
    </div>
    {resource.loading?<p role="status" className="text-sm text-zinc-400 mt-4">Loading matched records…</p>:resource.error?<p role="alert" className="text-sm text-red-300 mt-4">{resource.error}</p>:!value?.device?<p className="text-sm text-zinc-400 mt-4">Link a node to build a matched history.</p>:analysis&&<>
      <p className="text-xs text-zinc-400 mt-4">{analysis.pairs.length} matched days · {analysis.population} · {value.device.device_id}</p>
      {analysis.pairs.length > 0 && <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-950/50 p-3">
        <h3 className="text-sm font-semibold">Recorded risk score and symptoms</h3>
        <p className="mt-1 text-xs text-zinc-400">Horizontal: forecast environmental score /100 · Vertical: TNSS /12 and VAS /10</p>
        <div role="img" aria-label="Line graph of matched forecast risk score against TNSS and VAS scores" className="mt-3 h-60">
          <ResponsiveContainer width="100%" height="100%"><LineChart data={[...analysis.pairs].sort((a,b)=>a.score-b.score)} margin={{top:8,right:4,bottom:8,left:-18}}>
            <CartesianGrid stroke="#3f3f46" strokeDasharray="3 3" />
            <XAxis dataKey="score" type="number" domain={[0,100]} stroke="#a1a1aa" tick={{fontSize:10}} label={{value:"Risk score",position:"insideBottom",offset:-5,fill:"#a1a1aa",fontSize:10}} />
            <YAxis yAxisId="tnss" domain={[0,12]} stroke="#60a5fa" tick={{fontSize:10}} />
            <YAxis yAxisId="vas" orientation="right" domain={[0,10]} stroke="#facc15" tick={{fontSize:10}} />
            <Tooltip contentStyle={{backgroundColor:"#18181b",border:"1px solid #3f3f46"}} />
            <Legend verticalAlign="top" />
            <Line dataKey="tnss" name="TNSS /12" yAxisId="tnss" stroke="#60a5fa" strokeWidth={2} dot={{r:3}} />
            <Line dataKey="vas" name="VAS /10" yAxisId="vas" stroke="#facc15" strokeWidth={2} dot={{r:3}} />
          </LineChart></ResponsiveContainer>
        </div>
      </div>}
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
