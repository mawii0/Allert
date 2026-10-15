import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
await build({entryPoints:['src/app/utils/browser-push.ts'],outfile:'integration/test-output/push-browser.mjs',bundle:true,format:'esm',platform:'node',plugins:[{name:'fixtures',setup(b){
  b.onResolve({filter:/^\/utils\/supabase\/info$/},()=>({path:resolve('utils/supabase/info.tsx')}));
  b.onResolve({filter:/^\.\/auth$/},()=>({path:'auth',namespace:'fixture'}));
  b.onResolve({filter:/^\.\/private-api$/},()=>({path:'api',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='auth'?'export const getCurrentUser=()=>({id:globalThis.owner});export const getAuthToken=()=>globalThis.token;':'export const privateApi=(...args)=>globalThis.api(...args);'}));
}}]});
const browser=await import('./test-output/push-browser.mjs');
let binding,subscription,reg,calls,prompts,cleanup,tail;
const key='B'+'a'.repeat(86);
const drain=async()=>{await tail;await new Promise(resolve=>setImmediate(resolve));await tail;};
beforeEach(()=>{
  globalThis.owner='account-a';globalThis.token='old-session-token';binding=null;calls=[];prompts=0;tail=Promise.resolve();
  globalThis.location={origin:'https://allert.example'};globalThis.window=new EventTarget();window.isSecureContext=true;window.setTimeout=setTimeout;window.clearTimeout=clearTimeout;window.PushManager=class{};
  window.Notification={permission:'granted',requestPermission:async()=>{prompts++;return 'granted';}};
  const keyBytes=Uint8Array.from(Buffer.from(key,'base64url')).buffer;
  const makeSubscription=()=>({options:{applicationServerKey:keyBytes},toJSON:()=>({endpoint:'https://fcm.googleapis.com/wp/browser',keys:{}}),unsubscribe:async()=>{calls.push('unsubscribe');subscription=null;return true;}});
  subscription=makeSubscription();
  reg={active:{scriptURL:'https://allert.example/allert-sw.js',postMessage:({type,binding:value,owner:expected},ports)=>{
    calls.push(type);
    if(type==='save')binding=value;
    if(type==='clear'&&(!expected||binding?.owner===expected))binding=null;
    ports[0].postMessage({ok:true,binding});ports[0].close();
  }},pushManager:{getSubscription:async()=>subscription,subscribe:async()=>{calls.push('subscribe');subscription=makeSubscription();return subscription;}}};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:(_name,action)=>{const run=tail.then(action);tail=run.catch(()=>{});return run;}},serviceWorker:{getRegistration:async()=>reg,register:async()=>reg}}});
  globalThis.api=async(path,options)=>{calls.push({path,options});return path.endsWith('/status')?{connected:true}:path.endsWith('/test')?{outcome:'accepted'}:{bindingId:'11111111-1111-4111-8111-111111111111'};};
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response('{}');};
});
afterEach(async()=>{cleanup?.();cleanup=null;await drain();});
test('permission is requested by the connect action before registration and API writes',async()=>{
  window.Notification.permission='default';const order=[];window.Notification.requestPermission=()=>{order.push('permission');return Promise.resolve('granted');};
  const normal=api;globalThis.api=(...args)=>{order.push('api');return normal(...args);};
  await browser.connectBrowser(key);assert.equal(order[0],'permission');assert.equal(binding.owner,'account-a');assert.equal(binding.id,'11111111-1111-4111-8111-111111111111');
});
test('denied permission never registers a server subscription',async()=>{
  window.Notification.permission='denied';await assert.rejects(browser.connectBrowser(key),/blocked/);assert.equal(calls.filter(x=>x.path).length,0);assert.equal(binding,null);
});
test('account changes while native permission is pending cannot connect the new account',async()=>{
  window.Notification.permission='default';let finish;window.Notification.requestPermission=()=>new Promise(resolve=>finish=resolve);
  const task=browser.connectBrowser(key);owner='account-b';finish('granted');await assert.rejects(task,/Account changed/);assert.equal(calls.length,0);
});
test('cold-start guard clears subscriptions belonging to another account without prompting',async()=>{
  binding={owner:'account-b',id:'old'};cleanup=browser.startPushSessionGuard();await drain();assert.equal(binding,null);assert.equal(subscription,null);assert.equal(prompts,0);
});
test('logout revokes the captured old session, clears binding and unsubscribes even with Settings closed',async()=>{
  binding={owner:'account-a',id:'11111111-1111-4111-8111-111111111111'};cleanup=browser.startPushSessionGuard();await drain();
  window.dispatchEvent(new Event('allert-before-signout'));owner=null;token=null;window.dispatchEvent(new Event('allert-session-changed'));await drain();
  const revoke=calls.find(x=>x.options?.keepalive);assert.equal(revoke.options.headers.Authorization,'Bearer old-session-token');assert.equal(revoke.options.method,'DELETE');assert.equal(binding,null);assert.equal(subscription,null);
});
test('local disconnect clears the worker even when server cleanup fails',async()=>{
  binding={owner:'account-a',id:'old'};globalThis.api=async()=>{throw Error('offline');};
  assert.equal(await browser.disconnectBrowser(),false);assert.equal(binding,null);assert.equal(subscription,null);
});
test('connection status verifies server ownership instead of trusting native permission',async()=>{
  assert.equal(await browser.browserPushConnected(),false);binding={owner:'account-a',id:'current'};
  globalThis.api=async()=>({connected:false});assert.equal(await browser.browserPushConnected(),false);assert.equal(prompts,0);
});
