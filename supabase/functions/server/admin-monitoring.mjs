import { readingTableFor } from "./sensor-routing.mjs";
import { validObservedBlock } from "./anomaly-policy.mjs";

export async function nodeSnapshot(client, device, now = Date.now()) {
  const table = await readingTableFor(client,device.device_id);
  const columns = "id,device_id,timestamp,created_at,pm2_5,pm10,temperature,humidity,sample_count,expected_samples,data_quality_status";
  const [latest, history] = await Promise.all([
    client.from(table).select(columns).eq("device_id",device.device_id).order("timestamp",{ascending:false}).order("id",{ascending:false}).limit(1),
    client.from(table).select(columns).eq("device_id",device.device_id).gte("timestamp",new Date(now-86400000).toISOString()).lte("timestamp",new Date(now).toISOString()).order("timestamp").order("id").limit(1000),
  ]);
  if (latest.error || history.error) throw Error("Unable to load node telemetry.");
  const slots = new Map();
  for (const row of history.data || []) {
    const slot = Math.floor(Date.parse(row.timestamp)/300000);
    slots.set(slot,slots.has(slot) ? null : row);
  }
  const valid = [...slots.values()].filter(row => validObservedBlock(row,device.device_id,now) && Date.parse(row.timestamp)>now-86400000);
  const reading = latest.data?.[0] || null;
  return { device:{device_id:device.device_id,location_label:device.location_label,is_active:device.is_active,assigned:!!device.user_id},latest:reading,history:history.data || [],
    valid_blocks:valid.length,expected_blocks:288,coverage:valid.length/288*100,
    online:device.is_active && validObservedBlock(reading,device.device_id,now) && Date.parse(reading.timestamp)>=now-600000 && Date.parse(reading.timestamp)<=now,
    generated_at:new Date(now).toISOString(),truncated:(history.data?.length || 0)===1000 };
}
export async function adminOverview(client, now = Date.now()) {
  const since = new Date(now-86400000).toISOString();
  const [devices,events,accepted,eventCount,worker] = await Promise.all([
    client.from("sensor_devices").select("device_id,location_label,is_active,user_id,owner_since",{count:"exact"}).order("device_id").limit(100),
    client.from("allert_anomaly_events").select("id,device_id,observed_at,severity,metrics,classification,review_revision").order("observed_at",{ascending:false}).limit(30),
    client.from("allert_alert_deliveries").select("id",{count:"exact",head:true}).eq("status","accepted").gte("attempted_at",since),
    client.from("allert_anomaly_events").select("id",{count:"exact",head:true}).gte("observed_at",since),
    client.from("allert_alert_worker").select("last_finished_at,last_success_at,summary").eq("id",1).maybeSingle(),
  ]);
  if ([devices,events,accepted,eventCount,worker].some(result=>result.error)) throw Error("Admin data is unavailable. Check the feature migrations.");
  const nodes=[];
  for (let offset=0;offset<(devices.data || []).length;offset+=5) {
    const group = devices.data.slice(offset,offset+5);
    const snapshots = await Promise.all(group.map(async device => {
      try { return await nodeSnapshot(client,device,now); }
      catch { return {device:{device_id:device.device_id,location_label:device.location_label,is_active:device.is_active,assigned:!!device.user_id},error:"Telemetry unavailable",latest:null,history:[],coverage:null,online:false}; }
    }));
    nodes.push(...snapshots);
  }
  return { nodes,events:events.data || [],total_nodes:devices.count ?? nodes.length,truncated:(devices.count ?? nodes.length)>nodes.length,
    accepted_deliveries:accepted.count ?? 0,anomaly_count:eventCount.count ?? 0,worker:worker.data,generated_at:new Date(now).toISOString() };
}
