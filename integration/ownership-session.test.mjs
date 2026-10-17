import {MODEL_ID,CHECKPOINT} from '../supabase/functions/server/seed7-policy.mjs';
import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {build} from 'esbuild';
import {resolve} from 'node:path';
await build({stdin:{contents:`export * from './src/app/utils/telemetry';export * from './src/app/utils/node-linking';export * from './src/app/utils/risk-monitor';export * from './src/app/utils/environment';`,resolveDir:process.cwd(),loader:'ts'},outfile:'integration/test-output/ownership-session.mjs',bundle:true,format:'esm',platform:'node',external:['react'],plugins:[{name:'fixtures',setup(b){
  b.onResolve({filter:/^\/utils\/supabase\/info$/},()=>({path:resolve('utils/supabase/info.tsx')}));b.onResolve({filter:/(?:^|\/)auth$/},()=>({path:'auth',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const getCurrentUser=()=>({id:globalThis.currentAccount});export const getValidAuthToken=async()=>globalThis.currentToken;export const logout=()=>{globalThis.signouts++;};',loader:'js'}));
}}]});
const app=await import('./test-output/ownership-session.mjs');let tree;
beforeEach(()=>{globalThis.currentAccount='a';globalThis.currentToken='old-token';globalThis.signouts=0;globalThis.window=new EventTarget();window.setInterval=setInterval;window.clearInterval=clearInterval;globalThis.localStorage={getItem:key=>key==='allert_auth_token'?globalThis.currentToken:null};});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
test('late telemetry and node-action 401s cannot sign out a renewed access token',async()=>{
  for(const action of [()=>app.getSensorTelemetry(),()=>app.unlinkNode('ALLERT-NODE-001')]){currentToken='old-token';globalThis.fetch=async()=>{currentToken='renewed-token';return new Response(JSON.stringify({error:'Old token rejected'}),{status:401});};await assert.rejects(action(),/Old token rejected/);assert.equal(signouts,0);}
});
test('delayed private telemetry cannot return another account data',async()=>{
  globalThis.fetch=async()=>{currentAccount='b';return new Response(JSON.stringify({device:{device_id:'OLD-NODE'},latest:null,history:[]}));};await assert.rejects(app.getSensorTelemetry(),/Account changed/);assert.equal(signouts,0);
});
test('signing out and back into the same account invalidates the old telemetry request',async()=>{
  globalThis.fetch=async()=>{window.dispatchEvent(new Event('allert-session-changed'));return new Response(JSON.stringify({device:null,latest:null,history:[]}));};await assert.rejects(app.getSensorTelemetry(),/Account changed/);
});
test('late node mutation after an account switch cannot broadcast current node ownership',async()=>{
  let events=0;window.addEventListener('allert-node-changed',()=>events++);globalThis.fetch=async()=>{currentAccount='b';return new Response(JSON.stringify({ok:true,device_id:'ALLERT-NODE-001'}));};await assert.rejects(app.unlinkNode('ALLERT-NODE-001'),/Account changed/);assert.equal(events,0);
});
test('Risk Monitor ignores a previous account response and does not sign out a renewed session',async()=>{
  const pending=[];globalThis.fetch=()=>new Promise(resolve=>pending.push(resolve));let state;
  function Screen(){state=app.useRiskMonitor();return null;}
  await act(async()=>{tree=TestRenderer.create(React.createElement(Screen));});
  currentAccount='b';currentToken='new-token';await act(async()=>window.dispatchEvent(new Event('allert-session-changed')));
  await act(async()=>pending[0](new Response(JSON.stringify({error:'old'}),{status:401})));assert.equal(signouts,0);assert.equal(state.data,null);
  await act(async()=>pending.at(-1)(new Response(JSON.stringify({availability:'unavailable',device:null,current:null,forecasts:[],model_status:'warming_up',model_id:MODEL_ID,checkpoint_sha256:CHECKPOINT}))));assert.equal(state.status,'unavailable');
});

test('legacy environment loading cannot sign out a new family account from a previous-account 401',async()=>{const pending=[];globalThis.fetch=()=>new Promise(resolve=>pending.push(resolve));let state;function Screen(){state=app.useEnvironment();return null;}await act(async()=>{tree=TestRenderer.create(React.createElement(Screen));});currentAccount='b';currentToken='new-token';await act(async()=>window.dispatchEvent(new Event('allert-session-changed')));await act(async()=>pending[0](new Response(JSON.stringify({error:'old'}),{status:401})));assert.equal(signouts,0);assert.equal(state.snapshot,null);await act(async()=>pending.at(-1)(new Response(JSON.stringify({snapshot:null,availability:'unavailable'}))));assert.equal(state.status,'unavailable');});
