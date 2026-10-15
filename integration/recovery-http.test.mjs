import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
await build({entryPoints:['src/app/utils/password-recovery.ts'],outfile:'integration/test-output/recovery-http.mjs',bundle:true,format:'esm',platform:'node',plugins:[{name:'info',setup(b){b.onResolve({filter:/^\/utils\/supabase\/info$/},()=>({path:resolve('utils/supabase/info.tsx')}));}}]});
const api=await import('./test-output/recovery-http.mjs');
const id='11111111-1111-4111-8111-111111111111';
const token='eyJhbGciOiJub25lIn0.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature';
const verified=()=>({access_token:token,refresh_token:'never-store-this',user:{id,email:'person@example.com'}});
const response=(data,status=200)=>new Response(data===null?null:JSON.stringify(data),{status});
let requests;
beforeEach(()=>{
  requests=[];
  globalThis.localStorage=globalThis.sessionStorage={getItem(){throw Error('Recovery must not read stored sessions');},setItem(){throw Error('Recovery must not persist tokens');},removeItem(){throw Error('Recovery must not mutate stored sessions');}};
  globalThis.fetch=async(url,options)=>{requests.push({url,options});return response(url.endsWith('/verify')?verified():url.endsWith('/user')?{id}:null,url.includes('/logout?')?204:200);};
});
test('recovery requests use the recover endpoint, normalize email and never create an account',async()=>{
  await api.requestRecoveryCode(' Person@Example.COM ');assert.match(requests[0].url,/\/auth\/v1\/recover$/);assert.equal(requests[0].options.method,'POST');assert.deepEqual(JSON.parse(requests[0].options.body),{email:'person@example.com'});assert.equal(requests[0].options.headers.Authorization,undefined);assert.equal(requests[0].options.redirect,'error');
});
test('invalid emails and recovery codes are rejected before network requests',async()=>{
  for(const email of ['', 'invalid','a@b','a\n@b.com'])await assert.rejects(api.requestRecoveryCode(email),/valid email/);
  for(const code of ['', '12345','abc123','12345678901'])await assert.rejects(api.verifyRecoveryCode('person@example.com',code),/numeric recovery/);
  assert.equal(requests.length,0);
});
test('an unknown or unconfirmed account receives the same generic client result',async()=>{
  for(const code of ['user_not_found','email_not_confirmed']){globalThis.fetch=async()=>response({error_code:code},400);assert.equal(await api.requestRecoveryCode('person@example.com'),undefined);}
});
test('email delivery failures and rate limits are not reported as successful requests',async()=>{
  globalThis.fetch=async()=>response({error_code:'over_email_send_rate_limit'},429);await assert.rejects(api.requestRecoveryCode('person@example.com'),/Too many/);
  globalThis.fetch=async()=>response({error_code:'email_address_not_authorized'},400);await assert.rejects(api.requestRecoveryCode('person@example.com'),/could not be completed/);
});
test('verification uses recovery scope and keeps only a temporary session in memory',async()=>{
  const session=await api.verifyRecoveryCode('Person@Example.com','123 456');assert.deepEqual(JSON.parse(requests[0].options.body),{email:'person@example.com',token:'123456',type:'recovery'});assert.equal(session.accessToken,token);assert.equal(session.userId,id);assert.equal('refresh_token' in session,false);assert.ok(session.expiresAt<=Date.now()+15*60000);assert.equal(requests.length,1);
});
test('wrong, expired, replayed or mismatched recovery responses cannot enable a password update',async()=>{
  globalThis.fetch=async()=>response({error_code:'otp_expired'},403);await assert.rejects(api.verifyRecoveryCode('person@example.com','123456'),/invalid or expired/);
  for(const data of [{...verified(),user:{id,email:'other@example.com'}},{...verified(),access_token:'bad'},{...verified(),user:null}]){
    globalThis.fetch=async()=>response(data);await assert.rejects(api.verifyRecoveryCode('person@example.com','123456'),/Unable to verify/);
  }
});
test('password mismatch and expiry never send an update; password whitespace is preserved',async()=>{
  const session={accessToken:token,userId:id,email:'person@example.com',expiresAt:Date.now()+10000};
  await assert.rejects(api.resetRecoveredPassword(session,'password1','different'),/do not match/);await assert.rejects(api.resetRecoveredPassword({...session,expiresAt:0},'password1','password1'),/expired/);assert.equal(requests.length,0);
  const result=await api.resetRecoveredPassword(session,' password1 ',' password1 ');assert.equal(result.sessionsRevoked,true);assert.equal(requests[0].options.headers.Authorization,'Bearer '+token);assert.deepEqual(JSON.parse(requests[0].options.body),{password:' password1 '});assert.match(requests[1].url,/logout\?scope=global$/);
});
test('a rejected password does not revoke sessions or report success',async()=>{
  globalThis.fetch=async(url,options)=>{requests.push({url,options});return response({error_code:'weak_password'},422);};
  await assert.rejects(api.resetRecoveredPassword({accessToken:token,userId:id,expiresAt:Date.now()+10000},'password1','password1'),/password requirements/);assert.equal(requests.length,1);
});
test('successful update remains success if session cleanup fails',async()=>{
  globalThis.fetch=async url=>response(url.includes('logout')?{error_code:'unexpected_failure'}:{id},url.includes('logout')?503:200);
  assert.deepEqual(await api.resetRecoveredPassword({accessToken:token,userId:id,expiresAt:Date.now()+10000},'password1','password1'),{sessionsRevoked:false});
});
test('unreadable responses never expose server content as success',async()=>{
  globalThis.fetch=async()=>new Response('<html>gateway error</html>',{status:503});await assert.rejects(api.requestRecoveryCode('person@example.com'),/unreadable response/);
});
test('caller cancellation reaches fetch and returns a readable error',async()=>{
  globalThis.fetch=(_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));
  const controller=new AbortController();const pending=api.requestRecoveryCode('person@example.com',controller.signal);controller.abort();await assert.rejects(pending,/cancelled/);
});
test('discarding a recovery session revokes only that temporary session',async()=>{
  await api.closeRecoverySession({accessToken:token});assert.match(requests[0].url,/logout\?scope=local$/);assert.equal(requests[0].options.headers.Authorization,'Bearer '+token);
});
