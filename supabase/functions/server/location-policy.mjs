export function normalizeNodeLocation(body, now = Date.now()) {
  if (!body || typeof body.deviceId !== "string" || body.deviceId.length > 200 || !body.deviceId.trim() ||
      !Number.isInteger(body.revision) || body.revision < 0 || body.revision >= 1000000000 || typeof body.enabled !== "boolean" ||
      typeof body.label !== "string" || !body.label.trim() || body.label.trim().length > 100 || /[\u0000-\u001f\u007f]/.test(body.label) ||
      typeof body.ownerEpoch !== "string" || !Number.isFinite(Date.parse(body.ownerEpoch))) return null;
  const result = { label: body.label.trim(), enabled: body.enabled };
  if (body.enabled) {
    const finite = (value,min,max) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
    const captured = Date.parse(body.capturedAt);
    if (!finite(body.latitude,-90,90) || !finite(body.longitude,-180,180) || !finite(body.accuracy,0,1000000) ||
        typeof body.capturedAt !== "string" || !/(Z|[+-]\d\d:\d\d)$/.test(body.capturedAt) || !Number.isFinite(captured) || captured > now+60000) return null;
    Object.assign(result, { latitude: Math.round(body.latitude*10000)/10000, longitude: Math.round(body.longitude*10000)/10000, accuracy: body.accuracy, capturedAt: body.capturedAt });
  }
  return { deviceId: body.deviceId, ownerEpoch: body.ownerEpoch, revision: body.revision, location: result };
}
