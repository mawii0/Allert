import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

await build({entryPoints:['supabase/functions/server/index.tsx'],outfile:'integration/test-output/email-verification-server.mjs',bundle:true,format:'esm',platform:'node',plugins:[{name:'auth-fixture',setup(build){
  build.onResolve({filter:/push-delivery\.mjs$/},()=>({path:'push',namespace:'fixture'}));
  build.onResolve({filter:/^npm:hono/},args=>({path:args.path.replace('npm:',''),external:true}));
  build.onResolve({filter:/^npm:@supabase/},()=>({path:'supabase',namespace:'fixture'}));
  build.onResolve({filter:/kv_store\.tsx$/},()=>({path:'kv',namespace:'fixture'}));
  build.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='supabase'
    ? 'export const createClient=()=>({auth:{signUp:(...args)=>globalThis.authFixture.signUp(...args),signInWithPassword:(...args)=>globalThis.authFixture.signInWithPassword(...args),verifyOtp:(...args)=>globalThis.authFixture.verifyOtp(...args),resend:(...args)=>globalThis.authFixture.resend(...args)}});'
    : args.path==='push' ? 'export const deliverTestPush=()=>{};export const deliverAnomalyPush=deliverTestPush;export const deliverForecastPush=deliverTestPush;'
    : 'export const get=()=>null;export const set=()=>{};export const mget=()=>[];export const del=()=>{};export const getRecentByPrefix=()=>[];export const setIfAbsent=()=>{};',loader:'js'}));
}}]});
globalThis.Deno={env:{get:()=>undefined},serve:handler=>{globalThis.serverHandler=handler;}};
await import('./test-output/email-verification-server.mjs');
const route=async(path,body)=>{
  const response=await serverHandler(new Request(`https://example.invalid/make-server-a473accf/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
  return {status:response.status,data:await response.json()};
};
const user={id:'account-1',email:'person@example.com',email_confirmed_at:null};

test('registration requests confirmation and never returns a session',async()=>{
  let signup;
  globalThis.authFixture={signUp:async value=>{signup=value;return {data:{user,session:null},error:null};}};
  const result=await route('signup',{email:user.email,password:'secret-pass',name:'Patient'});
  assert.equal(result.status,200);assert.equal(result.data.pending_verification,true);assert.equal(result.data.access_token,undefined);
  assert.deepEqual(signup.options.data,{name:'Patient'});
});

test('registration fails closed if Supabase email confirmation is disabled',async()=>{
  globalThis.authFixture={signUp:async()=>({data:{user:{...user,email_confirmed_at:'2026-10-19T00:00:00Z'},session:{access_token:'unverified'}},error:null})};
  const result=await route('signup',{email:user.email,password:'secret-pass'});
  assert.equal(result.status,503);assert.equal(result.data.access_token,undefined);
});

test('login rejects a session whose email is not confirmed',async()=>{
  globalThis.authFixture={signInWithPassword:async()=>({data:{user,session:{access_token:'token',refresh_token:'refresh'}},error:null})};
  const result=await route('login',{email:user.email,password:'secret-pass'});
  assert.equal(result.status,403);assert.equal(result.data.verification_required,true);assert.equal(result.data.access_token,undefined);
});

test('verification accepts a confirmed email and returns its session',async()=>{
  globalThis.authFixture={verifyOtp:async()=>({data:{user:{...user,email_confirmed_at:'2026-10-19T00:00:00Z'},session:{access_token:'token',refresh_token:'refresh'}},error:null})};
  const result=await route('verify-email',{email:user.email,token:'123456'});
  assert.equal(result.status,200);assert.equal(result.data.access_token,'token');
  const invalid=await route('verify-email',{email:user.email,token:'bad'});assert.equal(invalid.status,400);
});
