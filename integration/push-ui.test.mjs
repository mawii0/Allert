import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
await build({entryPoints:['src/app/components/BrowserPushControls.tsx'],outfile:'integration/test-output/push-ui.mjs',bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime'],plugins:[{name:'fixture',setup(b){
  b.onResolve({filter:/useBrowserPush$/},()=>({path:'push',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const useBrowserPush=()=>globalThis.push;'}));
}}]});
const {BrowserPushControls}=await import('./test-output/push-ui.mjs');
const text=node=>typeof node==='string'?node:(node?.children||[]).map(text).join('');
function fixture(extra={}){globalThis.push={quiet:{enabled:false,start:'22:00',end:'07:00',revision:0},connected:false,loading:false,busy:false,error:'',message:'',supported:true,configured:true,connect:async()=>{},disconnect:async()=>{},test:async()=>{},saveQuiet:async()=>{},refresh(){},...extra};}
test('connecting requires an enabled account, and tests require an actual connection',async()=>{
  fixture();let tree;await act(async()=>{tree=TestRenderer.create(React.createElement(BrowserPushControls,{enabled:false}));});
  assert.equal(tree.root.findAllByType('button').find(b=>text(b)==='Connect this browser').props.disabled,true);assert.equal(tree.root.findAllByType('button').some(b=>text(b)==='Send test notification'),false);
  await act(async()=>tree.unmount());fixture({connected:true});let tests=0;push.test=async()=>tests++;
  await act(async()=>{tree=TestRenderer.create(React.createElement(BrowserPushControls,{enabled:true}));});await act(async()=>tree.root.findAllByType('button').find(b=>text(b)==='Send test notification').props.onClick());assert.equal(tests,1);assert.match(text(tree.toJSON()),/Forecast risk alerts are not connected yet/);assert.match(text(tree.toJSON()),/not confirmed active/);await act(async()=>tree.unmount());
});
test('quiet-hour inputs preserve chosen times and submit an explicit save',async()=>{
  fixture();let tree,saved;push.saveQuiet=async value=>saved=value;
  await act(async()=>{tree=TestRenderer.create(React.createElement(BrowserPushControls,{enabled:true}));});
  await act(async()=>tree.root.findByProps({'aria-label':'Quiet hours start'}).props.onChange({target:{value:'23:30'}}));
  await act(async()=>tree.root.findByProps({'aria-label':'Quiet hours end'}).props.onChange({target:{value:'06:45'}}));
  assert.equal(saved,undefined);await act(async()=>tree.root.findAllByType('button').find(b=>text(b)==='Save quiet hours').props.onClick());assert.deepEqual(saved,{enabled:false,start:'23:30',end:'06:45'});await act(async()=>tree.unmount());
});
