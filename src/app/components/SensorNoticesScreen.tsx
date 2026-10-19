import "../../styles/patient-actions.css";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { SensorNotices } from "./SensorNotices";

export function SensorNoticesScreen() {
  const navigate = useNavigate();
  return <div className="sensor-notices-page allert-ui min-h-screen bg-zinc-950 px-5 py-6 pb-24 text-white">
    <button type="button" className="allert-action-link mb-4" onClick={() => navigate("/app/settings")}><ArrowLeft aria-hidden="true" />Back to Settings</button>
    <SensorNotices />
  </div>;
}
