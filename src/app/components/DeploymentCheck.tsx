import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { useServiceHealth } from "../utils/useServiceHealth";

export function DeploymentCheck() {
  const {state,retry}=useServiceHealth();
  if(state.kind==="ready")return null;
  const checking=state.kind==="checking",offline=state.kind==="offline";
  const title=checking?"Checking connection…":offline?"Your device is offline":"Connection check could not finish";
  const detail=checking?(state.attempt>1?"Retrying the connection check…":"Checking the ALLERT connection…"):
    offline?"Reconnect to the internet. ALLERT will check again automatically.":
    state.kind==="network" || state.kind==="timeout"?"ALLERT could not confirm its connection. It will check again automatically. You can also retry below.":
    state.kind==="http"?`The connection check returned HTTP ${state.status}. Try again shortly. If it continues, contact the ALLERT team.`:
    "The connection check received an unexpected response. Try again shortly. If it continues, contact the ALLERT team.";
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md" role="status" aria-live="polite">
      <div className={`rounded-xl p-4 border shadow-xl ${checking?"bg-blue-500/10 border-blue-500/30":"bg-orange-500/10 border-orange-500/30"}`}>
        <div className="flex items-start gap-3">
          {checking?<Loader2 className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0 mt-0.5"/>:<AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5"/>}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm mb-1">{title}</h3>
            <p className="text-xs text-zinc-300 mb-2">{detail}</p>
            {!checking&&<button type="button" onClick={retry} className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 rounded-lg text-xs font-medium text-orange-300 transition-colors disabled:opacity-50">
              <RefreshCw className="w-3 h-3"/>Check again
            </button>}
          </div>
        </div>
      </div>
    </div>
  );
}
