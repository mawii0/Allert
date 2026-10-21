// Frozen supplied YAML policy. Historical policy modules/records retain their own identity.
import POLICY from './indicator-policy.json' with {type:'json'};
import {INDICATOR_HASH} from './indicator-policy-hash.mjs';
export {POLICY,INDICATOR_HASH};
export const OBSERVED_HASH='76486e7733f32d8e4d1ac61a03b35ef3108280f0140533d3a43312a863199b77';
export const MODEL_ID='median-residual-seed7-epoch15-20261013-v1';
export const CHECKPOINT='4253e73515d8d2a3d4a4463065f8bfb2192c9454e161da560fd928a4051672c4';
export const ADVISORIES=POLICY.advisories;
export function validIndicator(value){
 return !!value && value.rule_id===POLICY.id && value.rule_sha256===INDICATOR_HASH && value.not_a_symptom_probability===true &&
 ['adult','pediatric'].every(p=>{const v=value[p],cuts=POLICY[p].map(v=>v/100);
 if(!v || !Number.isFinite(v.indicator_0_1) || v.indicator_0_1<0 || v.indicator_0_1>1 || !Number.isFinite(v.score_0_100))return false;
 const tier=v.indicator_0_1>=cuts[2]?'very_high':v.indicator_0_1>=cuts[1]?'high':v.indicator_0_1>=cuts[0]?'moderate':'low';
 return v.tier===tier && Math.abs(v.score_0_100-v.indicator_0_1*100)<1e-6;});
}
export function validStoredForecast(run,node,now=Date.now(),maxOriginAgeMs=1200000){
 const v=run?.result,origin=Date.parse(run?.origin),cutoff=Date.parse(run?.receipt_cutoff),generated=Date.parse(v?.generated_at);
 if(!run || run.device_id!==node || run.stream_id!=='live' || run.mode!=='live' || run.status!=='ready' || run.model_id!==MODEL_ID || run.checkpoint_sha256!==CHECKPOINT ||
 !/^[a-f0-9]{64}$/.test(run.input_hash || '') || !Number.isFinite(origin) || origin%900000!==0 || origin>now || now-origin>maxOriginAgeMs ||
 !Number.isFinite(cutoff) || cutoff>generated || generated>now+60000 ||
 v?.model_id!==MODEL_ID || v.checkpoint_sha256!==CHECKPOINT || v.node_id!==node || v.mode!=='live' || v.status!=='ok' ||
 Date.parse(v.forecast_origin)!==origin || Date.parse(v.input_last_block_end)!==origin || v.is_future_allergy_probability!==false || v.trained_or_recalibrated!==false ||
 !Array.isArray(v.forecasts) || v.forecasts.length!==6)return false;
 const keys=new Set();for(const f of v.forecasts){
 if(!['pm2_5','pm10'].includes(f.pollutant)||![6,12,24].includes(f.horizon_hours)||!Number.isFinite(f.value)||f.value<0||f.units!=='ug/m3'||
 Date.parse(f.target_block_end)!==origin+f.horizon_hours*3600000 || Date.parse(f.target_block_start)!==Date.parse(f.target_block_end)-300000)return false;
 keys.add(f.pollutant+':'+f.horizon_hours);}
 return keys.size===6;
}

export function classifyScore(score,population='adult'){
 if(!['adult','pediatric'].includes(population) || !Number.isFinite(score) || score<0 || score>100)return null;
 const cuts=POLICY[population];return score>=cuts[2]?'very_high':score>=cuts[1]?'high':score>=cuts[0]?'moderate':'low';
}
// Shared calculation used for parity checks/previews. Persisted worker output is canonical.
export function currentIndicator(pm25,pm10,temperature,humidity){
 if(![pm25,pm10,temperature,humidity].every(v=>typeof v==='number' && Number.isFinite(v)) || pm25<0 || pm10<0 || temperature< -10 || temperature>60 || humidity<0 || humidity>100)return null;
 const c=POLICY.coefficients.pm2_5*pm25+POLICY.coefficients.pm10*pm10+POLICY.coefficients.temperature*(temperature-25)+POLICY.coefficients.humidity*(humidity-60);
 if(!Number.isFinite(c))return null;
 const result={rule_id:POLICY.id,rule_sha256:INDICATOR_HASH,not_a_symptom_probability:true};
 for(const population of ['adult','pediatric']){const p=POLICY.reference[population+'_p0'],z=Math.log(p/(1-p))+c;
 const value=z>=0?1/(1+Math.exp(-z)):Math.exp(z)/(1+Math.exp(z));
 result[population]={score_0_100:100*value,indicator_0_1:value,tier:classifyFraction(value,population)};}
 return result;
}
function classifyFraction(value,population){const cuts=POLICY[population].map(v=>v/100);return value>=cuts[2]?'very_high':value>=cuts[1]?'high':value>=cuts[0]?'moderate':'low';}
export function validPmInterpretations(value,run){
 if(!value || value.enabled!==true || value.policy_hash!==INDICATOR_HASH || value.policy_id!==POLICY.forecast_pm.id || value.basis!=='forecast_pm_only' || value.score_unit!=='points' || !Array.isArray(value.interpretations) || value.interpretations.length!==3)return false;
 const horizons=new Set();for(const row of value.interpretations){
 if(![6,12,24].includes(row.horizon_hours) || row.node_id!==run.device_id || row.model_id!==MODEL_ID || Date.parse(row.forecast_origin)!==Date.parse(run.origin) || row.status!=='neural_forecast' ||
 Date.parse(row.target_block_end)!==Date.parse(run.origin)+row.horizon_hours*3600000 || Date.parse(row.target_block_start)!==Date.parse(row.target_block_end)-300000)return false;
 const pair=run.result.forecasts.filter(v=>v.horizon_hours===row.horizon_hours),pm25=pair.find(v=>v.pollutant==='pm2_5')?.value,pm10=pair.find(v=>v.pollutant==='pm10')?.value;
 const expected=currentIndicator(pm25,pm10,25,60);if(!expected)return false;
 for(const population of ['adult','pediatric']){const v=row.populations?.[population];if(!v || v.tier!==expected[population].tier || Math.abs(v.score_0_100-expected[population].score_0_100)>1e-8 || Math.abs(v.indicator_0_1*100-v.score_0_100)>1e-8)return false;}
 horizons.add(row.horizon_hours);}
 return horizons.size===3;
}
