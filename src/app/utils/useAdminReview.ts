import { useEffect, useRef, useState } from "react";
import { getCurrentUser } from "./auth";
import { privateApi } from "./private-api";
export function useAdminReview(resource:any,eventId:string|null){
  const [classification,setClassificationValue]=useState("investigating"),[notes,setNotesValue]=useState("");
  const [loadedRevision,setLoadedRevision]=useState<number|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const revision=useRef<number|null>(null),dirty=useRef(false),working=useRef(false),generation=useRef(0),mounted=useRef(false),controller=useRef<AbortController>();
  useEffect(()=>{
    mounted.current=true;
    const reset=()=>{generation.current++;controller.current?.abort();revision.current=null;setLoadedRevision(null);dirty.current=false;working.current=false;setBusy(false);setClassificationValue("investigating");setNotesValue("");setError("");setMessage("");};
    reset();window.addEventListener("allert-session-changed",reset);
    return()=>{mounted.current=false;generation.current++;controller.current?.abort();window.removeEventListener("allert-session-changed",reset);};
  },[eventId]);
  const event=resource.data?.event;
  useEffect(()=>{
    if(!event || working.current)return;
    if(dirty.current && revision.current!==event.review_revision){setError("Another administrator reviewed this event. Cancel and refresh before saving.");return;}
    if(!dirty.current){revision.current=event.review_revision;setLoadedRevision(event.review_revision);setClassificationValue(event.classification==="unreviewed"?"investigating":event.classification);setNotesValue(event.review_notes || "");}
  },[event]);
  async function save(){
    if(!eventId || !event || working.current || resource.loading || revision.current===null || revision.current!==event.review_revision)return false;
    if(notes.length>500){setError("Keep investigation notes within 500 characters.");return false;}
    working.current=true;setBusy(true);setError("");setMessage("");const version=generation.current,account=getCurrentUser().id;
    const current=()=>mounted.current && generation.current===version && account===getCurrentUser().id;
    controller.current=new AbortController();
    try{
      const result=await privateApi<any>(`/admin/anomalies/${eventId}`,{method:"PUT",body:{revision:revision.current,classification,notes},signal:controller.current.signal});
      if(!current())return false;if(!result.event || result.event.id!==eventId)throw Error("The saved review could not be confirmed. Refresh and check.");
      dirty.current=false;revision.current=result.event.review_revision;setMessage("Classification saved with an audit record.");resource.retry();return true;
    }catch(error){if(current())setError(error instanceof Error?error.message:"The review save could not be confirmed.");return false;}
    finally{if(current()){working.current=false;setBusy(false);}}
  }
  function cancel(){if(working.current)return;dirty.current=false;revision.current=null;setError("");setMessage("");resource.retry();}
  return{classification,notes,busy,error,message,save,cancel,canSave:!!event && !resource.loading && !busy && notes.length<=500 && loadedRevision===event.review_revision,
    setClassification:(value:string)=>{dirty.current=true;setMessage("");setClassificationValue(value);},setNotes:(value:string)=>{dirty.current=true;setMessage("");setNotesValue(value);}};
}
