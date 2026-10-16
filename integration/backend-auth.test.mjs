import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
// Run the actual Hono entrypoint. No request may reach a private query without verified Auth.
await build({entryPoints:['supabase/functions/server/index.tsx'],outfile:'integration/test-output/server.mjs',bundle:true,format:'esm',platform:'node',plugins:[{name:'backend-fixture',setup(b){
  b.onResolve({filter:/push-delivery\.mjs$/},()=>({path:'push-delivery',namespace:'push-fixture'}));
  b.onLoad({filter:/.*/,namespace:'push-fixture'},()=>({contents:'export const deliverTestPush=()=>{throw Error("Unexpected push transport in this fixture");};export const deliverAnomalyPush=deliverTestPush;'}));
  b.onResolve({filter:/^npm:hono/},args=>({path:args.path.replace('npm:',''),external:true}));
  b.onResolve({filter:/^npm:@supabase/},()=>({path:'supabase',namespace:'fixture'}));
  b.onResolve({filter:/kv_store\.tsx$/},()=>({path:'kv',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='supabase'
    ? 'export const createClient=()=>({auth:{getUser:async()=>({data:{user:null},error:Error("Invalid token")})},from:()=>{throw Error("Unauthorized query");},rpc:()=>{throw Error("Unauthorized RPC");}});'
    : 'export const get=()=>{throw Error("Unauthorized KV read");};export const set=()=>{throw Error("Unauthorized KV write");};export const del=()=>{};export const getRecentByPrefix=()=>[];export const setIfAbsent=()=>{};',loader:'js'}));
}}]});
globalThis.Deno={env:{get:()=>undefined},serve:handler=>{globalThis.serverHandler=handler;}};
await import('./test-output/server.mjs');
const routes=[['GET','profile'],['POST','profile'],['GET','health-logs'],['POST','health-logs'],['GET','sensor-telemetry'],['GET','risk-monitor'],['GET','environment'],['POST','nodes/claim'],['POST','nodes/unlink']];
for(const [method,path] of routes)for(const auth of ['', 'Bearer forged'])test(`${method} ${path} rejects ${auth?'forged':'missing'} sessions with gateway verification disabled`,async()=>{
  const request=new Request(`https://example.invalid/make-server-a473accf/${path}`,{method,headers:{Authorization:auth,'Content-Type':'application/json'},...(method==='POST'?{body:'{}'}:{})});
  const response=await serverHandler(request);
  assert.equal(response.status,401);assert.ok((await response.json()).error);
});
test('private publishing requires worker authentication',async()=>{
  const response=await serverHandler(new Request('https://example.invalid/make-server-a473accf/environment/publish',{method:'POST',body:'{}'}));
  assert.equal(response.status,401);
});
test('health is intentionally public and both function configs use handler authentication',async()=>{
  const response=await serverHandler(new Request('https://example.invalid/make-server-a473accf/health'));
  assert.equal(response.status,200);
  const config=await readFile('supabase/config.toml','utf8');
  assert.equal((config.match(/verify_jwt = false/g)||[]).length,2);
});
