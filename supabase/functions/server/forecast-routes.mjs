// Historical regression module; not installed by the selected application entrypoint.
import { processForecastBatch } from './forecast-worker.mjs';
import { accessibleNode,currentNodeAccess } from './node-ownership.mjs';

export async function workerAuthorized(expected,actual){
 if(!expected || !actual || actual.length>2048)return false;
 const hash=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
 const a=await hash(expected),b=await hash(actual);let different=0;for(let i=0;i<a.length;i++)different|=a[i]^b[i];return different===0;
}
export function installForecastRoutes(app,authenticate,createClient,env,send){
 const root='/make-server-a473accf';
 app.post(`${root}/forecasts/process`,async c=>{
  if(!await workerAuthorized(env.get('ALLERT_ALERT_WORKER_TOKEN'),c.req.header('X-Allert-Worker-Token')))return c.json({error:'Unauthorized'},401);
  try{const result=await processForecastBatch(createClient(),env,send);return c.json(result,result.errors>0?503:200);}
  catch{return c.json({error:'Forecast processing unavailable. Check its migration and configuration.'},503);}
 });
 app.get(`${root}/forecast-alerts`,async c=>{
  c.header('Cache-Control','no-store');
  try{
   const account=await authenticate(c);if(account.response)return account.response;
   const {client,user}=account,device=await accessibleNode(client,user.id);
   if(device===undefined)return c.json({error:'Multiple active homes require node selection.'},409);
   if(!device)return c.json({device:null,worker:null,events:[],deliveries:[],enabled:env.get('ALLERT_FORECAST_ALERTS_ENABLED')==='true'});
   const epoch=device.owner_since || '1970-01-01T00:00:00Z';
   const [worker,events]=await Promise.all([
    client.from('allert_forecast_worker').select('status,last_attempt_at,last_finished_at,last_success_at,summary').eq('device_id',device.device_id).eq('owner_epoch',epoch).maybeSingle(),
    client.from('allert_forecast_notices').select('id,origin,target,horizon_hours,population,tier,score,status,created_at')
      .eq('device_id',device.device_id).eq('owner_epoch',epoch).eq('user_id',user.id).gte('created_at',device.access_since || epoch).order('origin',{ascending:false}).limit(10),
   ]);
   if(worker.error || events.error)throw Error('Forecast diagnostics unavailable');
   let deliveries={data:[],error:null};
   if(events.data?.length)deliveries=await client.from('allert_forecast_deliveries').select('event_id,status,http_status,attempted_at,completed_at').eq('user_id',user.id).in('event_id',events.data.map(row=>row.id)).order('attempted_at',{ascending:false}).limit(30);
   if(deliveries.error)throw Error('Delivery diagnostics unavailable');
   if(!await currentNodeAccess(client,user.id,device))return c.json({error:'Node access changed. Refresh this screen.'},409);
   return c.json({device:{device_id:device.device_id},enabled:env.get('ALLERT_FORECAST_ALERTS_ENABLED')==='true',sensorEnabled:device.device_id===env.get('ALLERT_FORECAST_SENSOR_ID'),worker:worker.data,events:events.data || [],deliveries:deliveries.data || []});
  }catch{return c.json({error:'Forecast notices unavailable. Check the release migration and backend files.'},503);}
 });
}
