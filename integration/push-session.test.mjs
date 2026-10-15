import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
await build({entryPoints:['src/app/utils/useBrowserPush.ts'],outfile:'integration/test-output/push-session.mjs',bundle:true,format:'esm',platform:'node',external:['react'],plugins:[{name:'fixtures',setup(b){
  b.onResolve({filter:/^\.\/auth$/},()=>({path:'auth',namespace:'fixture'}));
  b.onResolve({filter:/^\.\/private-api$/},()=>({path:'api',namespace:'fixture'}));
  b.onResolve({filter:/^\.\/browser-push$/},()=>({path:'browser',namespace:'fixture'}));
  const fixtures={auth:'export const getCurrentUser=()=>({id:globalThis.owner});',api:'export const privateApi=(...args)=>globalThis.api(...args);',browser:'export const pushSupported=()=>true;export const browserPushConnected=async()=>globalThis.connection;export const connectBrowser=(...args)=>globalThis.connect(...args);export const disconnectBrowser=async()=>{};export const testBrowserPush=async()=>globalThis.testOutcome;'};
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:fixtures[args.path],loader:'js'}));
}}]});
const {useBrowserPush}=await import('./test-output/push-session.mjs');
let state,tree,calls;
const quiet={enabled:false,start:'22:00',end:'07:00',revision:0,timezone:'Asia/Manila'};
beforeEach(()=>{
  globalThis.window=new EventTarget();globalThis.owner='account-a';globalThis.connection=false;globalThis.testOutcome='accepted';calls=[];
  globalThis.connect=async()=>true;
  globalThis.api=async(path,options)=>{calls.push({path,options});return path==='/push'?{configured:true,publicKey:'B'+'a'.repeat(86),quietHours:{...quiet}}:{quietHours:{...quiet,...options.body,revision:options.body.revision+1}};};
});
afterEach(async()=>{if(tree){await act(async()=>tree.unmount());tree=null;}});
async function mount(){function Harness(){state=useBrowserPush();return null;}await act(async()=>{tree=TestRenderer.create(React.createElement(Harness));});}
test('opening settings loads configuration without connecting or requesting permission',async()=>{
  let connected=0;globalThis.connect=async()=>{connected++;};await mount();assert.equal(connected,0);assert.equal(state.connected,false);assert.equal(state.configured,true);assert.equal(state.loading,false);
});
test('connection state is set only after a successful browser connection',async()=>{
  await mount();globalThis.connect=async()=>{throw Error('Permission blocked');};await act(async()=>state.connect());assert.equal(state.connected,false);assert.match(state.error,/blocked/);
  globalThis.connect=async()=>true;await act(async()=>state.connect());assert.equal(state.connected,true);
});
test('delayed connection from an old account cannot mark the new account connected',async()=>{
  await mount();let finish,task;globalThis.connect=()=>new Promise(resolve=>finish=resolve);
  await act(async()=>{task=state.connect();});
  await act(async()=>{owner='account-b';window.dispatchEvent(new Event('allert-session-changed'));});
  await act(async()=>{finish(true);await task;});assert.equal(state.connected,false);assert.equal(state.message,'');assert.equal(state.busy,false);
});
test('delayed configuration cannot replace another account settings',async()=>{
  let resolveOld;const normal=api;globalThis.api=(...args)=>new Promise(resolve=>resolveOld=resolve);await mount();
  globalThis.api=normal;await act(async()=>{owner='account-b';window.dispatchEvent(new Event('allert-session-changed'));});
  await act(async()=>resolveOld({configured:false,publicKey:null,quietHours:{...quiet,enabled:true}}));assert.equal(state.quiet.enabled,false);assert.equal(state.configured,true);
});
test('quiet saves use the server revision and conflicts never show success',async()=>{
  await mount();await act(async()=>state.saveQuiet({enabled:true,start:'23:00',end:'06:00'}));assert.equal(calls[1].options.body.revision,0);assert.equal(state.quiet.revision,1);assert.equal(state.quiet.enabled,true);
  globalThis.api=async()=>{throw Error('Changed in another tab');};await act(async()=>state.saveQuiet({enabled:false,start:'23:00',end:'06:00'}));assert.match(state.error,/another tab/);assert.equal(state.quiet.enabled,true);assert.equal(state.message,'');
});
test('accepted tests describe service acceptance without claiming display; quiet tests report suppression',async()=>{
  await mount();await act(async()=>state.test());assert.match(state.message,/accepted/);assert.doesNotMatch(state.message,/delivered|displayed/);
  globalThis.testOutcome='quiet_hours';await act(async()=>state.test());assert.match(state.message,/No test was sent/);
});
test('focus during a connection does not cancel it or issue duplicate loads',async()=>{
  await mount();let finish,task;globalThis.connect=()=>new Promise(resolve=>finish=resolve);
  await act(async()=>{task=state.connect();window.dispatchEvent(new Event('focus'));});assert.equal(calls.length,1);
  await act(async()=>{finish(true);await task;});assert.equal(state.connected,true);assert.equal(state.busy,false);
});
