import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('integration/test-output',{recursive:true});
await build({entryPoints:['supabase/functions/server/index.tsx'],outfile:'integration/test-output/diary-http.mjs',bundle:true,format:'esm',platform:'node',plugins:[{name:'fixtures',setup(b){
  b.onResolve({filter:/push-delivery\.mjs$/},()=>({path:'push-delivery',namespace:'push-fixture'}));
  b.onLoad({filter:/.*/,namespace:'push-fixture'},()=>({contents:'export const deliverTestPush=()=>{throw Error("Unexpected push transport in this fixture");};export const deliverAnomalyPush=deliverTestPush;export const deliverForecastPush=deliverTestPush;'}));
  b.onResolve({filter:/^npm:hono$/},()=>({path:'hono',external:true}));b.onResolve({filter:/^npm:hono\/cors$/},()=>({path:'hono/cors',external:true}));b.onResolve({filter:/^npm:hono\/logger$/},()=>({path:'hono/logger',external:true}));
  b.onResolve({filter:/^npm:@supabase\/supabase-js@2$/},()=>({path:'supabase',namespace:'fixture'}));b.onResolve({filter:/kv_store\.tsx$/},()=>({path:'kv',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='supabase'?'export const createClient=()=>globalThis.client;':`
    export const get=async key=>globalThis.kvRecords.get(key);
    export const set=async(key,value)=>globalThis.kvRecords.set(key,value);
    export const del=async key=>globalThis.kvRecords.delete(key);
    export const mget=async keys=>keys.map(key=>globalThis.kvRecords.get(key)).filter(Boolean);
    export const getRecentByPrefix=async(prefix,limit=100)=>[...globalThis.kvRecords].filter(([key])=>key.startsWith(prefix)).map(([,value])=>value).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,limit);
    export const setIfAbsent=async(key,value)=>{if(!globalThis.kvRecords.has(key))globalThis.kvRecords.set(key,value);return globalThis.kvRecords.get(key);};`,loader:'js'}));
}}]});
globalThis.Deno={env:{get:()=>undefined},serve:handler=>{globalThis.handler=handler;}};
await import('./test-output/diary-http.mjs');
const owner='11111111-1111-4111-8111-111111111111';
const id='12345678-1234-4234-8234-123456789012';
const tokens={member:{id:owner,app_metadata:{}},admin:{id:owner,app_metadata:{allert_role:'admin'}},spoofed:{id:owner,user_metadata:{allert_role:'admin'},app_metadata:{}}};
let queried,rpcCalls;
const now=Date.now();
const reading=(device_id)=>({device_id,timestamp:new Date(now-300000).toISOString(),pm2_5:7,pm10:8,temperature:29,humidity:60,sample_count:30,expected_samples:30,pm25_stddev:.5,data_quality_status:'VALID',created_at:new Date(now-299000).toISOString()});
class Query {
  constructor(name){this.name=name;this.filters=[];this.maximum=Infinity;queried.push(name);}
  select(columns){this.columns=columns;return this;}eq(key,value){this.filters.push(row=>row[key]===value);return this;}lte(key,value){this.filters.push(row=>row[key]<=value);return this;}gt(key,value){this.filters.push(row=>row[key]>value);return this;}
  order(){return this;}limit(value){this.maximum=value;return this;}maybeSingle(){this.single=true;return this;}
  then(resolve,reject){return Promise.resolve().then(()=>{
    let rows=this.name==='sensor_devices'?[{device_id:'ALLERT-NODE-001',user_id:owner,is_active:true,location_label:'Home'},{device_id:'ALLERT-NODE-002',user_id:null,is_active:true,location_label:'Second home'}]:this.name==='node_ingestion_credentials'?[{device_id:'ALLERT-NODE-001',readings_table:'sensor_readings'},{device_id:'ALLERT-NODE-002',readings_table:'node_two_actual'}]:this.name==='sensor_readings'?[reading('ALLERT-NODE-001')]:this.name==='node_two_actual'?[reading('ALLERT-NODE-002')]:[];
    rows=rows.filter(row=>this.filters.every(filter=>filter(row))).slice(0,this.maximum);return {data:this.single?rows[0]??null:rows,error:null};
  }).then(resolve,reject);}
}
beforeEach(()=>{
  queried=[];rpcCalls=[];globalThis.kvRecords=new Map();
  globalThis.client={auth:{getUser:async token=>({data:{user:tokens[token]??null},error:tokens[token]?null:Error('Invalid')})},from:name=>new Query(name),rpc:async(name,args)=>{rpcCalls.push({name,args});return {data:{ok:true,entry:{...args.p_payload,id:args.p_entry_id,userId:args.p_user_id,revision:args.p_expected_revision+1},deleted:args.p_action==='delete'},error:null};}};
});
const request=(path,method='GET',token='member',body)=>handler(new Request(`https://example.invalid/make-server-a473accf/${path}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}));
const fields={revision:1,vasScore:5,tnssScore:6,riskLevel:49,notes:'Corrected',observedAt:new Date(now-1000).toISOString(),symptomSeverities:{sneezing:0,'itchy-nose':1,'runny-nose':2,congestion:3}};

test('diary mutations reject missing and invalid sessions before calling the database',async()=>{
  for(const token of ['', 'invalid'])for(const method of ['PUT','DELETE'])assert.equal((await request(`health-logs/${id}`,method,token,fields)).status,401);
  assert.equal(rpcCalls.length,0);
});
test('diary deletion passes only the verified owner, entry ID and expected revision',async()=>{
  const response=await request(`health-logs/${id}`,'DELETE','member',{revision:2,userId:'victim'});
  assert.equal(response.status,200);assert.equal((await response.json()).deleted,true);
  assert.equal(rpcCalls[0].args.p_user_id,owner);assert.equal(rpcCalls[0].args.p_entry_id,id);
  assert.equal(rpcCalls[0].args.p_expected_revision,2);assert.equal(rpcCalls[0].args.p_action,'delete');assert.equal(rpcCalls[0].args.p_payload,null);
});
test('diary database failures return an error rather than reporting success',async()=>{
  client.rpc=async()=>({data:null,error:Error('Unavailable')});
  for(const method of ['PUT','DELETE'])assert.equal((await request(`health-logs/${id}`,method,'member',fields)).status,503);
});
test('diary corrections reject oversized notes before mutation',async()=>{
  assert.equal((await request(`health-logs/${id}`,'PUT','member',{...fields,notes:'x'.repeat(2001)})).status,400);
  assert.equal(rpcCalls.length,0);
});

test('diary update ignores spoofed identity and derives the symptom summary on server',async()=>{
  const response=await request(`health-logs/${id}`,'PUT','member',{...fields,userId:'victim',id:'spoofed'});assert.equal(response.status,200);const args=rpcCalls[0].args;assert.equal(args.p_user_id,owner);assert.equal(args.p_entry_id,id);assert.equal(args.p_payload.userId,undefined);assert.equal(args.p_payload.riskLevel,24);assert.equal(args.p_expected_revision,1);
});
test('invalid scores and absent revisions never execute diary mutations',async()=>{
  for(const body of [{...fields,vasScore:11},{...fields,revision:undefined},{...fields,revision:0},{...fields,tnssScore:9}])assert.equal((await request(`health-logs/${id}`,'PUT','member',body)).status,400);
  assert.equal(rpcCalls.length,0);
});
test('diary conflict errors remain conflicts and never report a successful correction',async()=>{
  client.rpc=async()=>({data:{ok:false,status:409,error:'Entry changed'},error:null});const response=await request(`health-logs/${id}`,'PUT','member',fields);assert.equal(response.status,409);assert.equal((await response.json()).error,'Entry changed');
});
test('deleted diary retry cannot recreate an entry',async()=>{
  kvRecords.set(`health-log:v2:${owner}:${id}`,{id,userId:owner,deletedAt:new Date(now).toISOString(),...fields});
  const response=await request('health-logs','POST','member',{...fields,requestId:id});assert.equal(response.status,410);assert.equal(kvRecords.size,1);
});
test('diary listing merges edited legacy copies and suppresses deletion tombstones',async()=>{
  const old={id,userId:owner,date:new Date(now-1000).toISOString(),vasScore:5,tnssScore:6,riskLevel:24};
  kvRecords.set(`health-logs:${owner}`,[old]);kvRecords.set(`health-log:v2:${owner}:${id}`,{...old,notes:'Corrected',revision:2});
  let result=await (await request('health-logs')).json();assert.equal(result.logs.length,1);assert.equal(result.logs[0].notes,'Corrected');assert.equal(result.logs[0].revision,2);
  kvRecords.set(`health-log:v2:${owner}:${id}`,{...old,deletedAt:new Date(now).toISOString()});result=await (await request('health-logs')).json();assert.equal(result.logs.length,0);
});
