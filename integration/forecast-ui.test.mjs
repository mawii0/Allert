import {MODEL_ID,CHECKPOINT} from '../supabase/functions/server/seed7-policy.mjs';
import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {build} from 'esbuild';
await build({entryPoints:['src/app/components/ForecastNotices.tsx'],outfile:'integration/test-output/forecast-ui.mjs',bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime'],plugins:[{name:'fixtures',setup(b){
 b.onResolve({filter:/\/auth$/},()=>({path:'auth',namespace:'fixture'}));b.onResolve({filter:/private-api$/},()=>({path:'api',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='auth'?'export const getCurrentUser=()=>({id:globalThis.currentAccount});':'export const privateApi=(...args)=>globalThis.forecastApi(...args);'}));
}}]});
const {ForecastNotices}=await import('./test-output/forecast-ui.mjs');
let tree,value,calls;
const text=node=>Array.isArray(node)?node.map(text).join(''):typeof node==='string'?node:(node?.children||[]).map(text).join('');
const snapshot=()=>({availability:'ready',current:null,forecasts:[],model_id:MODEL_ID,checkpoint_sha256:CHECKPOINT,device:{device_id:'ALLERT-NODE-001'},model_status:'warming_up',worker:{enabled:true,last_finished_at:new Date().toISOString(),summary:{errors:0}},model_input:{eligible_blocks:14,required_blocks:648,missing_receipts:2,duplicate_blocks:0}});
beforeEach(()=>{globalThis.currentAccount='owner';globalThis.window=new EventTarget();window.setInterval=setInterval;window.clearInterval=clearInterval;calls=[];value=snapshot();globalThis.forecastApi=async(path,options)=>{calls.push({path,options});return value};});
afterEach(async()=>{if(tree){await act(async()=>tree.unmount());tree=null;}});
async function mount(props={}){await act(async()=>{tree=Renderer.create(React.createElement(ForecastNotices,props));});}
test('forecast status explains real input progress and does not claim a working model prematurely',async()=>{
 await mount();const result=text(tree.toJSON());assert.match(result,/14\/648/);assert.match(result,/Collecting model input/);assert.match(result,/Future allergy tiers are not calculated/);assert.doesNotMatch(result,/Verified forecasts collected/);
});
test('forecast panel does not interpret retired tier notices or claim automatic PM-indicator push',async()=>{
 value.events=[{tier:'very_high',score:95}];await mount();const result=text(tree.toJSON());assert.doesNotMatch(result,/95|very high|trigger push/);assert.match(result,/concentration values/);
});
test('disabled collection, missing schedule and stale heartbeat are shown explicitly',async()=>{
 for(const mutate of [v=>{v.worker.enabled=false},v=>{v.worker.last_finished_at=null},v=>{v.worker.last_finished_at=new Date(Date.now()-240000).toISOString()}]){
  value=snapshot();mutate(value);await mount();const result=text(tree.toJSON());assert.match(result,/switched off|No scheduled run|not finished recently/);await act(async()=>tree.unmount());tree=null;
 }
});
test('migration or network failures show an error and refresh reloads actual status',async()=>{
 globalThis.forecastApi=async()=>{throw Error('Release migration unavailable')};await mount();assert.match(text(tree.toJSON()),/Release migration unavailable/);
 globalThis.forecastApi=async()=>snapshot();await act(async()=>tree.root.findByType('button').props.onClick());assert.match(text(tree.toJSON()),/14\/648/);assert.doesNotMatch(text(tree.toJSON()),/Release migration unavailable/);
});
test('a late previous-account request cannot replace the new account forecast status',async()=>{
 let finish;globalThis.forecastApi=()=>new Promise(resolve=>finish=resolve);await mount();
 globalThis.forecastApi=async()=>({...snapshot(),device:null,worker:null});await act(async()=>{currentAccount='member';window.dispatchEvent(new Event('allert-session-changed'))});
 await act(async()=>{finish({...snapshot(),events:[{id:'private-old',horizon_hours:24,population:'adult',tier:'very_high',target:new Date().toISOString(),status:'pending'}]})});assert.match(text(tree.toJSON()),/Link or join a node/);assert.doesNotMatch(text(tree.toJSON()),/very high/);
});
test('Settings compact status retains collection checks without expanding the forecast history',async()=>{value.events=[{id:'event',target:new Date().toISOString(),horizon_hours:6,population:'adult',tier:'high',status:'pending'}];await mount({compact:true});assert.equal(tree.root.findAllByType('article').length,0);assert.match(text(tree.toJSON()),/14\/648/);assert.equal(calls[0].path,'/risk-monitor');});
