import { Outlet, useNavigate } from "react-router";
import { BottomNavigation } from "./BottomNavigation";
import { useEffect } from "react";
import { isAuthenticated } from "../utils/auth";

export function Root() {
  const navigate = useNavigate();

  // Enable dark mode
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  // Check authentication on mount
  useEffect(() => {
    const userId = localStorage.getItem("allert_user_id");
    const check = () => { if (!isAuthenticated() || localStorage.getItem("allert_user_id") !== userId) navigate("/", { replace: true }); };
    check();
    window.addEventListener("storage", check);
    window.addEventListener("allert-session-changed", check);
    return () => { window.removeEventListener("storage", check); window.removeEventListener("allert-session-changed", check); };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-md mx-auto min-h-screen flex flex-col relative">
        <main className="flex-1 pb-20">
          <Outlet />
        </main>
        <BottomNavigation />
      </div>
    </div>
  );
}
