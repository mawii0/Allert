import { useEffect, useState } from "react";
import { privateApi } from "./private-api";
import type { IndicatorValue } from "./model-contract";
import type { SensorReading } from "./telemetry";
import {validIndicator,MODEL_ID,CHECKPOINT,POLICY,INDICATOR_HASH,currentIndicator} from "../../../supabase/functions/server/seed7-policy.mjs";
type Indicators = { adult: IndicatorValue; pediatric: IndicatorValue };
export interface MonitorForecast {horizon_hours:number;pm2_5:number;pm10:number;forecast_pm_policy_id?:string;forecast_pm_policy_hash?:string;forecast_pm_indicator?:Indicators|null;method:string;target_block_start:string;target_block_end:string;origin:string;}
export interface MonitorData {availability:string;device:{device_id:string}|null;current:(SensorReading & {risk:Indicators|null})|null;baseline:{reading_count:number;expected_readings:number;available_minutes:number;window_start:string;window_end:string}|null;forecasts:MonitorForecast[];model_status:string;model_id?:string|null;provenance?:{generated_at:string;receipt_cutoff:string;input_hash:string;origin:string}|null;indicator_status?:string;checkpoint_sha256?:string;worker?:{enabled:boolean;last_finished_at:string|null;summary:{errors:number}};model_input?:{eligible_blocks:number;required_blocks:number;missing_receipts:number;duplicate_blocks:number}|null;}
function validForecastCard(f:MonitorForecast) {
  if (![6,12,24].includes(f.horizon_hours) || !Number.isFinite(f.pm2_5) || f.pm2_5<0 || !Number.isFinite(f.pm10) || f.pm10<0 ||
      Date.parse(f.target_block_end)-Date.parse(f.target_block_start)!==300000 ||
      Date.parse(f.target_block_end)!==Date.parse(f.origin)+f.horizon_hours*3600000) return false;
  if (!f.forecast_pm_indicator) return true;
  if (f.forecast_pm_policy_id!==POLICY.forecast_pm.id || f.forecast_pm_policy_hash!==INDICATOR_HASH) return false;
  const expected=currentIndicator(f.pm2_5,f.pm10,25,60);
  return ["adult","pediatric"].every(p=>{
    const actual=f.forecast_pm_indicator?.[p];
    return expected && actual && expected[p].tier===actual.tier &&
      Math.abs(expected[p].score_0_100-actual.score_0_100)<1e-8 &&
      Math.abs(actual.indicator_0_1*100-actual.score_0_100)<1e-8;
  });
}
export function useRiskMonitor() {
  const [data,setData]=useState<MonitorData|null>(null),[status,setStatus]=useState("loading"),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let active=true,pending=false,revision=0;const controller=new AbortController();setData(null);setStatus("loading");
    async function refresh(){
      if(pending)return;pending=true;const requestRevision=revision;
      try{
        const result = await privateApi<MonitorData>("/risk-monitor", {signal:controller.signal,timeoutMs:30000});

        if ((result.current?.risk && !validIndicator(result.current.risk)) ||
            result.model_id!==MODEL_ID || result.checkpoint_sha256!==CHECKPOINT || !Array.isArray(result.forecasts) ||
            (result.forecasts.length!==0 && (result.forecasts.length!==3 ||
              new Set(result.forecasts.map(f=>f.horizon_hours)).size!==3 || !result.forecasts.every(validForecastCard)))) {
          throw Error("Analytics release mismatch; refresh after the matching server update.");
        }
        if(active&&revision===requestRevision){setData(result);setStatus(result.availability);}
      }catch(error){if(active&&revision===requestRevision){setData(null);setStatus(error instanceof Error?error.message:"unavailable");}}
      finally{pending=false;if(active&&revision!==requestRevision)void refresh();}
    }
    const reset=()=>{revision++;setData(null);setStatus("loading");void refresh();};
    window.addEventListener("storage",reset);window.addEventListener("allert-session-changed",reset);window.addEventListener("allert-node-changed",reset);window.addEventListener("focus",refresh);
    void refresh();const timer=window.setInterval(refresh,60000);
    return()=>{active=false;controller.abort();window.clearInterval(timer);window.removeEventListener("storage",reset);window.removeEventListener("allert-session-changed",reset);window.removeEventListener("allert-node-changed",reset);window.removeEventListener("focus",refresh);};
  },[attempt]);
  return {data,status,retry:()=>setAttempt(value=>value+1)};
}
