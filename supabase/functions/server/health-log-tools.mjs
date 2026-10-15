export const validEntryId = value => typeof value === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(value);
export const symptomSummary = (vas, tnss) => Math.min(Math.round(vas * 3 + tnss * 1.5), 50);

// Individual records override legacy copies, including deletion tombstones.
export function visibleHealthLogs(entries, legacy, limit = 500) {
  const records = new Map();
  for (const entry of Array.isArray(legacy) ? legacy : []) if (validEntryId(entry?.id)) records.set(entry.id, entry);
  for (const entry of Array.isArray(entries) ? entries : []) if (validEntryId(entry?.id)) records.set(entry.id, entry);
  return [...records.values()].filter(entry => !entry.deletedAt)
    .sort((a, b) => Date.parse(b.observedAt || b.date) - Date.parse(a.observedAt || a.date) || b.id.localeCompare(a.id))
    .slice(0, limit).map(entry => ({ ...entry, revision: entry.revision || 1 }));
}
