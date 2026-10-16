import { useEffect, useRef, useState } from "react";
import { getCurrentUser } from "./auth";
import { privateApi } from "./private-api";
import { usePrivateResource } from "./usePrivateResource";

export function useNodeLocation() {
  const resource=usePrivateResource<any>("/node-location");
  const [label,setLabelValue]=useState("");
  const [draft,setDraft]=useState<any>(null);
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [stale,setStale]=useState(false);
  const working=useRef(false),dirty=useRef(false),generation=useRef(0),mounted=useRef(false);
  const controller=useRef<AbortController>();
  const loadedRevision=useRef<number | null>(null);
  const location=resource.data?.location,device=resource.data?.device;
  useEffect(()=>{
    mounted.current=true;
    const reset=()=>{generation.current++;controller.current?.abort();working.current=false;dirty.current=false;loadedRevision.current=null;setBusy(false);setLabelValue("");setDraft(null);setConfirmed(false);setStale(false);setError("");setMessage("");};
    const storage=(event:StorageEvent)=>{if(event.key===null || event.key==="allert_user_id" || event.key==="allert_auth_token" && !event.newValue)reset();};
    window.addEventListener("allert-session-changed",reset);window.addEventListener("allert-node-changed",reset);window.addEventListener("storage",storage);
    return()=>{mounted.current=false;generation.current++;controller.current?.abort();window.removeEventListener("allert-session-changed",reset);window.removeEventListener("allert-node-changed",reset);window.removeEventListener("storage",storage);};
  },[]);
  useEffect(()=>{
    if(!location || working.current)return;
    if(dirty.current && loadedRevision.current!==location.revision){setStale(true);setError("Node location changed elsewhere. Cancel and refresh before saving.");return;}
    if(!dirty.current){setLabelValue(location.label);loadedRevision.current=location.revision;}
  },[location]);
  const start=()=>{
    const version=generation.current,account=getCurrentUser().id;
    const current=()=>mounted.current && generation.current===version && getCurrentUser().id===account;
    working.current=true;setBusy(true);setError("");setMessage("");
    return current;
  };
  async function capture(){
    if(working.current || !device || resource.loading || stale)return;
    const current=start();
    try{
      if(!window.isSecureContext)throw Error("Open ALLERT over HTTPS or localhost to capture location.");
      if(!navigator.geolocation)throw Error("Location is unavailable in this browser. Enter a node label instead.");
      // The browser prompt starts directly from this explicit user action. No background tracking.
      const position=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:false,maximumAge:0,timeout:15000}));
      if(!current())return;
      const point={latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,capturedAt:new Date(position.timestamp).toISOString()};
      if(![point.latitude,point.longitude,point.accuracy].every(Number.isFinite))throw Error("The browser returned an invalid location.");
      dirty.current=true;setDraft(point);setConfirmed(false);
    }catch(error){if(current())setError((error as any)?.code===1?"Location permission was denied. You can still save a node label.":(error as any)?.code===3?"Location capture timed out. Try again or save a node label.":error instanceof Error?error.message:"Unable to capture location. You can save a node label instead.");}
    finally{if(current()){working.current=false;setBusy(false);}}
  }
  async function save(disable=false){
    if(working.current || !device || !location || resource.loading || stale)return false;
    if(!label.trim() || label.trim().length>100){setError("Enter a node label between 1 and 100 characters.");return false;}
    if(!disable && draft && !confirmed){setError("Confirm that this is the sensor node's installed location.");return false;}
    const current=start();controller.current=new AbortController();
    try{
      const enabled=!disable && (!!draft || location.enabled);
      const body={deviceId:device.device_id,ownerEpoch:device.owner_epoch,revision:location.revision,label:label.trim(),enabled,
        ...(enabled?(draft || {latitude:location.latitude,longitude:location.longitude,accuracy:location.accuracy,capturedAt:location.captured_at}):{})};
      const result=await privateApi<any>("/node-location",{method:"PUT",body,signal:controller.current.signal});
      if(!current())return false;
      if(!result.location || !Number.isInteger(result.location.revision))throw Error("The saved location could not be confirmed. Refresh and check.");
      dirty.current=false;loadedRevision.current=result.location.revision;setDraft(null);setConfirmed(false);
      setMessage(disable?"Location capture is off and saved coordinates were removed. Your node label remains.":"Node location saved.");
      window.dispatchEvent(new Event("allert-location-changed"));resource.retry();return true;
    }catch(error){if(current())setError(error instanceof Error?error.message:"The location save could not be confirmed. Refresh and check.");return false;}
    finally{if(current()){working.current=false;setBusy(false);}}
  }
  function cancel(){if(working.current)return;dirty.current=false;setDraft(null);setConfirmed(false);setStale(false);setError("");setMessage("");if(location)setLabelValue(location.label);resource.retry();}
  return {device,location,label,draft,confirmed,busy,loading:resource.loading,error:error || resource.error,message,stale,capture,save,cancel,
    setLabel:(value:string)=>{dirty.current=true;setLabelValue(value);setMessage("");},setConfirmed,
    canSave:!!device && !!location && !resource.loading && !busy && !stale && !!label.trim() && label.trim().length<=100 && (!!draft || label.trim()!==location.label) && (!draft || confirmed),
    retry:resource.retry};
}
