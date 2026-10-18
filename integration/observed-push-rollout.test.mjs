import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const caller=readFileSync('docs/sql/PRODUCTION-alert-caller.sql','utf8');
const activate=readFileSync('docs/sql/PRODUCTION-enable-observed-push.sql','utf8');
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE SCHEMA vault;CREATE SCHEMA cron;CREATE SCHEMA net;
 CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
 CREATE TABLE public.allert_v2_settings(id int,enabled boolean,forecast_enabled boolean);
 INSERT INTO public.allert_v2_settings VALUES(1,true,false);
 CREATE TABLE cron.job(jobid bigint,jobname text,schedule text,command text,active boolean);
 INSERT INTO cron.job VALUES(1,'allert-observed-anomalies','15 seconds','old command',false),(2,'allert-verified-forecasts','* * * * *','legacy',false),(3,'allert-seed7-production','* * * * *','model',true);
 CREATE FUNCTION cron.alter_job(job_id bigint,schedule text DEFAULT NULL,command text DEFAULT NULL,active boolean DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$ BEGIN UPDATE cron.job SET schedule=coalesce($2,cron.job.schedule),command=coalesce($3,cron.job.command),active=coalesce($4,cron.job.active) WHERE jobid=$1; END $$;
 CREATE TABLE public.calls(url text,headers jsonb,body jsonb,timeout_ms int);
 CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int) RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN INSERT INTO public.calls VALUES(url,headers,body,timeout_milliseconds);RETURN 42;END $$;`);
 await db.query('INSERT INTO vault.decrypted_secrets VALUES ($1,$2),($3,$4)',['allert_alert_worker_token','a'.repeat(64),'allert_alert_gateway_key','sb_publishable_'+'b'.repeat(31)]);
 return db;
}
test('installing the alert caller sends nothing, is repeatable and denies ordinary roles',async()=>{
 const db=await fixture();try{
  await db.exec(caller);await db.exec(caller);
  assert.equal((await db.query('SELECT count(*)::int n FROM calls')).rows[0].n,0);
  assert.equal((await db.query('SELECT active FROM cron.job WHERE jobid=1')).rows[0].active,false);
  for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("SELECT has_function_privilege($1,'public.request_allert_alert_tick()','EXECUTE') allowed",[role])).rows[0].allowed,false);
 }finally{await db.close();}
});
test('approved activation resumes only observed delivery and uses the fixed authenticated endpoint',async()=>{
 const db=await fixture();try{
  await db.exec(caller);await db.exec(activate);
  const jobs=(await db.query('SELECT * FROM cron.job ORDER BY jobid')).rows;
  assert.equal(jobs[0].active,true);assert.equal(jobs[0].schedule,'15 seconds');assert.equal(jobs[0].command,'SELECT public.request_allert_alert_tick();');assert.equal(jobs[1].active,false);assert.equal(jobs[2].active,true);
  const call=(await db.query('SELECT * FROM calls')).rows[0];
  assert.equal(call.url,'https://fugziwuyiecvdopdnkmn.supabase.co/functions/v1/make-server-a473accf/alerts/process');
  assert.deepEqual(call.body,{});assert.equal(call.headers['X-Allert-Worker-Token'],'a'.repeat(64));assert.equal(call.timeout_ms,45000);
  assert.equal((await db.query('SELECT forecast_enabled FROM allert_v2_settings')).rows[0].forecast_enabled,false);
 }finally{await db.close();}
});
test('malformed credentials or incompatible schedules cannot activate delivery or send a request',async()=>{
 const db=await fixture();try{
  await db.exec(caller);
  const cases=[
   ["UPDATE vault.decrypted_secrets SET decrypted_secret=decrypted_secret || chr(10) WHERE name='allert_alert_worker_token'","UPDATE vault.decrypted_secrets SET decrypted_secret=repeat('a',64) WHERE name='allert_alert_worker_token'"],
   ["UPDATE vault.decrypted_secrets SET decrypted_secret=decrypted_secret || chr(13) WHERE name='allert_alert_gateway_key'","UPDATE vault.decrypted_secrets SET decrypted_secret='sb_publishable_' || repeat('b',31) WHERE name='allert_alert_gateway_key'"],
   ['UPDATE allert_v2_settings SET forecast_enabled=true','UPDATE allert_v2_settings SET forecast_enabled=false'],
   ['UPDATE allert_v2_settings SET enabled=false','UPDATE allert_v2_settings SET enabled=true'],
   ['UPDATE cron.job SET active=true WHERE jobid=2','UPDATE cron.job SET active=false WHERE jobid=2'],
   ['UPDATE cron.job SET active=false WHERE jobid=3','UPDATE cron.job SET active=true WHERE jobid=3'],
   ["UPDATE cron.job SET jobname='missing' WHERE jobid=1","UPDATE cron.job SET jobname='allert-observed-anomalies' WHERE jobid=1"],
  ];
  for(const [setup,reset] of cases){
   await db.exec(setup);await assert.rejects(()=>db.exec(activate));await db.exec('ROLLBACK');
   assert.equal((await db.query('SELECT active FROM cron.job WHERE jobid=1')).rows[0].active,false);
   assert.equal((await db.query('SELECT count(*)::int n FROM calls')).rows[0].n,0);
   await db.exec(reset);
  }
 }finally{await db.close();}
});
