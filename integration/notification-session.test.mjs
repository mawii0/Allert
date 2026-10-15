import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
await build({entryPoints:['src/app/utils/useNotificationPreferences.ts'],outfile:'integration/test-output/notification-session.mjs',bundle:true,format:'esm',platform:'node',external:['react'],plugins:[{name:'fixtures',setup(b){
  b.onResolve({filter:/^\/utils\/supabase\/info$/},()=>({path:resolve('utils/supabase/info.tsx')}));
  b.onResolve({filter:/^\.\/auth$/},()=>({path:'auth',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const getCurrentUser=()=>({id:globalThis.account});export const getValidAuthToken=async()=>globalThis.token;export const logout=()=>{globalThis.signedOut=true;};',loader:'js'}));
}}]});
const {useNotificationPreferences}=await import('./test-output/notification-session.mjs');
let state,tree,requests,prompts,saved;
const response=(preferences,status=200)=>new Response(JSON.stringify(status===200?{preferences,deliveryReady:false}:preferences),{status});
beforeEach(()=>{
  globalThis.account='account-a';globalThis.token='renewed-token';globalThis.signedOut=false;
  globalThis.window=new EventTarget();window.isSecureContext=true;
  requests=[];prompts=0;saved={enabled:false,revision:0,updatedAt:null};
  window.Notification={permission:'default',requestPermission:async()=>{prompts++;window.Notification.permission='granted';return 'granted';}};
  globalThis.fetch=async(url,options)=>{
    requests.push({url,options});assert.equal(options.headers.Authorization,'Bearer renewed-token');
    if(options.method==='PUT'){const body=JSON.parse(options.body);saved={enabled:body.enabled,revision:body.revision+1,updatedAt:new Date().toISOString()};}
    return response(saved);
  };
});
afterEach(async()=>{if(tree){await act(async()=>tree.unmount());tree=null;}});
async function mount(){function Harness(){state=useNotificationPreferences();return null;}await act(async()=>{tree=TestRenderer.create(React.createElement(Harness));});}
test('loading preferences never requests browser permission automatically',async()=>{
  await mount();assert.equal(prompts,0);assert.equal(state.enabled,false);assert.equal(state.loading,false);assert.match(state.status,/not connected/);
});
test('a user enable action requests permission before issuing the save request',async()=>{
  await mount();const order=[];window.Notification.requestPermission=()=>{order.push('permission');window.Notification.permission='granted';return Promise.resolve('granted');};
  const fetch=globalThis.fetch;globalThis.fetch=(url,options)=>{if(options.method==='PUT')order.push('save');return fetch(url,options);};
  await act(async()=>{assert.equal(await state.changeEnabled(true),true);});
  assert.deepEqual(order,['permission','save']);assert.equal(state.enabled,true);assert.equal(JSON.parse(requests[1].options.body).revision,0);
});
test('permission denial leaves the stored account preference off',async()=>{
  await mount();window.Notification.requestPermission=async()=>{window.Notification.permission='denied';return 'denied';};
  await act(async()=>{assert.equal(await state.changeEnabled(true),false);});
  assert.equal(state.enabled,false);assert.equal(requests.length,1);assert.match(state.error,/denied/);
});
test('dismissed permission prompts do not save an enabled preference',async()=>{
  await mount();window.Notification.requestPermission=async()=>'default';
  await act(async()=>{assert.equal(await state.changeEnabled(true),false);});
  assert.equal(state.enabled,false);assert.equal(requests.length,1);assert.match(state.error,/not granted/);
});
test('browser-blocked permissions are not requested again automatically',async()=>{
  window.Notification.permission='denied';await mount();
  await act(async()=>{assert.equal(await state.changeEnabled(true),false);});
  assert.equal(prompts,0);assert.equal(requests.length,1);assert.match(state.error,/browser settings/);
});
test('unsupported and insecure contexts cannot enable notifications',async()=>{
  delete window.Notification;await mount();assert.equal(state.toggleDisabled,true);assert.equal(prompts,0);
  await act(async()=>tree.unmount());tree=null;
  window.Notification={permission:'default',requestPermission:async()=>{prompts++;return 'granted';}};window.isSecureContext=false;
  await mount();assert.equal(state.toggleDisabled,true);await act(async()=>{assert.equal(await state.changeEnabled(true),false);});assert.equal(prompts,0);
});
test('an enabled account preference can be turned off even if browser permission is blocked',async()=>{
  saved={enabled:true,revision:2,updatedAt:new Date().toISOString()};window.Notification.permission='denied';await mount();
  assert.equal(state.toggleDisabled,false);await act(async()=>{assert.equal(await state.changeEnabled(false),true);});
  assert.equal(state.enabled,false);assert.equal(prompts,0);assert.equal(saved.revision,3);
});
test('save failure retains the previous server preference and shows the error',async()=>{
  window.Notification.permission='granted';await mount();globalThis.fetch=async()=>response({error:'Database unavailable'},503);
  await act(async()=>{assert.equal(await state.changeEnabled(true),false);});assert.equal(state.enabled,false);assert.match(state.error,/Database unavailable/);assert.equal(state.saving,false);
});
test('focus after a permission prompt cannot invalidate its save or issue duplicate loads',async()=>{
  await mount();let finish;window.Notification.requestPermission=()=>new Promise(resolve=>finish=resolve);let saving;
  await act(async()=>{saving=state.changeEnabled(true);});assert.equal(state.saving,true);
  await act(async()=>window.dispatchEvent(new Event('focus')));assert.equal(requests.length,1);
  await act(async()=>{window.Notification.permission='granted';finish('granted');assert.equal(await saving,true);});
  assert.equal(state.enabled,true);assert.equal(requests.length,2);
});
test('account switching during a permission prompt cannot save for the new account',async()=>{
  await mount();let finish;window.Notification.requestPermission=()=>new Promise(resolve=>finish=resolve);let saving;
  await act(async()=>{saving=state.changeEnabled(true);});
  await act(async()=>{account='account-b';window.dispatchEvent(new Event('allert-session-changed'));});
  await act(async()=>{window.Notification.permission='granted';finish('granted');assert.equal(await saving,false);});
  assert.equal(requests.filter(request=>request.options.method==='PUT').length,0);assert.equal(state.enabled,false);assert.equal(state.saving,false);
});
test('a delayed previous-account load cannot replace the new account settings',async()=>{
  const pending=[];globalThis.fetch=(url,options)=>new Promise(resolve=>pending.push({options,resolve}));
  await mount();assert.equal(state.loading,true);
  await act(async()=>{account='account-b';window.dispatchEvent(new Event('allert-session-changed'));});
  assert.equal(pending[0].options.signal.aborted,true);
  await act(async()=>pending[1].resolve(response({enabled:false,revision:1,updatedAt:new Date().toISOString()})));
  await act(async()=>pending[0].resolve(response({enabled:true,revision:2,updatedAt:new Date().toISOString()})));
  assert.equal(state.enabled,false);assert.equal(signedOut,false);
});
test('a saved preference survives remount and delivery remains explicitly disconnected',async()=>{
  window.Notification.permission='granted';await mount();await act(async()=>{await state.changeEnabled(true);});
  await act(async()=>tree.unmount());tree=null;await mount();assert.equal(state.enabled,true);assert.match(state.status,/delivery is not connected/);
});
