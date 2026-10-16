import { useId } from "react";
import { Switch } from "./ui/switch";
import { useNodeLocation } from "../utils/useNodeLocation";
export function NodeLocationControls(){
  const location=useNodeLocation(),id=useId();
  return <div className="space-y-3">
    <div className="flex items-center justify-between py-2"><div><div className="text-sm font-medium">Location Services</div>
      <div className="text-xs text-zinc-500 max-w-[230px]">{location.loading?"Loading node location…":!location.device?"Link a node before saving its location.":location.location?.enabled?"An installed node position is saved.":"Capture once near the node, or enter its label manually."}</div></div>
      <Switch aria-label="Location services" disabled={location.loading || location.busy || !location.device || location.stale || !!location.error && !location.location}
        checked={!!location.location?.enabled || !!location.draft} onCheckedChange={value=>{if(value)void location.capture();else if(location.draft)location.cancel();else void location.save(true);}} />
    </div>
    {location.device && <>
      <label htmlFor={`${id}-label`} className="block text-xs text-zinc-400">Node location label</label>
      <input id={`${id}-label`} aria-label="Node location label" maxLength={100} value={location.label} disabled={location.busy || location.loading}
        onChange={event=>location.setLabel(event.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm text-white" placeholder="Home · Living room" />
      {(location.draft || location.location?.enabled) && <p className="text-xs text-zinc-400">{location.draft?"Captured phone position":"Saved node position"}: {Number(location.draft?.latitude ?? location.location.latitude).toFixed(4)}, {Number(location.draft?.longitude ?? location.location.longitude).toFixed(4)} · accuracy ±{Math.round(location.draft?.accuracy ?? location.location.accuracy)} m.</p>}
      {location.draft && <label className="flex gap-2 text-xs text-zinc-300"><input type="checkbox" checked={location.confirmed} disabled={location.busy} onChange={event=>location.setConfirmed(event.target.checked)} />I am near my sensor node and confirm this as its installed location.</label>}
      <p className="text-xs text-zinc-500">A one-time capture saves an approximate node position. Your phone is not tracked as it moves.</p>
      <div className="flex flex-wrap gap-4 text-xs"><button type="button" className="text-emerald-400 underline disabled:opacity-50" disabled={!location.canSave} onClick={()=>{void location.save();}}>{location.busy?"Working…":"Save node location"}</button>
        <button type="button" className="text-zinc-400 underline disabled:opacity-50" disabled={location.busy} onClick={location.cancel}>Cancel changes</button>
        {location.location?.enabled && <button type="button" className="text-zinc-400 underline disabled:opacity-50" disabled={location.busy || location.loading} onClick={()=>{void location.capture();}}>Capture a new position</button>}
      </div>
    </>}
    {location.error && <p role="alert" className="text-xs text-red-300">{location.error}</p>}
    {location.message && <p role="status" className="text-xs text-emerald-300">{location.message}</p>}
    <button type="button" disabled={location.busy || location.loading} onClick={location.retry} className="text-xs text-zinc-400 underline disabled:opacity-50">Refresh node location</button>
  </div>;
}
