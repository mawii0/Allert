import {useEffect,useRef,useState} from "react";
import {checkServiceHealth,retryableHealth,type HealthResult} from "./service-health";
type HealthState=HealthResult|{kind:"checking";attempt:number};
export function useServiceHealth(){
 const [state,setState]=useState<HealthState>({kind:"checking",attempt:1});
 const retryRef=useRef<()=>void>(()=>{});
 useEffect(()=>{
  let active=true,pending=false,revision=0,lastStarted=0;
  let controller:AbortController|null=null,timer:ReturnType<typeof window.setTimeout>|undefined;
  const clearTimer=()=>{if(timer!==undefined){window.clearTimeout(timer);timer=undefined;}};
  const pause=(milliseconds:number,signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{
   const cancel=()=>{clearTimer();reject(new DOMException("Check cancelled","AbortError"));};
   timer=window.setTimeout(()=>{timer=undefined;signal.removeEventListener("abort",cancel);resolve();},milliseconds);
   signal.addEventListener("abort",cancel,{once:true});
   if(signal.aborted){signal.removeEventListener("abort",cancel);cancel();}
  });
  async function run(){
   if(!active || pending)return;
   pending=true;clearTimer();lastStarted=Date.now();const version=++revision;
   const current=()=>active && version===revision;
   const request=new AbortController();controller=request;
   try{
    let result:HealthResult={kind:"network"};
    for(let attempt=1;attempt<=3;attempt++){
     if(!current())return;setState({kind:"checking",attempt});
     result=await checkServiceHealth(request.signal);
     if(!current())return;
     if(result.kind==="ready"){setState(result);return;}
     if(!retryableHealth(result) || attempt===3)break;
     await pause(attempt===1?1000:3000,request.signal);
    }
    if(current()){
     setState(result);
     if(retryableHealth(result))timer=window.setTimeout(()=>{timer=undefined;void run();},30000);
    }
   }catch{
    // Aborted/unmounted checks are discarded, never reported as an outage.
   }finally{if(current()){pending=false;controller=null;}}
  }
  const offline=()=>{revision++;clearTimer();controller?.abort();controller=null;pending=false;if(active)setState({kind:"offline"});};
  const online=()=>{revision++;clearTimer();controller?.abort();controller=null;pending=false;void run();};
  const focus=()=>{if(Date.now()-lastStarted>=30000)void run();};
  retryRef.current=()=>{if(!pending)void run();};
  window.addEventListener("online",online);window.addEventListener("offline",offline);window.addEventListener("focus",focus);
  void run();
  return()=>{active=false;revision++;clearTimer();controller?.abort();retryRef.current=()=>{};window.removeEventListener("online",online);window.removeEventListener("offline",offline);window.removeEventListener("focus",focus);};
 },[]);
 return {state,retry:()=>retryRef.current()};
}
