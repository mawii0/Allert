import { readingTableFor } from './sensor-routing.mjs';
import { buildMonitor, modelPayload, modelInputStatus, validModelForecast, median } from './risk-monitor.mjs';
import { forecastEvidence } from './clinical-correlation.mjs';
import { pushConfiguration } from './push-policy.mjs';

// One explicitly configured model sensor. Additional sensors fail closed until separately validated.
export async function processForecastBatch(client, env, send, transport=fetch, now=Date.now()) {
  if(env.get('ALLERT_FORECAST_ALERTS_ENABLED')!=='true')return {outcome:'disabled'};
  const deviceId=env.get('ALLERT_FORECAST_SENSOR_ID');
  if(!/^ALLERT-NODE-\d{3}$/.test(deviceId || ''))return {outcome:'model_not_configured'};
  const deadline=Date.now()+40000;
  const runId=crypto.randomUUID();
  const start=await client.rpc('begin_allert_forecast_run',{p_device_id:deviceId,p_run_id:runId});
  if(start.error || !start.data?.ok)throw Error('Forecast reservation unavailable.');
  if(start.data.outcome!=='started')return {outcome:start.data.outcome};
  const device=start.data.device,epoch=device.owner_since || '1970-01-01T00:00:00Z';
  let status='unavailable',monitor=null,model=null;
  const summary={errors:0,eligible_blocks:0,required_blocks:648,missing_receipts:0,duplicate_blocks:0,origin:null};
  try {
    const table=await readingTableFor(client,deviceId);
    const history=await client.from(table).select('device_id,timestamp,created_at,pm2_5,pm10,temperature,humidity,sample_count,expected_samples,data_quality_status')
      .eq('device_id',deviceId).gte('timestamp',epoch).gte('timestamp',new Date(now-55*3600000).toISOString())
      .lte('timestamp',new Date(now).toISOString()).order('timestamp',{ascending:false}).limit(4096);
    if(history.error)throw Error('Forecast history unavailable.');
    const rows=history.data || [],latest=rows[0],telemetry={device,latest,history:rows};
    if(buildMonitor(telemetry,null,now).availability!=='ready')status='stale_or_missing_readings';
    else {
      const origin=Math.floor(Date.parse(latest.timestamp)/900000)*900000;summary.origin=new Date(origin).toISOString();
      Object.assign(summary,modelInputStatus(rows,origin,now)); delete summary.status;
      if(now-origin>600000)status='waiting_for_model_grid';
      else {
        const key=`sensor-model:v1:${deviceId}`;
        const cached=await client.from('kv_store_a473accf').select('value').eq('key',key).maybeSingle();
        if(cached.error)throw Error('Model cache unavailable.');
        if(validModelForecast(cached.data?.value,deviceId,now) && Date.parse(cached.data.value.forecast_origin)===origin && origin>=Date.parse(epoch))model=cached.data.value;
        else {
          const payload=modelPayload(rows,origin,now);
          if(!payload)status=modelInputStatus(rows,origin,now).status;
          else {
            const base=env.get('ALLERT_MODEL_BASE_URL'),token=env.get('ALLERT_MODEL_API_TOKEN');
            let url;try{url=new URL(base);}catch{}
            if(!url || url.protocol!=='https:' || url.username || url.password || url.search || url.hash || !token)status='model_not_configured';
            else {
              const reply=await transport(base.replace(/\/$/,'')+'/v1/forecast',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(20000)});
              const value=await reply.json();
              if(value && typeof value==='object' && !Array.isArray(value))value.sensor_device_id=deviceId;
              if(!reply.ok)status='model_service_error';
              else if(!validModelForecast(value,deviceId,now) || Date.parse(value.forecast_origin)!==origin)status='model_output_unverified';
              else {
                const last=payload.history.slice(-12);
                model={...value,input_baseline:{pm2_5:median(last.map(r=>r.pm2_5)),pm10:median(last.map(r=>r.pm10)),temperature:median(last.map(r=>r.temperature_c)),humidity:median(last.map(r=>r.humidity_percent)),reading_count:12,expected_readings:12,available_minutes:60,window_start:new Date(origin-3600000).toISOString(),window_end:new Date(origin).toISOString()}};
              }
            }
          }
        }
        if(model){monitor=buildMonitor(telemetry,model,now);status=forecastEvidence(monitor,now).length===6?'ready':'model_output_unverified';}
      }
    }
  }catch{status='service_unavailable';summary.errors++;}
  const saved=await client.rpc('finish_allert_forecast_run',{p_device_id:deviceId,p_owner_epoch:epoch,p_run_id:runId,p_status:status,p_summary:summary,p_forecasts:status==='ready'?forecastEvidence(monitor,now):[]});
  if(saved.error || !saved.data?.ok)throw Error('Forecast capture unavailable or ownership changed.');
  if(status==='ready'){
    // Persist the verified cache only after the DB has rechecked the ownership period.
    const cache=await client.from('kv_store_a473accf').upsert({key:`sensor-model:v1:${deviceId}`,value:model});
    if(cache.error)summary.errors++;
  }
  const config=pushConfiguration(env);let accepted=0;
  if(config.ready){
    const pending=await client.from('allert_forecast_notices').select('id').eq('device_id',deviceId).eq('status','pending').lte('next_attempt_at',new Date().toISOString()).order('next_attempt_at').limit(11);
    if(pending.error)throw Error('Forecast delivery queue unavailable.');
    for(const event of pending.data || []){
      if(Date.now()>deadline-11000)break;
      const reservation=await client.rpc('reserve_allert_forecast_push',{p_event_id:event.id,p_vapid_key:config.publicKey});
      if(reservation.error || !reservation.data?.ok){summary.errors++;continue;}
      await Promise.all((reservation.data.deliveries || []).map(async delivery=>{
        let code=null;try{code=await send(delivery.subscription,delivery.bindingId,event.id,config);}catch{}
        const result=await client.rpc('finish_allert_forecast_push',{p_delivery_id:delivery.deliveryId,p_http_status:code});
        if(result.error || !result.data?.ok)summary.errors++;else if(code>=200 && code<300)accepted++;
      }));
    }
  }
  return {outcome:status,accepted,...summary};
}
