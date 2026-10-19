import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
await build({entryPoints:['src/app/components/HistoryExplorer.tsx'],outfile:'integration/test-output/history-explorer.mjs',bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime']});
const {HistoryExplorer}=await import('./test-output/history-explorer.mjs');
const end=Date.parse('2026-10-13T00:00:00Z');
const row={id:1,device_id:'a',timestamp:new Date(end).toISOString(),pm2_5:0,pm10:2,temperature:28,humidity:70,data_quality_status:'VALID'};
const render=(readings=[row],extra={})=>renderToStaticMarkup(React.createElement(HistoryExplorer,{readings,end,deviceId:'a',...extra}));
test('explorer has no nested scroll table and permits vertical touch scrolling',()=>{const html=render();assert.doesNotMatch(html,/<table|overflow-auto|overflow-scroll/);assert.match(html,/touch-action:pan-y/);assert.match(html,/Choose a reading/);assert.match(html,/View readings/);});
test('single zero reading remains visible and valid',()=>{const html=render();assert.match(html,/1 sample</);assert.match(html,/0\.0/);assert.match(html,/<circle/);assert.match(html,/Breaks in the line/);});
test('missing measurements do not produce NaN or Infinity chart coordinates',()=>{const html=render([{...row,pm2_5:NaN}]);assert.doesNotMatch(html,/NaN|Infinity/);assert.match(html,/No usable readings/);});
test('invalid quality is excluded from chart and marked red',()=>{const html=render([{...row,data_quality_status:'INVALID'}]);assert.match(html,/text-red-300/);assert.match(html,/No usable readings/);});
test('missing five-minute blocks break the line',()=>{const html=render([row,{...row,id:2,timestamp:new Date(end-900000).toISOString()}]);assert.equal((html.match(/<path/g)||[]).length,2);});
test('empty and replay states remain explicit',()=>{assert.match(render([]),/No readings in this time range/);assert.match(render([row],{replay:true}),/Previously recorded readings/);});
test('constant readings have consistent axis bounds',()=>{const html=render();assert.match(html,/>1\.0<\/text>/);assert.match(html,/>0\.0<\/text>/);});

test('Lowest is the minimum valid measurement, not the middle value, and keeps genuine zero',()=>{
 const rows=[{...row,pm2_5:8},{...row,id:2,timestamp:new Date(end-300000).toISOString(),pm2_5:2},{...row,id:3,timestamp:new Date(end-600000).toISOString(),pm2_5:11},{...row,id:4,timestamp:new Date(end-900000).toISOString(),pm2_5:-99,data_quality_status:'INVALID'}];
 const html=render(rows);assert.match(html,/Lowest<\/p><p[^>]*>2\.0<\/p>/);assert.doesNotMatch(html,/Middle value/);
 assert.match(render([{...row,pm2_5:0}]),/Lowest<\/p><p[^>]*>0\.0<\/p>/);
});
test('measurement choices and time choices have a distinct divider group',()=>{assert.match(render(),/class="history-window-controls[^"]*" aria-label="History window"/);});
