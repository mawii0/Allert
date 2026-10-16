import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {processForecastBatch} from '../supabase/functions/server/forecast-worker.mjs';
import {CHECKPOINT} from '../supabase/functions/server/environment-validation.mjs';
import {validPushSubscription} from '../supabase/functions/server/push-policy.mjs';
const origin=Math.floor(Date.now()/900000)*900000,now=origin+301000;
let flags,rows,cache,rpcs,writes,requests,sendCalls,pending,failCapture;
const device={device_id:'ALLERT-NODE-001',user_id:'owner',owner_since:new Date(now-60*3600000).toISOString(),is_active:true};
function model(){return {sensor_device_id:device.device_id,model_id:'median-residual-single-v1',checkpoint_sha256:CHECKPOINT,mode:'live',node_id:'node-1',status:'ok',trained_or_recalibrated:false,is_future_allergy_probability:false,forecast_origin:new Date(origin).toISOString(),forecasts:[6,12,24].flatMap(hours=>['pm2_5','pm10'].map(pollutant=>({horizon_hours:hours,pollutant,value:30,units:'ug/m3',target_block_end:new Date(origin+hours*3600000).toISOString(),target_block_start:new Date(origin+hours*3600000-300000).toISOString()})))};}
const query=table=>{
 let single=false;const q={select(){return q},eq(){return q},gte(){return q},lte(){return q},order(){return q},limit(){return q},maybeSingle(){single=true;return q},upsert(value){writes.push(value);return q},then(resolve,reject){const data=table==='sensor_readings'?rows:table==='node_ingestion_credentials'?{readings_table:'sensor_readings'}:table==='kv_store_a473accf'?cache?{value:cache}:null:pending;return Promise.resolve({data:single?data:data||[],error:null}).then(resolve,reject)}};return q;
};
const client={from:query,rpc:async(name,args)=>{rpcs.push({name,args});return {error:null,data:name==='begin_allert_forecast_run'?{ok:true,outcome:'started',device}:name==='finish_allert_forecast_run'?{ok:!failCapture}:name==='reserve_allert_forecast_push'?{ok:true,deliveries:[{deliveryId:'delivery',bindingId:'binding',subscription:{}}]}:{ok:true}};}};
const env={get:key=>flags[key]};
const transport=async(url,options)=>{requests.push({url,options});return new Response(JSON.stringify(model()));};
const send=async(...args)=>{sendCalls.push(args);return 201;};
const run=(fetcher=transport)=>processForecastBatch(client,env,send,fetcher,now);
const saved=()=>rpcs.find(call=>call.name==='finish_allert_forecast_run').args;
beforeEach(()=>{
 flags={ALLERT_FORECAST_ALERTS_ENABLED:'true',ALLERT_FORECAST_SENSOR_ID:device.device_id,ALLERT_MODEL_BASE_URL:'https://model.example',ALLERT_MODEL_API_TOKEN:'test-token'};rpcs=[];writes=[];requests=[];sendCalls=[];pending=[];cache=null;failCapture=false;
 rows=Array.from({length:649},(_,index)=>({device_id:device.device_id,timestamp:new Date(origin+300000-index*300000).toISOString(),created_at:new Date(origin+300500-index*300000).toISOString(),pm2_5:15,pm10:20,temperature:28,humidity:65,sample_count:30,expected_samples:30,data_quality_status:'VALID'}));
});
test('disabled collection and unassigned model sensors never read data or call inference',async()=>{
 flags.ALLERT_FORECAST_ALERTS_ENABLED='false';assert.equal((await run()).outcome,'disabled');assert.equal(rpcs.length,0);
 flags.ALLERT_FORECAST_ALERTS_ENABLED='true';delete flags.ALLERT_FORECAST_SENSOR_ID;assert.equal((await run()).outcome,'model_not_configured');assert.equal(rpcs.length,0);
});
test('complete genuine input calls the hosted model once and captures six verified forecasts',async()=>{
 const result=await run();assert.equal(result.outcome,'ready');assert.equal(requests.length,1);const request=requests[0];assert.equal(request.url,'https://model.example/v1/forecast');assert.equal(request.options.redirect,'error');assert.ok(request.options.signal instanceof AbortSignal);
 assert.equal(JSON.parse(request.options.body).history.length,648);assert.equal(saved().p_forecasts.length,6);assert.equal(writes.length,1);
});
test('current verified cache avoids another inference while still capturing household evidence',async()=>{
 cache=model();const result=await run(()=>assert.fail('Must use the cache'));assert.equal(result.outcome,'ready');assert.equal(saved().p_forecasts.length,6);
});
test('input gaps, duplicate blocks and missing receipts cannot create model forecasts',async()=>{
 for(const mutate of [()=>{rows.splice(200,1)},()=>{rows.push({...rows[100]})},()=>{rows[100].created_at=null}]){
  rpcs=[];rows=Array.from({length:649},(_,index)=>({device_id:device.device_id,timestamp:new Date(origin+300000-index*300000).toISOString(),created_at:new Date(origin+300500-index*300000).toISOString(),pm2_5:15,pm10:20,temperature:28,humidity:65,sample_count:30,expected_samples:30,data_quality_status:'VALID'}));mutate();await run(()=>assert.fail('Incomplete input must not call the model'));assert.equal(saved().p_forecasts.length,0);
 }
});
test('old readings, insecure model origin and wrong checkpoint cannot be promoted to live forecasts',async()=>{
 for(const mode of ['stale','insecure','checkpoint']){
  rpcs=[];writes=[];if(mode==='stale')rows=rows.slice(100);else if(mode==='insecure'){beforeResetRows();flags.ALLERT_MODEL_BASE_URL='http://model.example';}else flags.ALLERT_MODEL_BASE_URL='https://model.example';
  await run(async()=>{const value=model();value.checkpoint_sha256='0'.repeat(64);return new Response(JSON.stringify(value))});assert.equal(saved().p_forecasts.length,0);assert.equal(writes.length,0);
 }
 function beforeResetRows(){rows=Array.from({length:649},(_,index)=>({device_id:device.device_id,timestamp:new Date(origin+300000-index*300000).toISOString(),created_at:new Date(origin+300500-index*300000).toISOString(),pm2_5:15,pm10:20,temperature:28,humidity:65,sample_count:30,expected_samples:30,data_quality_status:'VALID'}));}
});
test('model transport failures record diagnostics without substituting fallback evidence',async()=>{
 await run(async()=>{throw Error('offline')});assert.equal(saved().p_status,'service_unavailable');assert.equal(saved().p_summary.errors,1);assert.deepEqual(saved().p_forecasts,[]);
});
test('ownership rejection prevents cache writes and notification delivery',async()=>{
 failCapture=true;await assert.rejects(run(),/ownership changed/);assert.equal(writes.length,0);assert.equal(sendCalls.length,0);
});
test('only database-reserved bindings are delivered and completion records provider acceptance',async()=>{
 flags.ALLERT_VAPID_PUBLIC_KEY='B'+'a'.repeat(86);flags.ALLERT_VAPID_PRIVATE_KEY='a'.repeat(43);flags.ALLERT_VAPID_SUBJECT='mailto:test@example.invalid';pending=[{id:'event'}];
 const result=await run();assert.equal(result.accepted,1);assert.equal(sendCalls.length,1);assert.equal(rpcs.find(call=>call.name==='finish_allert_forecast_push').args.p_http_status,201);
});
test('browser subscription validation allows known providers and rejects arbitrary network targets',()=>{
 const keys={p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64)]).toString('base64url'),auth:Buffer.alloc(16).toString('base64url')};
 for(const endpoint of ['https://fcm.googleapis.com/fcm/send/token','https://web.push.apple.com/token-1','https://updates.push.services.mozilla.com/wpush/v2/token_2'])assert.equal(validPushSubscription({endpoint,keys}),true,endpoint);
 for(const endpoint of ['https://web.push.apple.com.evil.example/token','https://web.push.apple.com/token?secret=1','https://web.push.apple.com:444/token','https://localhost/token','https://user:pass@web.push.apple.com/token','http://fcm.googleapis.com/wp/token','https://updates.push.services.mozilla.com/wpush/v2/token#hash'])assert.equal(validPushSubscription({endpoint,keys}),false,endpoint);
});
