import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { defaultNotificationPreferences, validNotificationPreferences, notificationPreferenceChange } from '../supabase/functions/server/notification-preferences.mjs';
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const db=new PGlite();
before(async()=>{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE kv_store_a473accf(key text PRIMARY KEY,value jsonb NOT NULL);');
  await db.exec(await readFile('supabase/migrations/20261015160000_notification_preferences.sql','utf8'));
});
after(()=>db.close());
const save=(user,enabled,revision)=>db.query('SELECT public.set_allert_notification_preference($1,$2,$3) value',[user,enabled,revision]).then(result=>result.rows[0].value);
test('new accounts default to off without claiming push delivery',()=>{
  assert.deepEqual(defaultNotificationPreferences(),{enabled:false,revision:0,updatedAt:null});
  assert.equal(validNotificationPreferences(defaultNotificationPreferences()),true);
});
test('changes reject string booleans, missing revisions and revision overflow',()=>{
  for(const value of [null,{}, {enabled:'true',revision:0},{enabled:true,revision:-1},{enabled:true,revision:1.1},{enabled:false,revision:1000000000}])assert.equal(notificationPreferenceChange(value),null);
  assert.deepEqual(notificationPreferenceChange({enabled:true,revision:0,userId:'spoofed'}),{enabled:true,revision:0});
});
test('permission intent persists with a real server time and revision',async()=>{
  const result=await save(owner,true,0);assert.equal(result.ok,true);assert.equal(result.preferences.enabled,true);assert.equal(result.preferences.revision,1);assert.ok(Date.parse(result.preferences.updatedAt));
});
test('another first-write request cannot overwrite the saved preference',async()=>{
  assert.equal((await save(owner,false,0)).status,409);
  assert.equal((await db.query('SELECT value FROM kv_store_a473accf')).rows[0].value.enabled,true);
});
test('turning notifications off persists and older corrections cannot replace it',async()=>{
  const result=await save(owner,false,1);assert.equal(result.preferences.enabled,false);assert.equal(result.preferences.revision,2);
  assert.equal((await save(owner,true,1)).status,409);
});
test('separate accounts have independent preference records',async()=>{
  assert.equal((await save(other,true,0)).preferences.enabled,true);
  const rows=(await db.query('SELECT key,value FROM kv_store_a473accf ORDER BY key')).rows;
  assert.equal(rows.length,2);assert.equal(rows.find(row=>row.key.endsWith(owner)).value.enabled,false);assert.equal(rows.find(row=>row.key.endsWith(other)).value.enabled,true);
});
test('missing records with nonzero revisions are conflicts rather than new inserts',async()=>{
  assert.equal((await save('33333333-3333-4333-8333-333333333333',true,2)).status,409);
  assert.equal((await db.query('SELECT count(*) FROM kv_store_a473accf')).rows[0].count,2);
});
test('ordinary roles cannot mutate notification preferences through the RPC',async()=>{
  for(const role of ['anon','authenticated']){
    await db.exec(`SET ROLE ${role}`);
    try{await assert.rejects(save(owner,true,2),error=>error.code==='42501');}finally{await db.exec('RESET ROLE');}
  }
});
test('service role can update preferences without direct table privileges',async()=>{
  await db.exec('SET ROLE service_role');try{assert.equal((await save(owner,true,2)).preferences.revision,3);}finally{await db.exec('RESET ROLE');}
});
test('invalid RPC arguments do not mutate saved values',async()=>{
  for(const args of [[null,true,0],[owner,null,3],[owner,true,-1],[owner,true,1000000000]])assert.equal((await save(...args)).status,400);
});
