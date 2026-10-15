import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
await build({entryPoints:['src/app/utils/auth.ts'],outfile:'integration/test-output/profile-api.mjs',bundle:true,format:'esm',platform:'node',plugins:[{name:'info',setup(b){b.onResolve({filter:/^\/utils\/supabase\/info$/},()=>({path:resolve('utils/supabase/info.tsx')}));}}]});
const auth=await import('./test-output/profile-api.mjs');
class Storage {getItem(k){return this[k]??null;}setItem(k,v){this[k]=String(v);}removeItem(k){delete this[k];}}
const jwt=(id='account-a',exp=Date.now()/1000+3600)=>`header.${Buffer.from(JSON.stringify({sub:id,exp})).toString('base64url')}.signature`;
const session=(id='account-a',exp)=>({user:{id,email:`${id}@example.invalid`,user_metadata:{name:'Old auth name'}},access_token:jwt(id,exp),refresh_token:`refresh-${id}`});
const profile=(overrides={})=>({userId:'account-a',email:'account-a@example.invalid',name:'Saved name',demographic:'adult',createdAt:'2026-10-01T00:00:00Z',...overrides});
const response=(value,status=200)=>new Response(JSON.stringify(value),{status});
let requests;
beforeEach(()=>{
  globalThis.window=new EventTarget();globalThis.localStorage=new Storage();auth.storeSession(session());requests=[];
  globalThis.fetch=async(url,options)=>{requests.push({url,options});return response({success:true,profile:profile()});};
});
test('loading a verified profile updates the active account name and category cache',async()=>{
  let updates=0;window.addEventListener('allert-profile-changed',()=>updates++);
  const result=await auth.getProfile();assert.equal(result.success,true);assert.equal(result.profile.userId,'account-a');
  assert.equal(localStorage.getItem('allert_user_name'),'Saved name');assert.equal(localStorage.getItem('allert_demographic'),'adult');assert.equal(updates,1);
  await auth.getProfile();assert.equal(updates,1);assert.equal(requests[0].options.cache,'no-store');assert.equal(requests[0].options.headers.Authorization,`Bearer ${auth.getAuthToken()}`);
});
test('saving sends only editable fields and uses the canonical server response',async()=>{
  globalThis.fetch=async(url,options)=>{requests.push({url,options});return response({success:true,profile:profile({name:'Canonical name',demographic:'pediatric'})});};
  const result=await auth.saveProfile('pediatric','  Edited name  ');
  assert.equal(result.success,true);assert.deepEqual(JSON.parse(requests[0].options.body),{demographic:'pediatric',name:'Edited name'});assert.equal(requests[0].options.method,'POST');
  assert.equal(localStorage.getItem('allert_user_name'),'Canonical name');assert.equal(localStorage.getItem('allert_demographic'),'pediatric');
});
test('legacy onboarding calls can still save a category without an explicit name',async()=>{
  await auth.saveProfile('adult');assert.deepEqual(JSON.parse(requests[0].options.body),{demographic:'adult'});
});
test('invalid editable values never reach the backend',async()=>{
  for(const [category,name] of [['unknown','Name'],['adult','x'.repeat(101)],['adult',42]])assert.equal((await auth.saveProfile(category,name)).success,false);
  assert.equal(requests.length,0);
});
test('wrong-owner and malformed profile responses cannot change cached values',async()=>{
  for(const patch of [{userId:'account-b'},{demographic:'unknown'},{name:null},{createdAt:'bad'}, {email:undefined}]){
    globalThis.fetch=async()=>response({profile:profile(patch)});const result=await auth.getProfile();assert.equal(result.success,false);assert.match(result.error,/Invalid profile response/);
    assert.equal(localStorage.getItem('allert_user_name'),'Old auth name');assert.equal(localStorage.getItem('allert_demographic'),null);
  }
});
test('a failed save retains the previously confirmed cache and reports no success',async()=>{
  await auth.getProfile();globalThis.fetch=async()=>response({error:'Database unavailable'},503);
  const result=await auth.saveProfile('pediatric','New');assert.equal(result.success,false);assert.match(result.error,/Database unavailable/);assert.equal(localStorage.getItem('allert_user_name'),'Saved name');assert.equal(localStorage.getItem('allert_demographic'),'adult');
});
test('a rejected current session signs out without caching a profile',async()=>{
  globalThis.fetch=async()=>response({error:'Unauthorized'},401);assert.equal((await auth.getProfile()).success,false);assert.equal(auth.getCurrentUser().id,null);
});
test('a late prior-account 401 cannot sign out the newly signed-in account',async()=>{
  let finish;globalThis.fetch=()=>new Promise(resolve=>finish=resolve);const pending=auth.getProfile();await Promise.resolve();auth.storeSession(session('account-b'));
  finish(response({error:'Unauthorized'},401));assert.equal((await pending).success,false);assert.equal(auth.getCurrentUser().id,'account-b');assert.equal(localStorage.getItem('allert_user_name'),'Old auth name');
});
test('logout and signing back into the same account invalidates a prior profile response',async()=>{
  let finish;globalThis.fetch=()=>new Promise(resolve=>finish=resolve);const pending=auth.getProfile();await Promise.resolve();auth.logout();auth.storeSession(session());
  finish(response({profile:profile({name:'Late old profile'})}));assert.equal((await pending).success,false);assert.equal(localStorage.getItem('allert_user_name'),'Old auth name');
});
test('a late save for a previous account cannot write to the current account cache',async()=>{
  let finish;globalThis.fetch=()=>new Promise(resolve=>finish=resolve);const pending=auth.saveProfile('pediatric','Edited');await Promise.resolve();auth.storeSession(session('account-b'));
  finish(response({profile:profile({name:'Edited',demographic:'pediatric'})}));assert.equal((await pending).success,false);assert.equal(auth.getCurrentUser().id,'account-b');assert.equal(localStorage.getItem('allert_demographic'),null);
});
test('a late 401 using an old access token does not sign out a renewed session',async()=>{
  let finish;globalThis.fetch=()=>new Promise(resolve=>finish=resolve);const pending=auth.getProfile();await Promise.resolve();localStorage.setItem('allert_auth_token',jwt('account-a',Date.now()/1000+7200));
  finish(response({error:'Unauthorized'},401));assert.equal((await pending).success,false);assert.equal(auth.getCurrentUser().id,'account-a');
});
test('profile saves survive token renewal without restoring stale Auth metadata',async()=>{
  await auth.getProfile();localStorage.setItem('allert_auth_token',jwt('account-a',1));
  globalThis.fetch=async()=>response({...session(),refresh_token:'rotated-token'});await auth.getValidAuthToken();assert.equal(localStorage.getItem('allert_user_name'),'Saved name');
});
test('a rejected old refresh cannot sign out an account selected while it was pending',async()=>{
  auth.storeSession(session('account-a',1));let finish;globalThis.fetch=()=>new Promise(resolve=>finish=resolve);const pending=auth.getValidAuthToken();auth.storeSession(session('account-b'));
  finish(response({error:'Revoked'},400));await assert.rejects(pending);assert.equal(auth.getCurrentUser().id,'account-b');
});
test('cancellation reaches fetch and prevents a late successful response from updating storage',async()=>{
  let finish,signal;globalThis.fetch=(_url,options)=>{signal=options.signal;return new Promise(resolve=>finish=resolve);};const controller=new AbortController();
  const pending=auth.getProfile({signal:controller.signal});await Promise.resolve();controller.abort();assert.equal(signal.aborted,true);
  finish(response({profile:profile()}));assert.equal((await pending).success,false);assert.equal(localStorage.getItem('allert_user_name'),'Old auth name');
});
test('a profile GET started before saving cannot rewind the saved category',async()=>{
  let finish;globalThis.fetch=(_url,options)=>options.method==='GET'?new Promise(resolve=>finish=resolve):Promise.resolve(response({profile:profile({demographic:'pediatric'})}));
  const pending=auth.getProfile();await Promise.resolve();assert.equal((await auth.saveProfile('pediatric','Saved name')).success,true);
  finish(response({profile:profile({demographic:'adult'})}));assert.equal((await pending).success,false);assert.equal(localStorage.getItem('allert_demographic'),'pediatric');
});
test('a profile GET started during a save also cannot rewind the successful save',async()=>{
  let finishGet,finishPost;globalThis.fetch=(_url,options)=>new Promise(resolve=>{if(options.method==='GET')finishGet=resolve;else finishPost=resolve;});
  const saving=auth.saveProfile('pediatric','Saved name');await Promise.resolve();const loading=auth.getProfile();await Promise.resolve();
  finishPost(response({profile:profile({demographic:'pediatric'})}));assert.equal((await saving).success,true);finishGet(response({profile:profile()}));assert.equal((await loading).success,false);assert.equal(localStorage.getItem('allert_demographic'),'pediatric');
});
test('plain-text deployment errors are readable without exposing the response body',async()=>{
  globalThis.fetch=async()=>new Response('<html>gateway</html>',{status:404});const result=await auth.getProfile();assert.equal(result.success,false);assert.match(result.error,/HTTP 404/);assert.ok(!result.error.includes('<html>'));
});
