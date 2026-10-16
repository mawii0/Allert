import { projectId } from "/utils/supabase/info";
import { requestSignal } from "./request-signal";

export type HealthResult = {kind:"ready"|"offline"|"network"|"timeout"|"invalid"} | {kind:"http";status:number};
export const retryableHealth = (result:HealthResult) => result.kind==="network" || result.kind==="timeout" || (result.kind==="http" && (result.status===408 || result.status>=500));
export async function checkServiceHealth(signal:AbortSignal):Promise<HealthResult> {
 if(signal.aborted)throw signal.reason ?? new DOMException("Check cancelled","AbortError");
 if(typeof navigator!=="undefined" && navigator.onLine===false)return {kind:"offline"};
 try{
  // Public liveness check: no Authorization header, cookies, or session changes.
  const response=await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-a473accf/health`,{
   method:"GET",credentials:"omit",cache:"no-store",redirect:"error",signal:requestSignal(10000,signal),
  });
  if(signal.aborted)throw signal.reason ?? new DOMException("Check cancelled","AbortError");
  if(!response.ok){await response.body?.cancel();return {kind:"http",status:response.status};}
  try{const value=await response.json();return {kind:value?.status==="ok"?"ready":"invalid"};}
  catch(error){if(signal.aborted)throw error;return {kind:(error as Error)?.name==="TimeoutError"?"timeout":error instanceof SyntaxError?"invalid":"network"};}
 }catch(error){
  if(signal.aborted)throw error;
  return {kind:(error as Error)?.name==="TimeoutError"?"timeout":"network"};
 }
}
