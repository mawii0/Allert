import { test } from "node:test";
import assert from "node:assert/strict";
import { validProfile, validHealthLog, sameHealthLog } from "../supabase/functions/server/account-validation.mjs";
const log = () => ({vasScore: 5, tnssScore: 6, riskLevel: 24, notes: "Synthetic test", requestId: "12345678-1234-1234-1234-123456789012", observedAt: new Date().toISOString(), symptomSeverities: {sneezing: 0, "itchy-nose": 1, "runny-nose": 2, congestion: 3}});
test("accepts adult and pediatric profiles and cleared name", () => { for (const demographic of ["adult", "pediatric"]) assert.ok(validProfile({demographic, name:""})); });
test("rejects invalid profile fields", () => { for (const body of [{demographic:"unknown"}, {name:3}, {name:"x".repeat(101)}, null, []]) assert.equal(validProfile(body),false); });
test("preserves valid scores and four individual symptoms", () => assert.ok(validHealthLog(log())));
for (const [label, update] of [
  ["negative VAS", s=>s.vasScore=-1], ["VAS above scale", s=>s.vasScore=11], ["string VAS",s=>s.vasScore="5"],
  ["boolean VAS",s=>s.vasScore=true], ["nonfinite score",s=>s.vasScore=NaN], ["TNSS above scale",s=>s.tnssScore=13],
  ["fractional TNSS",s=>s.tnssScore=6.5], ["mismatched total",s=>s.tnssScore=5], ["missing symptom",s=>delete s.symptomSeverities.sneezing],
  ["unknown symptom",s=>s.symptomSeverities.extra=0], ["symptom above scale",s=>s.symptomSeverities.sneezing=4],
  ["long notes",s=>s.notes="x".repeat(2001)], ["object notes",s=>s.notes={}], ["invalid retry ID",s=>s.requestId="bad:id"],
  ["future observation",s=>s.observedAt=new Date(Date.now()+120000).toISOString()], ["unparseable observation",s=>s.observedAt="yesterday"],
]) test(`rejects ${label}`,()=>{const s=log();update(s);assert.equal(validHealthLog(s),false);});
test("legacy aggregate entries remain supported",()=>assert.ok(validHealthLog({vasScore:0,tnssScore:0,riskLevel:0})));
test("retry comparison accepts empty notes and reordered symptom keys",()=>{ const s=log();s.notes="";const saved={...s,notes:null,symptomSeverities:{congestion:3,"runny-nose":2,"itchy-nose":1,sneezing:0}};assert.ok(sameHealthLog(s,saved));assert.equal(sameHealthLog(s,{...saved,vasScore:9}),false); });
