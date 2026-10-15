const number = (value, min, max) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

export function normalizePacket(body, now = Date.now()) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  if (typeof body.device_id !== "string" || !/^ALLERT-NODE-\d{3}$/.test(body.device_id)) return null;
  if (typeof body.timestamp !== "string" || !/(Z|[+-]\d\d:\d\d)$/.test(body.timestamp)) return null;
  const timestamp = Date.parse(body.timestamp);
  if (!Number.isFinite(timestamp) || timestamp > now + 60_000 || timestamp < now - 7 * 86400_000) return null;
  if (!number(body.pm2_5, 0, 1000) || !number(body.pm10, 0, 1000) ||
      !number(body.temperature, -40, 125) || !number(body.humidity, 0, 100) ||
      !number(body.pm25_stddev, 0, 1000)) return null;
  if (body.expected_samples !== 30 || !Number.isInteger(body.sample_count) || body.sample_count < 1 || body.sample_count > 30) return null;
  if (!["VALID", "GAP_FLAGGED"].includes(body.data_quality_status)) return null;
  // A full block is required for model input. Preserve incomplete measurements as flagged data.
  if (body.data_quality_status === "VALID" && body.sample_count !== 30) return null;
  return {
    device_id: body.device_id,
    reading: {
      timestamp: new Date(timestamp).toISOString(),
      pm2_5: body.pm2_5, pm10: body.pm10,
      temperature: body.temperature, humidity: body.humidity,
      sample_count: body.sample_count, expected_samples: 30,
      pm25_stddev: body.pm25_stddev, data_quality_status: body.data_quality_status,
    },
  };
}

export async function tokenHash(token) {
  if (typeof token !== "string" || !/^[A-Fa-f0-9]{64}$/.test(token)) return null;
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
}

export async function handleIngest(request, ingest, now = Date.now()) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const hash = await tokenHash(request.headers.get("X-Allert-Device-Token"));
  if (!hash) return json({ error: "Invalid device credential" }, 401);
  if (request.headers.get("Content-Length") && Number(request.headers.get("Content-Length")) > 4096) {
    return json({ error: "Packet too large" }, 413);
  }
  let text;
  try {
    // Bound actual bytes, including chunked bodies without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Invalid JSON" }, 400);
    const chunks = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); return json({ error: "Packet too large" }, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    text = new TextDecoder().decode(bytes);
  } catch { return json({ error: "Unable to read packet" }, 400); }
  let packet;
  try { packet = normalizePacket(JSON.parse(text), now); }
  catch { return json({ error: "Invalid JSON" }, 400); }
  if (!packet) return json({ error: "Invalid sensor packet" }, 400);
  try {
    const result = await ingest(packet.device_id, hash, packet.reading);
    if (!result?.ok) {
      const status = [400, 401, 403, 409, 429, 503].includes(result?.status) ? result.status : 503;
      return json({ error: result?.error || "Unable to store packet" }, status);
    }
    return json({ ok: true, duplicate: result.duplicate === true });
  } catch { return json({ error: "Unable to store packet. Retry later." }, 503); }
}
