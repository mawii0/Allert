import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { build } from 'esbuild';
import { resolve } from 'node:path';
await build({stdin:{contents:`export * from './src/app/utils/auth';export * from './src/app/utils/useProfileSettings';export * from './src/app/components/SettingsScreen';export * from './src/app/components/DashboardScreen';`,resolveDir:process.cwd(),loader:'ts'},outfile:'integration/test-output/profile-ui.mjs',bundle:true,format:'esm',platform:'node',jsx:'automatic',loader:{'.css':'empty'},external:['react','react/jsx-runtime','lucide-react'],plugins:[{name:'fixtures',setup(b){
  b.onResolve({filter:/AdminLiveTools$/},()=>({path:'admin-link',namespace:'admin-link-fixture'}));b.onLoad({filter:/.*/,namespace:'admin-link-fixture'},()=>({contents:'export const AdminAccessLink=()=>null;'}));
  b.onResolve({filter:/NodeLocationControls$/},()=>({path:'location-controls',namespace:'location-fixture'}));b.onLoad({filter:/.*/,namespace:'location-fixture'},()=>({contents:'export const NodeLocationControls=()=>null;'}));
  b.onResolve({filter:/^\/utils\/supabase\/info$/},()=>({path:resolve('utils/supabase/info.tsx')}));
  const fixtures={
    useNotificationPreferences:'export const useNotificationPreferences=()=>({enabled:false,loading:false,saving:false,error:"",toggleDisabled:false,status:"Notifications unchanged",retry:()=>{},changeEnabled:async()=>true});',
    useNodeTelemetry:'export const useNodeTelemetry=()=>({device:{device_id:"ALLERT-NODE-001"},latest:null,loading:false,error:null,nodeStatus:"Node offline",lastReading:"Unknown",retry:()=>{}});',
    'risk-monitor':'export const useRiskMonitor=()=>globalThis.monitorFixture;',
    'ui/switch':`import React from 'react';export const Switch=props=>React.createElement('button',{role:'switch','aria-label':props['aria-label'],'aria-checked':props.checked,onClick:()=>props.onCheckedChange(!props.checked)});`,
    'ui/button':`import React from 'react';export const Button=({children,variant,...props})=>React.createElement('button',props,children);`,
    'react-router':'export const useNavigate=()=>()=>{};',
  };
  b.onResolve({filter:/(useNotificationPreferences|useNodeTelemetry|risk-monitor|ui\/switch|ui\/button|react-router)$/},args=>{const key=Object.keys(fixtures).find(key=>args.path.endsWith(key));return {path:key,namespace:'fixture'};});
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:fixtures[args.path],loader:'js'}));
}}]});
const app=await import('./test-output/profile-ui.mjs');
class Storage {getItem(k){return this[k]??null;}setItem(k,v){this[k]=String(v);}removeItem(k){delete this[k];}}
const session=id=>({user:{id,email:`${id}@example.invalid`,user_metadata:{name:id}},access_token:`header.${Buffer.from(JSON.stringify({sub:id,exp:Date.now()/1000+3600})).toString('base64url')}.signature`,refresh_token:`refresh-${id}`});
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
const text=node=>Array.isArray(node)?node.map(text).join(''):typeof node==='string'?node:(node?.children||[]).map(text).join('');
const storageEvent=(key,newValue)=>{const event=new Event('storage');Object.assign(event,{key,newValue});window.dispatchEvent(event);};
let tree,state,saved,requests;
beforeEach(()=>{
  globalThis.window=new EventTarget();globalThis.localStorage=new Storage();app.storeSession(session('account-a'));
  saved={userId:'account-a',email:'account-a@example.invalid',name:'Original name',demographic:'adult',createdAt:'2026-10-01T00:00:00Z'};requests=[];
  globalThis.fetch=async(url,options)=>{requests.push({url,options});if(options.method==='POST')saved={...saved,...JSON.parse(options.body),updatedAt:new Date().toISOString()};return response({success:true,profile:{...saved}});};
  const current={timestamp:'2026-10-01T00:00:00Z',pm2_5:12,pm10:20,temperature:28,humidity:60,risk:{adult:{tier:'low',score_0_100:12.3},pediatric:{tier:'high',score_0_100:45.6}}};
  globalThis.monitorFixture={data:{current,device:{device_id:'ALLERT-NODE-001'},model_status:'ready',forecasts:[]},status:'ready',retry:()=>{}};
});
afterEach(async()=>{if(tree){await act(async()=>tree.unmount());tree=null;}});
async function mount(component){await act(async()=>{tree=TestRenderer.create(React.createElement(component));});}
async function harness(){function Harness(){state=app.useProfileSettings();return null;}await mount(Harness);}
const button=label=>tree.root.findAllByType('button').find(node=>text(node)===label);
async function click(label){await act(async()=>button(label).props.onClick());}
const form=()=>tree.root.findByProps({'aria-label':'Edit profile'});
async function submit(){await act(async()=>{await form().props.onSubmit({preventDefault(){}});});}
test('Settings keeps its existing sections and adds editing inside the profile card',async()=>{
  await mount(app.SettingsScreen);const content=text(tree.toJSON());for(const label of ['Settings','Original name','ALLERT-NODE-001','Sensor Node Status','Notifications unchanged','Logout','Edit profile'])assert.ok(content.includes(label),label);
  assert.equal(tree.root.findAllByType('form').length,0);
});
test('cancel discards draft changes and performs no save',async()=>{
  await mount(app.SettingsScreen);await click('Edit profile');await act(async()=>form().findByProps({name:'name'}).props.onChange({target:{value:'Unsaved name'}}));await click('Cancel');
  assert.equal(requests.filter(request=>request.options.method==='POST').length,0);assert.ok(text(tree.toJSON()).includes('Original name'));await click('Edit profile');assert.equal(tree.root.findByProps({name:'name'}).props.value,'Original name');
});
test('name correction persists and survives remount while email and membership remain intact',async()=>{
  await mount(app.SettingsScreen);await click('Edit profile');await act(async()=>tree.root.findByProps({name:'name'}).props.onChange({target:{value:'  Updated name  '}}));await submit();
  assert.equal(saved.name,'Updated name');assert.ok(text(tree.toJSON()).includes('Profile saved.'));assert.ok(text(tree.toJSON()).includes('account-a@example.invalid'));assert.equal(saved.createdAt,'2026-10-01T00:00:00Z');
  await act(async()=>tree.unmount());tree=null;await mount(app.SettingsScreen);assert.ok(text(tree.toJSON()).includes('Updated name'));
});
test('category change requires explicit confirmation and updates the mounted dashboard immediately',async()=>{
  function Screens(){return React.createElement(React.Fragment,null,React.createElement(app.SettingsScreen),React.createElement(app.DashboardScreen));}
  await mount(Screens);assert.ok(text(tree.toJSON()).includes('12.3'));await click('Edit profile');await act(async()=>tree.root.findByType('select').props.onChange({target:{value:'pediatric'}}));
  assert.equal(button('Save profile').props.disabled,true);await submit();assert.equal(requests.filter(request=>request.options.method==='POST').length,0);
  await act(async()=>form().findByProps({type:'checkbox'}).props.onChange({target:{checked:true}}));assert.equal(button('Save profile').props.disabled,false);await submit();
  assert.equal(saved.demographic,'pediatric');assert.ok(text(tree.toJSON()).includes('45.6'));assert.ok(text(tree.toJSON()).includes('Current pediatric environmental indicator'));
});
test('switching categories again resets the confirmation and cancel keeps the saved category',async()=>{
  await harness();await act(async()=>state.begin());await act(async()=>{state.setDemographic('pediatric');state.setConfirmed(true);});assert.equal(state.canSave,true);
  await act(async()=>state.setDemographic('adult'));assert.equal(state.confirmed,false);assert.equal(state.canSave,false);await act(async()=>state.cancel());assert.equal(state.profile.demographic,'adult');
});
test('empty, whitespace-only and oversized names cannot be saved',async()=>{
  await harness();await act(async()=>state.begin());for(const value of ['','   ','x'.repeat(101)]){
    await act(async()=>state.setName(value));assert.equal(state.canSave,false);await act(async()=>{assert.equal(await state.save(),false);});
  }assert.equal(requests.filter(request=>request.options.method==='POST').length,0);
});
test('failed saves preserve the draft and confirmed profile without a false success message',async()=>{
  await harness();await act(async()=>state.begin());await act(async()=>state.setName('Draft name'));globalThis.fetch=async()=>response({error:'Database unavailable'},503);
  await act(async()=>{assert.equal(await state.save(),false);});assert.equal(state.name,'Draft name');assert.equal(state.profile.name,'Original name');assert.equal(state.message,'');assert.match(state.error,/Database unavailable/);assert.equal(state.saving,false);
});
test('failed initial loads show an error and retry restores the server profile',async()=>{
  const fetch=globalThis.fetch;globalThis.fetch=async()=>response({error:'Temporarily unavailable'},503);await mount(app.SettingsScreen);assert.ok(text(tree.toJSON()).includes('Temporarily unavailable'));assert.equal(button('Edit profile'),undefined);
  assert.ok(button('Logout'));
  globalThis.fetch=fetch;await click('Retry profile');assert.ok(text(tree.toJSON()).includes('Original name'));
});
test('rapid save clicks serialize into one mutation and focus cannot reset the pending save',async()=>{
  await harness();await act(async()=>state.begin());await act(async()=>state.setName('New name'));let finish,count=0;
  globalThis.fetch=(_url,options)=>{assert.equal(options.method,'POST');count++;return new Promise(resolve=>finish=resolve);};let saving;
  await act(async()=>{saving=state.save();assert.equal(await state.save(),false);});await act(async()=>window.dispatchEvent(new Event('focus')));assert.equal(count,1);assert.equal(state.saving,true);
  await act(async()=>{finish(response({profile:{...saved,name:'New name'}}));assert.equal(await saving,true);});assert.equal(state.profile.name,'New name');assert.equal(state.saving,false);
});
test('switching accounts clears an open draft and ignores a delayed prior-account load',async()=>{
  const pending=[];globalThis.fetch=(_url,options)=>new Promise(resolve=>pending.push({resolve,options}));await harness();assert.equal(state.loading,true);
  await act(async()=>app.storeSession(session('account-b')));assert.equal(pending[0].options.signal.aborted,true);
  await act(async()=>pending[1].resolve(response({profile:{...saved,userId:'account-b',email:'account-b@example.invalid',name:'Account B'}})));
  await act(async()=>pending[0].resolve(response({profile:saved})));assert.equal(state.profile.userId,'account-b');assert.equal(state.profile.name,'Account B');assert.equal(state.editing,false);
});
test('a delayed save cannot replace a new account profile or show success for that account',async()=>{
  await harness();await act(async()=>state.begin());await act(async()=>state.setName('Account A draft'));let finish;const fetch=globalThis.fetch;
  globalThis.fetch=(url,options)=>options.method==='POST'?new Promise(resolve=>finish=resolve):fetch(url,options);let saving;await act(async()=>{saving=state.save();});
  await act(async()=>{saved={...saved,userId:'account-b',email:'account-b@example.invalid',name:'Account B'};app.storeSession(session('account-b'));});
  await act(async()=>{finish(response({profile:{...saved,userId:'account-a',name:'Account A draft'}}));assert.equal(await saving,false);});
  assert.equal(state.profile.name,'Account B');assert.equal(state.message,'');assert.equal(state.saving,false);assert.equal(state.name,'');
});
test('a known cross-tab change blocks a stale draft until it is cancelled and reloaded',async()=>{
  await harness();await act(async()=>state.begin());await act(async()=>state.setName('My draft'));
  await act(async()=>{saved={...saved,name:'Other tab name'};localStorage.setItem('allert_user_name',saved.name);storageEvent('allert_user_name',saved.name);});
  assert.equal(state.canSave,false);assert.match(state.error,/another tab/);await act(async()=>{assert.equal(await state.save(),false);state.cancel();});assert.equal(state.profile.name,'Other tab name');
});
test('dashboard follows cross-tab category updates without rerunning the forecast',async()=>{
  await mount(app.DashboardScreen);assert.ok(text(tree.toJSON()).includes('12.3'));
  await act(async()=>{localStorage.setItem('allert_demographic','pediatric');storageEvent('allert_demographic','pediatric');});assert.ok(text(tree.toJSON()).includes('45.6'));
});
test('leaving Settings aborts its in-flight save and does not update the cache from a late reply',async()=>{
  await harness();await act(async()=>state.begin());await act(async()=>state.setName('Late name'));let finish,signal;
  globalThis.fetch=(_url,options)=>{signal=options.signal;return new Promise(resolve=>finish=resolve);};let saving;await act(async()=>{saving=state.save();});await act(async()=>tree.unmount());tree=null;assert.equal(signal.aborted,true);
  finish(response({profile:{...saved,name:'Late name'}}));assert.equal(await saving,false);assert.equal(localStorage.getItem('allert_user_name'),'Original name');
});
