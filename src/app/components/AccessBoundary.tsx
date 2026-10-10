import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router";
import { isAuthenticated } from "../utils/auth";

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

export function AdminPreview({ children }: { children: ReactNode }) {
  return <AccessBoundary><div className="bg-amber-950 p-4 text-sm text-amber-200" role="status">Design preview only. Sensor tables, charts, alerts and administrative actions use sample data. No live administration is connected.</div>{children}</AccessBoundary>;
}
