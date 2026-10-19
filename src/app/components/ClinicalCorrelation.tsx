import "../../styles/patient-actions.css";
import { useEffect, useRef, useState } from "react";
import { usePrivateResource } from "../utils/usePrivateResource";
import { correlationCsv } from "../../../supabase/functions/server/clinical-correlation.mjs";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Statistic = {rho:number|null;reason:string|null;n:number};
type Correlation = {device:{device_id:string}|null;analysis:null|{population:string;horizon:number;days:number;pairs:any[];vas:Statistic;tnss:Statistic;excluded:Record<string,number>};historical?:boolean;history_truncated?:boolean;collection?:string};
const resultLabel = (stat:Statistic) => stat.rho===null ? stat.reason==="constant_values"?"Scores stayed the same, so there is not enough variation to compare.":"Not enough matched days yet (at least 7 are needed)." : `ρ = ${stat.rho.toFixed(3)}`;
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
    <p className="text-xs text-zinc-400 mt-2">See whether changes in air conditions tend to happen alongside stronger symptoms in your saved reports. Similar patterns do not prove a cause.</p>
    <p className="text-xs text-zinc-400 mt-2">VAS measures overall discomfort (0–10). TNSS totals four nasal symptoms (0–12).</p>
    <label className="flex gap-2 mt-3 text-xs text-zinc-400"><input type="checkbox" checked={historical} onChange={e=>setHistorical(e.target.checked)} />Show older-model comparisons</label>
    <div className="allert-correlation-controls">
      <label className="text-xs text-zinc-400">Time period<select aria-label="Correlation period" value={days} onChange={e=>setDays(Number(e.target.value))} className="block min-w-28 bg-zinc-800 rounded-lg px-3 py-2 mt-2 text-white">{[7,30,90].map(value=><option key={value} value={value}>{value} days</option>)}</select></label>
      <label className="text-xs text-zinc-400">Prediction ahead<select aria-label="Correlation forecast horizon" value={horizon} onChange={e=>setHorizon(Number(e.target.value))} className="block min-w-28 bg-zinc-800 rounded-lg px-3 py-2 mt-2 text-white">{[6,12,24].map(value=><option key={value} value={value}>{value} hours</option>)}</select></label>
    </div>
    {resource.loading?<p role="status" className="text-sm text-zinc-400 mt-4">Finding matching diary entries and environmental records…</p>:resource.error?<p role="alert" className="text-sm text-red-300 mt-4">{resource.error}</p>:!value?.device?<p className="text-sm text-zinc-400 mt-4">Link a node to compare its readings with your diary.</p>:analysis&&<>
      <p className="text-xs text-zinc-400 mt-4">{analysis.pairs.length} matched days · {analysis.population} · {value.device.device_id}</p>
      {analysis.pairs.length > 0 && <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-950/50 p-3">
        <h3 className="text-sm font-semibold">Environmental scores and your symptoms</h3>
        <p className="mt-1 text-xs text-zinc-400">The graph compares older forecast scores with the symptoms you reported.</p>
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
      <dl className="grid grid-cols-1 gap-3 mt-3"><div><dt className="text-sm">Air conditions and overall discomfort (VAS)</dt><dd className="text-sm text-emerald-300">{resultLabel(analysis.vas)}</dd></div><div><dt className="text-sm">Air conditions and nasal symptoms (TNSS)</dt><dd className="text-sm text-emerald-300">{resultLabel(analysis.tnss)}</dd></div></dl>
      <p className="text-xs text-zinc-500 mt-4">Each matched day pairs a saved forecast with a diary report made near its predicted time.</p>
      <p className="text-xs text-zinc-500 mt-2">{analysis.excluded.no_matching_forecast} reports have no matching forecast; {analysis.excluded.missing_observation_time} have no recorded observation time.</p>

      {value.history_truncated&&<p className="text-xs text-amber-300 mt-2">Only the loaded records are included in this comparison.</p>}
    </>}
    {!resource.loading && !resource.error && value?.device && !analysis && <p role="status" className="text-xs text-zinc-400 mt-4">The comparison is not available for the current model yet. Select “Show older-model comparisons” to review any earlier results.</p>}
    <aside aria-labelledby="comparison-help-title" className="mt-4 rounded-xl border border-emerald-900/50 bg-emerald-950/15 p-3">
      <h3 id="comparison-help-title" className="text-xs font-semibold text-zinc-100">How to read the comparison</h3>
      <p className="mt-2 text-[12px] leading-relaxed text-zinc-300"><strong className="text-emerald-300">Positive:</strong> higher environmental scores tend to appear with higher symptom scores; lower scores tend to appear together too.<br /><strong className="text-emerald-300">Negative:</strong> higher environmental scores tend to appear with lower symptom scores, or the reverse.<br /><strong className="text-emerald-300">Near zero:</strong> there is no clear pattern between air conditions and symptoms in the matched records.</p>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">Range: −1 to 1. This comparison does not trigger alerts or prove cause.</p>
    </aside>
    <div className="flex flex-wrap gap-4 mt-4"><button type="button" onClick={resource.retry} disabled={resource.loading} className="allert-action-link disabled:opacity-50">Refresh correlation</button><button type="button" onClick={download} disabled={resource.loading||!!resource.error||!analysis?.pairs.length} className="allert-action-link disabled:opacity-50">Export matched pairs</button></div>
  </section>;
}
