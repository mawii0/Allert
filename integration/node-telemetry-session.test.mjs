import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
await build({entryPoints:['src/app/utils/useNodeTelemetry.ts'],outfile:'integration/test-output/node-hook.mjs',bundle:true,format:'esm',platform:'node',external:['react'],plugins:[{name:'hook-fixture',setup(b){
  b.onResolve({filter:/^\.\/auth$/},()=>({path:'auth',namespace:'fixture'}));
  b.onResolve({filter:/^\.\/telemetry$/},()=>({path:'telemetry',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='auth'?'export const getCurrentUser=()=>({id:globalThis.account});':'export const getSensorTelemetry=(signal)=>globalThis.readTelemetry(signal);',loader:'js'}));
}}]});
const { useNodeTelemetry }=await import('./test-output/node-hook.mjs');
globalThis.window=new EventTarget();
function Screen(){globalThis.nodeState=useNodeTelemetry();return React.createElement('div',null,nodeState.device?.device_id??nodeState.nodeStatus);}
const telemetry=id=>({device:{device_id:id},latest:{timestamp:new Date().toISOString()},history:[]});
test('node state clears on account switch and ignores the old request even if it resolves late',async()=>{
  globalThis.account='a';const pending=[];
  globalThis.readTelemetry=signal=>new Promise(resolve=>pending.push({signal,resolve}));
  let screen;
  await act(async()=>{screen=TestRenderer.create(React.createElement(Screen));});
  await act(async()=>pending[0].resolve(telemetry('node-a')));
  assert.equal(nodeState.device.device_id,'node-a');
  await act(async()=>window.dispatchEvent(new Event('allert-node-changed')));
  assert.equal(nodeState.device,null); // Authorized changes clear cached ownership too.
  globalThis.account='b';
  await act(async()=>window.dispatchEvent(new Event('allert-session-changed')));
  assert.equal(nodeState.device,null);assert.equal(pending[1].signal.aborted,true);
  await act(async()=>pending[1].resolve(telemetry('old-node-a')));
  assert.equal(nodeState.device,null);
  await act(async()=>pending[2].resolve(telemetry('node-b')));
  assert.equal(nodeState.device.device_id,'node-b');
  await act(async()=>screen.unmount());
  assert.equal(pending[2].signal.aborted,true);
});
test('failed refresh removes private cached device data and cleanup stops polling',async()=>{
  globalThis.account='a';globalThis.readTelemetry=async()=>telemetry('node-a');
  let screen;await act(async()=>{screen=TestRenderer.create(React.createElement(Screen));});
  assert.equal(nodeState.device.device_id,'node-a');
  globalThis.readTelemetry=async()=>{throw Error('Session expired');};
  await act(async()=>nodeState.retry());
  assert.equal(nodeState.device,null);assert.equal(nodeState.error,'Session expired');
  await act(async()=>screen.unmount());
});
