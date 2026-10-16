import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
await build({stdin:{contents:`export * from './src/app/utils/service-health';export * from './src/app/utils/useServiceHealth';export * from './src/app/components/DeploymentCheck';`,resolveDir:process.cwd(),loader:'ts'},outfile:'integration/test-output/service-health.mjs',bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime','lucide-react'],plugins:[{name:'public-project',setup(b){b.onResolve({filter:/^\/utils\/supabase\/info$/},()=>({path:'info',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const projectId="public-project";'}));}}]});
const app=await import('./test-output/service-health.mjs');
let state,tree,calls,timers,nextTimer,online;
const text=node=>Array.isArray(node)?node.map(text).join(''):typeof node==='string'?node:(node?.children||[]).map(text).join('');
beforeEach(()=>{
 calls=[];timers=new Map();nextTimer=1;online=true;state=null;globalThis.window=new EventTarget();
 window.setTimeout=(fn,ms)=>{const id=nextTimer++;timers.set(id,{fn,ms});return id};window.clearTimeout=id=>timers.delete(id);
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{get onLine(){return online}}});
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({status:'ok'}))};
});
afterEach(async()=>{if(tree){await act(async()=>tree.unmount());tree=null}assert.equal(timers.size,0);});
async function mount(Component=()=>{state=app.useServiceHealth();return null}){await act(async()=>{tree=Renderer.create(React.createElement(Component))});}
async function tick(ms){const found=[...timers].find(([,timer])=>timer.ms===ms);assert.ok(found,`No ${ms}ms timer`);timers.delete(found[0]);await act(async()=>{found[1].fn()});}
const probe=()=>app.checkServiceHealth(new AbortController().signal);
test('public liveness checks send no authorization, cookies or credential request',async()=>{
 assert.equal((await probe()).kind,'ready');assert.equal(calls.length,1);assert.equal(calls[0].url,'https://public-project.supabase.co/functions/v1/make-server-a473accf/health');assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.headers,undefined);assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.cache,'no-store');assert.ok(calls[0].options.signal instanceof AbortSignal);
});
test('offline health checking does not send a network request',async()=>{online=false;assert.equal((await probe()).kind,'offline');assert.equal(calls.length,0);});
test('HTTP failures preserve status without exposing server response content',async()=>{globalThis.fetch=async()=>new Response('private backend diagnostic',{status:503});const result=await probe();assert.deepEqual(result,{kind:'http',status:503});assert.ok(!JSON.stringify(result).includes('private'));});
test('malformed JSON and unexpected successful responses cannot report ready',async()=>{for(const body of ['<html>fallback</html>','{}','{"status":"failed"}']){globalThis.fetch=async()=>new Response(body);assert.equal((await probe()).kind,'invalid');}});
test('network failures and timeouts remain distinguishable',async()=>{globalThis.fetch=async()=>{throw new TypeError('Failed to fetch')};assert.equal((await probe()).kind,'network');globalThis.fetch=async()=>{throw new DOMException('timeout','TimeoutError')};assert.equal((await probe()).kind,'timeout');});
test('a failed response body stream is retried as a network failure',async()=>{globalThis.fetch=async()=>({ok:true,json:async()=>{throw new TypeError('Network body failed')}});assert.equal((await probe()).kind,'network');});
test('caller cancellation is discarded rather than translated into an outage',async()=>{const caller=new AbortController();caller.abort();await assert.rejects(app.checkServiceHealth(caller.signal));assert.equal(calls.length,0);});
test('a successful first health request hides the banner',async()=>{await mount(app.DeploymentCheck);assert.equal(tree.toJSON(),null);assert.equal(calls.length,1);});
test('a transient fetch failure retries automatically and clears on success',async()=>{
 let attempts=0;globalThis.fetch=async()=>{attempts++;if(attempts===1)throw new TypeError('Failed to fetch');return new Response('{"status":"ok"}')};await mount();assert.equal(state.state.kind,'checking');assert.equal(attempts,1);await tick(1000);assert.equal(state.state.kind,'ready');assert.equal(attempts,2);assert.equal(timers.size,0);
});
test('three failed checks show unconfirmed connection and retry in the background',async()=>{
 let failures=true;globalThis.fetch=async()=>{if(failures)throw new TypeError('Failed to fetch');return new Response('{"status":"ok"}')};await mount();await tick(1000);await tick(3000);assert.equal(state.state.kind,'network');assert.ok([...timers.values()].some(timer=>timer.ms===30000));failures=false;await tick(30000);assert.equal(state.state.kind,'ready');assert.equal(timers.size,0);
});
test('the warning never claims a confirmed sign-in outage for a failed health fetch',async()=>{globalThis.fetch=async()=>{throw new TypeError('Failed to fetch')};await mount(app.DeploymentCheck);await tick(1000);await tick(3000);const content=text(tree.toJSON());assert.match(content,/Connection check could not finish/);assert.match(content,/automatically/);assert.doesNotMatch(content,/Sign-in service unavailable/);});
test('an online event immediately recovers from offline without a reload',async()=>{online=false;await mount();assert.equal(state.state.kind,'offline');online=true;await act(async()=>window.dispatchEvent(new Event('online')));assert.equal(state.state.kind,'ready');assert.equal(calls.length,1);});
test('a late health response after going offline cannot restore ready',async()=>{let finish;globalThis.fetch=()=>new Promise(resolve=>finish=resolve);await mount();online=false;await act(async()=>window.dispatchEvent(new Event('offline')));assert.equal(state.state.kind,'offline');await act(async()=>finish(new Response('{"status":"ok"}')));assert.equal(state.state.kind,'offline');});
test('online reconnection cancels the old check and ignores its late failure',async()=>{let fail;globalThis.fetch=()=>new Promise((_resolve,reject)=>fail=reject);await mount();globalThis.fetch=async()=>new Response('{"status":"ok"}');await act(async()=>window.dispatchEvent(new Event('online')));assert.equal(state.state.kind,'ready');await act(async()=>fail(new TypeError('old fetch failed')));assert.equal(state.state.kind,'ready');});
test('manual retry and focus do not create overlapping requests',async()=>{let finish;globalThis.fetch=(url,options)=>{calls.push({url,options});return new Promise(resolve=>finish=resolve)};await mount();await act(async()=>{state.retry();state.retry();window.dispatchEvent(new Event('focus'))});assert.equal(calls.length,1);await act(async()=>finish(new Response('{"status":"ok"}')));assert.equal(state.state.kind,'ready');});
test('unmount aborts the in-flight check and removes reconnect listeners',async()=>{globalThis.fetch=(url,options)=>{calls.push({url,options});return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}))};await mount();const signal=calls[0].options.signal;await act(async()=>tree.unmount());tree=null;assert.equal(signal.aborted,true);window.dispatchEvent(new Event('online'));assert.equal(calls.length,1);});
test('unmount clears scheduled retry work',async()=>{globalThis.fetch=async()=>{throw new TypeError('failed')};await mount();assert.equal(timers.size,1);await act(async()=>tree.unmount());tree=null;assert.equal(timers.size,0);});
test('HTTP deployment errors remain visible and require an explicit retry',async()=>{globalThis.fetch=async()=>new Response('{}',{status:404});await mount(app.DeploymentCheck);assert.match(text(tree.toJSON()),/HTTP 404/);assert.equal(timers.size,0);globalThis.fetch=async()=>new Response('{"status":"ok"}');await act(async()=>tree.root.findByType('button').props.onClick());assert.equal(tree.toJSON(),null);});
test('server errors retry while authentication/configuration failures do not loop',async()=>{for(const status of [401,403,404,429])assert.equal(app.retryableHealth({kind:'http',status}),false);for(const status of [408,500,502,503,504])assert.equal(app.retryableHealth({kind:'http',status}),true);});
