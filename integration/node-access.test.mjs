import { test } from "node:test";
import assert from "node:assert/strict";
import { assignmentKey, hasNodeAccess } from "../supabase/functions/server/node-access.mjs";
const assignment = {schema_version:1,user_id:"account-a",node_id:"node-1",active:true};
test("stable account ID authorizes independent login sessions",()=>assert.ok(hasNodeAccess(assignment,"account-a")));
test("keys are scoped to account and node",()=>{assert.notEqual(assignmentKey("account-a"),assignmentKey("account-b"));assert.notEqual(assignmentKey("account-a"),assignmentKey("account-a","node-2"));});
for(const [label,value,user,node] of [
  ["missing assignment",null,"account-a","node-1"],
  ["another account",assignment,"account-b","node-1"],
  ["another node",assignment,"account-a","node-2"],
  ["revoked assignment",{...assignment,active:false},"account-a","node-1"],
  ["string enabled flag",{...assignment,active:"true"},"account-a","node-1"],
  ["unknown version",{...assignment,schema_version:2},"account-a","node-1"],
  ["forged browser data",{email:"approved@example.invalid",nodeConnected:true},"account-a","node-1"],
])test(`denies ${label}`,()=>assert.equal(hasNodeAccess(value,user,node),false));
