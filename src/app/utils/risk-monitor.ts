import { useEffect, useState } from "react";
import { projectId } from "/utils/supabase/info";
import { getValidAuthToken, logout } from "./auth";
import type { IndicatorValue } from "./model-contract";
import type { SensorReading } from "./telemetry";
type Indicators = { adult: IndicatorValue; pediatric: IndicatorValue };
export interface MonitorForecast {horizon_hours:number;pm2_5:number;pm10:number;temperature:number;humidity:number;risk:Indicators;method:string;target_block_end:string;origin:string;}
export interface MonitorData {availability:string;device:{device_id:string}|null;current:(SensorReading & {risk:Indicators})|null;baseline:{reading_count:number;expected_readings:number;available_minutes:number;window_start:string;window_end:string}|null;forecasts:MonitorForecast[];model_status:string;model_id?:string|null;model_input?:{eligible_blocks:number;required_blocks:number;missing_receipts:number;duplicate_blocks:number}|null;}
export function useRiskMonitor() {
  const [data,setData]=useState<MonitorData|null>(null),[status,setStatus]=useState("loading"),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let active=true,pending=false,revision=0;const controller=new AbortController();setData(null);setStatus("loading");
    async function refresh(){
      if(pending)return;pending=true;const requestRevision=revision;
      try{
        const token=await getValidAuthToken();if(!token)throw Error("Please sign in.");
        const response=await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-a473accf/risk-monitor`,{headers:{Authorization:`Bearer ${token}`},cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])});
        const raw=await response.text();let result;try{result=JSON.parse(raw);}catch{throw Error(`Risk monitor endpoint returned HTTP ${response.status}. Check its deployment.`);}if(response.status===401)logout();if(!response.ok)throw Error(result.error||"Risk monitor unavailable");
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
