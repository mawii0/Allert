export function normalizeNodeClaim(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  if (typeof body.device_id !== "string" || typeof body.setup_code !== "string") return null;
  if (body.device_id.length > 100 || body.setup_code.length > 100) return null;
  const device_id = body.device_id.trim().toUpperCase();
  const setup_code = body.setup_code.replace(/[\s-]/g, "").toUpperCase();
  if (!/^ALLERT-NODE-\d{3}$/.test(device_id) || !/^[A-F0-9]{32}$/.test(setup_code)) return null;
  return { device_id, setup_code };
}
