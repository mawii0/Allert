type InstallEvent = Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
let promptEvent:InstallEvent|null=null, started=false, installing=false, error="";
const subscribers=new Set<()=>void>();
const notify=()=>subscribers.forEach(update=>update());
export const installedApp=()=>typeof window!=="undefined" && (!!window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone===true);
export const installationState=()=>({available:!!promptEvent,installed:installedApp(),busy:installing,error});
export const subscribeInstallation=(update:()=>void)=>{subscribers.add(update);return()=>{subscribers.delete(update);};};
export function startInstallationSupport(){
  if(started || typeof window==="undefined")return;
  started=true;
  window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();promptEvent=event as InstallEvent;error="";notify();});
  window.addEventListener("appinstalled",()=>{promptEvent=null;installing=false;error="";notify();});
  window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change",notify);
  if(window.isSecureContext && "serviceWorker" in navigator){
    void(async()=>{
      const existing=await navigator.serviceWorker.getRegistration("/");
      if(existing?.active && existing.active.scriptURL!==new URL("/allert-sw.js",location.origin).href)return;
      await navigator.serviceWorker.register("/allert-sw.js",{scope:"/",updateViaCache:"none"});
    })().catch(()=>{error="Installation support could not load. Reload while connected.";notify();});
  }
}
export async function installApp(){
  if(installing || !promptEvent)return;
  const event=promptEvent;promptEvent=null;installing=true;error="";notify();
  try{await event.prompt();await event.userChoice;}catch{error="Installation did not complete. Use your browser’s install menu or reload to try again.";}
  finally{installing=false;notify();}
}
