import {accessibleNode,currentNodeAccess} from "./node-ownership.mjs";
export const validInviteToken=value=>typeof value==="string" && /^[a-f0-9]{64}$/.test(value);
export async function invitationHash(token){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))),value=>value.toString(16).padStart(2,"0")).join("");}
const uuid=value=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function installHouseholdRoutes(app,authenticate,loadProfile){
  const root="/make-server-a473accf/node-sharing";
  const guard=handler=>async c=>{c.header("Cache-Control","no-store");try{const account=await authenticate(c);if(account.response)return account.response;return await handler(c,account);}catch{return c.json({error:"Family sharing is unavailable. Check its migration and deployment."},503);}};
  const result=(c,response,extra={})=>response.error?c.json({error:"Sharing could not be updated. Refresh and check."},503):!response.data?.ok?c.json({error:response.data?.error||"Sharing request failed."},[400,403,409,410,429].includes(response.data?.status)?response.data.status:503):c.json({...response.data,...extra});
  app.get(root,guard(async(c,{client,user})=>{
    const device=await accessibleNode(client,user.id);if(device===undefined)return c.json({error:"Multiple active homes require node selection."},409);
    if(!device)return c.json({device:null,members:[],link:null});
    let members=[],link=null;
    if(device.role==="owner"){
      const epoch=device.owner_since || "1970-01-01T00:00:00Z";
      const [m,l]=await Promise.all([client.from("allert_node_memberships").select("user_id,display_name,joined_at,active,blocked").eq("device_id",device.device_id).eq("owner_id",user.id).eq("owner_epoch",epoch).or("active.eq.true,blocked.eq.true").order("joined_at").limit(100),
        client.from("allert_node_share_links").select("enabled,updated_at").eq("device_id",device.device_id).eq("owner_id",user.id).eq("owner_epoch",epoch).maybeSingle()]);
      if(m.error||l.error)throw Error("Sharing unavailable");members=m.data||[];link=l.data;
    }
    if(!await currentNodeAccess(client,user.id,device))return c.json({error:"Node access changed. Refresh this screen."},409);
    return c.json({device:{device_id:device.device_id,role:device.role,owner_epoch:device.owner_since || "1970-01-01T00:00:00Z",location_label:device.location_label},members,link,members_truncated:members.length>=100});
  }));
  app.post(`${root}/link`,guard(async(c,{client,user})=>{
    const body=await c.req.json();if(typeof body?.device_id!=="string"||body.device_id.length>100||!Number.isFinite(Date.parse(body.owner_epoch)))return c.json({error:"Choose your node."},400);
    const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),value=>value.toString(16).padStart(2,"0")).join("");
    return result(c,await client.rpc("set_allert_node_share_link",{p_user_id:user.id,p_device_id:body.device_id,p_owner_epoch:body.owner_epoch,p_hash:await invitationHash(token)}),{token});
  }));
  for(const action of ["preview","join"])app.post(`${root}/${action}`,guard(async(c,{client,user})=>{
    const body=await c.req.json();if(!validInviteToken(body?.token))return c.json({error:"Open a complete invitation link."},400);
    const profile=action==="join"?await loadProfile(user.id):null;
    return result(c,await client.rpc(action==="join"?"join_allert_node_share":"preview_allert_node_share",{
      p_user_id:user.id,p_hash:await invitationHash(body.token),...(action==="join"?{p_name:typeof profile?.name==="string"?profile.name.slice(0,100):"Family member"}:{}),
    }));
  }));
  app.post(`${root}/manage`,guard(async(c,{client,user})=>{
    const body=await c.req.json();if(typeof body?.device_id!=="string"||body.device_id.length>100||!Number.isFinite(Date.parse(body.owner_epoch))||!["leave","remove_member","allow_member","disable_link"].includes(body.action)||!["leave","disable_link"].includes(body.action)&&!uuid(body.target))return c.json({error:"Choose a valid sharing action."},400);
    return result(c,await client.rpc("manage_allert_node_share",{p_actor:user.id,p_device_id:body.device_id,p_owner_epoch:body.owner_epoch,p_action:body.action,p_target:["leave","disable_link"].includes(body.action)?null:body.target}));
  }));
}
