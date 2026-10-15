import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { build } from 'esbuild';
await build({entryPoints:['src/app/components/SettingsScreen.tsx','src/app/components/OnboardingScreen.tsx'],outdir:'integration/test-output/notification-ui',bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime','lucide-react'],plugins:[{name:'fixtures',setup(b){
  b.onResolve({filter:/BrowserPushControls$/},()=>({path:'push-controls',namespace:'fixture'}));
  b.onResolve({filter:/useNotificationPreferences$/},()=>({path:'preferences',namespace:'fixture'}));
  b.onResolve({filter:/useNodeTelemetry$/},()=>({path:'telemetry',namespace:'fixture'}));
  b.onResolve({filter:/risk-monitor$/},()=>({path:'monitor',namespace:'fixture'}));
  b.onResolve({filter:/ui\/switch$/},()=>({path:'switch',namespace:'fixture'}));
  b.onResolve({filter:/ui\/button$/},()=>({path:'button',namespace:'fixture'}));
  b.onResolve({filter:/utils\/auth$/},()=>({path:'auth',namespace:'fixture'}));
  b.onResolve({filter:/^react-router$/},()=>({path:'router',namespace:'fixture'}));
  b.onResolve({filter:/\.png$/},()=>({path:'image',namespace:'fixture'}));
  const fixtures={
    'push-controls':'export const BrowserPushControls=()=>null;',
    preferences:'export const useNotificationPreferences=()=>globalThis.preferences;',
    telemetry:'export const useNodeTelemetry=()=>({device:null,latest:null,loading:false,error:null,nodeStatus:"No node",lastReading:"Unknown",retry:()=>{}});',
    monitor:'export const useRiskMonitor=()=>({data:null,status:"unavailable"});',
    switch:`import React from 'react';export const Switch=props=>React.createElement('button',{role:'switch','aria-label':props['aria-label'],'aria-checked':props.checked,disabled:props.disabled,onClick:()=>props.onCheckedChange(!props.checked)});`,
    button:`import React from 'react';export const Button=({children,variant,...props})=>React.createElement('button',props,children);`,
    auth:'export const isAuthenticated=()=>true;export const logout=()=>{};export const getCurrentUser=()=>({id:"account-a"});export const getProfile=async()=>({success:true,profile:{userId:"account-a",name:"Test",email:"test@example.invalid",demographic:"adult",createdAt:"2026-10-01T00:00:00Z"}});export const saveProfile=async()=>({success:true});',
    router:'export const useNavigate=()=>()=>{};',image:'export default "test-logo.png";',
  };
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:fixtures[args.path],loader:'js'}));
}}]});
const {SettingsScreen}=await import('./test-output/notification-ui/SettingsScreen.js');
const {OnboardingScreen}=await import('./test-output/notification-ui/OnboardingScreen.js');
globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
const text=node=>typeof node==='string'?node:(node?.children||[]).map(text).join('');
function fixture(overrides={}){globalThis.preferences={enabled:false,permission:'default',loading:false,saving:false,error:'',toggleDisabled:false,status:'Off for your account. Push delivery is not connected yet.',changeEnabled:async()=>true,retry:()=>{},...overrides};}
test('the existing Settings notification switch calls the preference action',async()=>{
  fixture();let changed;preferences.changeEnabled=async value=>{changed=value;return true;};let tree;
  await act(async()=>{tree=TestRenderer.create(React.createElement(SettingsScreen));});
  await act(async()=>tree.root.findByProps({role:'switch','aria-label':'Push notifications'}).props.onClick());
  assert.equal(changed,true);assert.ok(text(tree.toJSON()).includes('Push delivery is not connected yet.'));await act(async()=>tree.unmount());
});
test('a loading preference cannot be toggled and browser-blocked errors remain visible',async()=>{
  fixture({loading:true,toggleDisabled:true,error:'Notifications blocked in browser'});let tree;
  await act(async()=>{tree=TestRenderer.create(React.createElement(SettingsScreen));});
  assert.equal(tree.root.findByProps({role:'switch','aria-label':'Push notifications'}).props.disabled,true);
  assert.ok(text(tree.root.findByProps({role:'alert'})).includes('blocked'));await act(async()=>tree.unmount());
});
test('onboarding uses the same preference and waits for an active preference save',async()=>{
  fixture({enabled:true,saving:true,toggleDisabled:true});let tree;
  await act(async()=>{tree=TestRenderer.create(React.createElement(OnboardingScreen));});
  assert.equal(tree.root.findByProps({role:'switch','aria-label':'Push notifications'}).props['aria-checked'],true);
  const proceed=tree.root.findAllByType('button').find(button=>text(button).includes('Get Started'));
  assert.equal(proceed.props.disabled,true);await act(async()=>tree.unmount());
});
