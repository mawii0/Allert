export const manilaDay = value => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
export function manilaInput(value) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return `${manilaDay(value)}T${parts.hour}:${parts.minute}`;
}
export function filteredDiary(entries, query, days, now) {
  const search = query.trim().toLowerCase();
  const start = days ? manilaDay(now - (days - 1) * 86400000) : null;
  return entries.filter(entry => {
    const at = Date.parse(entry.observedAt || entry.date);
    if (!Number.isFinite(at) || at > now + 60000) return false;
    if (start && manilaDay(at) < start) return false;
    const text = [entry.notes || "", manilaDay(at), `VAS ${entry.vasScore}`, `TNSS ${entry.tnssScore}`].join(" ").toLowerCase();
    return !search || text.includes(search);
  }).sort((a, b) => Date.parse(b.observedAt || b.date) - Date.parse(a.observedAt || a.date) || b.id.localeCompare(a.id));
}
export function diaryDailyTrend(entries) {
  const days = new Map();
  for (const entry of entries) {
    const at = Date.parse(entry.observedAt || entry.date);
    if (!Number.isFinite(at)) continue;
    const day = manilaDay(at);
    const group = days.get(day) || { day, vas: 0, tnss: 0, count: 0 };
    group.vas += entry.vasScore; group.tnss += entry.tnssScore; group.count++;
    days.set(day, group);
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day))
    .map(({day, vas, tnss, count}) => ({ day, vas: vas / count, tnss: tnss / count, count }));
}
export function csvRows(rows) {
  const cell = value => {
    let text = String(value ?? "");
    // Notes are untrusted spreadsheet input, including formula prefixes after whitespace.
    if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return "\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n");
}
export function diaryCsv(entries) {
  const columns = ["Observed time (when recorded)", "Entry creation time", "VAS (0-10)", "TNSS (0-12)", "Sneezing (0-3)", "Itchy nose (0-3)", "Runny nose (0-3)", "Congestion (0-3)", "Notes", "Updated time"];
  return csvRows([columns, ...entries.map(entry => [entry.observedAt || "", entry.date, entry.vasScore, entry.tnssScore,
    ...["sneezing", "itchy-nose", "runny-nose", "congestion"].map(key => entry.symptomSeverities?.[key] ?? ""), entry.notes, entry.updatedAt])]);
}
