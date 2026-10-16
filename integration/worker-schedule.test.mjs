import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
before(async()=>{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA vault;CREATE SCHEMA net;CREATE SCHEMA cron;
    CREATE TABLE vault.secrets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text UNIQUE,secret text);
    CREATE VIEW vault.decrypted_secrets AS SELECT id,name,secret AS decrypted_secret FROM vault.secrets;
    CREATE FUNCTION vault.create_secret(new_secret text,new_name text,new_description text)RETURNS uuid LANGUAGE plpgsql AS $$DECLARE result uuid;BEGIN INSERT INTO vault.secrets(name,secret)VALUES(new_name,new_secret)RETURNING id INTO result;RETURN result;END;$$;
    CREATE FUNCTION vault.update_secret(secret_id uuid,new_secret text)RETURNS void LANGUAGE SQL AS $$UPDATE vault.secrets SET secret=new_secret WHERE id=secret_id;$$;
    CREATE TABLE net.calls(id bigint GENERATED ALWAYS AS IDENTITY,url text,headers jsonb,body jsonb,timeout_ms integer);
    CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer)RETURNS bigint LANGUAGE SQL AS $$INSERT INTO net.calls(url,headers,body,timeout_ms)VALUES(url,headers,body,timeout_milliseconds)RETURNING id;$$;
    CREATE TABLE cron.jobs(name text PRIMARY KEY,schedule text,command text);
    CREATE FUNCTION cron.schedule(job_name text,job_schedule text,job_command text)RETURNS bigint LANGUAGE SQL AS $$INSERT INTO cron.jobs VALUES(job_name,job_schedule,job_command)ON CONFLICT(name)DO UPDATE SET schedule=excluded.schedule,command=excluded.command RETURNING 1::bigint;$$;`);
});
after(async()=>db.close());
test('website SQL setup preserves the existing worker token and keeps it out of the scheduled command',async()=>{
  const tokenSql=await readFile('docs/sql/create-alert-worker-token.sql','utf8');await db.exec(tokenSql);const token=(await db.query("SELECT secret FROM vault.secrets WHERE name='allert_alert_worker_token'")).rows[0].secret;assert.equal(token.length,64);await db.exec(tokenSql);assert.equal((await db.query("SELECT secret FROM vault.secrets WHERE name='allert_alert_worker_token'")).rows[0].secret,token);
  const gatewaySql=await readFile('docs/sql/configure-alert-gateway-key.sql','utf8');await assert.rejects(db.exec(gatewaySql),/Replace the gateway-key placeholder/);await db.exec(gatewaySql.replace('REPLACE_WITH_PUBLIC_PUBLISHABLE_OR_ANON_KEY','public-test-key-for-local-schedule-validation'));
  await db.exec(await readFile('docs/sql/schedule-anomaly-worker.sql','utf8'));const job=(await db.query('SELECT * FROM cron.jobs')).rows[0];assert.equal(job.schedule,'15 seconds');assert.equal(job.command,'SELECT public.request_allert_alert_tick();');assert.equal(job.command.includes(token),false);
  const call=(await db.query('SELECT * FROM net.calls')).rows[0];assert.equal(call.url,'https://fugziwuyiecvdopdnkmn.supabase.co/functions/v1/make-server-a473accf/alerts/process');assert.equal(call.headers['X-Allert-Worker-Token'],token);assert.equal(call.headers.apikey,'public-test-key-for-local-schedule-validation');assert.equal(call.timeout_ms,45000);assert.deepEqual(call.body,{});
});
test('ordinary users and the service role cannot use the private scheduler wrapper as a public RPC',async()=>{
  for(const role of ['anon','authenticated','service_role']){await db.exec('SET ROLE '+role);try{await assert.rejects(db.query('SELECT public.request_allert_alert_tick()'));}finally{await db.exec('RESET ROLE');}}
});
