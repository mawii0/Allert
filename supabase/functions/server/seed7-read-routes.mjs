import {accessibleNode,currentNodeAccess} from './node-ownership.mjs';
import {MODEL_ID,CHECKPOINT,OBSERVED_HASH,POLICY,INDICATOR_HASH,validIndicator,validStoredForecast,validPmInterpretations} from './seed7-policy.mjs';
const root='/make-server-a473accf';
export function observationReading(row){return row?{id:row.id,device_id:row.device_id,timestamp:row.block_end,created_at:row.received_at,
 pm2_5:row.pm2_5,pm10:row.pm10,temperature:row.temperature,humidity:row.humidity,sample_count:row.quality?.pm2_5==='ok'?30:null,expected_samples:30,pm25_stddev:null,
 data_quality_status:Object.values(row.quality || {}).every(v=>v==='ok')?'VALID':'CHANNEL_QUALITY',channel_quality:row.quality}:null;}
export function storedMonitor(device,observation,current,run,now=Date.now()){
 const reading=observationReading(observation),age=now-Date.parse(reading?.timestamp),fresh=age>=-60000 && age<=600000;
 const matching=current?.observation_id===observation?.id;
 const indicator=matching && validIndicator(current?.indicator)?current.indicator:null;
 const valid=device?.device_id==='ALLERT-NODE-001' && validStoredForecast(run,device.device_id,now);
 const interpreted=valid && validPmInterpretations(run.forecast_pm_indicator,run);
 const forecasts=valid?[6,12,24].map(h=>{const rows=run.result.forecasts.filter(v=>v.horizon_hours===h);return{horizon_hours:h,pm2_5:rows.find(v=>v.pollutant==='pm2_5').value,
 pm10:rows.find(v=>v.pollutant==='pm10').value,target_block_start:rows[0].target_block_start,target_block_end:rows[0].target_block_end,origin:run.origin,method:'seed7_model',forecast_pm_policy_id:POLICY.forecast_pm.id,forecast_pm_policy_hash:INDICATOR_HASH,forecast_pm_indicator:interpreted?run.forecast_pm_indicator.interpretations.find(v=>v.horizon_hours===h).populations:null};}):[];
 return{availability:!reading?'unavailable':fresh?'ready':'stale',device:device?{device_id:device.device_id,role:device.role}:null,
 current:reading?{...reading,risk:indicator}:null,indicator_status:!fresh?'stale':indicator?'ready':matching?'missing_or_invalid_channels':'processing',baseline:null,forecasts,
 model_id:MODEL_ID,checkpoint_sha256:CHECKPOINT,model_status:device?.device_id!=='ALLERT-NODE-001'?'sensor_not_enabled_for_model':valid?'ready':run?.status==='ready'?'stale_or_unverified_forecast':run?.status || 'warming_up',
 model_input:run?.summary || null,provenance:valid?{receipt_cutoff:run.receipt_cutoff,generated_at:run.result.generated_at,input_hash:run.input_hash,origin:run.origin}:null};
}
export function installSeed7ReadRoutes(app,authenticate,env={get:()=>undefined}){
 const guard=fn=>async c=>{try{const a=await authenticate(c);if(a.response)return a.response;const device=await accessibleNode(a.client,a.user.id);
 if(device===undefined)return c.json({error:'Select one active home.'},409);
 const payload=await fn(a,device);
 if(device && !await currentNodeAccess(a.client,a.user.id,device))return c.json({error:'Node access changed. Refresh this screen.'},409);
 c.header('Cache-Control','no-store');return c.json(payload);
 }catch{return c.json({error:'Analytics unavailable. Check the reviewed seed-7 migration and worker deployment.'},503);}};
 const scope=(query,device)=>query.eq('device_id',device.device_id).eq('stream_id','live').eq('owner_epoch',device.owner_since || '1970-01-01T00:00:00Z');
 async function monitor({client},device){
 if(!device)return storedMonitor(null,null,null,null);
 const [reading,state,forecasts,heartbeat,settings]=await Promise.all([
 scope(client.from('allert_v2_observations').select('*'),device).eq('mode','live').order('block_end',{ascending:false}).limit(1),
 scope(client.from('allert_v2_current').select('*'),device).eq('policy_hash',OBSERVED_HASH).maybeSingle(),
 scope(client.from('allert_v2_forecasts').select('*'),device).eq('mode','live').eq('model_id',MODEL_ID).eq('checkpoint_sha256',CHECKPOINT).order('origin',{ascending:false}).limit(1),
 client.from('allert_v2_worker').select('last_finished_at,summary').eq('id',1).maybeSingle(),
 client.from('allert_v2_settings').select('enabled,forecast_enabled').eq('id',1).maybeSingle()]);
 if([reading,state,forecasts,heartbeat,settings].some(r=>r.error))throw Error('Analytics query failed');
 const value=storedMonitor(device,reading.data?.[0],state.data,forecasts.data?.[0]);
 if(settings.data?.forecast_enabled!==true && device.device_id==='ALLERT-NODE-001'){value.forecasts=[];value.model_status='model_not_enabled';value.provenance=null;}
 return {...value,worker:{...heartbeat.data,enabled:settings.data?.enabled===true}};
 }
 app.post(root+'/forecasts/process',async c=>{
 const actual=c.req.header('X-Allert-Worker-Token'),expected=env.get('ALLERT_ALERT_WORKER_TOKEN');
 if(!actual || !expected || actual.length>2048)return c.json({error:'Unauthorized'},401);
 const digest=async v=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)));
 const a=await digest(actual),b=await digest(expected);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
 return diff?c.json({error:'Unauthorized'},401):c.json({outcome:'retired_forecast_scheduler',replacement:'Vercel durable seed7 jobs'});
 });
 app.get(root+'/risk-monitor',guard(monitor));
 app.get(root+'/forecast-alerts',guard(async(a,device)=>{
 const value=await monitor(a,device);return{...value,enabled:true,sensorEnabled:device?.device_id==='ALLERT-NODE-001',worker:{status:value.model_status,summary:value.model_input || {}},events:[],deliveries:[]};}));
 app.get(root+'/analytics-events',guard(async({client},device)=>{
 if(!device)return{device:null,events:[],detector:null,processorReady:false};
 const [events,state,heartbeat]=await Promise.all([
 scope(client.from('allert_v2_events').select('id,phase,event,observed_at,policy_hash'),device).eq('mode','live').eq('policy_hash',OBSERVED_HASH).gte('observed_at',device.access_since || device.owner_since).order('observed_at',{ascending:false}).limit(30),
 scope(client.from('allert_v2_current').select('decision,observed_at,updated_at'),device).eq('policy_hash',OBSERVED_HASH).maybeSingle(),
 client.from('allert_v2_worker').select('last_finished_at,summary').eq('id',1).maybeSingle()]);
 if([events,state,heartbeat].some(r=>r.error))throw Error('Observed event query failed');
 const age=Date.now()-Date.parse(heartbeat.data?.last_finished_at),fresh=Date.now()-Date.parse(state.data?.observed_at)<=600000;
 return{device:{device_id:device.device_id},events:events.data || [],detector:state.data,processorReady:age>=0 && age<180000 && heartbeat.data?.summary?.enabled===true && heartbeat.data?.summary?.current_errors===0,fresh};}));
 // Old publishing endpoint must not reintroduce previous-model snapshots.
 app.post(root+'/environment',async c=>c.json({error:'Use the registered-node ingestion and durable analytics worker.'},410));
}
