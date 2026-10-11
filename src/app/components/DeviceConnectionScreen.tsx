import { useNavigate } from "react-router";
import { Bluetooth, Wifi, Cloud, ArrowLeft } from "lucide-react";
import { Button } from "./ui/button";

export function DeviceConnectionScreen() {
  const navigate = useNavigate();
  return <div className="min-h-screen bg-zinc-950 text-white max-w-md mx-auto px-6 py-8">
    <button aria-label="Back to Settings" onClick={() => navigate("/app/settings")} className="mb-6 rounded-full bg-zinc-800 p-3"><ArrowLeft size={20}/></button>
    <p className="text-sm text-zinc-400 mb-1">Node Setup</p><h1 className="text-2xl font-bold mb-6">Connect Node Device</h1>
    <section className="rounded-2xl border border-emerald-800 bg-emerald-950/40 p-5 mb-6"><h2 className="font-semibold mb-2">Hardware not connected</h2><p className="text-sm text-zinc-300">You can use the cloud model's historical replay without a sensor. Device pairing will become available when the firmware and verified telemetry connection are ready.</p></section>
    {[{icon:Bluetooth,title:"Bluetooth Pairing",text:"Awaiting the device pairing protocol."},{icon:Wifi,title:"Wi-Fi Setup",text:"Awaiting firmware provisioning. No network credentials are collected."},{icon:Cloud,title:"Cloud Sync",text:"Historical model results are available. Live sensor ingestion is pending."}].map(step=><section key={step.title} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 mb-4 flex gap-3"><step.icon className="text-emerald-400 shrink-0"/><div><h2 className="font-semibold">{step.title}</h2><p className="text-xs text-zinc-400 mt-2">{step.text}</p></div></section>)}
    <Button className="w-full bg-emerald-600 mt-4" onClick={() => navigate("/app/dashboard")}>View Historical Results</Button>
  </div>;
}
