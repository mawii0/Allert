import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
await build({entryPoints:['src/app/utils/useDiary.ts','src/app/utils/private-api.ts'],outdir:'integration/test-output/diary-session',bundle:true,format:'esm',platform:'node',external:['react'],plugins:[{name:'fixture',setup(b){
  b.onResolve({filter:/^\/utils\/supabase\/info$/},()=>({path:resolve('utils/supabase/info.tsx')}));
  b.onResolve({filter:/^\.\/auth$/},()=>({path:'auth',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const getCurrentUser=()=>({id:globalThis.account});export const getValidAuthToken=async()=>globalThis.token;export const logout=()=>{globalThis.signedOut=true;};',loader:'js'}));
}}]});
const {privateApi}=await import('./test-output/diary-session/private-api.js');
const {useDiary}=await import('./test-output/diary-session/useDiary.js');
globalThis.window=new EventTarget();window.setInterval=setInterval;window.clearInterval=clearInterval;
const response=(body,status=200)=>new Response(JSON.stringify(body),{status});

test('private requests use renewed token, timeout and caller abort signal',async()=>{
  globalThis.account='a';globalThis.token='renewed';globalThis.signedOut=false;const controller=new AbortController();
  globalThis.fetch=async(url,options)=>{assert.ok(url.endsWith('/health-logs'));assert.equal(options.headers.Authorization,'Bearer renewed');assert.ok(options.signal instanceof AbortSignal);assert.equal(options.cache,'no-store');return response({logs:[]});};
  assert.deepEqual(await privateApi('/health-logs',{signal:controller.signal}),{logs:[]});
});
test('late error from a previous account cannot sign out the new account',async()=>{
  let finish;globalThis.fetch=()=>new Promise(resolve=>finish=resolve);const pending=privateApi('/health-logs');await Promise.resolve();account='b';finish(response({error:'Old unauthorized'},401));await assert.rejects(pending,/Account changed/);assert.equal(signedOut,false);
});
test('a previous request cannot sign out a new session for the same account after a session change',async()=>{
  account='a';signedOut=false;let finish;globalThis.fetch=()=>new Promise(resolve=>finish=resolve);const pending=privateApi('/health-logs');await Promise.resolve();window.dispatchEvent(new Event('allert-session-changed'));finish(response({error:'Old session'},401));await assert.rejects(pending,/Account changed/);assert.equal(signedOut,false);
});
test('a late unauthorized response for a rotated access token does not sign out the renewed session',async()=>{
  account='a';signedOut=false;token='old';globalThis.localStorage={getItem:()=> 'new'};let finish;globalThis.fetch=()=>new Promise(resolve=>finish=resolve);const pending=privateApi('/health-logs');await Promise.resolve();finish(response({error:'Old token'},401));await assert.rejects(pending,/Old token/);assert.equal(signedOut,false);delete globalThis.localStorage;
});
test('current rejected sessions sign out and plain text deployment errors are readable',async()=>{
  globalThis.fetch=async()=>response({error:'Expired'},401);await assert.rejects(privateApi('/health-logs'),/Expired/);assert.equal(signedOut,true);
  globalThis.fetch=async()=>new Response('404 Not Found',{status:404});await assert.rejects(privateApi('/health-logs'),/HTTP 404/);
});
test('diary clears history after account switching and ignores a delayed previous-account load',async()=>{
  account='a';token='token';const requests=[];globalThis.fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,resolve,account}));
  let state;function Harness(){state=useDiary();return null;}let tree;
  await act(async()=>{tree=TestRenderer.create(React.createElement(Harness));});assert.equal(requests.length,1);
  await act(async()=>{account='b';window.dispatchEvent(new Event('allert-session-changed'));});assert.equal(state.entries.length,0);assert.equal(state.loading,true);assert.equal(requests[0].options.signal.aborted,true);assert.equal(requests.length,2);
  await act(async()=>{requests[1].resolve(response({logs:[{id:'b-entry',revision:1}]}));});assert.equal(state.entries[0].id,'b-entry');
  await act(async()=>{requests[0].resolve(response({logs:[{id:'a-entry',revision:1}]}));});assert.equal(state.entries[0].id,'b-entry');
  await act(async()=>{tree.unmount();});
});
test('diary serializes mutation clicks and refreshes server history after saving',async()=>{
  account='b';const entry={id:'12345678-1234-4234-8234-123456789012',revision:1};let finish,mutations=0,reads=0,state;
  globalThis.fetch=async(url,options)=>{if(options.method==='PUT'){mutations++;assert.equal(JSON.parse(options.body).revision,1);return new Promise(resolve=>finish=resolve);}reads++;return response({logs:[entry]});};
  function Harness(){state=useDiary();return null;}let tree;await act(async()=>{tree=TestRenderer.create(React.createElement(Harness));});
  const fields={vasScore:5,tnssScore:0,notes:'Updated',observedAt:new Date().toISOString()};let saving;
  await act(async()=>{saving=state.update(entry,fields);});assert.equal(state.busy,true);assert.equal(await state.update(entry,fields),false);assert.equal(mutations,1);
  await act(async()=>{finish(response({entry:{...entry,revision:2}}));assert.equal(await saving,true);});assert.equal(state.busy,false);assert.ok(reads>=2);
  await act(async()=>{tree.unmount();});
});
