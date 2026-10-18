import { Wind } from "lucide-react";
import type { SensorReading } from "../utils/telemetry";
import { historyRows, formatMeasurement, formatSampleTime, qualityPresentation } from "../utils/sample-history.mjs";
export function SampleHistoryTable({ readings, end, deviceId, replay=false }: {readings:SensorReading[];end:number;deviceId:string;replay?:boolean}) {
 const rows=historyRows(readings,end,deviceId);
 return <section className="history-table-card mt-3 overflow-hidden rounded-xl border border-emerald-900/60 bg-gradient-to-br from-emerald-950/40 via-zinc-900/90 to-zinc-900/70">
   <div className="border-b border-emerald-900/50 px-4 py-4">
     <div className="flex items-center justify-between gap-3">
       <div className="flex items-center gap-2"><div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-400"><Wind className="h-4 w-4" /></div><div><h2 className="text-sm font-semibold text-zinc-100">24-Hour Sample History</h2><p className="mt-0.5 text-[10px] text-zinc-400">{replay ? "Recorded replay samples" : "Five-minute sensor samples"} - newest first</p></div></div>
       <span className="rounded-full border border-emerald-800/70 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-300">{rows.length} {rows.length===1?"sample":"samples"}</span>
     </div>
     <p className="mt-2 text-[10px] text-zinc-400">Scroll horizontally for all columns. Window ends {formatSampleTime(Number.isFinite(end) ? new Date(end).toISOString() : "invalid")} (Manila).</p>
   </div>
   <div className="px-3 pb-3 pt-3">
     <div className="history-table-scroll max-h-80 overflow-auto rounded-lg border border-zinc-800/80 bg-zinc-950/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400" role="region" aria-label="Scrollable environmental sample history" tabIndex={0}>
      {rows.length ? <table className="min-w-[620px] w-full text-left text-[11px]" aria-label={replay ? "Recorded environmental samples in the replay window" : "Environmental samples from the last 24 hours"}>
       <thead className="sticky top-0 z-10 bg-zinc-800/95 text-zinc-400 backdrop-blur-sm"><tr>
        <th scope="col" className="px-3 py-2.5 font-medium">Time <span className="font-normal text-zinc-500">- Manila</span></th>
        <th scope="col" className="px-3 py-2.5 text-right font-medium">PM2.5 (μg/m³)</th><th scope="col" className="px-3 py-2.5 text-right font-medium">PM10 (μg/m³)</th>
        <th scope="col" className="px-3 py-2.5 text-right font-medium">Temp. (°C)</th><th scope="col" className="px-3 py-2.5 text-right font-medium">Humidity (%)</th><th scope="col" className="px-3 py-2.5 text-right font-medium">Quality</th>
       </tr></thead>
       <tbody className="divide-y divide-zinc-800/80">{rows.map(reading=>{
        const quality=qualityPresentation(reading.data_quality_status);
        const tone=quality.tone==="valid"?"bg-emerald-500/10 text-emerald-300":quality.tone==="invalid"?"bg-red-500/10 text-red-300":"bg-zinc-800 text-zinc-300";
        return <tr key={`${reading.device_id}-${reading.timestamp}`} className="text-zinc-300 transition-colors hover:bg-emerald-950/30">
         <th scope="row" className="whitespace-nowrap px-3 py-2.5 font-normal text-zinc-400">{formatSampleTime(reading.timestamp)}</th>
         {[reading.pm2_5,reading.pm10,reading.temperature,reading.humidity].map((value,index)=><td key={index} className="px-3 py-2.5 text-right">{formatMeasurement(value)}</td>)}
         <td className="px-3 py-2.5 text-right"><span className={`inline-block rounded-full px-2 py-0.5 text-[10px] ${tone}`}>{quality.label}</span></td>
        </tr>;
       })}</tbody>
      </table> : <p className="px-3 py-8 text-center text-xs text-zinc-500">No five-minute samples are available for this 24-hour window.</p>}
     </div>
   </div>
 </section>;
}
