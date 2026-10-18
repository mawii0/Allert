import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
await build({entryPoints:['src/app/utils/usePasswordRecovery.ts'],outfile:'integration/test-output/recovery-session.mjs',bundle:true,format:'esm',platform:'node',external:['react'],plugins:[{name:'fixtures',setup(b){
  b.onResolve({filter:/^\.\/auth$/},()=>({path:'auth',namespace:'fixture'}));b.onResolve({filter:/^\.\/password-recovery$/},()=>({path:'recovery',namespace:'fixture'}));
  const fixtures={auth:'export const getCurrentUser=()=>({id:globalThis.account});export const getAuthToken=()=>globalThis.normalToken;export const logout=()=>{globalThis.logouts++;globalThis.account=null;globalThis.normalToken=null;window.dispatchEvent(new Event("allert-session-changed"));};',
    recovery:'export class RecoveryError extends Error{constructor(message,status){super(message);this.status=status;}}export const recoveryEmail=value=>value.trim().toLowerCase();export const validRecoveryEmail=value=>value.includes("@");export const requestRecoveryCode=(...args)=>globalThis.send(...args);export const verifyRecoveryCode=(...args)=>globalThis.verify(...args);export const resetRecoveredPassword=(...args)=>globalThis.save(...args);export const closeRecoverySession=async session=>globalThis.closed.push(session);'};
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:fixtures[args.path],loader:'js'}));
}}]});
const {usePasswordRecovery}=await import('./test-output/recovery-session.mjs');
let state,tree,tick,calls;
const originalNow=Date.now;
beforeEach(()=>{
  globalThis.window=new EventTarget();window.setInterval=fn=>{tick=fn;return 1;};window.clearInterval=()=>{};
  globalThis.account=null;globalThis.normalToken=null;globalThis.logouts=0;globalThis.closed=[];calls=[];
  globalThis.send=async(email,signal)=>{calls.push({kind:'send',email,signal});};
  globalThis.verify=async(email,code,signal)=>{calls.push({kind:'verify',email,code,signal});return {accessToken:'temporary-secret',userId:'recovered-user',email,expiresAt:Date.now()+900000};};
  globalThis.save=async(session,password,confirmation,signal)=>{calls.push({kind:'save',session,password,confirmation,signal});return {sessionsRevoked:true};};
});
afterEach(async()=>{Date.now=originalNow;if(tree){await act(async()=>tree.unmount());tree=null;}});
async function mount(){function Harness(){state=usePasswordRecovery('Person@Example.com');return null;}await act(async()=>{tree=TestRenderer.create(React.createElement(Harness));});}
async function verified(){await act(async()=>state.send());await act(async()=>state.setCode('123456'));await act(async()=>state.verify());}
test('opening recovery never sends email or signs in automatically',async()=>{
  await mount();assert.equal(state.stage,'email');assert.equal(state.email,'Person@Example.com');assert.equal(calls.length,0);assert.equal(logouts,0);
});
test('requesting recovery shows a generic acknowledgement and enforces resend cooldown',async()=>{
  await mount();await act(async()=>state.send());assert.equal(state.stage,'code');assert.match(state.notice,/If an account exists/);assert.equal(state.remaining,60);
  await act(async()=>state.send());assert.equal(calls.length,1);
  const future=originalNow()+61000;Date.now=()=>future;await act(async()=>tick());assert.equal(state.remaining,0);await act(async()=>state.send());assert.equal(calls.length,2);
});
test('wrong codes retain the code stage; password updates are unavailable before verification',async()=>{
  await mount();await act(async()=>state.save());assert.equal(calls.length,0);await act(async()=>state.send());
  globalThis.verify=async()=>{throw Error('Code invalid or expired');};await act(async()=>state.verify());assert.equal(state.stage,'code');assert.match(state.error,/invalid or expired/);assert.equal(logouts,0);
});
test('double clicks serialize requests before React updates the disabled button',async()=>{
  await mount();let finish;globalThis.send=()=>new Promise(resolve=>{calls.push({kind:'send'});finish=resolve;});let first;
  await act(async()=>{first=state.send();void state.send();});assert.equal(calls.length,1);assert.equal(state.busy,true);await act(async()=>{finish();await first;});assert.equal(state.stage,'code');assert.equal(state.busy,false);
});
test('verification keeps its session separate and an unrelated signed-in account survives reset',async()=>{
  account='another-user';normalToken='normal-session';await mount();await verified();assert.equal(state.stage,'password');assert.equal(state.code,'');assert.equal(logouts,0);
  await act(async()=>{state.setPassword('new-password');state.setConfirmation('new-password');});await act(async()=>state.save());assert.equal(state.stage,'done');assert.equal(state.password,'');assert.equal(state.confirmation,'');assert.equal(account,'another-user');assert.equal(normalToken,'normal-session');assert.equal(logouts,0);assert.equal(state.busy,false);
});
test('resetting the active account clears its normal local session without erasing success',async()=>{
  account='recovered-user';normalToken='old-session';await mount();await verified();await act(async()=>{state.setPassword('new-password');state.setConfirmation('new-password');});await act(async()=>state.save());assert.equal(logouts,1);assert.equal(account,null);assert.equal(state.stage,'done');assert.equal(state.busy,false);assert.match(state.notice,/Password updated/);
});
test('a late verification after account switching cannot enable reset or overwrite the new session',async()=>{
  await mount();await act(async()=>state.send());let finish,task;globalThis.verify=()=>new Promise(resolve=>finish=resolve);
  await act(async()=>{task=state.verify();});await act(async()=>{account='new-user';normalToken='new-session';window.dispatchEvent(new Event('allert-session-changed'));});
  const session={userId:'old-user',accessToken:'old-recovery',expiresAt:originalNow()+10000};await act(async()=>{finish(session);await task;});assert.equal(state.stage,'email');assert.equal(state.email,'');assert.equal(state.busy,false);assert.equal(normalToken,'new-session');assert.equal(logouts,0);assert.deepEqual(closed,[session]);
});
test('a late password result after account switching cannot clear the new account or display old-account success',async()=>{
  account='recovered-user';normalToken='old-session';await mount();await verified();let finish,task;globalThis.save=()=>new Promise(resolve=>finish=resolve);
  await act(async()=>{task=state.save();});await act(async()=>{account='new-user';normalToken='new-session';window.dispatchEvent(new Event('allert-session-changed'));});
  await act(async()=>{finish({sessionsRevoked:true});await task;});assert.equal(account,'new-user');assert.equal(normalToken,'new-session');assert.equal(logouts,0);assert.equal(state.stage,'email');assert.equal(state.notice,'');
});
test('password rejection retains the verified session for a corrected password',async()=>{
  await mount();await verified();globalThis.save=async()=>{throw Error('Choose a stronger password');};await act(async()=>state.save());assert.equal(state.stage,'password');assert.match(state.error,/stronger/);assert.equal(closed.length,0);
});
test('verified recovery expires in memory and requests a new code',async()=>{
  await mount();await verified();Date.now=()=>originalNow()+901000;await act(async()=>tick());assert.equal(state.stage,'code');assert.match(state.error,/expired/);assert.equal(closed.length,1);
});
test('leaving recovery closes only its temporary session and clears ongoing work',async()=>{
  account='normal-user';normalToken='normal-session';await mount();await verified();await act(async()=>tree.unmount());tree=null;assert.equal(closed.length,1);assert.equal(account,'normal-user');assert.equal(normalToken,'normal-session');assert.equal(logouts,0);
});

test('an existing email code can be entered on another device without requesting a new code',async()=>{
  await mount();await act(async()=>state.useExistingCode());assert.equal(state.stage,'code');assert.equal(state.email,'person@example.com');assert.equal(calls.length,0);
  await act(async()=>state.setCode('123456'));await act(async()=>state.verify());assert.equal(state.stage,'password');assert.equal(calls[0].kind,'verify');
});
test('refreshing a normal same-account session during reset cannot be undone by a late local logout',async()=>{
  account='recovered-user';normalToken='old-session';await mount();await verified();let finish,task;globalThis.save=()=>new Promise(resolve=>finish=resolve);
  await act(async()=>{task=state.save();});normalToken='new-session';await act(async()=>{finish({sessionsRevoked:true});await task;});assert.equal(logouts,0);assert.equal(normalToken,'new-session');assert.equal(state.stage,'done');
});
