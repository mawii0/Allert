import {observationReading} from './seed7-read-routes.mjs';
const validPm=row=>!!row && ['pm2_5','pm10'].every(k=>row.quality?.[k]==='ok' && Number.isFinite(row[k]) && row[k]>=0);
export async function nodeSnapshot(client,device,now=Date.now()){
 const scope=q=>q.eq('device_id',device.device_id).eq('stream_id','live').eq('mode','live');
 const [latest,history]=await Promise.all([
 scope(client.from('allert_v2_observations').select('*')).order('block_end',{ascending:false}).limit(1),
 scope(client.from('allert_v2_observations').select('*')).gte('block_end',new Date(now-86400000).toISOString()).lte('block_end',new Date(now).toISOString()).order('block_end').limit(1000)]);
 if(latest.error || history.error)throw Error('Unable to read canonical telemetry');
 const rows=history.data || [],valid=rows.filter(validPm),raw=latest.data?.[0],reading=observationReading(raw),age=now-Date.parse(raw?.block_end);
 return{device:{device_id:device.device_id,location_label:device.location_label,is_active:device.is_active,assigned:!!device.user_id},latest:reading,history:rows.map(observationReading),
 valid_blocks:valid.length,expected_blocks:288,coverage:valid.length/288*100,coverage_basis:'valid_pm_blocks',online:device.is_active && validPm(raw) && age>=0 && age<=600000,generated_at:new Date(now).toISOString(),truncated:rows.length===1000};
}
export async function adminOverview(client, now = Date.now()) {
  const since = new Date(now-86400000).toISOString();
  const [devices,events,accepted,eventCount,worker] = await Promise.all([
    client.from("sensor_devices").select("device_id,location_label,is_active,user_id,owner_since",{count:"exact"}).order("device_id").limit(100),
    client.from("allert_anomaly_events").select("id,device_id,observed_at,severity,metrics,reading,classification,review_revision").order("observed_at",{ascending:false}).limit(30),
    client.from("allert_alert_deliveries").select("id",{count:"exact",head:true}).eq("status","accepted").gte("attempted_at",since),
    client.from("allert_anomaly_events").select("id",{count:"exact",head:true}).gte("observed_at",since),
    client.from("allert_v2_worker").select("last_finished_at,summary").eq("id",1).maybeSingle(),
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
