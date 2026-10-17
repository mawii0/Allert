import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {POLICY,INDICATOR_HASH,MODEL_ID,CHECKPOINT,currentIndicator,classifyScore,validIndicator,validStoredForecast,validPmInterpretations} from '../supabase/functions/server/seed7-policy.mjs';
import {storedMonitor} from '../supabase/functions/server/seed7-read-routes.mjs';
const origin=Math.floor(Date.now()/900000)*900000;
function stored(){const f=[6,12,24].flatMap(h=>['pm2_5','pm10'].map(p=>({pollutant:p,horizon_hours:h,value:25,units:'ug/m3',target_block_end:new Date(origin+h*3600000).toISOString(),target_block_start:new Date(origin+h*3600000-300000).toISOString()})));
 return{device_id:'ALLERT-NODE-001',stream_id:'live',mode:'live',status:'ready',model_id:MODEL_ID,checkpoint_sha256:CHECKPOINT,origin:new Date(origin).toISOString(),receipt_cutoff:new Date(origin+1000).toISOString(),input_hash:'a'.repeat(64),result:{status:'ok',model_id:MODEL_ID,checkpoint_sha256:CHECKPOINT,node_id:'ALLERT-NODE-001',mode:'live',forecast_origin:new Date(origin).toISOString(),input_last_block_end:new Date(origin).toISOString(),generated_at:new Date(origin+2000).toISOString(),is_future_allergy_probability:false,trained_or_recalibrated:false,forecasts:f}};
}
test('canonical joint policy has a reproducible real hash and exact chosen adult/pediatric cuts',async()=>{
 const bytes=await readFile('supabase/functions/server/indicator-policy.json');assert.equal(createHash('sha256').update(bytes).digest('hex'),INDICATOR_HASH);
 assert.deepEqual(POLICY.adult,[22.5,30,37.5]);assert.deepEqual(POLICY.pediatric,[20.5,28,35.5]);assert.equal(POLICY.forecast_pm.enabled_by_default,false);
});
for(const p of ['adult','pediatric'])test(`${p} category equality, neighbours, endpoints and display rounding use raw scores`,()=>{
 const tiers=['low','moderate','high','very_high'];POLICY[p].forEach((v,i)=>{assert.equal(classifyScore(v-1e-10,p),tiers[i]);assert.equal(classifyScore(v,p),tiers[i+1]);assert.equal(classifyScore(v+1e-10,p),tiers[i+1]);});assert.equal(classifyScore(0,p),'low');assert.equal(classifyScore(100,p),'very_high');assert.equal(classifyScore(NaN,p),null);
});
test('JavaScript matches the local Python policy adapter at full precision',async()=>{
 const vectors=JSON.parse(await readFile('docs/model_seed7/joint-policy-test-vectors.json','utf8'));assert.equal(vectors.policy_hash,INDICATOR_HASH);
 for(const c of vectors.cases){const i=c.input,actual=currentIndicator(i.pm2_5,i.pm10,i.temperature_c,i.humidity_percent);assert.ok(validIndicator(actual));
 for(const p of ['adult','pediatric']){assert.ok(Math.abs(actual[p].score_0_100-c.expected[p].score_0_100)<vectors.tolerance_points);assert.equal(actual[p].tier,c.expected[p].tier);}}
 const zero=currentIndicator(0,0,25,60);assert.equal(zero.adult.tier,'low');assert.equal(zero.pediatric.tier,'moderate');
 assert.equal(Number((22.49).toFixed(1)),22.5);assert.equal(classifyScore(22.49,'adult'),'low');
});
test('invalid/missing values never become a Low indicator',()=>{for(const v of [null,undefined,true,'2',NaN,Infinity,-1])assert.equal(currentIndicator(v,5,25,60),null);assert.equal(classifyScore(10,'unknown'),null);});
test('selected stored runs require one node, mode, model, checkpoint, origin, six unique targets and actual provenance',()=>{
 const now=origin+300000;assert.ok(validStoredForecast(stored(),'ALLERT-NODE-001',now));
 for(const edit of [r=>r.model_id='old',r=>r.stream_id='replay',r=>r.result.forecasts[0]=r.result.forecasts[1],r=>r.checkpoint_sha256='f'.repeat(64),r=>r.input_hash='',r=>r.result.node_id='ALLERT-NODE-002',r=>r.receipt_cutoff=new Date(origin+3000).toISOString(),r=>r.result.forecasts[0].units='mg/m3']){const r=stored();edit(r);assert.equal(validStoredForecast(r,'ALLERT-NODE-001',now),false);}
 assert.equal(validStoredForecast(stored(),'ALLERT-NODE-001',origin+1200001),false);
});
test('current indicator remains independent when a forecast is absent and no median values are manufactured',()=>{
 const o={id:1,device_id:'ALLERT-NODE-001',block_end:new Date(origin).toISOString(),received_at:new Date(origin+1000).toISOString(),pm2_5:11,pm10:13,temperature:35.6,humidity:92.8,quality:{pm2_5:'ok',pm10:'ok',temperature:'ok',humidity:'ok'}};
 const risk=currentIndicator(11,13,35.6,92.8),v=storedMonitor({device_id:o.device_id},o,{observation_id:1,indicator:risk},null,origin+300000);
 assert.deepEqual(v.forecasts,[]);assert.equal(v.current.risk.adult.tier,'low');assert.equal(v.current.risk.pediatric.tier,'moderate');assert.equal(v.model_status,'warming_up');
 assert.equal(storedMonitor({device_id:o.device_id},o,{observation_id:2,indicator:risk},null,origin+300000).current.risk,null);
 assert.equal(storedMonitor({device_id:o.device_id},o,{observation_id:1,indicator:risk},null,origin+600001).availability,'stale');
});
test('PM-only interpretation is optional and must match the same verified pair and target',()=>{
 const r=stored(),score=currentIndicator(25,25,25,60),pm={enabled:true,policy_id:POLICY.forecast_pm.id,policy_hash:INDICATOR_HASH,basis:'forecast_pm_only',score_unit:'points',interpretations:[6,12,24].map(h=>({horizon_hours:h,node_id:r.device_id,model_id:MODEL_ID,forecast_origin:r.origin,status:'neural_forecast',target_block_start:new Date(origin+h*3600000-300000).toISOString(),target_block_end:new Date(origin+h*3600000).toISOString(),populations:{adult:score.adult,pediatric:score.pediatric}}))};
 assert.ok(validPmInterpretations(pm,r));pm.interpretations[0].node_id='ALLERT-NODE-002';assert.equal(validPmInterpretations(pm,r),false);pm.interpretations[0].node_id=r.device_id;pm.interpretations[0].populations.adult.tier='low';assert.equal(validPmInterpretations(pm,r),false);
});
