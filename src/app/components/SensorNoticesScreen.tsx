import { useNavigate } from "react-router";
import { SensorNotices } from "./SensorNotices";

export function SensorNoticesScreen() {
  const navigate = useNavigate();
  return <div className="min-h-screen bg-zinc-950 px-5 py-6 pb-24 text-white">
    <button type="button" className="mb-5 text-sm text-emerald-400 underline" onClick={() => navigate("/app/settings")}>Back to Settings</button>
    <SensorNotices />
  </div>;
}
