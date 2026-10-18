import {test} from 'node:test';
import assert from 'node:assert/strict';
import {averageRanks,spearman,forecastEvidence,correlateSymptoms,correlationCsv} from '../supabase/functions/server/clinical-correlation.mjs';
import {indicator} from '../supabase/functions/server/risk-monitor.mjs';
import {POLICY_HASH} from '../supabase/functions/server/environment-policy-hash.mjs';
const now=Date.parse('2026-10-16T03:00:00Z'),epoch='2026-09-01T00:00:00Z';
function sample(count=7){
  const entries=[],forecasts=[];
  for(let at=0;at<count;at++){
    const target=now-(at+1)*86400000,origin=target-6*3600000;
    entries.push({id:'entry-'+at,observedAt:new Date(target).toISOString(),vasScore:at,tnssScore:at});
    forecasts.push({id:at,device_id:'NODE-A',owner_epoch:epoch,population:'adult',horizon_hours:6,origin:new Date(origin).toISOString(),target:new Date(target).toISOString(),captured_at:new Date(origin+1000).toISOString(),policy_hash:POLICY_HASH,score:10+at*5,tier:['low','low','moderate','moderate','high','high','very_high'][at%7]});
  }
  return{entries,forecasts};
}
const options={deviceId:'NODE-A',ownerEpoch:epoch,population:'adult',horizon:6,days:30,now};
test('average ranks preserve input order and assign genuine average ties',()=>{const values=[30,10,20,20];assert.deepEqual(averageRanks(values),[4,1,2.5,2.5]);assert.deepEqual(values,[30,10,20,20]);});
test('Spearman matches independently calculated scipy tie vector',()=>{assert.ok(Math.abs(spearman([1,2,2,3,4,4,5],[7,1,1,4,3,2,6]).rho-0.11009637651263608)<1e-12);});
test('increasing and decreasing ranks have the expected direction',()=>{assert.equal(spearman([0,1,2,3,4,5,6],[0,1,2,3,4,5,6]).rho,1);assert.equal(spearman([0,1,2,3,4,5,6],[6,5,4,3,2,1,0]).rho,-1);});
test('small samples, constant tiers and malformed pairs never invent a correlation',()=>{assert.equal(spearman([1],[2]).reason,'insufficient_pairs');assert.equal(spearman(Array(7).fill(1),[0,1,2,3,4,5,6]).reason,'constant_values');assert.equal(spearman([1,NaN],[2,3]).reason,'invalid_pairs');assert.equal(spearman([1],[2,3]).reason,'invalid_pairs');});
test('correlation uses tier rank and actual observations rather than symptom-derived summaries',()=>{const fixture=sample();const result=correlateSymptoms(fixture.entries,fixture.forecasts,options);assert.equal(result.pairs.length,7);assert.equal(result.vas.n,7);assert.ok(result.vas.rho>0.9);assert.equal(result.vas.rho,result.tnss.rho);});
test('an absent forecast, legacy creation time, median estimate or retrospective capture cannot supply a pair',()=>{const {entries,forecasts}=sample(1);assert.equal(correlateSymptoms(entries,[],options).pairs.length,0);assert.equal(correlateSymptoms([{...entries[0],observedAt:undefined,date:entries[0].observedAt}],forecasts,options).pairs.length,0);assert.equal(correlateSymptoms(entries,[{...forecasts[0],captured_at:forecasts[0].target}],options).pairs.length,0);});
test('different device, owner epoch, policy, category, horizon and invalid scores are excluded',()=>{const {entries,forecasts}=sample(1);for(const patch of [{device_id:'NODE-B'},{owner_epoch:'2026-08-01T00:00:00Z'},{policy_hash:'0'.repeat(64)},{population:'pediatric'},{horizon_hours:12},{score:Infinity},{tier:'unknown'}])assert.equal(correlateSymptoms(entries,[{...forecasts[0],...patch}],options).pairs.length,0);});
test('reports outside the target tolerance, future observations and deleted entries are excluded',()=>{const {entries,forecasts}=sample(1);for(const patch of [{observedAt:new Date(Date.parse(forecasts[0].target)+900001).toISOString()},{observedAt:new Date(now+1).toISOString()},{deletedAt:new Date(now).toISOString()},{vasScore:11}])assert.equal(correlateSymptoms([{...entries[0],...patch}],forecasts,options).pairs.length,0);});
test('one closest report per Manila day prevents repeated logs from inflating n',()=>{const {entries,forecasts}=sample(1);const result=correlateSymptoms([...entries,{...entries[0],id:'another',observedAt:new Date(Date.parse(entries[0].observedAt)+1000).toISOString()}],forecasts,options);assert.equal(result.pairs.length,1);assert.equal(result.pairs[0].entry_id,entries[0].id);assert.equal(result.excluded.extra_same_day_or_reused_forecast,1);});
test('Manila calendar boundary is used even when UTC day differs',()=>{const {entries,forecasts}=sample(1);entries[0].observedAt='2026-10-15T16:01:00Z';forecasts[0].target=entries[0].observedAt;forecasts[0].origin='2026-10-15T10:01:00Z';forecasts[0].captured_at='2026-10-15T10:02:00Z';assert.equal(correlateSymptoms(entries,forecasts,options).pairs[0].day,'2026-10-16');});
test('CSV contains actual matched evidence and escapes formulas and quotes',()=>{const output=correlationCsv({pairs:[{day:'=SUM(1)',entry_id:'a,"b',vas:0}]});assert.ok(output.includes("'=SUM(1)"));assert.ok(output.includes('a,""b'));assert.ok(output.includes('"0"'));});
test('forecast archive only accepts a complete verified live set, never median fallback',()=>{const origin=new Date(now-30000).toISOString(),risk=indicator(20,25,28,60);const monitor={availability:'ready',model_status:'ready',model_id:'model-1',forecasts:[6,12,24].map(hours=>({horizon_hours:hours,origin,target_block_end:new Date(Date.parse(origin)+hours*3600000).toISOString(),method:'model_adjusted',risk}))};assert.equal(forecastEvidence(monitor,now).length,6);for(const patch of [{availability:'stale'},{model_status:'warming_up'},{forecasts:monitor.forecasts.map(value=>({...value,method:'median_only'}))},{forecasts:monitor.forecasts.slice(0,2)}])assert.deepEqual(forecastEvidence({...monitor,...patch},now),[]);});
