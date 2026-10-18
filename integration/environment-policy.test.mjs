import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { POLICY, classifyScore, classifyFraction, validPolicyIndicator } from '../supabase/functions/server/environment-policy.mjs';
import { POLICY_HASH } from '../supabase/functions/server/environment-policy-hash.mjs';
import { indicator } from '../supabase/functions/server/risk-monitor.mjs';
const vectors = JSON.parse(readFileSync(new URL('../docs/model_v2/test-vectors.json', import.meta.url)));
test('canonical artifact bytes and runtime metadata have identical hashes', () => {
  const bytes = readFileSync(new URL('../docs/model_v2/environment-policy.json', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), POLICY_HASH);
  assert.equal(bytes.toString(), JSON.stringify(POLICY));
  assert.equal(indicator(0,0,25,60).rule_sha256, POLICY_HASH);
  assert.equal(indicator(0,0,25,60).rule_id, POLICY.id);
});
for (const population of ['adult', 'pediatric']) {
  for (const [score, tier] of vectors[population]) test(`${population} exact score and fraction ${score}`, () => {
    assert.equal(classifyScore(score, population), tier);
    assert.equal(classifyFraction(score / 100, population), tier);
  });
}
for (const [i, vector] of vectors.readings.entries()) test(`independent formula reference ${i}`, () => {
  const result = indicator(...vector.input);
  assert.ok(Math.abs(result.adult.score_0_100 - vector.adult_score) < vectors.score_tolerance);
  assert.equal(result.adult.tier, vector.adult_tier);
  if (vector.pediatric_score !== undefined) {
    assert.ok(Math.abs(result.pediatric.score_0_100 - vector.pediatric_score) < vectors.score_tolerance);
    assert.equal(result.pediatric.tier, vector.pediatric_tier);
  }
});
test('invalid score units fail closed', () => {
  for (const value of [null, undefined, NaN, Infinity, -Infinity, -1, 101, '22.5']) assert.equal(classifyScore(value), null);
  for (const value of [null, undefined, NaN, Infinity, -1, 1.01, '0.225']) assert.equal(classifyFraction(value), null);
  assert.equal(classifyScore(20,'unknown'),null);
});
test('frontend refuses old policy identities, hashes, units and incorrect tiers', () => {
  const valid=indicator(0,0,25,60);
  assert.equal(validPolicyIndicator(valid,POLICY_HASH),true);
  for(const patch of [{rule_id:'environmental-indicator-v1'},{rule_sha256:'bad'},{adult:{...valid.adult,tier:'moderate'}},{adult:{...valid.adult,score_0_100:.2}}])
    assert.equal(validPolicyIndicator({...valid,...patch},POLICY_HASH),false);
});
test('invalid and missing weather do not become low', () => {
  for (const input of [[-1,0,25,60],[0,0,null,60],[0,0,25,undefined],[0,0,25,101],[Infinity,0,25,60]]) assert.equal(indicator(...input),null);
});
test('continuous scores and pediatric tiers remain identical to prior formula over 2000 cases', () => {
  for (let i=0;i<2000;i++) {
    const inputs=[i/7,i/3,-10+(i%701)/10,i%101];
    const result=indicator(...inputs);
    const contribution=inputs[0]*.0104+inputs[1]*.0026+(inputs[2]-25)*.012+(inputs[3]-60)*-.004;
    for(const population of ['adult','pediatric']) {
      const p0=population==='adult'?.2:.22;
      const score=100/(1+Math.exp(-(Math.log(p0/(1-p0))+contribution)));
      assert.ok(Math.abs(result[population].score_0_100-score)<1e-12);
    }
    const p=result.pediatric.indicator_0_1;
    assert.equal(result.pediatric.tier,p>=.38?'very_high':p>=.23?'high':p>=.13?'moderate':'low');
  }
});
test('monotonicity and numerical stability near saturation', () => {
  const baseline=indicator(10,20,25,60).adult.score_0_100;
  for (const inputs of [[11,20,25,60],[10,21,25,60],[10,20,26,60],[10,20,25,59]]) assert.ok(indicator(...inputs).adult.score_0_100>baseline);
  assert.equal(indicator(1e9,1e9,25,60).adult.score_0_100,100);
  assert.equal(indicator(0,0,-1e9,100).adult.score_0_100,0);
});
