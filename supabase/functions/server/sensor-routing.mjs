export async function readingTableFor(client, deviceId) {
  const { data, error } = await client.from("node_ingestion_credentials")
    .select("readings_table").eq("device_id", deviceId).maybeSingle();
  if (error) throw error;
  const table = data?.readings_table ?? "sensor_readings";
  if (typeof table !== "string" || !/^[a-z][a-z0-9_]{0,62}$/.test(table)) {
    throw new Error("Invalid server-owned reading table mapping");
  }
  return table;
}
