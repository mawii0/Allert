// Historical regression module; not installed by the selected application entrypoint.
import { detectObservedAnomalies } from "./anomaly-policy.mjs";
import { readingTableFor } from "./sensor-routing.mjs";
import { pushConfiguration } from "./push-policy.mjs";

export async function automaticAnomalyReady(client,env,now=Date.now()) {
  if(env.get("ALLERT_ANOMALY_ALERTS_ENABLED")!=="true")return false;
  try {
    const {data,error}=await client.from("allert_alert_worker").select("last_success_at,summary").eq("id",1).maybeSingle();
    const age=now-Date.parse(data?.last_success_at || "");
    return !error && data?.summary?.errors===0 && Number.isFinite(age) && age>=0 && age<180000;
  }catch{return false;}
}

export async function processAnomalyBatch(client, env, send, now = Date.now()) {
  const deadline = Date.now() + 40000;
  const runId = crypto.randomUUID();
  const started = await client.rpc("begin_allert_alert_run", { p_run_id: runId });
  if (started.error || !started.data?.ok) throw Error("Unable to reserve the alert worker.");
  if (started.data.outcome !== "started") return { outcome: "busy" };
  let cursor = started.data.cursor || "";
  const summary = { processed: 0, events: 0, accepted: 0, errors: 0 };
  try {
    const selectDevices = after => client.from("sensor_devices").select("device_id,user_id,owner_since,is_active").eq("is_active",true).not("user_id","is",null).gt("device_id",after).order("device_id").limit(5);
    let devices = await selectDevices(cursor);
    if (devices.error) throw Error("Unable to read registered nodes.");
    if (!devices.data?.length && cursor) { cursor = ""; devices = await selectDevices(""); }
    if (devices.error) throw Error("Unable to read registered nodes.");
    for (const device of devices.data || []) {
      if (Date.now() > deadline - 15000) break;
      cursor = device.device_id;
      try {
        const epoch = device.owner_since || "1970-01-01T00:00:00.000Z";
        const table = await readingTableFor(client,device.device_id);
        const [history, previous] = await Promise.all([
          client.from(table).select("device_id,timestamp,created_at,pm2_5,pm10,temperature,humidity,sample_count,expected_samples,data_quality_status")
            .eq("device_id",device.device_id).gte("timestamp",new Date(now-6*3600000).toISOString()).gte("timestamp",epoch)
            .lte("timestamp",new Date(now+60000).toISOString()).order("timestamp",{ascending:false}).limit(1000),
          client.from("allert_detector_state").select("revision,state").eq("device_id",device.device_id).eq("user_id",device.user_id).eq("owner_epoch",epoch).maybeSingle(),
        ]);
        if (history.error || previous.error) throw Error("Unable to load detector history.");
        const result = detectObservedAnomalies(history.data || [],device,previous.data?.state || {},now);
        const saved = await client.rpc("record_allert_detection", { p_device_id:device.device_id,p_user_id:device.user_id,p_owner_epoch:epoch,p_revision:previous.data?.revision || 0,p_result:result });
        if (saved.error || !saved.data?.ok) throw Error("Unable to persist detector state.");
        summary.processed += result.processed; summary.events += saved.data.added;
      } catch { summary.errors++; }
    }
    const configuration = pushConfiguration(env);
    if (configuration.ready) {
      const pending = await client.from("allert_alert_recipients").select("event_id,user_id").eq("status","pending").lte("next_attempt_at",new Date().toISOString()).order("next_attempt_at").limit(33);
      if (pending.error) throw Error("Unable to load alert delivery queue.");
      for (const eventId of [...new Set((pending.data || []).map(row=>row.event_id))].slice(0,3)) {
        if (Date.now() > deadline - 11000) break;
        const reserved = await client.rpc("reserve_allert_family_event", { p_event_id:eventId,p_vapid_key:configuration.publicKey });
        if (reserved.error || !reserved.data?.ok) { summary.errors++; continue; }
        if (reserved.data.outcome !== "reserved") continue;
        await Promise.all((reserved.data.deliveries || []).map(async delivery => {
          let status = null;
          try { status = await send(delivery.subscription,delivery.bindingId,eventId,configuration); }
          catch { /* Ambiguous transport is recorded; never blindly resend a reserved delivery. */ }
          const finished = await client.rpc("finish_allert_anomaly_push", { p_delivery_id:delivery.deliveryId,p_http_status:status });
          if (finished.error || !finished.data?.ok) summary.errors++;
          else if (status >= 200 && status < 300) summary.accepted++;
          else if (status === null || status >= 500) summary.errors++;
        }));
      }
    }
  } catch { summary.errors++; }
  const finished = await client.rpc("finish_allert_alert_run", { p_run_id:runId,p_cursor:cursor,p_summary:summary });
  if (finished.error || !finished.data?.ok) throw Error("Unable to finish the alert worker.");
  return { outcome:summary.errors ? "partial_failure" : "processed", ...summary };
}
