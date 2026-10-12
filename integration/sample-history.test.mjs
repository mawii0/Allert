import {test} from "node:test";
import assert from "node:assert/strict";
import {historyRows,formatMeasurement,formatSampleTime,qualityPresentation} from "../src/app/utils/sample-history.mjs";
const end=Date.parse("2026-10-13T00:00:00Z");
const row=(minutes,id=1)=>({id,device_id:"sensor-a",timestamp:new Date(end-minutes*60000).toISOString(),pm2_5:20,pm10:30,temperature:27,humidity:70,data_quality_status:"VALID"});
test("history is newest-first without changing source graph order",()=>{const rows=[row(10,1),row(5,2),row(0,3)];const before=JSON.stringify(rows);assert.deepEqual(historyRows(rows,end,"sensor-a").map(r=>r.id),[3,2,1]);assert.equal(JSON.stringify(rows),before);});
test("24-hour completed blocks exclude the exact start boundary and future rows",()=>assert.deepEqual(historyRows([row(1440,1),row(1435,2),row(-5,3),row(0,4)],end,"sensor-a").map(r=>r.id),[4,2]));
test("invalid and timezone-free timestamps are excluded",()=>assert.deepEqual(historyRows([null,{timestamp:"invalid"},{timestamp:"2026-10-13T00:00:00"}],end,"sensor-a"),[]));
test("wrong sensor history is excluded",()=>assert.deepEqual(historyRows([{...row(0),device_id:"other"}],end,"sensor-a"),[]));
test("duplicate uploads retain latest id, once per timestamp",()=>assert.deepEqual(historyRows([row(0,1),row(0,3),row(0,2)],end,"sensor-a").map(r=>r.id),[3]));
test("equivalent timezone representations count once",()=>assert.equal(historyRows([row(0,1),{...row(0,2),timestamp:"2026-10-13T08:00:00+08:00"}],end,"sensor-a").length,1));
for(const value of [null,undefined,NaN,Infinity,-Infinity,"20.0",{},true])test("invalid measurement renders unavailable: "+String(value),()=>assert.equal(formatMeasurement(value),"—"));
test("zero is a real measured value",()=>assert.equal(formatMeasurement(0),"0.0"));
test("finite measured value preserves one decimal",()=>assert.equal(formatMeasurement(12.34),"12.3"));
test("Manila date rolls over correctly",()=>assert.match(formatSampleTime("2026-10-12T17:05:01Z"),/Oct 13.*1:05 AM/));
test("invalid sample time is explicit",()=>assert.equal(formatSampleTime("invalid"),"Unavailable"));
for(const quality of ["VALID","OK","ORIGINAL","ok"])test("known valid quality: "+quality,()=>assert.equal(qualityPresentation(quality).tone,"valid"));
for(const quality of ["INVALID","FAILED","MISSING","ERROR"])test("known invalid quality cannot appear valid: "+quality,()=>assert.equal(qualityPresentation(quality).tone,"invalid"));
for(const quality of [null,"",undefined,"PARTIAL","<script>alert(1)</script>"])test("unknown quality not labeled valid: "+quality,()=>assert.equal(qualityPresentation(quality).tone,"unknown"));
test("invalid window and empty history do not throw",()=>{assert.deepEqual(historyRows(null,end,"sensor-a"),[]);assert.deepEqual(historyRows([row(0)],NaN,"sensor-a"),[]);});
test("288-block day has exactly 288 distinct rows",()=>assert.equal(historyRows(Array.from({length:289},(_,i)=>row(i*5,i)),end,"sensor-a").length,288));
test("200 shuffled/duplicated datasets preserve unique ordered in-window rows",()=>{
 for(let seed=1;seed<=200;seed++){
  const data=Array.from({length:400},(_,i)=>row(((i*seed)%320-10)*5,i));const before=JSON.stringify(data);const result=historyRows(data,end,"sensor-a");
  assert.equal(new Set(result.map(r=>Date.parse(r.timestamp))).size,result.length);
  assert.ok(result.every((r,i)=>Date.parse(r.timestamp)>end-86400000 && Date.parse(r.timestamp)<=end && (!i || Date.parse(result[i-1].timestamp)>Date.parse(r.timestamp))));
  assert.equal(JSON.stringify(data),before);
 }
});
