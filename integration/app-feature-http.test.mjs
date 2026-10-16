import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {Hono} from 'hono';
import {installAppFeatureRoutes} from '../supabase/functions/server/app-feature-routes.mjs';
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',eventId='33333333-3333-4333-8333-333333333333',epoch='2026-10-01T00:00:00Z';
let tables,queries,rpcs,rpcResult,failTable,flags;
function query(table){const filters=[];let single=false,head=false,limit=Infinity,sort=[];const q={
  select(columns,options={}){queries.push({table,columns,filters});head=!!options.head;return q;},
  eq(key,value){filters.push({key,value,op:'eq'});return q;},gt(key,value){filters.push({key,value,op:'gt'});return q;},gte(key,value){filters.push({key,value,op:'gte'});return q;},lte(key,value){filters.push({key,value,op:'lte'});return q;},not(key,_is,value){filters.push({key,value,op:'not'});return q;},
  order(key,options={}){sort.push({key,ascending:options.ascending!==false});return q;},limit(value){limit=value;return q;},maybeSingle(){single=true;return q;},
  then(resolve,reject){if(table===failTable)return Promise.resolve({error:{message:'unavailable'},data:null}).then(resolve,reject);let rows=[...(tables[table] || [])].filter(row=>filters.every(({key,value,op})=>op==='eq'?row[key]===value:op==='gt'?row[key]>value:op==='gte'?row[key]>=value:op==='lte'?row[key]<=value:row[key]!==value));const count=rows.length;rows.sort((a,b)=>{for(const item of sort){if(a[item.key]!==b[item.key])return(a[item.key]>b[item.key]?1:-1)*(item.ascending?1:-1);}return 0;});rows=rows.slice(0,limit);return Promise.resolve({data:head?null:single?rows[0] || null:rows,error:null,count}).then(resolve,reject);},
};return q;}
const client={from:query,rpc:async(name,args)=>{rpcs.push({name,args});return{data:rpcResult,error:null};}};
const env={get:key=>flags[key]};
const app=new Hono();installAppFeatureRoutes(app,async c=>{
  const token=c.req.header('Authorization');return['Bearer owner','Bearer other'].includes(token)?{client,user:{id:token==='Bearer owner'?owner:other,user_metadata:{role:'admin'}}}:{response:c.json({error:'Please sign in.'},401)};
},()=>client,env,async()=>{throw Error('No network transport in HTTP tests');});
const request=(path,method='GET',body,token='owner',headers={})=>app.request('https://example.invalid/make-server-a473accf'+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
beforeEach(()=>{
  queries=[];rpcs=[];failTable=null;flags={};rpcResult={ok:true,location:{revision:1,label:'Saved'},event:{id:eventId,review_revision:1}};
  const now=new Date().toISOString();tables={sensor_devices:[{device_id:'NODE-A',user_id:owner,owner_since:epoch,is_active:true,location_label:'Home'}],node_ingestion_credentials:[{device_id:'NODE-A',readings_table:'sensor_readings'}],
    allert_alert_worker:[{id:1,last_success_at:now,summary:{errors:0}}],allert_admin_users:[],allert_node_locations:[],allert_anomaly_events:[],allert_detector_state:[],sensor_readings:[],allert_alert_deliveries:[],allert_anomaly_reviews:[]};
});
test('every private feature rejects missing or forged sessions before querying storage',async()=>{
  for(const [path,method] of [['/alerts','GET'],['/node-location','GET'],['/node-location','PUT'],['/admin/access','GET'],['/admin/overview','GET'],['/admin/nodes/NODE-A','GET'],['/admin/anomalies/'+eventId,'GET'],['/admin/anomalies/'+eventId,'PUT']])for(const token of ['', 'forged'])assert.equal((await request(path,method,method==='PUT'?{}:undefined,token)).status,401);
  assert.equal(queries.length,0);assert.equal(rpcs.length,0);
});
test('user-editable metadata and worker headers cannot grant admin access',async()=>{
  assert.equal((await request('/admin/overview')).status,403);assert.equal((await request('/admin/anomalies/'+eventId,'PUT',{})).status,403);assert.equal((await request('/admin/nodes/NODE-A','GET',undefined,'owner',{'X-Allert-Worker-Token':'worker'})).status,403);
  assert.deepEqual(queries.map(item=>item.table),['allert_admin_users','allert_admin_users','allert_admin_users']);
});
test('a role check failure is an error rather than a false success or private-data fallback',async()=>{
  failTable='allert_admin_users';assert.equal((await request('/admin/access')).status,503);assert.equal((await request('/admin/overview')).status,503);
});
test('admin overview returns actual registered nodes and real empty event totals',async()=>{
  tables.allert_admin_users=[{user_id:owner,active:true}];const response=await request('/admin/overview');assert.equal(response.status,200);const result=await response.json();assert.equal(result.nodes.length,1);assert.equal(result.nodes[0].device.device_id,'NODE-A');assert.equal(result.nodes[0].latest,null);assert.equal(result.accepted_deliveries,0);assert.equal(result.anomaly_count,0);assert.equal(result.nodes[0].online,false);assert.ok(!JSON.stringify(result).includes('ilo-node-06'));
});
test('an unavailable admin source cannot be converted into fabricated zero statistics',async()=>{
  tables.allert_admin_users=[{user_id:owner,active:true}];failTable='allert_anomaly_events';assert.equal((await request('/admin/overview')).status,503);
});
test('node detail uses the server-owned readings-table mapping and selected node filter',async()=>{
  tables.allert_admin_users=[{user_id:owner,active:true}];tables.node_ingestion_credentials[0].readings_table='second_readings';tables.second_readings=[];
  assert.equal((await request('/admin/nodes/NODE-A')).status,200);assert.equal(queries.filter(item=>item.table==='second_readings').length,2);assert.ok(queries.filter(item=>item.table==='second_readings').every(item=>item.filters.some(filter=>filter.key==='device_id'&&filter.value==='NODE-A')));
});
test('review mutations derive the actor from verified Auth and preserve the expected revision',async()=>{
  tables.allert_admin_users=[{user_id:owner,active:true}];const response=await request('/admin/anomalies/'+eventId,'PUT',{actor_id:other,revision:3,classification:'investigating',notes:'Check the sensor'});assert.equal(response.status,200);
  assert.deepEqual(rpcs[0],{name:'review_allert_anomaly',args:{p_actor_id:owner,p_event_id:eventId,p_revision:3,p_classification:'investigating',p_notes:'Check the sensor'}});
});
test('invalid reviews are rejected before mutation and database conflicts remain conflicts',async()=>{
  tables.allert_admin_users=[{user_id:owner,active:true}];assert.equal((await request('/admin/anomalies/'+eventId,'PUT',{revision:0,classification:'invalid',notes:''})).status,400);assert.equal((await request('/admin/anomalies/'+eventId,'PUT',{revision:0,classification:'investigating',notes:'x'.repeat(501)})).status,400);assert.equal(rpcs.length,0);
  rpcResult={ok:false,status:409,error:'Changed elsewhere'};assert.equal((await request('/admin/anomalies/'+eventId,'PUT',{revision:0,classification:'investigating',notes:''})).status,409);
});
test('alert history is restricted to the verified current owner, device and ownership epoch',async()=>{
  tables.allert_anomaly_events=[{id:eventId,user_id:owner,device_id:'NODE-A',owner_epoch:epoch,observed_at:new Date().toISOString()},{id:'private',user_id:other,device_id:'NODE-A',owner_epoch:epoch},{id:'old-ownership',user_id:owner,device_id:'NODE-A',owner_epoch:'2020-01-01'}];
  const result=await(await request('/alerts')).json();assert.equal(result.events.length,1);assert.equal(result.events[0].id,eventId);assert.equal(result.processorReady,false);
  const revoked=await(await request('/alerts','GET',undefined,'other')).json();assert.equal(revoked.device,null);assert.equal(revoked.events.length,0);
});
test('worker readiness requires an enabled processor and a recent error-free heartbeat',async()=>{
  flags.ALLERT_ANOMALY_ALERTS_ENABLED='true';assert.equal((await(await request('/alerts')).json()).processorReady,true);tables.allert_alert_worker[0].summary.errors=1;assert.equal((await(await request('/alerts')).json()).processorReady,false);
  tables.allert_alert_worker[0].summary.errors=0;tables.allert_alert_worker[0].last_success_at='2020-01-01';assert.equal((await(await request('/alerts')).json()).processorReady,false);
});
test('ordinary bearer tokens cannot invoke the background processor',async()=>{
  flags.ALLERT_ALERT_WORKER_TOKEN='private-worker';for(const headers of [{},{'X-Allert-Worker-Token':'wrong'}])assert.equal((await request('/alerts/process','POST',{},'owner',headers)).status,401);assert.equal(rpcs.length,0);
  assert.equal((await request('/alerts/process','POST',{},'owner',{'X-Allert-Worker-Token':'private-worker'})).status,200);assert.equal(rpcs.length,0);
});
test('location capture and revision checks use the verified account rather than a supplied owner',async()=>{
  const body={deviceId:'NODE-A',ownerEpoch:epoch,revision:2,label:' Living room ',enabled:true,latitude:10.720234,longitude:122.562123,accuracy:30,capturedAt:new Date().toISOString(),userId:other};
  assert.equal((await request('/node-location','PUT',body)).status,200);assert.equal(rpcs[0].args.p_user_id,owner);assert.equal(rpcs[0].args.p_owner_epoch,epoch);assert.equal(rpcs[0].args.p_revision,2);assert.equal(rpcs[0].args.p_location.latitude,10.7202);assert.equal('userId' in rpcs[0].args.p_location,false);
});
test('an unlinked account gets no previous node coordinates and cannot select another user via query',async()=>{
  tables.allert_node_locations=[{device_id:'NODE-A',user_id:owner,owner_epoch:epoch,latitude:10,longitude:120}];const result=await(await request('/node-location?userId='+owner,'GET',undefined,'other')).json();assert.deepEqual(result,{device:null,location:null});assert.equal(queries.some(item=>item.table==='allert_node_locations'),false);
});
test('multiple owned nodes require explicit future node selection rather than silently choosing a home',async()=>{
  tables.sensor_devices.push({...tables.sensor_devices[0],device_id:'NODE-B'});assert.equal((await request('/node-location')).status,409);assert.equal((await request('/alerts')).status,409);
});
