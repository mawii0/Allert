import "../../styles/patient-actions.css";
import {useRiskMonitor} from "../utils/risk-monitor";
import {displayTime} from "../utils/environment";
export const forecastStatusLabel=(status:string)=>({ready:"Verified particulate matter forecasts available",warming_up:"Collecting model input",insufficient_history:"Collecting model input",stale:"Forecast input is stale",model_not_enabled:"Neural forecasts are not enabled for this deployment"}[status] || status.replaceAll("_"," "));
export function ForecastNotices({compact=false}:{compact?:boolean}){
 const {data,status,retry}=useRiskMonitor();
 return <section id={compact?undefined:"forecast-notices"} aria-label="Forecast status" className={compact?"border-t border-zinc-800 pt-3":"bg-zinc-900/50 rounded-2xl border border-zinc-800 p-6 mt-6"}>
 <h2 className="font-semibold">Particulate matter forecast status</h2>
 {!data && status!=="loading" && <p role="alert" className="text-xs text-red-300 mt-2">{status}</p>}
 <div className="mt-2 space-y-0.5 leading-4"><p className="text-xs text-zinc-400">{data && !data.device?"Link or join a node to see forecasts.":forecastStatusLabel(data?.model_status || status)}</p>
 {data?.worker&&<p className="text-xs text-zinc-500">{!data.worker.enabled?"Background collection is switched off.":!data.worker.last_finished_at?"No scheduled run recorded.":Date.now()-Date.parse(data.worker.last_finished_at)>180000?"Scheduled collection has not finished recently.":"Background worker checked recently."}</p>}
 {data?.model_input&&<p className="text-xs text-zinc-400">Eligible input: {data.model_input.eligible_blocks}/{data.model_input.required_blocks} five-minute blocks.</p>}</div>
 {!compact&&<><p className="text-xs text-zinc-500 mt-2">Six concentration values at +6h, +12h and +24h. Each describes one five-minute target block. Future allergy tiers are not calculated.</p>
 <p className="text-xs text-zinc-500 mt-2">{data?.model_id}</p>{data?.provenance&&<p className="text-xs text-zinc-500 mt-2">Generated {displayTime(data.provenance.generated_at)}; inputs available by {displayTime(data.provenance.receipt_cutoff)} (Manila).</p>}</>}
 <button type="button" onClick={retry} className="allert-action-link mt-3">Refresh forecast status</button></section>;
}
