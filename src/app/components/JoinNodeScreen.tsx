import {useEffect,useRef,useState} from "react";
import {useNavigate} from "react-router";
import {getCurrentUser,isAuthenticated} from "../utils/auth";
import {privateApi} from "../utils/private-api";
import {readPendingNodeShare,clearPendingNodeShare} from "../utils/pending-node-share";
export function JoinNodeScreen(){
  const navigate=useNavigate();const [token,setToken]=useState(readPendingNodeShare);
  const [account,setAccount]=useState(()=>isAuthenticated()?getCurrentUser().id:null),[preview,setPreview]=useState<any>(null),[error,setError]=useState(""),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0);
  const version=useRef(0),working=useRef(false),controller=useRef<AbortController>();
  useEffect(()=>{const changed=()=>{version.current++;controller.current?.abort();working.current=false;setBusy(false);setPreview(null);setToken(readPendingNodeShare());};window.addEventListener("hashchange",changed);return()=>window.removeEventListener("hashchange",changed);},[]);
  useEffect(()=>{const reset=()=>{version.current++;controller.current?.abort();working.current=false;setBusy(false);setPreview(null);setError("");setAccount(isAuthenticated()?getCurrentUser().id:null);setAttempt(value=>value+1);};window.addEventListener("allert-session-changed",reset);window.addEventListener("storage",reset);return()=>{version.current++;controller.current?.abort();window.removeEventListener("allert-session-changed",reset);window.removeEventListener("storage",reset);};},[]);
  useEffect(()=>{if(!token||!account)return;const revision=++version.current;controller.current=new AbortController();setLoading(true);setPreview(null);setError("");
    void privateApi<any>("/node-sharing/preview",{method:"POST",body:{token},signal:controller.current.signal}).then(result=>{if(revision===version.current)setPreview(result);}).catch(error=>{if(revision===version.current)setError(error instanceof Error?error.message:"This link could not be checked.");}).finally(()=>{if(revision===version.current)setLoading(false);});
    return()=>{version.current++;controller.current?.abort();};},[account,token,attempt]);
  async function join(){
    if(working.current||!preview?.ok||!account||!token)return;
    working.current=true;setBusy(true);setError("");const revision=version.current;controller.current=new AbortController();
    try{const result=await privateApi<any>("/node-sharing/join",{method:"POST",body:{token},signal:controller.current.signal});if(revision!==version.current||account!==getCurrentUser().id)return;if(!result.ok)throw Error("The join could not be confirmed. Refresh and check.");clearPendingNodeShare();window.dispatchEvent(new Event("allert-node-changed"));navigate("/app/dashboard",{replace:true});}
    catch(error){if(revision===version.current)setError(error instanceof Error?error.message:"Unable to join this node.");}
    finally{if(revision===version.current){working.current=false;setBusy(false);}}
  }
  return <main className="min-h-screen bg-zinc-950 text-white px-6 py-12"><section className="max-w-md mx-auto rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6"><p className="text-sm text-emerald-400">ALLERT</p><h1 className="text-2xl font-bold mt-2">Join your home node</h1>
    {!token?<p role="alert" className="text-sm text-zinc-300 mt-4">Reopen the complete private link supplied by the node owner.</p>:!account?<><p className="text-sm text-zinc-300 mt-4">Sign in or create your own ALLERT account to access this shared node. You will confirm joining after sign-in.</p><button type="button" onClick={()=>navigate("/")} className="mt-5 rounded-lg bg-emerald-700 px-4 py-3">Sign in or create account</button></>:loading?<p role="status" className="text-sm text-zinc-400 mt-4">Checking private link…</p>:preview?.ok?<><p className="text-sm text-zinc-300 mt-4">Node: {preview.device_id}</p><p className="text-sm text-zinc-400 mt-1">{preview.location_label || "Home"}</p><p className="text-sm text-zinc-400 mt-4">Joining gives your account access to this home's sensor readings, forecasts, and sensor notices. Your diary stays private. The owner can see your display name and remove your access.</p><button type="button" disabled={busy} onClick={()=>{void join();}} className="mt-5 rounded-lg bg-emerald-700 px-4 py-3 disabled:opacity-50">{busy?"Joining…":"Join shared node"}</button></>:null}
    {error&&<p role="alert" className="text-sm text-red-300 mt-4">{error}</p>}{account&&error&&<button type="button" disabled={busy} onClick={()=>setAttempt(value=>value+1)} className="block underline text-sm mt-3">Check link again</button>}
    <button type="button" disabled={busy} onClick={()=>{clearPendingNodeShare();navigate(account?"/app/settings":"/",{replace:true});}} className="block text-sm text-zinc-400 underline mt-5">Cancel</button>
  </section></main>;
}
