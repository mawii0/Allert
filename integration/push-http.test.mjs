import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { installPushRoutes } from '../supabase/functions/server/push-routes.mjs';
const owner='11111111-1111-4111-8111-111111111111', binding='22222222-2222-4222-8222-222222222222';
let calls,sends,rpcData,rpcError,status,dbUser,deleteUser;
const env={get:name=>({ALLERT_VAPID_PUBLIC_KEY:'B'+'a'.repeat(86),ALLERT_VAPID_PRIVATE_KEY:'a'.repeat(43),ALLERT_VAPID_SUBJECT:'https://allert-ten.vercel.app/'}[name])};
const app=new Hono();
const client={rpc:async(name,args)=>{calls.push({name,args});return {data:rpcData,error:rpcError};},from:()=>{
  const query={select(){return query;},delete(){calls.push('delete');return query;},eq(key,value){if(key==='user_id'){dbUser=value;deleteUser=value;}return query;},maybeSingle:async()=>({data:null,error:null}),then:resolve=>Promise.resolve({error:null}).then(resolve)};return query;
}};
installPushRoutes(app,async c=>c.req.header('Authorization')==='Bearer valid'?{client,user:{id:owner}}:{response:c.json({error:'Please sign in.'},401)},env,async(...args)=>{sends.push(args);if(status instanceof Error)throw status;return status;});
const request=(path,method='POST',body={},token='valid')=>app.request('https://example.invalid/make-server-a473accf/push'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})});
beforeEach(()=>{calls=[];sends=[];dbUser=deleteUser=null;rpcError=null;rpcData={ok:true,outcome:'reserved',subscription:{endpoint:'https://fcm.googleapis.com/wp/test',keys:{}}};status=201;});
test('all push endpoints reject invalid sessions before database or transport',async()=>{
  for(const [path,method] of [['','GET'],['/quiet-hours','PUT'],['/status','POST'],['/subscriptions','POST'],['/subscriptions','DELETE'],['/test','POST']])assert.equal((await request(path,method,{},'invalid')).status,401);
  assert.equal(calls.length,0);assert.equal(sends.length,0);assert.equal(dbUser,null);
});
test('push config reveals only public key and quiet settings for the verified owner',async()=>{
  const result=await(await request('','GET')).json();assert.equal(result.configured,true);assert.equal(result.automaticAlertsReady,false);assert.equal(result.quietHours.timezone,'Asia/Manila');assert.equal(dbUser,owner);assert.equal(JSON.stringify(result).includes('privateKey'),false);
});
test('SSRF targets and caller-supplied identity cannot reach registration RPC',async()=>{
  assert.equal((await request('/subscriptions','POST',{subscription:{endpoint:'https://localhost/private'},userId:'attacker'})).status,400);assert.deepEqual(calls,[]);
});
test('tests send only after an atomic reservation using authenticated identity',async()=>{
  const response=await request('/test','POST',{bindingId:binding,requestId:owner,userId:'attacker',payload:'spoofed'});assert.equal(response.status,200);assert.deepEqual(await response.json(),{outcome:'accepted'});assert.equal(calls[0].args.p_user_id,owner);assert.equal(sends.length,1);
});
test('quiet suppression and replay acknowledgments never call the push service',async()=>{
  for(const outcome of ['quiet_hours','already_attempted']){rpcData={ok:true,outcome};assert.equal((await request('/test','POST',{bindingId:binding,requestId:owner})).status,200);}
  assert.equal(sends.length,0);
});
test('off preferences, missing connections, throttling and database errors remain failures',async()=>{
  for(const code of [403,404,429]){rpcData={ok:false,status:code,error:'Rejected'};assert.equal((await request('/test','POST',{bindingId:binding,requestId:owner})).status,code);}
  rpcError=new Error('Missing migration');assert.equal((await request('/test','POST',{bindingId:binding,requestId:owner})).status,503);assert.equal(sends.length,0);
});
test('expired subscriptions are deleted only for the verified owner',async()=>{
  for(const code of [404,410]){status=code;assert.equal((await request('/test','POST',{bindingId:binding,requestId:owner})).status,410);assert.equal(deleteUser,owner);}
});
test('push rejection and timeout do not report delivery success or retry automatically',async()=>{
  for(const value of [401,403,429,500,new Error('timeout')]){status=value;assert.equal((await request('/test','POST',{bindingId:binding,requestId:owner})).status,502);}
  assert.equal(sends.length,5);
});
test('quiet edits preserve conflicts and ignore spoofed account/timezone values',async()=>{
  rpcData={ok:false,status:409,error:'Refresh settings'};
  assert.equal((await request('/quiet-hours','PUT',{enabled:true,start:'22:00',end:'07:00',revision:2,userId:'attacker',timezone:'UTC'})).status,409);assert.equal(calls[0].args.p_user_id,owner);assert.equal('timezone' in calls[0].args,false);
});
