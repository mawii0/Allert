import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router";
import { isAuthenticated } from "../utils/auth";
import { usePrivateResource } from "../utils/usePrivateResource";

export function AccessBoundary({ children }: { children: ReactNode }) {
  const [allowed, setAllowed] = useState(isAuthenticated);
  useEffect(() => {
    const check = () => setAllowed(isAuthenticated());
    window.addEventListener("storage", check);
    window.addEventListener("allert-session-changed", check);
    return () => { window.removeEventListener("storage", check); window.removeEventListener("allert-session-changed", check); };
  }, []);
  return allowed ? children : <Navigate to="/" replace />;
}

export function AdminBoundary({ children }: { children: ReactNode }) {
  const access=usePrivateResource<{allowed:boolean}>("/admin/access");
  return <AccessBoundary>{access.loading?<div className="bg-zinc-950 text-zinc-300 p-6" role="status">Checking administrator access…</div>:access.error?<div className="bg-zinc-950 text-zinc-300 p-6"><p role="alert">{access.error}</p><button onClick={access.retry} className="underline mt-3">Retry access check</button><a href="/app/settings" className="block underline mt-3">Return to Settings</a></div>:access.data?.allowed?children:<div className="bg-zinc-950 text-zinc-300 p-6"><p role="alert">Administrator access required.</p><a href="/app/settings" className="block underline mt-3">Return to Settings</a></div>}</AccessBoundary>;
}
