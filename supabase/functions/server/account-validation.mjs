export const symptomKeys = ["sneezing", "itchy-nose", "runny-nose", "congestion"];
const finiteRange = (value, max) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
export function validProfile(body) {
  return !!body && typeof body === "object" && !Array.isArray(body)
    && (body.demographic === undefined || ["adult", "pediatric"].includes(body.demographic))
    && (body.name === undefined || typeof body.name === "string" && body.name.trim().length <= 100);
}
export function validHealthLog(body) {
  if (!body || !finiteRange(body.vasScore, 10) || !finiteRange(body.tnssScore, 12) || !Number.isInteger(body.tnssScore) || !finiteRange(body.riskLevel, 50)) return false;
  if (body.notes !== undefined && (typeof body.notes !== "string" || body.notes.length > 2000)) return false;
  if (body.requestId !== undefined && (typeof body.requestId !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(body.requestId))) return false;
  if (body.observedAt !== undefined && (typeof body.observedAt !== "string" || !/(Z|[+-]\d\d:\d\d)$/.test(body.observedAt) || !Number.isFinite(Date.parse(body.observedAt)) || Date.parse(body.observedAt) > Date.now() + 60000)) return false;
  if (body.symptomSeverities !== undefined) {
    const s = body.symptomSeverities;
    if (!s || Object.keys(s).length !== 4 || !symptomKeys.every(key => Number.isInteger(s[key]) && finiteRange(s[key], 3))) return false;
    if (symptomKeys.reduce((sum, key) => sum + s[key], 0) !== body.tnssScore) return false;
  }
  return true;
}
export function sameHealthLog(a, b) {
  const normalize = value => ({vasScore:value.vasScore, tnssScore:value.tnssScore, riskLevel:value.riskLevel, notes:value.notes || null,
    observedAt:value.observedAt || null, symptoms:value.symptomSeverities ? symptomKeys.map(key => value.symptomSeverities[key]) : null});
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
