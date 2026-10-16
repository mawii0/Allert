import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {build} from 'esbuild';
import {resolve} from 'node:path';
await build({stdin:{contents:`export * from './src/app/utils/useNodeLocation';export * from './src/app/utils/useAdminReview';export * from './src/app/utils/usePrivateResource';export * from './src/app/components/NodeLocationControls';export * from './src/app/components/AccessBoundary';export * from './src/app/components/AdminOverviewScreen';export * from './src/app/components/AdminSensorDetailScreen';export * from './src/app/components/AdminAnomalyInvestigationScreen';export * from './src/app/components/AdminLiveTools';export * from './src/app/components/SensorNotices';`,resolveDir:process.cwd(),loader:'ts'},outfile:'integration/test-output/app-feature-ui.mjs',bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime','lucide-react'],plugins:[{name:'fixtures',setup(b){
  b.onResolve({filter:/^\/utils\/supabase\/info$/},()=>({path:resolve('utils/supabase/info.tsx')}));
  b.onResolve({filter:/private-api$/},()=>({path:'api',namespace:'fixture'}));
  b.onResolve({filter:/(?:^|\/)auth$/},()=>({path:'auth',namespace:'fixture'}));
  b.onResolve({filter:/^react-router$/},()=>({path:'router',namespace:'fixture'}));
  b.onResolve({filter:/ui\/switch$/},()=>({path:'switch',namespace:'fixture'}));
  const values={api:'export const privateApi=(...args)=>globalThis.api(...args);',auth:'export const getCurrentUser=()=>({id:globalThis.account});export const isAuthenticated=()=>!!globalThis.account;export const getValidAuthToken=async()=>"token";export const logout=()=>{};',
    router:`import React from 'react';export const useSearchParams=()=>[new URLSearchParams(globalThis.queryString)];export const useNavigate=()=>path=>globalThis.navigations.push(path);export const Navigate=props=>React.createElement('span',{'data-redirect':props.to});`,
    switch:`import React from 'react';export const Switch=props=>React.createElement('button',{role:'switch','aria-label':props['aria-label'],'aria-checked':props.checked,disabled:props.disabled,onClick:()=>props.onCheckedChange(!props.checked)});`,
  };
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:values[args.path],loader:'js'}));
}}]});
const app=await import('./test-output/app-feature-ui.mjs');
const epoch='2026-10-01T00:00:00Z',eventId='33333333-3333-4333-8333-333333333333';
let tree,state,requests,locations,event,overview,geoCalls,adminAllowed;
const text=node=>Array.isArray(node)?node.map(text).join(''):typeof node==='string'?node:(node?.children || []).map(text).join('');
beforeEach(()=>{
  globalThis.account='account-a';globalThis.queryString='';globalThis.navigations=[];requests=[];geoCalls=[];adminAllowed=false;
  globalThis.window=new EventTarget();window.setInterval=setInterval;window.clearInterval=clearInterval;window.isSecureContext=true;
  globalThis.localStorage={getItem:()=>null};
  Object.defineProperty(globalThis,'navigator',{value:{geolocation:{getCurrentPosition(resolve,_reject,options){geoCalls.push(options);resolve({coords:{latitude:10.720234,longitude:122.562123,accuracy:25},timestamp:Date.now()});}}},configurable:true});
  locations=new Map(['account-a','account-b'].map((id,index)=>[id,{device:{device_id:'NODE-'+(index?'B':'A'),owner_epoch:epoch},location:{label:index?'Other home':'Home',enabled:false,revision:0,latitude:null,longitude:null,accuracy:null,captured_at:null}}]));
  const now=new Date().toISOString();const reading={device_id:'NODE-A',timestamp:now,created_at:now,pm2_5:18,pm10:22,temperature:28,humidity:65,sample_count:30,expected_samples:30,data_quality_status:'VALID'};
  const node={device:{device_id:'NODE-A',location_label:'Living room',is_active:true},latest:reading,history:[reading],coverage:1/288*100,online:true,generated_at:now};
  event={id:eventId,device_id:'NODE-A',observed_at:now,severity:'warning',policy_version:'observed-pm-v1',metrics:{pm2_5:{mean:10,z:4,velocity:60,cusum:5,methods:['z_score']}},reading,baseline:[],classification:'unreviewed',review_revision:0,review_notes:''};
  overview={nodes:[node],events:[event],accepted_deliveries:0,anomaly_count:1,generated_at:now,total_nodes:1};
  globalThis.api=async(path,options={})=>{
    requests.push({path,options,account});
    if(path==='/node-location'){
      const saved=locations.get(account);if(options.method==='PUT'){
        const body=options.body;saved.location={...saved.location,label:body.label,enabled:body.enabled,revision:saved.location.revision+1,latitude:body.enabled?body.latitude:null,longitude:body.enabled?body.longitude:null,accuracy:body.enabled?body.accuracy:null,captured_at:body.enabled?body.capturedAt:null};return{location:{...saved.location}};
      }return structuredClone(saved);
    }
    if(path==='/admin/access')return{allowed:adminAllowed};
    if(path==='/admin/overview')return structuredClone(overview);
    if(path.startsWith('/admin/nodes/'))return structuredClone(node);
    if(path.startsWith('/admin/anomalies/')){if(options.method==='PUT'){event={...event,classification:options.body.classification,review_notes:options.body.notes,review_revision:event.review_revision+1};return{event:structuredClone(event)};}return{event:structuredClone(event),reviews:[],deliveries:[]};}
    if(path==='/alerts')return{device:{device_id:'NODE-A'},events:[structuredClone(event)],detector:{status:'ready',baseline_count:12},processorReady:true};
    throw Error('Unexpected request '+path);
  };
});
afterEach(async()=>{if(tree){await act(async()=>tree.unmount());tree=null;}});
async function mount(component,props={}){await act(async()=>{tree=TestRenderer.create(React.createElement(component,props));});}
async function locationHarness(){function Harness(){state=app.useNodeLocation();return null;}await mount(Harness);}
const button=label=>tree.root.findAllByType('button').find(node=>text(node)===label);
test('location never requests browser permission on load and manual labels do not require it',async()=>{
  await locationHarness();assert.equal(geoCalls.length,0);await act(async()=>state.setLabel('Bedroom'));await act(async()=>assert.equal(await state.save(),true));assert.equal(geoCalls.length,0);assert.equal(locations.get(account).location.label,'Bedroom');assert.equal(locations.get(account).location.enabled,false);
});
test('capture starts from an explicit action, shows accuracy, and saves only after installed-node confirmation',async()=>{
  await mount(app.NodeLocationControls);await act(async()=>tree.root.findByProps({role:'switch'}).props.onClick());assert.equal(geoCalls.length,1);assert.equal(geoCalls[0].maximumAge,0);assert.equal(requests.filter(request=>request.options.method==='PUT').length,0);assert.match(text(tree.toJSON()),/accuracy ±25 m/);assert.equal(button('Save node location').props.disabled,true);
  await act(async()=>tree.root.findByProps({type:'checkbox'}).props.onChange({target:{checked:true}}));await act(async()=>button('Save node location').props.onClick());assert.equal(locations.get(account).location.enabled,true);assert.match(text(tree.toJSON()),/Node location saved/);
});
test('cancelling a captured position sends no mutation',async()=>{
  await locationHarness();await act(async()=>state.capture());assert.ok(state.draft);await act(async()=>state.cancel());assert.equal(state.draft,null);assert.equal(requests.filter(request=>request.options.method==='PUT').length,0);
});
test('permission denial preserves the saved location and allows a manual label',async()=>{
  navigator.geolocation.getCurrentPosition=(_resolve,reject)=>{geoCalls.push(1);reject({code:1});};await locationHarness();await act(async()=>state.capture());assert.match(state.error,/denied/);assert.equal(state.draft,null);await act(async()=>state.setLabel('Home office'));await act(async()=>assert.equal(await state.save(),true));assert.equal(locations.get(account).location.label,'Home office');
});
test('timeout, insecure context and unsupported geolocation are readable without a false success',async()=>{
  navigator.geolocation.getCurrentPosition=(_resolve,reject)=>reject({code:3});await locationHarness();await act(async()=>state.capture());assert.match(state.error,/timed out/);window.isSecureContext=false;await act(async()=>state.capture());assert.match(state.error,/HTTPS/);window.isSecureContext=true;delete navigator.geolocation;await act(async()=>state.capture());assert.match(state.error,/unavailable/);assert.equal(state.message,'');
});
test('turning capture off removes coordinates while retaining the label',async()=>{
  locations.get(account).location={label:'Bedroom',enabled:true,revision:1,latitude:10.72,longitude:122.56,accuracy:25,captured_at:new Date().toISOString()};await locationHarness();await act(async()=>assert.equal(await state.save(true),true));assert.equal(locations.get(account).location.latitude,null);assert.equal(locations.get(account).location.label,'Bedroom');assert.match(state.message,/removed/);
});
test('a late phone capture cannot populate another account or send its position',async()=>{
  let finish;navigator.geolocation.getCurrentPosition=resolve=>finish=resolve;await locationHarness();let capturing;await act(async()=>{capturing=state.capture();});
  await act(async()=>{account='account-b';window.dispatchEvent(new Event('allert-session-changed'));});await act(async()=>{finish({coords:{latitude:10,longitude:120,accuracy:20},timestamp:Date.now()});await capturing;});assert.equal(state.label,'Other home');assert.equal(state.draft,null);assert.equal(requests.filter(request=>request.options.method==='PUT').length,0);assert.equal(state.busy,false);
});
test('rapid location save clicks serialize and an unsuccessful save retains the draft',async()=>{
  await locationHarness();await act(async()=>state.setLabel('Draft room'));const api=globalThis.api;let finish,count=0;globalThis.api=(path,options={})=>options.method==='PUT'?(count++,new Promise(resolve=>finish=resolve)):api(path,options);let saving;
  await act(async()=>{saving=state.save();assert.equal(await state.save(),false);});assert.equal(count,1);await act(async()=>{finish({});assert.equal(await saving,false);});assert.equal(state.label,'Draft room');assert.match(state.error,/could not be confirmed/);assert.equal(state.message,'');
});
test('a stale location draft is blocked after another tab changes its saved revision',async()=>{
  await locationHarness();await act(async()=>state.setLabel('My draft'));locations.get(account).location={...locations.get(account).location,label:'Other tab',revision:1};await act(async()=>window.dispatchEvent(new Event('focus')));assert.equal(state.canSave,false);assert.match(state.error,/changed elsewhere/);await act(async()=>state.cancel());assert.equal(state.label,'Other tab');assert.equal(state.stale,false);
});
test('an unlinked account cannot capture or save a different home',async()=>{
  locations.set(account,{device:null,location:null});await locationHarness();await act(async()=>state.capture());assert.equal(geoCalls.length,0);await act(async()=>assert.equal(await state.save(),false));
});
test('admin boundary does not render private screens for an ordinary account',async()=>{
  let rendered=0;function Private(){rendered++;return React.createElement('div',null,'Private records');}await mount(app.AdminBoundary,{children:React.createElement(Private)});assert.equal(rendered,0);assert.match(text(tree.toJSON()),/Administrator access required/);assert.deepEqual(requests.map(request=>request.path),['/admin/access']);
  adminAllowed=true;await act(async()=>window.dispatchEvent(new Event('focus')));assert.ok(rendered>0);assert.match(text(tree.toJSON()),/Private records/);
});
test('admin overview renders actual nodes, filters records and navigates to the selected node',async()=>{
  await mount(app.AdminOverviewScreen);assert.match(text(tree.toJSON()),/NODE-A/);assert.ok(!text(tree.toJSON()).includes('ilo-node-06'));assert.ok(!text(tree.toJSON()).includes('97.3%'));
  await act(async()=>button('View Detail').props.onClick());assert.deepEqual(navigations,['/admin/sensor-detail?node=NODE-A']);await act(async()=>tree.root.findByProps({type:'search'}).props.onChange({target:{value:'not a real node'}}));assert.match(text(tree.toJSON()),/No matching registered nodes/);
});
test('admin errors show unavailable data instead of sample sensors and invented statistics',async()=>{
  globalThis.api=async()=>{throw Error('Database unavailable');};await mount(app.AdminOverviewScreen);assert.match(text(tree.toJSON()),/Database unavailable/);assert.ok(!text(tree.toJSON()).includes('ilo-node-'));assert.equal(tree.root.findAllByType('polyline').length,0);
});
test('node detail renders real telemetry and keeps unsupported calibration and maintenance commands disabled',async()=>{
  queryString='node=NODE-A';await mount(app.AdminSensorDetailScreen);assert.match(text(tree.toJSON()),/18.0 µg\/m³/);assert.match(text(tree.toJSON()),/Not reported by firmware/);assert.match(text(tree.toJSON()),/Evaluation report unavailable/);assert.equal(button('Trigger Remote Calibration').props.disabled,true);assert.equal(button('Flag for Maintenance').props.disabled,true);assert.equal(button('Download Raw Data (CSV)').props.disabled,false);
});
test('admin review saves its chosen classification and notes, then reloads persisted values',async()=>{
  queryString='event='+eventId;await mount(app.AdminAnomalyInvestigationScreen);assert.equal(button('Save Classification').props.disabled,false);await act(async()=>tree.root.findByProps({'aria-label':'Anomaly classification'}).props.onChange({target:{value:'sensor_artifact'}}));await act(async()=>tree.root.findByProps({'aria-label':'Investigation notes'}).props.onChange({target:{value:'Checked intake obstruction'}}));await act(async()=>button('Save Classification').props.onClick());assert.equal(event.classification,'sensor_artifact');assert.equal(event.review_notes,'Checked intake obstruction');assert.match(text(tree.toJSON()),/audit record/);assert.ok(!text(tree.toJSON()).includes('85.3%'));
});
test('a concurrent admin review cannot silently overwrite an open draft',async()=>{
  queryString='event='+eventId;await mount(app.AdminAnomalyInvestigationScreen);await act(async()=>tree.root.findByProps({'aria-label':'Investigation notes'}).props.onChange({target:{value:'My draft'}}));event={...event,review_revision:1,classification:'external_event',review_notes:'Another admin'};await act(async()=>window.dispatchEvent(new Event('focus')));assert.equal(button('Save Classification').props.disabled,true);assert.match(text(tree.toJSON()),/Another administrator/);
});
test('leaving the review screen aborts its in-flight save and ignores a delayed result',async()=>{
  let resource={data:{event:structuredClone(event)},loading:false,retry(){}};function Harness(){state=app.useAdminReview(resource,eventId);return null;}await mount(Harness);let finish,signal;globalThis.api=(_path,options)=>{signal=options.signal;return new Promise(resolve=>finish=resolve);};let saving;await act(async()=>{saving=state.save();});await act(async()=>tree.unmount());tree=null;assert.equal(signal.aborted,true);finish({event:{...event,review_revision:1}});assert.equal(await saving,false);
});
test('resource state clears after an account switch and ignores a late previous-account response',async()=>{
  const pending=[];globalThis.api=(path,options)=>new Promise(resolve=>pending.push({resolve,options}));function Harness(){state=app.usePrivateResource('/alerts');return null;}await mount(Harness);await act(async()=>{account='account-b';window.dispatchEvent(new Event('allert-session-changed'));});assert.equal(pending[0].options.signal.aborted,true);await act(async()=>pending[1].resolve({events:['B']}));await act(async()=>pending[0].resolve({events:['A']}));assert.deepEqual(state.data,{events:['B']});
});
test('sensor notices use stored events and explicitly describe observed rather than forecast data',async()=>{
  await mount(app.SensorNotices);const content=text(tree.toJSON());assert.match(content,/Observed particulate changes/);assert.match(content,/warning measurement change/);assert.match(content,/18.00/);assert.match(content,/unreviewed/);assert.ok(!content.includes('85.3%'));
});
test('actual chart paths leave a missing sample gap empty',async()=>{
  const now=Date.now(),rows=[0,1,3,4].map(index=>({timestamp:new Date(now-(4-index)*300000).toISOString(),pm2_5:10+index}));await mount(app.AdminReadingChart,{rows,end:now});assert.equal(tree.root.findAllByType('polyline').length,2);
});
test('CSV download uses actual records and escapes formula-leading text',async()=>{
  let blob,downloaded;const original=URL.createObjectURL,oldDocument=globalThis.document;URL.createObjectURL=value=>{blob=value;return 'blob:test';};globalThis.document={createElement:()=>({click(){downloaded=this.download;}})};
  try{app.downloadNodeCsv('NODE-A',[{timestamp:'2026-10-16T00:00:00Z',device_id:'=malicious',pm2_5:18}]);assert.match(downloaded,/NODE-A-24h\.csv/);const csv=await blob.text();assert.ok(csv.includes("'=malicious"));assert.ok(csv.includes('18'));assert.ok(!csv.includes('45 ug/m3'));}finally{URL.createObjectURL=original;globalThis.document=oldDocument;}
});
