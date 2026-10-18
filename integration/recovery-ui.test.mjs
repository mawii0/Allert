import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
await build({entryPoints:['src/app/components/AuthScreen.tsx','src/app/components/PasswordRecoveryScreen.tsx'],outdir:'integration/test-output/recovery-ui',bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime','lucide-react'],plugins:[{name:'fixtures',setup(b){
  const fixtures={
    router:'export const useNavigate=()=>globalThis.navigate;export const useLocation=()=>({state:{email:"person@example.com"}});',
    recovery:'export const usePasswordRecovery=()=>globalThis.recovery;',
    auth:'export const storeSession=()=>{};export const getProfile=async()=>({success:false});',
    info:'export const projectId="fixture";export const publicAnonKey="public-fixture";',
    image:'export default "logo.png";',deployment:'export const DeploymentCheck=()=>null;',
    motion:`import React from 'react';export const AnimatePresence=({children})=>children;export const motion={div:({children,initial,animate,exit,transition,...props})=>React.createElement('div',props,children)};`,
    controls:`import React from 'react';export const Button=({children,...props})=>React.createElement('button',props,children);export const Input=props=>React.createElement('input',props);export const Label=({children,...props})=>React.createElement('label',props,children);`,
  };
  for(const [filter,path] of [[/^react-router$/,'router'],[/usePasswordRecovery$/,'recovery'],[/utils\/auth$/,'auth'],[/^\/utils\/supabase\/info$/,'info'],[/\.png$/,'image'],[/DeploymentCheck$/,'deployment'],[/^motion\/react$/,'motion'],[/ui\/(button|input|label)$/,'controls']])b.onResolve({filter},()=>({path,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:fixtures[args.path],loader:'js'}));
}}]});
const {AuthScreen}=await import('./test-output/recovery-ui/AuthScreen.js');
const {PasswordRecoveryScreen}=await import('./test-output/recovery-ui/PasswordRecoveryScreen.js');
const text=node=>typeof node==='string'?node:(node?.children||[]).map(text).join('');
const button=(tree,label)=>tree.root.findAllByType('button').find(node=>text(node)===label);
function fixture(extra={}){globalThis.recovery={email:'person@example.com',code:'',password:'',confirmation:'',stage:'email',busy:false,error:'',notice:'',remaining:0,setEmail(){},setCode(){},setPassword(){},setConfirmation(){},useExistingCode(){},send:async()=>{},verify:async()=>{},save:async()=>{},changeEmail(){},...extra};globalThis.navigate=()=>{};}
test('sign-in retains its design and adds a login-only recovery link with email in router state',async()=>{
  fixture();let destination,tree;globalThis.navigate=(...args)=>destination=args;await act(async()=>{tree=TestRenderer.create(React.createElement(AuthScreen));});
  assert.equal(tree.toJSON().props.className,'min-h-screen bg-zinc-950 text-white');assert.equal(tree.root.findByType('img').props.src,'logo.png');
  await act(async()=>tree.root.findByProps({id:'email'}).props.onChange({target:{value:' person@example.com '}}));
  await act(async()=>button(tree,'Forgot password?').props.onClick());assert.deepEqual(destination,['/forgot-password',{state:{email:'person@example.com'}}]);
  await act(async()=>button(tree,'Register').props.onClick());assert.equal(button(tree,'Forgot password?'),undefined);assert.ok(tree.root.findByProps({id:'name'}));await act(async()=>tree.unmount());
});
test('recovery email form sends only after an explicit submit',async()=>{
  fixture();let sends=0,tree;recovery.send=async()=>sends++;await act(async()=>{tree=TestRenderer.create(React.createElement(PasswordRecoveryScreen));});assert.equal(sends,0);
  assert.equal(tree.root.findByProps({id:'recovery-email'}).props.type,'email');await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));assert.equal(sends,1);await act(async()=>tree.unmount());
});
test('code step supports mobile autofill and disables resends during cooldown',async()=>{
  fixture({stage:'code',remaining:42});let tree;await act(async()=>{tree=TestRenderer.create(React.createElement(PasswordRecoveryScreen));});
  const input=tree.root.findByProps({id:'recovery-code'});assert.equal(input.props.inputMode,'numeric');assert.equal(input.props.autoComplete,'one-time-code');assert.equal(button(tree,'Resend code in 42s').props.disabled,true);assert.equal(tree.root.findAllByProps({id:'recovery-password'}).length,0);await act(async()=>tree.unmount());
});
test('password step keeps both inputs masked and calls the password action',async()=>{
  fixture({stage:'password'});let saves=0,tree;recovery.save=async()=>saves++;await act(async()=>{tree=TestRenderer.create(React.createElement(PasswordRecoveryScreen));});
  for(const id of ['recovery-password','recovery-confirmation'])assert.equal(tree.root.findByProps({id}).props.type,'password');
  await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));assert.equal(saves,1);await act(async()=>tree.unmount());
});
test('busy recovery prevents duplicate submission and navigation; errors remain visible',async()=>{
  fixture({stage:'password',busy:true,error:'Password rejected'});let tree;await act(async()=>{tree=TestRenderer.create(React.createElement(PasswordRecoveryScreen));});
  assert.equal(button(tree,'Back to sign in').props.disabled,true);assert.equal(button(tree,'Please wait…').props.disabled,true);assert.match(text(tree.root.findByProps({role:'alert'})),/Password rejected/);await act(async()=>tree.unmount());
});
test('success removes sensitive fields and returns to login without automatic sign-in',async()=>{
  fixture({stage:'done',notice:'Password updated. Sign in with your new password.'});let destination,tree;globalThis.navigate=(...args)=>destination=args;
  await act(async()=>{tree=TestRenderer.create(React.createElement(PasswordRecoveryScreen));});assert.equal(tree.root.findAllByType('input').length,0);assert.match(text(tree.toJSON()),/Password updated/);
  await act(async()=>button(tree,'Back to sign in').props.onClick());assert.deepEqual(destination,['/',{replace:true}]);await act(async()=>tree.unmount());
});
test('recovery is a public route and email template contains an OTP rather than an automatic sign-in link',async()=>{
  const routes=await readFile('src/app/routes.tsx','utf8');assert.match(routes,/path: "\/forgot-password",\s+Component: PasswordRecoveryScreen/);
  const template=await readFile('docs/auth/recovery-email.html','utf8');assert.match(template,/\{\{ \.Token \}\}/);assert.doesNotMatch(template,/ConfirmationURL|TokenHash|<a /);
});
