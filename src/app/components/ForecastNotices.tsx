import { usePrivateResource } from "../utils/usePrivateResource";
type Notice = {id:string;origin:string;target:string;horizon_hours:number;population:string;tier:string;score:number;status:string};
type Delivery = {event_id:string;status:string;http_status:number|null;attempted_at:string};
type ForecastStatus = {device:{device_id:string}|null;enabled:boolean;sensorEnabled?:boolean;worker:null|{status:string;last_finished_at:string|null;last_success_at:string|null;summary:{eligible_blocks?:number;required_blocks?:number;missing_receipts?:number;duplicate_blocks?:number}};events:Notice[];deliveries:Delivery[]};
const date = (value:string) => new Date(value).toLocaleString("en-PH",{timeZone:"Asia/Manila"});
export const forecastStatusLabel = (status:string) => ({ready:"Verified forecasts collected",warming_up:"Collecting model input",stale_or_missing_readings:"Waiting for fresh sensor readings",waiting_for_model_grid:"Waiting for the next forecast interval",model_not_configured:"Hosted model configuration is incomplete",model_service_error:"Hosted model could not return a forecast",model_output_unverified:"Model response did not pass verification",service_unavailable:"Collection needs attention"}[status] || status.replaceAll("_"," "));
const eventLabel = (status:string) => ({attempted:"Delivery attempted — see result below",below_threshold:"Below the alert threshold",joined_after_origin:"Forecast predates your access",pending:"Waiting for delivery checks",throttled:"Limited to avoid repeated alerts",disabled:"Push preference was off",no_subscription:"No connected browser",category_changed:"Patient category changed",access_revoked:"Node access changed",expired:"Forecast was too old to notify"}[status] || status.replaceAll("_"," "));
export function ForecastNotices({compact=false}:{compact?:boolean}) {
 const resource=usePrivateResource<ForecastStatus>("/forecast-alerts"),value=resource.data,worker=value?.worker;
 const stale=!!worker?.last_finished_at && Date.now()-Date.parse(worker.last_finished_at)>180000;
 return <section id={compact?undefined:"forecast-notices"} aria-label="Forecast alert status" className={compact?"border-t border-zinc-800 pt-3":"bg-zinc-900/50 rounded-2xl border border-zinc-800 p-6 mt-6"}>
  <h2 className={compact?"text-sm font-medium":"font-semibold"}>Forecast alerts</h2>
  {resource.loading?<p role="status" className="text-xs text-zinc-400 mt-2">Checking forecast collection…</p>:resource.error?<p role="alert" className="text-xs text-red-300 mt-2">{resource.error}</p>:!value?.device?<p className="text-xs text-zinc-400 mt-2">Link or join a node to receive forecast notices.</p>:<>
   <p className="text-xs text-zinc-400 mt-2">{!value.enabled?"Background forecast collection is switched off.":!value.sensorEnabled?"This node does not have a verified model assignment.":!worker?"No scheduled run recorded. Check the forecast schedule.":stale?"Scheduled collection has not finished recently. Check the worker.":forecastStatusLabel(worker.status)}</p>
   {worker&&<p className="text-xs text-zinc-500 mt-2">Model input: {worker.summary?.eligible_blocks ?? 0}/{worker.summary?.required_blocks ?? 648} blocks. Missing receipt timestamps: {worker.summary?.missing_receipts ?? 0}. Last collection check: {worker.last_finished_at?date(worker.last_finished_at):"not recorded"} (Manila).</p>}
   {!compact&&<div className="space-y-3 mt-3">{!value.events.length?<p className="text-xs text-zinc-500">No verified forecasts have been saved for your current access yet. Fresh, complete model input is required.</p>:value.events.map(event=><article key={event.id} className="border-t border-zinc-800 pt-3 text-xs">
    <p className="text-zinc-300">{event.tier.replaceAll("_"," ")} · {event.horizon_hours} hours · {event.population}</p><p className="text-zinc-500 mt-1">Forecast target: {date(event.target)} (Manila). {eventLabel(event.status)}.</p>
    {value.deliveries.filter(row=>row.event_id===event.id).map((row,index)=><p key={index} className="text-zinc-400 mt-1">{row.status==="accepted"?"Push provider accepted this notification; device display is not confirmed.":row.status==="uncertain"?"Delivery outcome is unknown; it will not be sent again automatically.":row.status==="expired"?"Browser subscription expired. Connect this browser again.":`Delivery: ${row.status.replaceAll("_"," ")}.`}</p>)}
   </article>)}</div>}
   <p className="text-xs text-zinc-500 mt-2">Only verified high or very high environmental forecasts trigger push. Quiet hours, your category, and current node access apply. This is not a symptom probability.</p>
  </>}
  <button type="button" className="text-xs text-emerald-400 underline mt-3 disabled:opacity-50" disabled={resource.loading} onClick={resource.retry}>Refresh forecast status</button>
 </section>;
}
