import { usePrivateResource } from "../utils/usePrivateResource";
export const adminTime=(value:any)=>value && Number.isFinite(Date.parse(value))?new Date(value).toLocaleString("en-PH",{timeZone:"Asia/Manila",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}):"Not recorded";
export const formatNumber=(value:any,unit="")=>typeof value==="number" && Number.isFinite(value)?`${value.toFixed(1)}${unit?` ${unit}`:""}`:"—";
export function AdminAccessLink(){const access=usePrivateResource<{allowed:boolean}>("/admin/access",0);return access.data?.allowed?<a href="/admin/overview" className="block text-xs text-emerald-400 underline mt-3">Open admin monitoring</a>:null;}
export function AdminLoadState({resource,missing="No record selected."}:{resource:any;missing?:string}){
  return resource.loading?<p role="status" className="text-sm text-zinc-400">Loading live data…</p>:resource.error?<div role="alert" className="text-sm text-red-300"><p>{resource.error}</p><button className="underline mt-2" onClick={resource.retry}>Retry</button></div>:!resource.data?<p className="text-sm text-zinc-400">{missing}</p>:null;
}
export function AdminReadingChart({rows=[],field="pm2_5",height=220,width=600,lookback=86400000,end=Date.now(),small=false}:{rows?:any[];field?:string;height?:number;width?:number;lookback?:number;end?:number;small?:boolean}){
  const sorted=[...rows].filter(row=>Number.isFinite(Date.parse(row.timestamp))).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
  const buckets=new Map<number,any>();for(const row of sorted){const slot=Math.floor(Date.parse(row.timestamp)/300000);buckets.set(slot,buckets.has(slot)?null:row);}
  const valid=(row:any)=>row && typeof row[field]==="number" && Number.isFinite(row[field]) && (!row.data_quality_status || row.data_quality_status==="VALID") && Date.parse(row.timestamp)>=end-lookback && Date.parse(row.timestamp)<=end;
  const values=[...buckets.values()].filter(valid);const max=Math.max(1,...values.map(row=>row[field]));
  const segments:string[]=[];let points:string[]=[],previous:number|null=null;
  for(const [slot,row] of buckets){if(!valid(row) || previous!==null && slot!==previous+1){if(points.length)segments.push(points.join(" "));points=[];}previous=slot;if(valid(row))points.push(`${(Date.parse(row.timestamp)-(end-lookback))/lookback*(width-20)+10},${height-15-row[field]/max*(height-30)}`);}
  if(points.length)segments.push(points.join(" "));
  return <div className={small?"h-12 w-24":"h-full w-full"}><svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label={`Recorded ${field} measurements; gaps are left empty`}>
    {!small && <text x="10" y="12" fill="#a1a1aa" fontSize="10">{max.toFixed(1)} µg/m³</text>}
    {segments.map((points,index)=><polyline key={index} fill="none" stroke="#3b82f6" strokeWidth={small?6:2} points={points} />)}
    {values.length===1 && <circle cx={10+(Date.parse(values[0].timestamp)-(end-lookback))/lookback*(width-20)} cy={height-15-values[0][field]/max*(height-30)} r="3" fill="#3b82f6" />}
    {!values.length && <text x="20" y={height/2} fill="#a1a1aa" fontSize={small?24:12}>No data</text>}
  </svg>{!small && <div className="flex justify-between text-[10px] text-zinc-500"><span>{adminTime(new Date(end-lookback).toISOString())}</span><span>{adminTime(new Date(end).toISOString())} · Manila</span></div>}</div>;
}
export function downloadNodeCsv(deviceId:string,rows:any[]){
  const fields=["timestamp","device_id","pm2_5","pm10","temperature","humidity","sample_count","expected_samples","data_quality_status","created_at"];
  const cell=(value:any)=>{let text=value==null?"":String(value);if(typeof value==="string" && /^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  const csv=[fields.join(","),...rows.map(row=>fields.map(field=>cell(row[field])).join(","))].join("\r\n");
  const url=URL.createObjectURL(new Blob(["\ufeff",csv],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download=`allert-${deviceId.replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,100)}-24h.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
