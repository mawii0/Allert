import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const manifest=JSON.parse(await readFile('public/manifest.webmanifest','utf8')),source=await readFile('public/allert-sw.js','utf8');
test('manifest launches only this origin with crisp vector installation icons',async()=>{
  assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');assert.equal(manifest.display,'standalone');
  const original=await readFile('src/imports/AllertLogoTransparent1.png');assert.deepEqual(await readFile('public/icons/allert.png'),original);
  for(const size of [192,512]){const icon=manifest.icons.find(item=>item.sizes===`${size}x${size}`);assert.ok(icon);const svg=await readFile('public'+icon.src,'utf8');assert.ok(svg.includes(`width="${size}"`));assert.match(svg,/<path /);assert.ok(!svg.includes('data:image/png'));}
  const html=await readFile('index.html','utf8');assert.ok(html.includes('rel="manifest"'));assert.ok(html.includes('rel="apple-touch-icon"'));
});
function worker(transport){const listeners={};const context=vm.createContext({URL,Response,Date,fetch:transport,self:{location:{origin:'https://allert.example'},addEventListener:(event,handler)=>{listeners[event]=handler;}}});vm.runInContext(source,context);return listeners.fetch;}
test('offline navigation returns a generic page without private data or cached responses',async()=>{
  const fetch=worker(async()=>{throw Error('offline');});let response;
  fetch({request:{mode:'navigate',url:'https://allert.example/app/clinical'},respondWith:value=>{response=value;}});
  const result=await response;assert.equal(result.status,503);assert.equal(result.headers.get('Cache-Control'),'no-store');const body=await result.text();assert.match(body,/You are offline/);assert.ok(!body.includes('allert_auth_token'));assert.ok(!body.includes('health-log:'));
});
test('API, image, external navigation and POST requests are never intercepted or cached',()=>{
  const fetch=worker(()=>{throw Error('Should not intercept');});for(const request of [{mode:'cors',url:'https://fugziwuyiecvdopdnkmn.supabase.co/functions/v1/server/health-logs'},{mode:'no-cors',url:'https://allert.example/icons/allert.png'},{mode:'navigate',url:'https://other.example/'}])fetch({request,respondWith:()=>assert.fail('Private or external fetch intercepted')});
});
test('successful navigation keeps the network response intact',async()=>{
  const expected=new Response('Current deployed app');const fetch=worker(async()=>expected);let response;
  fetch({request:{mode:'navigate',url:'https://allert.example/'},respondWith:value=>{response=value;}});assert.equal(await response,expected);
});
