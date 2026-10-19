import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { build } from 'esbuild';
await build({entryPoints:['src/app/components/ClinicalScreen.tsx'],outfile:'integration/test-output/clinical-ui.mjs',bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime','lucide-react'],plugins:[{name:'fixtures',setup(b){
  b.onResolve({filter:/ClinicalCorrelation$/},()=>({path:'correlation',namespace:'fixture'}));
  b.onResolve({filter:/useDiary$/},()=>({path:'diary',namespace:'fixture'}));
  b.onResolve({filter:/ui\/slider$/},()=>({path:'slider',namespace:'fixture'}));
  b.onResolve({filter:/^motion\/react$/},()=>({path:'motion',namespace:'fixture'}));
  b.onResolve({filter:/^recharts$/},()=>({path:'chart',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='correlation'?'export const ClinicalCorrelation=()=>{throw Error("Correlation must not mount on the patient Clinical screen")};':args.path==='diary'?'export const useDiary=()=>globalThis.diaryState;':args.path==='motion'?`import React from 'react';const cache=new Map();export const AnimatePresence=({children})=>React.createElement(React.Fragment,null,children);export const motion=new Proxy({}, {get:(_,tag)=>{if(!cache.has(tag))cache.set(tag,React.forwardRef(({initial,animate,exit,transition,drag,dragConstraints,dragElastic,onDragEnd,...props},ref)=>React.createElement(tag,{...props,ref})));return cache.get(tag);}});`:args.path==='slider'?`import React from 'react';export const Slider=props=>React.createElement('input',{'aria-label':props['aria-label'],value:props.value[0],disabled:props.disabled,onChange:event=>props.onValueChange([Number(event.target.value)])});`:`export const BarChart=()=>null;export const Bar=()=>null;export const ResponsiveContainer=()=>null;export const LineChart=()=>null;export const Line=()=>null;export const XAxis=()=>null;export const YAxis=()=>null;export const CartesianGrid=()=>null;export const Tooltip=()=>null;export const Legend=()=>null;`,loader:'js'}));
}}]});
const {ClinicalScreen}=await import('./test-output/clinical-ui.mjs');
globalThis.window=new EventTarget();window.setInterval=(...args)=>setInterval(...args).unref();window.clearInterval=clearInterval;window.setTimeout=(...args)=>setTimeout(...args).unref();window.clearTimeout=clearTimeout;
const entry={id:'12345678-1234-4234-8234-123456789012',revision:2,date:'2026-10-13T01:00:00Z',observedAt:'2026-10-13T00:59:23.123Z',vasScore:5,tnssScore:6,notes:'Existing notes',symptomSeverities:{sneezing:0,'itchy-nose':1,'runny-nose':2,congestion:3}};
const text=node=>typeof node==='string'?node:(node?.children||[]).map(text).join('');
const button=(tree,label)=>tree.root.findAllByType('button').find(node=>text(node).trim()===label);
function fixture(logs=[entry]){globalThis.diaryState={entries:logs,loading:false,error:'',busy:false,truncated:false,retry:()=>{},create:async()=>true,update:async()=>true,remove:async()=>true};}

test('diary saves all four symptoms, notes and a genuine chosen observation time',async()=>{
  fixture([]);let saved;diaryState.create=async(fields,id)=>{saved={fields,id};return true;};let tree;
  await act(async()=>{tree=TestRenderer.create(React.createElement(ClinicalScreen));});
  await act(async()=>{
    tree.root.findByProps({id:'diary-notes'}).props.onChange({target:{value:'Observed after cleaning'}});
    tree.root.findByProps({id:'diary-time'}).props.onChange({target:{value:'2026-01-01T12:00'}});
    tree.root.findByProps({'aria-label':'Sneezing severity'}).props.onValueChange([2]);
  });
  await act(async()=>{await (button(tree,'Save changes')||button(tree,"Save Today's Entry")).props.onClick();});
  assert.equal(saved.fields.notes,'Observed after cleaning');assert.equal(saved.fields.symptomSeverities.sneezing,2);assert.equal(saved.fields.tnssScore,2);assert.equal(saved.fields.observedAt,'2026-01-01T04:00:00.000Z');assert.match(saved.id,/^[a-f0-9-]{36}$/);await act(async()=>tree.unmount());
});
test('notes-only correction preserves original observation seconds and stored revision',async()=>{
  fixture();let changed;diaryState.update=async(original,fields)=>{changed={original,fields};return true;};let tree;
  await act(async()=>{tree=TestRenderer.create(React.createElement(ClinicalScreen));});await act(async()=>{tree.root.findByProps({'aria-label':'Open symptom history'}).props.onClick();});
  await act(async()=>{button(tree,'Edit').props.onClick();});
  await act(async()=>{tree.root.findByProps({id:'diary-notes'}).props.onChange({target:{value:'Corrected notes'}});});
  await act(async()=>{await (button(tree,'Save changes')||button(tree,"Save Today's Entry")).props.onClick();});
  assert.equal(changed.original.revision,2);assert.equal(changed.fields.observedAt,entry.observedAt);assert.equal(changed.fields.notes,'Corrected notes');await act(async()=>tree.unmount());
});
test('legacy corrections do not invent individual symptoms or an observation timestamp',async()=>{
  fixture([{...entry,symptomSeverities:undefined,observedAt:undefined}]);let changed;diaryState.update=async(original,fields)=>{changed=fields;return true;};let tree;
  await act(async()=>{tree=TestRenderer.create(React.createElement(ClinicalScreen));});await act(async()=>{tree.root.findByProps({'aria-label':'Open symptom history'}).props.onClick();});await act(async()=>button(tree,'Edit').props.onClick());
  assert.equal(tree.root.findByProps({id:'diary-time'}).props.value,'');assert.equal(tree.root.findByProps({id:'diary-total'}).props.value,6);
  await act(async()=>{await (button(tree,'Save changes')||button(tree,"Save Today's Entry")).props.onClick();});assert.equal(changed.observedAt,undefined);assert.equal(changed.symptomSeverities,undefined);assert.equal(changed.tnssScore,6);await act(async()=>tree.unmount());
});
test('deleting requires confirmation and cancel leaves the entry untouched',async()=>{
  fixture();let deleted=0;diaryState.remove=async()=>{deleted++;return true;};let tree;
  await act(async()=>{tree=TestRenderer.create(React.createElement(ClinicalScreen));});await act(async()=>{tree.root.findByProps({'aria-label':'Open symptom history'}).props.onClick();});await act(async()=>button(tree,'Delete').props.onClick());assert.equal(deleted,0);assert.equal(tree.root.findByProps({'aria-labelledby':'delete-diary-title'}).props['aria-modal'],'true');
  await act(async()=>button(tree,'Cancel').props.onClick());assert.equal(deleted,0);assert.equal(tree.root.findAllByProps({'aria-labelledby':'delete-diary-title'}).length,0);
  await act(async()=>button(tree,'Delete').props.onClick());await act(async()=>{await button(tree,'Delete entry').props.onClick();});assert.equal(deleted,1);await act(async()=>tree.unmount());
});

test('original symptom carousel retains each slider score when navigating and saving',async()=>{
  fixture([]);let saved;diaryState.create=async(fields)=>{saved=fields;return true;};let tree;
  await act(async()=>{tree=TestRenderer.create(React.createElement(ClinicalScreen));});
  const labels=['Sneezing','Itchy Nose','Runny Nose','Congestion'];
  for(let index=0;index<4;index++){
    await act(async()=>{tree.root.findByProps({'aria-label':`${labels[index]} severity`}).props.onValueChange([index]);});
    await act(async()=>tree.root.findByProps({'aria-label':'Next symptom'}).props.onClick());
  }
  assert.deepEqual(tree.root.findByProps({'aria-label':'Sneezing severity'}).props.value,[0]);
  await act(async()=>tree.root.findByProps({'aria-label':'Previous symptom'}).props.onClick());
  assert.deepEqual(tree.root.findByProps({'aria-label':'Congestion severity'}).props.value,[3]);
  await act(async()=>{await button(tree,"Save Today's Entry").props.onClick();});
  assert.equal(saved.tnssScore,6);assert.deepEqual(saved.symptomSeverities,{sneezing:0,'itchy-nose':1,'runny-nose':2,congestion:3});
  await act(async()=>tree.unmount());
});

test('account switching clears the restored tracker form and closes private history',async()=>{
  fixture();let tree;await act(async()=>{tree=TestRenderer.create(React.createElement(ClinicalScreen));});
  await act(async()=>tree.root.findByProps({'aria-label':'Open symptom history'}).props.onClick());
  await act(async()=>button(tree,'Edit').props.onClick());
  await act(async()=>tree.root.findByProps({'aria-label':'Open symptom history'}).props.onClick());
  await act(async()=>window.dispatchEvent(new Event('allert-session-changed')));
  assert.equal(tree.root.findByProps({id:'diary-notes'}).props.value,'');
  assert.equal(tree.root.findAllByProps({'aria-label':'Symptom history'}).length,0);
  assert.equal(button(tree,'Save changes'),undefined);assert.ok(button(tree,"Save Today's Entry"));
  await act(async()=>tree.unmount());
});

test('future observation times are rejected by the restored save button',async()=>{
  fixture([]);let saves=0;diaryState.create=async()=>{saves++;return true;};let tree;
  await act(async()=>{tree=TestRenderer.create(React.createElement(ClinicalScreen));});
  await act(async()=>tree.root.findByProps({id:'diary-time'}).props.onChange({target:{value:'2099-01-01T12:00'}}));
  await act(async()=>{await button(tree,"Save Today's Entry").props.onClick();});
  assert.equal(saves,0);assert.ok(text(tree.root.findByProps({role:'alert'})).includes('not in the future'));
  await act(async()=>tree.unmount());
});

test('failed saves keep the same request identity when retried',async()=>{
  fixture([]);const attempts=[];diaryState.create=async(fields,id)=>{attempts.push({fields,id});return false;};let tree;
  await act(async()=>{tree=TestRenderer.create(React.createElement(ClinicalScreen));});
  await act(async()=>{await button(tree,"Save Today's Entry").props.onClick();});
  await act(async()=>{await button(tree,"Save Today's Entry").props.onClick();});
  assert.equal(attempts.length,2);assert.equal(attempts[0].id,attempts[1].id);assert.deepEqual(attempts[0].fields,attempts[1].fields);
  await act(async()=>tree.unmount());
});

test('TNSS uses the symptom carousel without four selection boxes and saves all ratings',async()=>{
  fixture([]);let saved,tree;diaryState.create=async fields=>{saved=fields;return true;};
  await act(async()=>{tree=TestRenderer.create(React.createElement(ClinicalScreen));});
  assert.equal(tree.root.findAllByProps({'aria-label':'Symptom ratings'}).length,0);
  for(const [label,score] of [['Sneezing',1],['Itchy Nose',1],['Runny Nose',2],['Congestion',3]]){
    await act(async()=>tree.root.findByProps({'aria-label':`${label} severity`}).props.onValueChange([score]));
    await act(async()=>tree.root.findByProps({'aria-label':'Next symptom'}).props.onClick());
  }
  await act(async()=>button(tree,"Save Today's Entry").props.onClick());
  assert.equal(saved.tnssScore,7);assert.deepEqual(saved.symptomSeverities,{sneezing:1,'itchy-nose':1,'runny-nose':2,congestion:3});
  await act(async()=>tree.unmount());
});
test('save is before analysis and an empty week is explained without a fabricated trend',async()=>{
  fixture([]);let tree;await act(async()=>{tree=TestRenderer.create(React.createElement(ClinicalScreen));});
  const content=text(tree.toJSON());
  assert.ok(content.indexOf("Save Today's Entry")<content.indexOf('Your symptom patterns'));
  assert.match(content,/No entries in the last 7 days/);
  await act(async()=>tree.unmount());
});

test('Clinical keeps symptom history and the date-based trend without mounting correlation',async()=>{
  fixture();let tree;
  try{await act(async()=>tree=TestRenderer.create(React.createElement(ClinicalScreen)));const content=text(tree.toJSON());assert.match(content,/Symptom trend/);assert.match(content,/TNSS, 0–12/);assert.match(content,/VAS, 0–10/);assert.doesNotMatch(content,/Correlation insights|How to read the comparison|Show older-model comparisons/);await act(async()=>tree.root.findByProps({'aria-label':'Open symptom history'}).props.onClick());assert.match(text(tree.toJSON()),/Existing notes/);}finally{if(tree)await act(async()=>tree.unmount());}
});
