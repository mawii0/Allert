import { useEffect, useRef, useState } from "react";
import { getCurrentUser } from "./auth";
import { privateApi } from "./private-api";

export function usePrivateResource<T>(path: string | null, poll = 60000) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const version = useRef(0);
  useEffect(() => {
    let active = true, pending = false;
    const revision = ++version.current, owner = getCurrentUser().id, controller = new AbortController();
    const current = () => active && revision === version.current && owner === getCurrentUser().id;
    setData(null); setError(""); setStatus(null); setLoading(!!path);
    const refresh = async () => {
      if (!path || pending) return;
      pending = true;
      try {
        const result = await privateApi<T>(path,{signal:controller.signal});
        if(current()){setData(result);setError("");setStatus(null);}
      } catch(error) {
        if(current()){setData(null);setError(error instanceof Error?error.message:"Unable to load data.");setStatus(typeof (error as any)?.status === "number"?(error as any).status:null);}
      } finally { pending=false;if(current())setLoading(false); }
    };
    const reset=()=>{version.current++;controller.abort();setData(null);setError("");setLoading(true);setAttempt(value=>value+1);};
    void refresh();
    const timer=poll?window.setInterval(refresh,poll):null;
    window.addEventListener("allert-session-changed",reset);window.addEventListener("storage",reset);
    window.addEventListener("allert-node-changed",reset);window.addEventListener("focus",refresh);
    return()=>{active=false;controller.abort();if(timer!==null)window.clearInterval(timer);window.removeEventListener("allert-session-changed",reset);window.removeEventListener("storage",reset);window.removeEventListener("allert-node-changed",reset);window.removeEventListener("focus",refresh);};
  },[path,poll,attempt]);
  return {data,loading,error,status,retry:()=>setAttempt(value=>value+1)};
}
