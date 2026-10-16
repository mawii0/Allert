// Check again after an asynchronous read: a transfer can happen while data loads.
export async function currentNodeOwner(client, userId, device) {
  const query = client.from("sensor_devices").select("device_id,user_id,owner_since,is_active")
    .eq("device_id", device.device_id).eq("user_id", userId).eq("is_active", true).maybeSingle();
  // Let PostgreSQL compare the full timestamp, including sub-millisecond precision.
  if (device.owner_since) query.eq("owner_since", device.owner_since);
  const { data, error } = await query;
  if (error) throw Error("Node ownership could not be verified.");
  return !!data && Date.parse(data.owner_since || "1970-01-01T00:00:00Z") === Date.parse(device.owner_since || "1970-01-01T00:00:00Z");
}
