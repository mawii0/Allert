import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { validPushSubscription, validQuietHours } from '../supabase/functions/server/push-policy.mjs';
const db = new PGlite();
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const publicKey='B'+'a'.repeat(86);
const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/browser-a',keys:{p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64,1)]).toString('base64url'),auth:Buffer.alloc(16,1).toString('base64url')}};
let binding;
const rpc=async(name,args)=> (await db.query(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
const connect=(user,endpoint=subscription.endpoint)=>rpc('connect_allert_push',[user,{...subscription,endpoint},publicKey]);
const quiet=(value,revision)=>rpc('set_allert_quiet_hours',[a,value.enabled,value.start,value.end,revision]);
const reserve=(user=a,id=binding,request=crypto.randomUUID())=>rpc('reserve_allert_test_push',[user,id,request,publicKey]);
before(async()=>{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES('${a}'),('${b}');
    CREATE TABLE public.kv_store_a473accf(key text PRIMARY KEY,value jsonb NOT NULL);`);
  await db.exec(await readFile('supabase/migrations/20261016010000_browser_push.sql','utf8'));
});
after(()=>db.close());
test('endpoint allowlist rejects SSRF, credentials, query strings and malformed keys',()=>{
  assert.equal(validPushSubscription(subscription),true);
  for(const endpoint of ['http://fcm.googleapis.com/fcm/send/a','https://127.0.0.1/a','https://fcm.googleapis.com.evil.test/fcm/send/a','https://user@fcm.googleapis.com/fcm/send/a','https://fcm.googleapis.com/fcm/send/a?next=http://localhost','https://fcm.googleapis.com/other/a','https://fcm.googleapis.com:8443/wp/a'])assert.equal(validPushSubscription({...subscription,endpoint}),false,endpoint);
  assert.equal(validPushSubscription({...subscription,keys:{...subscription.keys,auth:'bad'}}),false);
});
test('quiet hour validation rejects equal times, out of range values, and stale-shape revisions',()=>{
  assert.equal(validQuietHours({enabled:true,start:'22:00',end:'07:00',revision:0}),true);
  for(const data of [{enabled:true,start:'24:00',end:'07:00',revision:0},{enabled:true,start:'22:00',end:'22:00',revision:0},{enabled:'true',start:'22:00',end:'07:00',revision:0}])assert.equal(validQuietHours(data),false);
});
test('browser connections bind to one account and preserve identity on retry',async()=>{
  const result=await connect(a);assert.equal(result.ok,true);binding=result.bindingId;
  assert.equal((await connect(a)).bindingId,binding);
  assert.equal((await connect(b)).status,409);
});
test('ordinary roles cannot see endpoints or call privileged push functions',async()=>{
  for(const role of ['anon','authenticated']){
    await db.exec(`SET ROLE ${role}`);
    try{await assert.rejects(db.query('SELECT * FROM allert_push_subscriptions'),e=>e.code==='42501');await assert.rejects(connect(a),e=>e.code==='42501');await assert.rejects(reserve(),e=>e.code==='42501');await assert.rejects(quiet({enabled:true,start:'22:00',end:'07:00'},0),e=>e.code==='42501');}
    finally{await db.exec('RESET ROLE');}
  }
});
test('tests require the verified owner and an enabled account preference',async()=>{
  assert.equal((await reserve(b)).status,404);assert.equal((await reserve()).status,403);
  await db.query('INSERT INTO kv_store_a473accf VALUES($1,$2)',[`notification-preferences:v1:${a}`,{enabled:true,revision:1}]);
});
test('quiet hour saves use revision checks and fixed Manila timezone',async()=>{
  const result=await quiet({enabled:true,start:'22:00',end:'07:00'},0);assert.equal(result.quietHours.timezone,'Asia/Manila');assert.equal(result.quietHours.revision,1);
  assert.equal((await quiet({enabled:false,start:'22:00',end:'07:00'},0)).status,409);
});
test('server suppresses tests inside daytime and overnight quiet ranges, including start but excluding end',async()=>{
  // Freeze PostgreSQL now() for this transaction through BEGIN: now() is the transaction timestamp.
  await db.exec('BEGIN');
  try {
    const time=(await db.query("SELECT to_char(now() AT TIME ZONE 'Asia/Manila','HH24:MI') value")).rows[0].value;
    const minute=Number(time.slice(0,2))*60+Number(time.slice(3));
    const hm=n=>`${String(Math.floor((n+1440)%1440/60)).padStart(2,'0')}:${String((n+1440)%60).padStart(2,'0')}`;
    for(const [start,end] of [[time,hm(minute+1)],['00:00','23:59'],['23:59','23:58']]){
      await db.query('UPDATE allert_push_settings SET quiet_enabled=true,quiet_start=$1,quiet_end=$2 WHERE user_id=$3',[start,end,a]);
      if(start==='00:00'&&time==='23:59'||start==='23:59'&&time==='23:58')continue;
      assert.equal((await reserve()).outcome,'quiet_hours');
    }
    await db.query('UPDATE allert_push_settings SET quiet_enabled=true,quiet_start=$1,quiet_end=$2 WHERE user_id=$3',[hm(minute-1),time,a]);
    assert.equal((await reserve()).outcome,'reserved');
  }finally{await db.exec('ROLLBACK');}
});
test('test reservations enforce replay protection and a per-account 60 second throttle',async()=>{
  await quiet({enabled:false,start:'22:00',end:'07:00'},1);
  const request=crypto.randomUUID();assert.equal((await reserve(a,binding,request)).outcome,'reserved');
  assert.equal((await reserve(a,binding,request)).outcome,'already_attempted');assert.equal((await reserve()).status,429);
  const second=await connect(a,'https://fcm.googleapis.com/wp/browser-b');assert.equal((await reserve(a,second.bindingId)).status,429);
});
test('disabled preferences and rotated VAPID keys stop test sends',async()=>{
  assert.equal((await rpc('reserve_allert_test_push',[a,binding,crypto.randomUUID(),'different'])).status,404);
  await db.query('UPDATE kv_store_a473accf SET value=$1 WHERE key=$2',[{enabled:false},`notification-preferences:v1:${a}`]);assert.equal((await reserve()).status,403);
});
test('service role can use the security definer functions without write access to tables',async()=>{
  await db.exec('SET ROLE service_role');try{assert.equal((await connect(b,'https://fcm.googleapis.com/wp/other-owner')).ok,true);}finally{await db.exec('RESET ROLE');}
});
test('browser limit bounds each account and deleting a subscription frees a slot',async()=>{
  for(let i=0;i<3;i++)assert.equal((await connect(a,`https://fcm.googleapis.com/wp/extra-${i}`)).ok,true);
  assert.equal((await connect(a,'https://fcm.googleapis.com/wp/too-many')).status,409);
  await db.query('DELETE FROM allert_push_subscriptions WHERE id=$1',[binding]);
  assert.equal((await connect(a,'https://fcm.googleapis.com/wp/slot-freed')).ok,true);
});
