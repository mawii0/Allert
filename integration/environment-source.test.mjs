import { test } from "node:test";
import assert from "node:assert/strict";
import { selectEnvironmentSource } from "../src/app/utils/environment-source.mjs";
const snapshot={node_id:"node-1",mode:"historical_fixture",current:{node_id:"node-1",block_end:"2026-09-13T00:00:00Z",pm2_5:19.2,pm10:21.2,temperature_c:27.4,humidity_percent:99.8,quality:"ORIGINAL"}};
const empty={device:null,latest:null,history:[]};
test("hardware-free assigned account displays verified replay measurements",()=>{const v=selectEnvironmentSource(empty,snapshot,"historical_replay");assert.equal(v.source,"historical_replay");assert.equal(v.latest.pm2_5,19.2);assert.equal(v.latest.temperature,27.4);assert.equal(v.latest.humidity,99.8);assert.equal(v.device.is_active,false);assert.deepEqual(v.history,[]);});
test("active device awaiting first reading can display labeled replay",()=>{assert.equal(selectEnvironmentSource({...empty,device:{device_id:"node-1"}},snapshot,"historical_replay").source,"historical_replay");});
test("actual readings take precedence over model replay",()=>{const latest={device_id:"real-node",pm2_5:3};const history=[latest];const v=selectEnvironmentSource({device:{device_id:"real-node"},latest,history},snapshot,"historical_replay");assert.equal(v.source,"sensor");assert.equal(v.latest,latest);assert.equal(v.history,history);});
test("old real readings are preserved for the screen to label stale",()=>{const latest={timestamp:"2020-01-01",pm2_5:1};assert.equal(selectEnvironmentSource({device:{},latest,history:[]},snapshot,"historical_replay").latest,latest);});
test("missing verified snapshot stays unavailable without fabricated zeros",()=>{assert.deepEqual(selectEnvironmentSource(empty,null,"unavailable"),{source:"unavailable",device:null,latest:null,history:[]});});
for(const status of ["loading","Node access has not been assigned","Unauthorized","ready"]){test("no replay after authorization or availability failure: "+status,()=>{assert.equal(selectEnvironmentSource(empty,snapshot,status).latest,null);});}
test("live model snapshot cannot be mislabeled historical",()=>{assert.equal(selectEnvironmentSource(empty,{...snapshot,mode:"live"},"historical_replay").source,"unavailable");});
for(const patch of [{pm2_5:NaN},{humidity_percent:undefined},{block_end:"bad"},{node_id:"other-node"}]){test("malformed replay block fails closed: "+Object.keys(patch)[0],()=>{assert.equal(selectEnvironmentSource(empty,{...snapshot,current:{...snapshot.current,...patch}},"historical_replay").latest,null);});}
test("recorded time and quality remain exact, with no invented samples",()=>{const v=selectEnvironmentSource(empty,snapshot,"historical_replay");assert.equal(v.latest.timestamp,snapshot.current.block_end);assert.equal(v.latest.data_quality_status,"ORIGINAL");assert.equal(v.latest.sample_count,null);});

test("replay maps recorded history into chart measurements",()=>{const v=selectEnvironmentSource(empty,{...snapshot,history:[snapshot.current]},"historical_replay");assert.equal(v.history.length,1);assert.equal(v.history[0].temperature,27.4);assert.equal(v.history[0].timestamp,snapshot.current.block_end);});
