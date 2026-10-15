import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { filteredDiary, diaryDailyTrend, diaryCsv, manilaDay, manilaInput } from '../src/app/utils/diary-history.mjs';
import { visibleHealthLogs } from '../supabase/functions/server/health-log-tools.mjs';
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const id='12345678-1234-4234-8234-123456789012';
const record={id,userId:owner,date:'2026-10-01T02:00:00Z',observedAt:'2026-10-01T01:00:00Z',vasScore:5,tnssScore:6,riskLevel:24,notes:'Initial report',revision:1};
const db = new PGlite();
before(async()=>{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE kv_store_a473accf(key text PRIMARY KEY,value jsonb NOT NULL);');
  await db.exec(await readFile('supabase/migrations/20261014050000_diary_management.sql','utf8'));
});
after(()=>db.close());
async function seed(entry=record){await db.query('INSERT INTO kv_store_a473accf VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',[`health-log:v2:${owner}:${id}`,JSON.stringify(entry)]);}
const manage=(who,revision,action,payload=null)=>db.query('SELECT manage_allert_health_log($1,$2,$3,$4,$5) value',[who,id,revision,action,payload===null?null:JSON.stringify(payload)]).then(r=>r.rows[0].value);

test('diary corrections preserve identity and creation time, and advance revision',async()=>{
  await seed();const result=await manage(owner,1,'update',{notes:'Corrected',id:'spoofed',userId:other,date:'2099-01-01',revision:99,deletedAt:'fake'});
  assert.equal(result.ok,true);assert.equal(result.entry.id,id);assert.equal(result.entry.userId,owner);assert.equal(result.entry.date,record.date);assert.equal(result.entry.revision,2);assert.equal(result.entry.notes,'Corrected');assert.ok(Date.parse(result.entry.updatedAt));assert.equal(result.entry.deletedAt,undefined);
});
test('stale concurrent edit cannot overwrite the winning correction',async()=>{
  const result=await manage(owner,1,'update',{notes:'Lost edit'});assert.equal(result.status,409);
  const entry=(await db.query('SELECT value FROM kv_store_a473accf WHERE key=$1',[`health-log:v2:${owner}:${id}`])).rows[0].value;assert.equal(entry.notes,'Corrected');
});
test('a different account cannot edit or delete an owned entry',async()=>{
  for(const action of ['update','delete'])assert.equal((await manage(other,2,action,{})).status,404);
});
test('deletion persists a tombstone, is retryable and refuses later edits',async()=>{
  const result=await manage(owner,2,'delete');assert.equal(result.deleted,true);assert.ok(result.entry.deletedAt);
  assert.equal(result.entry.notes,undefined);assert.equal(result.entry.vasScore,undefined);
  assert.equal((await manage(owner,2,'delete')).ok,true);assert.equal((await manage(owner,3,'update',{notes:'Restore'})).status,410);
});
test('legacy entry corrections migrate only the owner copy and preserve original observation time',async()=>{
  await db.query('DELETE FROM kv_store_a473accf WHERE key=$1',[`health-log:v2:${owner}:${id}`]);
  await db.query('INSERT INTO kv_store_a473accf VALUES($1,$2)',[`health-logs:${owner}`,JSON.stringify([{...record,revision:undefined}])]);
  const result=await manage(owner,1,'update',{notes:'Legacy corrected'});assert.equal(result.ok,true);assert.equal(result.entry.observedAt,record.observedAt);assert.equal(result.entry.date,record.date);assert.equal(result.entry.revision,2);
});
test('ordinary roles cannot call the privileged diary function',async()=>{
  for(const role of ['anon','authenticated']){
    await db.exec(`SET ROLE ${role}`);
    try{await assert.rejects(manage(owner,2,'delete'),error=>error.code==='42501');}finally{await db.exec('RESET ROLE');}
  }
});
test('service role can call the function without direct table permissions',async()=>{
  await db.exec('SET ROLE service_role');try{assert.equal((await manage(owner,2,'delete')).ok,true);}finally{await db.exec('RESET ROLE');}
});
test('deletion removes sensitive scores and notes from the legacy copy too',async()=>{
  const legacy=(await db.query('SELECT value FROM kv_store_a473accf WHERE key=$1',[`health-logs:${owner}`])).rows[0].value;
  assert.deepEqual(legacy,[]);
  const marker=(await db.query('SELECT value FROM kv_store_a473accf WHERE key=$1',[`health-log:v2:${owner}:${id}`])).rows[0].value;
  assert.equal(marker.notes,undefined);assert.equal(marker.tnssScore,undefined);assert.equal(marker.observedAt,undefined);assert.ok(marker.deletedAt);
});
test('invalid operations do not create records',async()=>{
  for(const args of [[owner,0,'delete'],[null,1,'delete'],[owner,1,'unknown']])assert.equal((await manage(...args)).status,400);
});
test('deleted and corrected individual copies override legacy history',()=>{
  assert.deepEqual(visibleHealthLogs([{...record,deletedAt:'now'}],[record]),[]);
  assert.equal(visibleHealthLogs([{...record,notes:'Edited',revision:2}],[record])[0].notes,'Edited');
});
test('Manila day and datetime handling survives UTC date boundaries',()=>{
  assert.equal(manilaDay('2026-10-13T16:01:00Z'),'2026-10-14');assert.equal(manilaInput('2026-10-13T16:01:00Z'),'2026-10-14T00:01');
});
test('diary search and seven-day filters use local calendar days',()=>{
  const now=Date.parse('2026-10-14T04:00:00Z');const logs=[{...record,id:'a',observedAt:'2026-10-07T16:01:00Z',notes:'Cooking'},{...record,id:'b',observedAt:'2026-10-07T15:59:00Z',notes:'Old'},{...record,id:'c',observedAt:'2026-10-14T04:02:00Z',notes:'Future'}];
  assert.deepEqual(filteredDiary(logs,'cook',7,now).map(x=>x.id),['a']);assert.deepEqual(filteredDiary(logs,'',7,now).map(x=>x.id),['a']);
});
test('daily symptom trends average same-day reports without inventing missing days',()=>{
  const result=diaryDailyTrend([{...record,vasScore:2,tnssScore:4},{...record,vasScore:6,tnssScore:8},{...record,observedAt:'2026-10-03T01:00:00Z'}]);
  assert.equal(result.length,2);assert.deepEqual(result[0],{day:'2026-10-01',vas:4,tnss:6,count:2});
});
test('CSV handles commas, multiline notes, quotation marks and formula injection',()=>{
  const csv=diaryCsv([{...record,notes:'  =HYPERLINK("bad")\nline,2'}]);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"\'  =HYPERLINK(""bad"")\nline,2"'));assert.ok(csv.includes('VAS (0-10)'));assert.ok(!csv.includes('riskLevel'));
});
