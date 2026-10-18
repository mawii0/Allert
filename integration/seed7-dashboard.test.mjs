import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {build} from 'esbuild';
import {currentIndicator,MODEL_ID,CHECKPOINT} from '../supabase/functions/server/seed7-policy.mjs';
await build({entryPoints:['src/app/components/DashboardScreen.tsx'],outfile:'integration/test-output/seed7-dashboard.mjs',bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime','lucide-react'],plugins:[{name:'fixtures',setup(b){
 b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));
 b.onResolve({filter:/utils\/risk-monitor$/},()=>({path:'monitor',namespace:'fixture'}));
 b.onResolve({filter:/useProfileSettings$/},()=>({path:'population',namespace:'fixture'}));
 b.onResolve({filter:/utils\/environment$/},()=>({path:'dates',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='monitor'?'export const useRiskMonitor=()=>globalThis.monitor;':a.path==='population'?'export const useProfilePopulation=()=>globalThis.population;':'export const displayTime=value=>value;'}));
}}]});
const {DashboardScreen}=await import('./test-output/seed7-dashboard.mjs');let tree;
const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):(n?.children || []).map(text).join('');
const buttonLabel=b=>Array.isArray(b.props.children)?b.props.children.join(''):b.props.children;
const origin='2026-10-16T18:00:00Z';
function value(optional=false){const pm=currentIndicator(25,35,25,60);return{data:{model_id:MODEL_ID,checkpoint_sha256:CHECKPOINT,device:{device_id:'ALLERT-NODE-001'},current:{pm2_5:0,pm10:0,temperature:25,humidity:60,timestamp:origin,risk:currentIndicator(0,0,25,60)},model_status:'ready',forecasts:[6,12,24].map(h=>({horizon_hours:h,pm2_5:25,pm10:35,target_block_start:`target-${h}-start`,target_block_end:`target-${h}-end`,origin,...(optional?{forecast_pm_indicator:{adult:pm.adult,pediatric:pm.pediatric}}:{})}))},status:'ready',retry(){}};}
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
test('horizon controls show paired PM forecasts while the gauge remains the current indicator',async()=>{
 globalThis.population='adult';globalThis.monitor=value();await act(async()=>{tree=Renderer.create(React.createElement(DashboardScreen));});
 const buttons=tree.root.findAllByType('button');assert.deepEqual(buttons.map(buttonLabel),['6h','12h','24h']);assert.equal(buttons[0].props['aria-pressed'],true);
 const initial=text(tree.toJSON());assert.ok(initial.indexOf('PM2.5')<initial.indexOf('Forecast Timeline'));assert.ok(initial.indexOf('PM10')<initial.indexOf('Forecast Timeline'));assert.match(initial,/PM estimates - 6h/);assert.match(initial,/Adult 20\.0Pediatric 22\.0/);
 await act(async()=>buttons[0].props.onClick());
 const content=text(tree.toJSON());assert.match(content,/20\.0/);assert.match(content,/Current environmental indicator/);assert.match(content,/PM estimates - 6h/);assert.match(content,/25\.0/);assert.match(content,/35\.0/);assert.doesNotMatch(content,/Forecast PM indicator/);assert.doesNotMatch(content,/weather.*median|Median estimate/);
});
test('optional PM score switches population without changing the paired network concentrations',async()=>{
 globalThis.population='adult';globalThis.monitor=value(true);await act(async()=>tree=Renderer.create(React.createElement(DashboardScreen)));await act(async()=>tree.root.findAllByType('button').find(b=>buttonLabel(b)==='6h').props.onClick());assert.match(text(tree.toJSON()),/Forecast PM indicator/);
 globalThis.population='pediatric';await act(async()=>tree.update(React.createElement(DashboardScreen)));const content=text(tree.toJSON());assert.match(content,/Forecast PM indicator/);assert.match(content,/22\.0/);assert.match(content,/moderate/);assert.match(content,/25\.0/);assert.match(content,/35\.0/);
});
test('missing weather leaves a visibly unavailable current gauge even when PM measurements exist',async()=>{
 globalThis.population='adult';globalThis.monitor=value();monitor.data.current.risk=null;monitor.data.current.temperature=null;monitor.data.current.humidity=null;monitor.data.model_status='warming_up';monitor.data.forecasts=[];
 await act(async()=>{tree=Renderer.create(React.createElement(DashboardScreen));});const content=text(tree.toJSON());assert.match(content,/Unavailable/);assert.doesNotMatch(content,/Current adult environmental indicator: low/);
});
test('unavailable model results retain the reference layout and retry control',async()=>{
 globalThis.population='adult';globalThis.monitor={data:null,status:'error',retry(){}};
 await act(async()=>{tree=Renderer.create(React.createElement(DashboardScreen));});
 const content=text(tree.toJSON());assert.match(content,/Model Results Unavailable/);assert.match(content,/Try Again/);assert.match(content,/Measurements unavailable/);assert.match(content,/PM estimates unavailable/);
 assert.deepEqual(tree.root.findAllByType('button').map(buttonLabel),['Try Again','6h','12h','24h']);
 assert.ok(content.indexOf('PM2.5')<content.indexOf('Forecast Timeline'));
});
