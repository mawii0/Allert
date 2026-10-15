import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source=await readFile('public/allert-sw.js','utf8');
function worker(binding={id:'current',owner:'account-a'}){
  const listeners={},notifications=[],opened=[];
  const context=vm.createContext({URL,Date,console,self:{location:{origin:'https://allert.example'},addEventListener:(name,fn)=>listeners[name]=fn,registration:{showNotification:async(title,options)=>notifications.push({title,options})},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}}});
  vm.runInContext(source,context);context.currentBinding=binding;
  vm.runInContext('state=async()=>currentBinding;',context);
  const dispatch=async(name,extra)=>{let task;listeners[name]({...extra,waitUntil:promise=>task=promise});await task;};
  return {notifications,opened,push:message=>dispatch('push',{data:{json:()=>message}}),click:bindingId=>dispatch('notificationclick',{notification:{data:{bindingId},close(){}}})};
}
test('a matching current binding displays a fixed generic test message',async()=>{
  const w=worker();await w.push({version:1,kind:'test',bindingId:'current',sentAt:Date.now(),title:'injected health detail',url:'https://evil.example'});
  assert.equal(w.notifications.length,1);assert.equal(w.notifications[0].title,'ALLERT test notification');assert.equal(w.notifications[0].options.body,'Browser push is working. This is a test notification.');
});
test('unbound, previous-account, malformed, old and future push messages cannot display app content',async()=>{
  for(const message of [null,{version:1,kind:'test',bindingId:'old',sentAt:Date.now()},{version:1,kind:'risk',bindingId:'current',sentAt:Date.now()},{version:1,kind:'test',bindingId:'current',sentAt:Date.now()-121000},{version:1,kind:'test',bindingId:'current',sentAt:Date.now()+31000}]){
    const w=worker();await w.push(message);assert.equal(w.notifications.length,0);
  }
  const w=worker(null);await w.push({version:1,kind:'test',bindingId:'current',sentAt:Date.now()});assert.equal(w.notifications.length,0);
});
test('notification clicks use only this origin and refuse stale account bindings',async()=>{
  const w=worker();await w.click('old');assert.equal(w.opened.length,0);await w.click('current');assert.deepEqual(w.opened,['https://allert.example/']);
});
