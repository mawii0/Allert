const timeValue=value=>typeof value==="string" && /(Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value) : NaN;
export function historyRows(readings, end, deviceId) {
  if (!Array.isArray(readings) || !Number.isFinite(end)) return [];
  const unique=new Map();
  for(const reading of readings){
    const time=timeValue(reading?.timestamp);
    if (!Number.isFinite(time) || time<=end-86400000 || time>end || (deviceId && reading.device_id!==deviceId)) continue;
    const key=`${reading.device_id??""}:${time}`;
    const previous=unique.get(key);
    if(!previous || Number(reading.id??0)>Number(previous.id??0))unique.set(key,reading);
  }
  return [...unique.values()].sort((a,b)=>timeValue(b.timestamp)-timeValue(a.timestamp));
}
export function formatMeasurement(value) {
 return typeof value==="number" && Number.isFinite(value) ? value.toFixed(1) : "—";
}
export function formatSampleTime(value) {
 return Number.isFinite(timeValue(value)) ? new Date(value).toLocaleString("en-PH",{timeZone:"Asia/Manila",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",hour12:true}) : "Unavailable";
}
export function qualityPresentation(value) {
 const label=typeof value==="string" && value.trim() ? value.trim() : "Unavailable";
 const quality=label.toUpperCase();
 return {label,tone:["VALID","OK","ORIGINAL"].includes(quality)?"valid":["INVALID","ERROR","FAILED","MISSING"].includes(quality)?"invalid":"unknown"};
}
