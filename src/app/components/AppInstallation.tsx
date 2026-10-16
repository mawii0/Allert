import { useEffect,useState } from "react";
import { installationState,subscribeInstallation,installApp } from "../utils/pwa-install";
export function AppInstallation(){
  const [state,setState]=useState(installationState);
  useEffect(()=>subscribeInstallation(()=>setState(installationState())),[]);
  return <div className="text-left border-t border-zinc-800 mt-4 pt-4" aria-label="App installation">
    <p className="text-sm text-zinc-300 font-medium">Install ALLERT</p>
    {state.installed?<p className="text-xs text-emerald-400 mt-2">Running as an installed app.</p>:state.available?<button type="button" disabled={state.busy} onClick={()=>{void installApp();}} className="text-xs text-emerald-400 underline mt-2 disabled:opacity-50">{state.busy?"Opening installation…":"Install on this device"}</button>:<p className="text-xs text-zinc-400 mt-2">Use your browser menu → Install app or Add to Home Screen. On iPhone, open in Safari and choose Share → Add to Home Screen.</p>}
    {state.error&&<p role="alert" className="text-xs text-red-300 mt-2">{state.error}</p>}
    <p className="text-xs text-zinc-500 mt-2">An internet connection is required for readings, diary saves, and account changes. Installation does not enable notifications automatically.</p>
  </div>;
}
export function ConnectionStatus(){
  const [offline,setOffline]=useState(()=>typeof navigator!=="undefined" && navigator.onLine===false);
  useEffect(()=>{const update=()=>setOffline(navigator.onLine===false);window.addEventListener("online",update);window.addEventListener("offline",update);return()=>{window.removeEventListener("online",update);window.removeEventListener("offline",update);};},[]);
  return offline?<div role="status" className="bg-amber-950 text-amber-200 text-xs px-4 py-3 text-center">Your device reports it is offline. Readings may be outdated; reconnect before saving changes.</div>:null;
}
