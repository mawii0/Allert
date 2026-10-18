import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {Hono} from 'hono';
import {installForecastRoutes,workerAuthorized} from '../supabase/functions/server/forecast-routes.mjs';
const epoch='2026-10-01T00:00:00Z';
let account,device,reads,mutate,queryError,flags;
const client={from(table){let single=false;const filters=[];const q={select(){return q},eq(k,v){filters.push({k,v});return q},gte(k,v){filters.push({k,v,gt:true});return q},in(k,v){filters.push({k,v,inside:true});return q},order(){return q},limit(){return q},maybeSingle(){single=true;return q},then(resolve,reject){
 reads.push({table,filters});let data=table==='sensor_devices'?[device]:table==='allert_node_memberships'?[]:table==='allert_forecast_worker'?[{device_id:'ALLERT-NODE-001',owner_epoch:epoch,status:'warming_up'}]:table==='allert_forecast_notices'?[{id:'own-event',user_id:'owner',device_id:'ALLERT-NODE-001',owner_epoch:epoch,created_at:new Date().toISOString()},{id:'other-event',user_id:'other',device_id:'ALLERT-NODE-001',owner_epoch:epoch,created_at:new Date().toISOString()}]:[{event_id:'own-event',user_id:'owner',status:'accepted'},{event_id:'other-event',user_id:'other',status:'accepted'}];
 data=data.filter(row=>row&&filters.every(({k,v,gt,inside})=>gt?Date.parse(row[k])>=Date.parse(v):inside?v.includes(row[k]):row[k]===v));const result={data:single?data[0]||null:data,error:queryError&&table==='allert_forecast_worker'?{}:null};if(table==='allert_forecast_notices')mutate?.();return Promise.resolve(result).then(resolve,reject);
 }};return q;}};
function app(){const app=new Hono();installForecastRoutes(app,async c=>account?{client,user:{id:account}}:{response:c.json({error:'Unauthorized'},401)},()=>{reads.push({worker:true});return client},{get:key=>flags[key]},async()=>assert.fail('No live push'));return app;}
beforeEach(()=>{account='owner';device={device_id:'ALLERT-NODE-001',user_id:'owner',owner_since:epoch,is_active:true};reads=[];mutate=null;queryError=false;flags={ALLERT_ALERT_WORKER_TOKEN:'worker-token',ALLERT_FORECAST_SENSOR_ID:'ALLERT-NODE-001'};});
test('forecast diagnostic endpoint requires authentication before database reads',async()=>{account=null;assert.equal((await app().request('/make-server-a473accf/forecast-alerts')).status,401);assert.equal(reads.length,0);});
test('worker endpoint rejects browser sessions and missing or wrong worker tokens',async()=>{
 for(const headers of [{},{Authorization:'Bearer session'},{'X-Allert-Worker-Token':'wrong'}])assert.equal((await app().request('/make-server-a473accf/forecasts/process',{method:'POST',headers})).status,401);assert.equal(reads.length,0);
});
test('authorized disabled worker returns an explicit disabled outcome',async()=>{const response=await app().request('/make-server-a473accf/forecasts/process',{method:'POST',headers:{'X-Allert-Worker-Token':'worker-token'}});assert.equal(response.status,200);assert.equal((await response.json()).outcome,'disabled');});
test('forecast diagnostics scope events and deliveries to the current account and node epoch',async()=>{
 const response=await app().request('/make-server-a473accf/forecast-alerts?user_id=other');assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');const data=await response.json();assert.equal(data.events.length,1);assert.equal(data.deliveries.length,1);assert.ok(!JSON.stringify(data).includes('other-event'));assert.ok(reads.some(row=>row.table==='allert_forecast_notices'&&row.filters.some(item=>item.k==='owner_epoch'&&item.v===epoch)));
});
test('an ownership change during diagnostics suppresses the in-flight response',async()=>{mutate=()=>{device.user_id='other'};const response=await app().request('/make-server-a473accf/forecast-alerts');assert.equal(response.status,409);assert.ok(!(await response.text()).includes('own-event'));});
test('an absent migration returns an error rather than a fabricated healthy status',async()=>{queryError=true;assert.equal((await app().request('/make-server-a473accf/forecast-alerts')).status,503);});
test('unlinked accounts receive an empty current-node response',async()=>{device.user_id='other';const response=await app().request('/make-server-a473accf/forecast-alerts');assert.equal(response.status,200);assert.equal((await response.json()).device,null);});
test('worker token comparison rejects absent, unequal and oversized values',async()=>{assert.equal(await workerAuthorized('same','same'),true);for(const value of ['',null,'different','a'.repeat(2049)])assert.equal(await workerAuthorized('same',value),false);});
