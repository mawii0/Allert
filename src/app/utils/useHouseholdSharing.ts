import {useEffect,useRef,useState} from "react";
import {getCurrentUser} from "./auth";
import {privateApi} from "./private-api";
import {usePrivateResource} from "./usePrivateResource";
export function useHouseholdSharing(){
  const resource=usePrivateResource<any>("/node-sharing");
  const [link,setLink]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const generation=useRef(0),working=useRef(false),mounted=useRef(false),controller=useRef<AbortController>(),identity=useRef<string|null>(null),linkTime=useRef<number|null>(null);
  useEffect(()=>{mounted.current=true;const reset=()=>{generation.current++;controller.current?.abort();working.current=false;setLink("");setBusy(false);setError("");setMessage("");};
    window.addEventListener("allert-session-changed",reset);window.addEventListener("allert-node-changed",reset);window.addEventListener("storage",reset);
    return()=>{mounted.current=false;generation.current++;controller.current?.abort();window.removeEventListener("allert-session-changed",reset);window.removeEventListener("allert-node-changed",reset);window.removeEventListener("storage",reset);};},[]);
  const device=resource.data?.device;
  useEffect(()=>{if(resource.loading)return;const next=device?`${device.device_id}:${device.owner_epoch}:${device.role}`:null;
    if(identity.current!==next || linkTime.current!==null && (!resource.data?.link?.enabled || Date.parse(resource.data.link.updated_at)!==linkTime.current)){setLink("");linkTime.current=null;}
    identity.current=next;
  },[device?.device_id,device?.owner_epoch,device?.role,resource.loading,resource.data?.link?.enabled,resource.data?.link?.updated_at]);
  async function mutate(action:"link"|"leave"|"remove_member"|"allow_member"|"disable_link",target?:string){
    if(working.current||!device||resource.loading)return false;
    working.current=true;setBusy(true);setError("");setMessage("");
    if(action==="link"){setLink("");linkTime.current=null;}
    const version=generation.current,owner=getCurrentUser().id,current=()=>mounted.current&&version===generation.current&&owner===getCurrentUser().id;
    controller.current=new AbortController();
    try{
      const result=await privateApi<any>(action==="link"?"/node-sharing/link":"/node-sharing/manage",{method:"POST",signal:controller.current.signal,
        body:{device_id:device.device_id,owner_epoch:device.owner_epoch,...(action!=="link"?{action,target}:{} )}});
      if(!current())return false;
      if(!result?.ok)throw Error("The sharing update could not be confirmed. Refresh and check.");
      if(action==="link"){
        if(typeof result.token!=="string"||!/^[a-f0-9]{64}$/.test(result.token))throw Error("The private link could not be confirmed.");
        linkTime.current=Date.parse(result.updated_at);setLink(`${window.location.origin}/join-node#${result.token}`);setMessage("Private link ready. Copy and keep it; the same link can be shared with your family.");
      }else{if(action==="disable_link")setLink("");setMessage(action==="leave"?"You left this shared node.":action==="remove_member"?"Member access removed.":action==="allow_member"?"This member may join again using the current private link.":"The private link is disabled. Existing members remain connected.");}
      if(action==="leave")window.dispatchEvent(new Event("allert-node-changed"));
      resource.retry();return true;
    }catch(error){if(current())setError(error instanceof Error?error.message:"Sharing update failed.");return false;}
    finally{if(current()){working.current=false;setBusy(false);}}
  }
  async function copy(){
    if(!link||working.current)return;
    const version=generation.current,owner=getCurrentUser().id;
    try{if(!navigator.clipboard?.writeText)throw Error("Copy the selected private link manually.");await navigator.clipboard.writeText(link);if(mounted.current&&generation.current===version&&getCurrentUser().id===owner)setMessage("Private link copied.");}
    catch{if(mounted.current&&generation.current===version)setError("Clipboard is unavailable. Select and copy the private link manually.");}
  }
  return{...resource,device,link,busy,error:error||resource.error,message,mutate,copy};
}
