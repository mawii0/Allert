import { useId } from "react";
import type { useProfileSettings } from "../utils/useProfileSettings";

export function ProfileEditor({ settings }: { settings: ReturnType<typeof useProfileSettings> }) {
  const id = useId();
  return <div>
    {settings.editing ? <form aria-label="Edit profile" onSubmit={event => { event.preventDefault(); void settings.save(); }} className="space-y-4 mt-4">
      <div>
        <label htmlFor={`${id}-name`} className="block text-sm text-zinc-400 mb-2">Display name</label>
        <input id={`${id}-name`} name="name" autoComplete="name" required maxLength={100} value={settings.name} disabled={settings.saving}
          onChange={event => settings.setName(event.target.value)}
          className="w-full px-4 py-3 bg-zinc-950 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50" />
      </div>
      <div>
        <label htmlFor={`${id}-category`} className="block text-sm text-zinc-400 mb-2">Patient category</label>
        <select id={`${id}-category`} value={settings.demographic} disabled={settings.saving} aria-describedby={`${id}-category-help`}
          onChange={event => settings.setDemographic(event.target.value as "adult" | "pediatric")}
          className="w-full px-4 py-3 bg-zinc-950 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50">
          <option value="adult">Adult</option><option value="pediatric">Pediatric</option>
        </select>
        <p id={`${id}-category-help`} className="text-xs text-zinc-400 mt-2">Choose the category of the patient being monitored. This selects the category used by Risk Monitor.</p>
      </div>
      {settings.categoryChanged && <label className="flex items-start gap-3 text-sm text-zinc-300">
        <input type="checkbox" checked={settings.confirmed} disabled={settings.saving} onChange={event => settings.setConfirmed(event.target.checked)} className="mt-1 accent-emerald-500" />
        <span>I confirm changing the patient category to {settings.demographic === "adult" ? "Adult" : "Pediatric"}. Risk Monitor will use this category after saving.</span>
      </label>}
      <div className="flex gap-3">
        <button type="submit" disabled={!settings.canSave} className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium disabled:opacity-50">{settings.saving ? "Saving…" : "Save profile"}</button>
        <button type="button" disabled={settings.saving} onClick={settings.cancel} className="flex-1 py-3 px-4 border border-zinc-700 rounded-lg text-sm disabled:opacity-50">Cancel</button>
      </div>
    </form> : <button type="button" onClick={settings.begin} className="w-full py-3 px-4 border border-zinc-700 hover:bg-zinc-800 rounded-lg text-sm font-medium">Edit profile</button>}
    {settings.error && <p role="alert" className="text-sm text-red-400 mt-3">{settings.error}</p>}
    {settings.message && <p role="status" className="text-sm text-emerald-400 mt-3">{settings.message}</p>}
  </div>;
}
