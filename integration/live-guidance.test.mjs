import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {build} from 'esbuild';
import {ADVISORIES,MODEL_ID} from '../supabase/functions/server/seed7-policy.mjs';
await build({entryPoints:['src/app/components/EnvironmentalGuidance.tsx'],outfile:'integration/test-output/live-guidance.mjs',bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime','lucide-react']});
await build({entryPoints:['src/app/utils/model-display-name.ts'],outfile:'integration/test-output/model-display-name.mjs',bundle:true,format:'esm',platform:'node'});
const {EnvironmentalGuidance}=await import('./test-output/live-guidance.mjs');
const {modelDisplayName}=await import('./test-output/model-display-name.mjs');
const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):(n?.children||[]).map(text).join('');
async function shown(props,check){let tree;try{await act(async()=>tree=Renderer.create(React.createElement(EnvironmentalGuidance,props)));check(tree);}finally{if(tree)await act(async()=>tree.unmount());}}
test('adult and pediatric guidance uses each population tier and frozen policy actions',async()=>{
 for(const [adult,pediatric] of [['low','moderate'],['high','very_high']]){
 await shown({risk:{adult:{score_0_100:22,tier:adult},pediatric:{score_0_100:30,tier:pediatric}},stale:false},tree=>{
 for(const [label,tier] of [['Adult',adult],['Pediatric',pediatric]])assert.ok(text(tree.root.findByProps({'aria-label':`${label} environmental guidance`})).includes(ADVISORIES[tier]));
 assert.doesNotMatch(text(tree.toJSON()),/This is not a personal symptom probability/);
 });}
});
test('missing and stale readings do not produce reassuring actions',async()=>{
 await shown({risk:{adult:{score_0_100:0,tier:'low'}},stale:false},tree=>{assert.match(text(tree.root.findByProps({'aria-label':'Adult environmental guidance'})),/0\.0/);assert.match(text(tree.root.findByProps({'aria-label':'Pediatric environmental guidance'})),/unavailable/);});
 await shown({risk:{adult:{score_0_100:0,tier:'low'}},stale:true},tree=>{assert.match(text(tree.toJSON()),/Current conditions are unknown/);assert.ok(!text(tree.toJSON()).includes(ADVISORIES.low));});
});
test('the branded model name changes presentation without altering runtime identity or hiding unknown models',()=>{
 assert.equal(modelDisplayName(MODEL_ID),'ALLERT-Model-Node1-4M-Iloilo-v1');assert.equal(MODEL_ID,'median-residual-seed7-epoch15-20261013-v1');assert.equal(modelDisplayName('other-model'),'other-model');assert.equal(modelDisplayName(null),'No neural output available');
});
