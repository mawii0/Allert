import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ANOMALY_POLICY,detectObservedAnomalies,validObservedBlock} from '../supabase/functions/server/anomaly-policy.mjs';
import {normalizeNodeLocation} from '../supabase/functions/server/location-policy.mjs';
const now=Date.parse('2026-10-16T00:00:00Z');
const device={device_id:'NODE-A',owner_since:new Date(now-86400000).toISOString()};
const row=(index,value=10)=>({device_id:'NODE-A',timestamp:new Date(now-(12-index)*300000).toISOString(),created_at:new Date(now-(12-index)*300000+1000).toISOString(),pm2_5:value,pm10:value,temperature:28,humidity:65,sample_count:30,expected_samples:30,data_quality_status:'VALID'});
const baseline=()=>Array.from({length:12},(_,i)=>row(i));
const detect=(rows,previous={},node=device)=>detectObservedAnomalies(rows,node,previous,now);
test('a stable series is monitored without inventing a spike or dividing by zero',()=>{
  const result=detect([...baseline(),row(12)]);assert.equal(result.status,'ready');assert.equal(result.events.length,0);assert.equal(result.state.cusum_pm2_5,0);assert.equal(result.processed,13);
});
test('fewer than twelve genuine consecutive baseline blocks cannot generate an event',()=>{
  const result=detect([row(10),row(11),row(12,100)]);assert.equal(result.status,'warming_up');assert.equal(result.events.length,0);assert.equal(result.baseline_count,3);
});
test('a genuine observed step records its exact reading and twelve preceding baseline blocks',()=>{
  const result=detect([...baseline(),row(12,17)]);assert.equal(result.events.length,1);const event=result.events[0];assert.equal(event.reading.pm2_5,17);assert.equal(event.baseline.length,12);assert.equal(event.baseline.at(-1).pm2_5,10);assert.equal(event.metrics.pm2_5.mean,10);assert.equal(event.metrics.pm2_5.z,7);assert.ok(event.metrics.pm2_5.methods.includes('z_score'));assert.equal(event.severity,'critical');assert.equal(event.policy_version,ANOMALY_POLICY.version);
});
test('PM10 changes can trigger independently of PM2.5',()=>{
  const current=row(12);current.pm10=19;const result=detect([...baseline(),current]);assert.equal(result.events.length,1);assert.equal(result.events[0].metrics.pm2_5.methods.length,0);assert.ok(result.events[0].metrics.pm10.methods.length>0);
});
test('a falling concentration does not become an upward particulate alert',()=>{
  const rows=Array.from({length:12},(_,i)=>row(i,30));assert.equal(detect([...rows,row(12,10)]).events.length,0);
});
test('small noise cannot trigger a statistically inflated spike against a flat baseline',()=>{
  assert.equal(detect([...baseline(),row(12,10.9)]).events.length,0);
});
test('persisted CUSUM carries over a process restart and only new observations are emitted',()=>{
  const first=detect([...baseline(),row(12,17)]);const next={...row(12,18),timestamp:new Date(now+300000).toISOString(),created_at:new Date(now+301000).toISOString()};
  const resumed=detectObservedAnomalies([...baseline(),row(12,17),next],device,first.state,now+300000);assert.equal(resumed.processed,1);assert.equal(resumed.events.length,1);assert.equal(resumed.events[0].observed_at,next.timestamp);assert.ok(resumed.state.cusum_pm2_5>first.state.cusum_pm2_5);
});
test('CUSUM can detect a sustained shift even when the single z-score is below its alarm threshold',()=>{
  const rows=Array.from({length:12},(_,i)=>row(i,i%2?20:0));const previous={last_timestamp:rows.at(-1).timestamp,cusum_pm2_5:4.99,cusum_pm10:4.99};
  const result=detect([...rows,row(12,16)],previous);assert.equal(result.events.length,1);assert.ok(result.events[0].metrics.pm2_5.methods.includes('cusum'));assert.ok(result.events[0].metrics.pm2_5.z<ANOMALY_POLICY.zWatch);
});
for(const patch of [{sample_count:29},{expected_samples:29},{data_quality_status:'GAP_FLAGGED'},{pm2_5:NaN},{humidity:101},{created_at:null}])test('incomplete or invalid current block cannot generate an event: '+Object.keys(patch)[0],()=>{
  assert.equal(detect([...baseline(),{...row(12,100),...patch}]).events.length,0);
});
test('a gap or a duplicate five-minute bucket breaks the baseline instead of being padded',()=>{
  assert.equal(detect([...baseline().slice(0,11),row(12,100)]).events.length,0);assert.equal(detect([...baseline(),row(11),row(12,100)]).events.length,0);
});
test('adjacent bucket labels cannot disguise an irregular real sampling interval',()=>{
  const rows=baseline();rows[11].timestamp=new Date(now-1000).toISOString();assert.equal(detect([...rows,row(12,100)]).events.length,0);
});
test('another device, a future observation and a future receipt are excluded',()=>{
  assert.equal(detect([...baseline(),{...row(12,100),device_id:'NODE-B'}]).events.length,0);
  assert.equal(validObservedBlock({...row(12),timestamp:new Date(now+61000).toISOString()},'NODE-A',now),false);
  assert.equal(validObservedBlock({...row(12),created_at:new Date(now+61000).toISOString()},'NODE-A',now),false);
});
test('an ownership boundary prevents a previous household baseline from being used',()=>{
  const result=detect([...baseline(),row(12,100)],{},{...device,owner_since:row(11).timestamp});assert.equal(result.events.length,0);assert.equal(result.status,'warming_up');
});
const point={deviceId:'NODE-A',ownerEpoch:device.owner_since,revision:0,label:'  Living room  ',enabled:true,latitude:10.720234,longitude:122.562123,accuracy:30,capturedAt:new Date(now).toISOString()};
test('location normalization trims a label, rounds capture and strips spoofed identity',()=>{
  const value=normalizeNodeLocation({...point,user_id:'spoofed'},now);assert.equal(value.location.label,'Living room');assert.equal(value.location.latitude,10.7202);assert.equal(value.location.longitude,122.5621);assert.equal('user_id' in value.location,false);
});
test('turning capture off drops all coordinates from the mutation',()=>{
  const value=normalizeNodeLocation({...point,enabled:false,latitude:'spoofed'},now);assert.deepEqual(value.location,{label:'Living room',enabled:false});
});
for(const patch of [{revision:-1},{revision:'0'},{label:''},{label:'x'.repeat(101)},{label:'a\nb'},{enabled:'true'},{latitude:91},{longitude:NaN},{accuracy:-1},{ownerEpoch:'invalid'},{capturedAt:new Date(now+61000).toISOString()}])test('invalid location fields are rejected: '+Object.keys(patch)[0],()=>assert.equal(normalizeNodeLocation({...point,...patch},now),null));
