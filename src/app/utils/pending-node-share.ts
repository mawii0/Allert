// The private token stays in memory across in-app sign-in/onboarding, never in storage.
let pending:string|null=null;
export const pendingNodeSharePath=()=>pending?"/join-node":null;
export const clearPendingNodeShare=()=>{pending=null;};
export function readPendingNodeShare(){
  const incoming=window.location.hash.slice(1);
  if(incoming){pending=/^[a-f0-9]{64}$/.test(incoming)?incoming:null;window.history.replaceState(window.history.state,"",window.location.pathname+window.location.search);}
  return pending;
}
