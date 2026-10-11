export function summarizeHistory(history, now) {
  const points = history.filter(r => Number.isFinite(r.pm2_5) && Number.isFinite(Date.parse(r.timestamp)) && Date.parse(r.timestamp) > now - 86400000 && Date.parse(r.timestamp) <= now);
  if (!points.length) return { average: null, peaks: [], coverage: 0 };
  const hours = new Map();
  for (const r of points) {
    const hour = (new Date(r.timestamp).getUTCHours() + 8) % 24;
    const values = hours.get(hour) ?? []; values.push(r.pm2_5); hours.set(hour, values);
  }
  const peaks = [...hours].map(([hour, values]) => ({hour, average: values.reduce((a,b)=>a+b,0)/values.length})).sort((a,b)=>b.average-a.average || a.hour-b.hour).slice(0,2).map(x=>x.hour);
  return {average:points.reduce((sum,r)=>sum+r.pm2_5,0)/points.length,peaks,coverage:Math.min(100,new Set(points.map(r=>r.timestamp)).size / 288 * 100)};
}
export function metricTrend(history, field) {
  const values=history.map(r=>r[field]).filter(Number.isFinite);
  if (values.length < 2) return "Unavailable";
  const count=Math.min(12,Math.floor(values.length/2));
  const mean=a=>a.reduce((sum,v)=>sum+v,0)/a.length;
  const first=mean(values.slice(0,count)),last=mean(values.slice(-count));
  const tolerance=Math.max(Math.abs(first)*.02,.1);
  return Math.abs(last-first)<=tolerance ? "Stable" : last>first ? "Rising" : "Falling";
}
