import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {build} from 'esbuild';
await build({stdin:{contents:`export * from './src/app/components/ClinicalCorrelation';export * from './src/app/components/AppInstallation';export * from './src/app/utils/pwa-install';`,resolveDir:process.cwd(),loader:'ts'},outfile:'integration/test-output/mobile-clinical.mjs',bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime'],plugins:[{name:'fixture',setup(b){
  b.onResolve({filter:/private-api$/},()=>({path:'api',namespace:'fixture'}));b.onResolve({filter:/(?:^|\/)auth$/},()=>({path:'auth',namespace:'fixture'}));
  b.onResolve({filter:/^recharts$/},()=>({path:'chart',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='api'?'export const privateApi=(...args)=>globalThis.readClinical(...args);':args.path==='chart'?'export const CartesianGrid=()=>null;export const Legend=()=>null;export const Line=()=>null;export const LineChart=()=>null;export const ResponsiveContainer=()=>null;export const Tooltip=()=>null;export const XAxis=()=>null;export const YAxis=()=>null;':'export const getCurrentUser=()=>({id:globalThis.currentAccount});',loader:'js'}));
}}]});
const app=await import('./test-output/mobile-clinical.mjs');
globalThis.window=new EventTarget();window.setInterval=setInterval;window.clearInterval=clearInterval;window.setTimeout=(...args)=>setTimeout(...args).unref();
const media=new EventTarget();media.matches=false;window.matchMedia=()=>media;window.isSecureContext=true;
globalThis.location={origin:'https://allert.example'};let registered=0;
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true,serviceWorker:{getRegistration:async()=>undefined,register:async()=>{registered++;return {};}}}});
let tree;const text=node=>Array.isArray(node)?node.map(text).join(''):typeof node==='string'?node:(node?.children||[]).map(text).join('');
const button=label=>tree.root.findAllByType('button').find(node=>text(node).trim()===label);
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
test('empty correlation shows insufficient data and keeps export disabled',async()=>{
  globalThis.currentAccount='a';globalThis.readClinical=async()=>({device:{device_id:'NODE-A'},analysis:{population:'adult',pairs:[],vas:{rho:null,reason:'insufficient_pairs'},tnss:{rho:null,reason:'insufficient_pairs'},excluded:{no_matching_forecast:3,missing_observation_time:1}}});
  await act(async()=>{tree=TestRenderer.create(React.createElement(app.ClinicalCorrelation));});
  assert.match(text(tree.toJSON()),/Insufficient matched days/);assert.equal(button('Export matched pairs').props.disabled,true);assert.ok(!text(tree.toJSON()).includes('ρ = 0'));
});
test('real coefficients, constant values, category and period controls remain honest',async()=>{
  const calls=[];globalThis.readClinical=async path=>{calls.push(path);return {device:{device_id:'NODE-A'},analysis:{population:'pediatric',pairs:[{}],vas:{rho:-0.375,reason:null},tnss:{rho:null,reason:'constant_values'},excluded:{no_matching_forecast:0,missing_observation_time:0}}};};
  await act(async()=>{tree=TestRenderer.create(React.createElement(app.ClinicalCorrelation));});assert.match(text(tree.toJSON()),/ρ = -0.375/);assert.match(text(tree.toJSON()),/values do not vary/);assert.match(text(tree.toJSON()),/pediatric/);
  await act(async()=>tree.root.findByProps({'aria-label':'Correlation forecast horizon'}).props.onChange({target:{value:'24'}}));assert.ok(calls.at(-1).endsWith('horizon=24'));
});
test('a failed correlation request cannot display a sample result',async()=>{
  globalThis.readClinical=async()=>{throw Error('Migration missing');};await act(async()=>{tree=TestRenderer.create(React.createElement(app.ClinicalCorrelation));});assert.match(text(tree.toJSON()),/Migration missing/);assert.equal(button('Export matched pairs').props.disabled,true);
});
test('diary corrections refresh matched analysis and account changes clear old results',async()=>{
  const pending=[];globalThis.currentAccount='a';globalThis.readClinical=()=>new Promise(resolve=>pending.push(resolve));
  await act(async()=>{tree=TestRenderer.create(React.createElement(app.ClinicalCorrelation,{diaryRevision:'1'}));});assert.equal(pending.length,1);
  await act(async()=>tree.update(React.createElement(app.ClinicalCorrelation,{diaryRevision:'2'})));assert.equal(pending.length,2);
  globalThis.currentAccount='b';await act(async()=>window.dispatchEvent(new Event('allert-session-changed')));
  await act(async()=>pending[1]({device:{device_id:'OLD-NODE'},analysis:null}));assert.ok(!text(tree.toJSON()).includes('OLD-NODE'));
  await act(async()=>pending.at(-1)({device:null,analysis:null}));assert.match(text(tree.toJSON()),/Link a node/);
});
test('startup registers the shared worker without requesting notification permission or installation',async()=>{
  app.startInstallationSupport();await new Promise(resolve=>setImmediate(resolve));assert.equal(registered,1);assert.equal(app.installationState().available,false);
  await act(async()=>{tree=TestRenderer.create(React.createElement(app.AppInstallation));});assert.match(text(tree.toJSON()),/Add to Home Screen/);
});
test('native installation prompt runs only after the install button and double clicks cannot duplicate it',async()=>{
  let prompts=0,finish;const event=new Event('beforeinstallprompt',{cancelable:true});event.prompt=async()=>{prompts++;};event.userChoice=new Promise(resolve=>{finish=resolve;});
  window.dispatchEvent(event);assert.equal(event.defaultPrevented,true);assert.equal(prompts,0);
  await act(async()=>{tree=TestRenderer.create(React.createElement(app.AppInstallation));});
  await act(async()=>{button('Install on this device').props.onClick();button('Install on this device')?.props.onClick();});assert.equal(prompts,1);
  await act(async()=>finish({outcome:'dismissed'}));assert.equal(app.installationState().busy,false);assert.ok(!text(tree.toJSON()).includes('Running as an installed app'));
});
test('standalone mode is recognized and offline banner follows actual browser events',async()=>{
  media.matches=true;await act(async()=>{tree=TestRenderer.create(React.createElement(app.AppInstallation));});assert.match(text(tree.toJSON()),/Running as an installed app/);await act(async()=>tree.unmount());tree=null;media.matches=false;
  await act(async()=>{tree=TestRenderer.create(React.createElement(app.ConnectionStatus));});assert.equal(tree.toJSON(),null);
  await act(async()=>{navigator.onLine=false;window.dispatchEvent(new Event('offline'));});assert.match(text(tree.toJSON()),/reconnect before saving/);
  await act(async()=>{navigator.onLine=true;window.dispatchEvent(new Event('online'));});assert.equal(tree.toJSON(),null);
});
