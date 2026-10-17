import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';

async function settings(env){
 const result=await build({entryPoints:['utils/supabase/info.tsx'],write:false,bundle:true,format:'esm',platform:'browser',define:{'import.meta.env':JSON.stringify(env)}});
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
test('public staging overrides require a complete pair and reject privileged keys',async()=>{
 const defaults=await settings({});assert.equal(defaults.projectId,'fugziwuyiecvdopdnkmn');
 assert.equal((await settings({VITE_SUPABASE_PROJECT_ID:'staging-ref',VITE_SUPABASE_PUBLIC_KEY:'sb_publishable_fixture'})).projectId,'staging-ref');
 await assert.rejects(settings({VITE_SUPABASE_PROJECT_ID:'staging-ref'}));
 await assert.rejects(settings({VITE_SUPABASE_PROJECT_ID:'staging-ref',VITE_SUPABASE_PUBLIC_KEY:'sb_secret_fixture'}));
 const jwt='e30.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.fixture';
 await assert.rejects(settings({VITE_SUPABASE_PROJECT_ID:'staging-ref',VITE_SUPABASE_PUBLIC_KEY:jwt}));
});
test('dedicated Vercel root contains the exact policy and never schedules Hobby cron',async()=>{
 assert.equal(await readFile('analytics/indicator-policy.json','utf8'),await readFile('supabase/functions/server/indicator-policy.json','utf8'));
 const config=JSON.parse(await readFile('analytics/vercel.json','utf8'));
 assert.equal(config.framework,'fastapi');assert.equal(config.functions['app.py'].maxDuration,120);assert.equal(config.crons,undefined);
 const sql=await readFile('docs/sql/STAGING-schedule-seed7-vercel.sql','utf8');
 assert.equal(sql.split('\n').filter(line=>!line.trimStart().startsWith('--')).join('\n').includes('cron.schedule('),false);
 const app=await readFile('analytics/app.py','utf8');assert.equal(app.includes('StaticFiles'),false);
});
