import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
await build({entryPoints:['supabase/functions/server/index.tsx'],outfile:'integration/test-output/notification-http.mjs',bundle:true,format:'esm',platform:'node',plugins:[{name:'fixtures',setup(b){
  b.onResolve({filter:/push-delivery\.mjs$/},()=>({path:'push-delivery',namespace:'push-fixture'}));
  b.onLoad({filter:/.*/,namespace:'push-fixture'},()=>({contents:'export const deliverTestPush=()=>{throw Error("Unexpected push transport in this fixture");};export const deliverAnomalyPush=deliverTestPush;export const deliverForecastPush=deliverTestPush;'}));
  b.onResolve({filter:/^npm:hono$/},()=>({path:'hono',external:true}));b.onResolve({filter:/^npm:hono\/cors$/},()=>({path:'hono/cors',external:true}));b.onResolve({filter:/^npm:hono\/logger$/},()=>({path:'hono/logger',external:true}));
  b.onResolve({filter:/^npm:@supabase\/supabase-js@2$/},()=>({path:'supabase',namespace:'fixture'}));b.onResolve({filter:/kv_store\.tsx$/},()=>({path:'kv',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='supabase'?'export const createClient=()=>globalThis.client;':`export const get=async key=>{globalThis.reads.push(key);return globalThis.records.get(key);};export const set=async()=>{};export const del=async()=>{};export const mget=async()=>[];export const getRecentByPrefix=async()=>[];export const setIfAbsent=async()=>{};`,loader:'js'}));
}}]});
globalThis.Deno={env:{get:()=>undefined},serve:handler=>{globalThis.handler=handler;}};
await import('./test-output/notification-http.mjs');
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const key=user=>`notification-preferences:v1:${user}`;
beforeEach(()=>{
  globalThis.records=new Map();globalThis.reads=[];globalThis.calls=[];
  globalThis.client={auth:{getUser:async token=>({data:{user:token==='member'?{id:owner}:token==='other'?{id:other}:null},error:null})},rpc:async(name,args)=>{
    calls.push({name,args});return {data:{ok:true,preferences:{enabled:args.p_enabled,revision:args.p_expected_revision+1,updatedAt:new Date().toISOString()}},error:null};
  }};
});
const request=(method='GET',token='member',body)=>handler(new Request('https://example.invalid/make-server-a473accf/notification-preferences',{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}));
test('preference endpoints require a verified session before reading or writing',async()=>{
  for(const method of ['GET','PUT'])for(const token of ['','invalid'])assert.equal((await request(method,token,method==='PUT'?{enabled:true,revision:0}:undefined)).status,401);
  assert.deepEqual(reads,[]);assert.deepEqual(calls,[]);
});
test('missing preferences return off and explicitly disconnected delivery',async()=>{
  const response=await request();assert.equal(response.status,200);assert.deepEqual(await response.json(),{preferences:{enabled:false,revision:0,updatedAt:null},deliveryReady:false});
});
test('account identity from Auth selects the private record',async()=>{
  records.set(key(owner),{enabled:true,revision:1,updatedAt:new Date().toISOString()});
  const result=await (await request('GET','other')).json();assert.equal(result.preferences.enabled,false);assert.deepEqual(reads,[key(other)]);
});
test('a save ignores caller-supplied identities and uses the verified account',async()=>{
  const response=await request('PUT','member',{enabled:true,revision:0,userId:other});assert.equal(response.status,200);
  assert.deepEqual(calls[0],{name:'set_allert_notification_preference',args:{p_user_id:owner,p_enabled:true,p_expected_revision:0}});assert.equal((await response.json()).deliveryReady,false);
});
test('invalid payloads never reach the database mutation',async()=>{
  for(const body of [{},{enabled:'yes',revision:0},{enabled:true},{enabled:true,revision:-1}])assert.equal((await request('PUT','member',body)).status,400);
  assert.equal(calls.length,0);
});
test('concurrent-change conflicts remain conflicts',async()=>{
  client.rpc=async()=>({data:{ok:false,status:409,error:'Refresh settings'},error:null});
  const response=await request('PUT','member',{enabled:true,revision:1});assert.equal(response.status,409);assert.equal((await response.json()).error,'Refresh settings');
});
test('a missing database function returns a readable failure rather than success',async()=>{
  client.rpc=async()=>({data:null,error:Error('Missing RPC')});
  const response=await request('PUT','member',{enabled:false,revision:0});assert.equal(response.status,503);assert.match((await response.json()).error,/migration/);
});
test('malformed stored preferences are not presented as valid settings',async()=>{
  records.set(key(owner),{enabled:'true',revision:1});assert.equal((await request()).status,503);
});
