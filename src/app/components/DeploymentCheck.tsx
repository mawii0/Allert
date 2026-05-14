import { useState, useEffect } from "react";
import { AlertCircle, CheckCircle, Loader2, RefreshCw } from "lucide-react";
import { projectId, publicAnonKey } from "/utils/supabase/info";

export function DeploymentCheck() {
  const [status, setStatus] = useState<"checking" | "deployed" | "not-deployed">("checking");
  const [isChecking, setIsChecking] = useState(false);

  const checkDeployment = async () => {
    setIsChecking(true);
    setStatus("checking");

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-a473accf/health`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setStatus("deployed");
      } else {
        setStatus("not-deployed");
      }
    } catch (error) {
      // Silently handle - this is expected if not deployed
      setStatus("not-deployed");
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkDeployment();
  }, []);

  if (status === "deployed") {
    return null; // Don't show anything if deployed successfully
  }

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md">
      <div
        className={`rounded-xl p-4 border shadow-xl ${
          status === "checking"
            ? "bg-blue-500/10 border-blue-500/30"
            : "bg-orange-500/10 border-orange-500/30"
        }`}
      >
        <div className="flex items-start gap-3">
          {status === "checking" ? (
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
          )}

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm mb-1">
              {status === "checking" ? "Checking backend status..." : "Backend not deployed"}
            </h3>
            {status === "not-deployed" && (
              <>
                <p className="text-xs text-zinc-300 mb-2">
                  Authentication requires the backend to be deployed.
                </p>
                <div className="text-xs text-zinc-400 mb-3 space-y-1">
                  <div>1. Click the <strong className="text-zinc-200">settings icon</strong> in Make</div>
                  <div>2. Find <strong className="text-zinc-200">Supabase</strong> section</div>
                  <div>3. Click <strong className="text-zinc-200">Deploy edge function</strong></div>
                </div>
                <button
                  onClick={checkDeployment}
                  disabled={isChecking}
                  className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 rounded-lg text-xs font-medium text-orange-300 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isChecking ? "animate-spin" : ""}`} />
                  {isChecking ? "Checking..." : "Check again"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
