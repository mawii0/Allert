import { ANOMALY_POLICY } from "./anomaly-policy.mjs";
import { processAnomalyBatch } from "./anomaly-worker.mjs";
import { adminOverview, nodeSnapshot } from "./admin-monitoring.mjs";
import { normalizeNodeLocation } from "./location-policy.mjs";

const validId = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function installAppFeatureRoutes(app, authenticate, createClient, env, send) {
  const root = "/make-server-a473accf";
  const guard = (handler, admin=false) => async c => {
    try {
      const account = await authenticate(c);
      if (account.response) return account.response;
      if (admin) {
        const role = await account.client.from("allert_admin_users").select("user_id").eq("user_id",account.user.id).eq("active",true).maybeSingle();
        if (role.error) return c.json({error:"Administrator access could not be checked. Check the admin migration."},503);
        if (!role.data) return c.json({error:"Administrator access required."},403);
      }
      return await handler(c,account);
    } catch { return c.json({error:"This feature is unavailable. Check its database migration and backend deployment."},503); }
  };
  const result = (c, response, payload) => response.error ? c.json({error:"Database request failed. Refresh and try again."},503) :
    !response.data?.ok ? c.json({error:response.data?.error || "Request could not be completed."},[400,403,404,409,429].includes(response.data?.status)?response.data.status:503) : c.json(payload(response.data));
  const ownedDevice = async(client,user) => {
    const response = await client.from("sensor_devices").select("device_id,location_label,is_active,user_id,owner_since").eq("user_id",user.id).eq("is_active",true).limit(2);
    if (response.error) throw Error("Unable to load the assigned node.");
    return response.data?.length>1 ? undefined : response.data?.[0] || null;
  };
  app.post(`${root}/alerts/process`, async c => {
    try {
      const expected=env.get("ALLERT_ALERT_WORKER_TOKEN"),actual=c.req.header("X-Allert-Worker-Token");
      if (!expected || !actual) return c.json({error:"Unauthorized"},401);
      const digest=async value=>new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
      const a=await digest(expected),b=await digest(actual);let different=0;for(let i=0;i<a.length;i++)different|=a[i]^b[i];
      if (different) return c.json({error:"Unauthorized"},401);
      if (env.get("ALLERT_ANOMALY_ALERTS_ENABLED")!=="true") return c.json({outcome:"disabled"});
      const response=await processAnomalyBatch(createClient(),env,send);
      return c.json(response,response.outcome==="partial_failure"?503:200);
    } catch { return c.json({error:"Alert processing failed. Check the worker configuration and migrations."},503); }
  });
  app.get(`${root}/alerts`,guard(async(c,{client,user})=>{
    const device=await ownedDevice(client,user);
    if(device===undefined)return c.json({error:"Multiple active nodes require node selection."},409);
    const heartbeat=await client.from("allert_alert_worker").select("last_finished_at,last_success_at,summary").eq("id",1).maybeSingle();
    if(heartbeat.error)throw heartbeat.error;
    const age=Date.now()-Date.parse(heartbeat.data?.last_success_at || "");
    const ready=env.get("ALLERT_ANOMALY_ALERTS_ENABLED")==="true" && heartbeat.data?.summary?.errors===0 && age>=0 && age<180000;
    if(!device)return c.json({device:null,events:[],detector:null,processorReady:ready});
    const epoch=device.owner_since || "1970-01-01T00:00:00.000Z";
    const [events,state]=await Promise.all([
      client.from("allert_anomaly_events").select("id,device_id,observed_at,severity,policy_version,metrics,reading,classification").eq("device_id",device.device_id).eq("user_id",user.id).eq("owner_epoch",epoch).order("observed_at",{ascending:false}).limit(30),
      client.from("allert_detector_state").select("status,baseline_count,updated_at").eq("device_id",device.device_id).eq("user_id",user.id).eq("owner_epoch",epoch).maybeSingle(),
    ]);
    if(events.error || state.error)throw Error("Alert history unavailable.");
    return c.json({device:{device_id:device.device_id},events:events.data || [],detector:state.data,processorReady:ready,policy:ANOMALY_POLICY});
  }));
  app.get(`${root}/admin/access`,guard(async(c,{client,user})=>{
    const response=await client.from("allert_admin_users").select("user_id").eq("user_id",user.id).eq("active",true).maybeSingle();
    if(response.error)throw response.error;return c.json({allowed:!!response.data});
  }));
  app.get(`${root}/admin/overview`,guard(async(c,{client})=>c.json(await adminOverview(client)),true));
  app.get(`${root}/admin/nodes/:id`,guard(async(c,{client})=>{
    const id=c.req.param("id");if(!id || id.length>200)return c.json({error:"Invalid node."},400);
    const device=await client.from("sensor_devices").select("device_id,location_label,is_active,user_id,owner_since").eq("device_id",id).maybeSingle();
    if(device.error)throw device.error;if(!device.data)return c.json({error:"Node not found."},404);
    return c.json(await nodeSnapshot(client,device.data));
  },true));
  app.get(`${root}/admin/anomalies/:id`,guard(async(c,{client})=>{
    const id=c.req.param("id");if(!validId(id))return c.json({error:"Invalid event."},400);
    const [event,reviews,deliveries]=await Promise.all([
      client.from("allert_anomaly_events").select("*").eq("id",id).maybeSingle(),
      client.from("allert_anomaly_reviews").select("revision,classification,notes,created_at").eq("event_id",id).order("revision",{ascending:false}).limit(30),
      client.from("allert_alert_deliveries").select("status,http_status,attempted_at,completed_at").eq("event_id",id).limit(10),
    ]);
    if(event.error || reviews.error || deliveries.error)throw Error("Event unavailable.");
    if(!event.data)return c.json({error:"Event not found."},404);
    return c.json({event:event.data,reviews:reviews.data || [],deliveries:deliveries.data || []});
  },true));
  app.put(`${root}/admin/anomalies/:id`,guard(async(c,{client,user})=>{
    const id=c.req.param("id"),body=await c.req.json();
    if(!validId(id) || !Number.isInteger(body.revision) || body.revision<0 || typeof body.notes!=="string" || body.notes.length>500 ||
      !["investigating","confirmed_anomaly","false_positive","sensor_artifact","external_event"].includes(body.classification))return c.json({error:"Choose a classification and keep notes within 500 characters."},400);
    const response=await client.rpc("review_allert_anomaly",{p_actor_id:user.id,p_event_id:id,p_revision:body.revision,p_classification:body.classification,p_notes:body.notes});
    return result(c,response,data=>({event:data.event}));
  },true));
  app.get(`${root}/node-location`,guard(async(c,{client,user})=>{
    const device=await ownedDevice(client,user);
    if(device===undefined)return c.json({error:"Multiple active nodes require node selection."},409);
    if(!device)return c.json({device:null,location:null});
    const response=await client.from("allert_node_locations").select("enabled,latitude,longitude,accuracy,captured_at,revision,updated_at")
      .eq("device_id",device.device_id).eq("user_id",user.id).eq("owner_epoch",device.owner_since || "1970-01-01T00:00:00.000Z").maybeSingle();
    if(response.error)throw response.error;
    return c.json({device:{device_id:device.device_id,owner_epoch:device.owner_since || "1970-01-01T00:00:00.000Z"},location:{enabled:false,revision:0,latitude:null,longitude:null,accuracy:null,captured_at:null,...response.data,label:device.location_label || "Home"}});
  }));
  app.put(`${root}/node-location`,guard(async(c,{client,user})=>{
    const body=normalizeNodeLocation(await c.req.json());if(!body)return c.json({error:"Enter a node label and confirm a fresh valid position when enabling location."},400);
    const response=await client.rpc("save_allert_node_location",{p_user_id:user.id,p_device_id:body.deviceId,p_owner_epoch:body.ownerEpoch,p_revision:body.revision,p_location:body.location});
    return result(c,response,data=>({location:data.location}));
  }));
}
