import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
await build({entryPoints:['src/app/utils/node-linking.ts'],outfile:'integration/test-output/node-linking.mjs',bundle:true,format:'esm',platform:'browser',plugins:[{name:'fixture',setup(b){
  b.onResolve({filter:/^\/utils\/supabase\/info$/},()=>({path:resolve('utils/supabase/info.tsx')}));
  b.onResolve({filter:/^\.\/auth$/},()=>({path:'auth',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const getValidAuthToken=async()=>globalThis.testToken;export const getCurrentUser=()=>({id:globalThis.testAccount});export const logout=()=>{globalThis.signedOut=true;};',loader:'js'}));
}}]});
const {claimNode,unlinkNode}=await import('./test-output/node-linking.mjs');
globalThis.window=new EventTarget();
test('claim uses renewed token, excludes client ownership and broadcasts update',async()=>{
  globalThis.testToken='renewed';globalThis.testAccount='a';let changed=false;
  window.addEventListener('allert-node-changed',()=>{changed=true;},{once:true});
  globalThis.fetch=async(url,options)=>{
    assert.ok(url.endsWith('/nodes/claim'));assert.equal(options.headers.Authorization,'Bearer renewed');assert.ok(options.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(options.body),{device_id:'ALLERT-NODE-001',setup_code:'A'.repeat(32)});
    return new Response(JSON.stringify({ok:true,device_id:'ALLERT-NODE-001',model_access_assigned:true}));
  };
  assert.equal((await claimNode('ALLERT-NODE-001','A'.repeat(32))).model_access_assigned,true);assert.equal(changed,true);
});
test('claim reports ownership conflicts and route errors clearly',async()=>{
  globalThis.fetch=async()=>new Response(JSON.stringify({error:'Another owner'}),{status:409});
  await assert.rejects(claimNode('ALLERT-NODE-001','A'.repeat(32)),/Another owner/);
  globalThis.fetch=async()=>new Response('404 Not Found',{status:404});
  await assert.rejects(claimNode('ALLERT-NODE-001','A'.repeat(32)),/HTTP 404/);
});
test('late response after switching accounts cannot imply current-account ownership',async()=>{
  globalThis.fetch=async()=>{globalThis.testAccount='b';return new Response(JSON.stringify({ok:true}));};
  await assert.rejects(claimNode('ALLERT-NODE-001','A'.repeat(32)),/Account changed/);
});
test('unlink is bounded, authenticated and sends only the selected device',async()=>{
  globalThis.fetch=async(url,options)=>{assert.ok(url.endsWith('/nodes/unlink'));assert.deepEqual(JSON.parse(options.body),{device_id:'ALLERT-NODE-001'});return new Response(JSON.stringify({ok:true}));};
  await unlinkNode('ALLERT-NODE-001');
});
test('revoked sessions sign out; missing sessions never send node actions',async()=>{
  globalThis.signedOut=false;globalThis.fetch=async()=>new Response(JSON.stringify({error:'Session expired'}),{status:401});
  await assert.rejects(unlinkNode('ALLERT-NODE-001'),/Session expired/);assert.equal(globalThis.signedOut,true);
  globalThis.testToken=null;globalThis.fetch=()=>{throw Error('Unexpected fetch');};
  await assert.rejects(unlinkNode('ALLERT-NODE-001'),/Please sign in/);
});
