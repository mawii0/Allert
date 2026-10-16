import { correlateSymptoms, forecastEvidence } from "./clinical-correlation.mjs";
import { accessibleNode, currentNodeAccess } from "./node-ownership.mjs";

export async function archiveForecastEvidence(client, user, device, monitor) {
  const rows = forecastEvidence(monitor);
  if (!rows.length) return "not_eligible";
  try {
    const result = await client.rpc("record_allert_forecast_evidence", { p_user_id: user.id, p_device_id: device.device_id,
      p_owner_epoch: device.owner_since || "1970-01-01T00:00:00Z", p_forecasts: rows });
    return !result.error && result.data?.ok ? "stored" : "unavailable";
  } catch { return "unavailable"; }
}
export function installClinicalRoutes(app, authenticate, loadDiary, loadProfile) {
  app.get("/make-server-a473accf/clinical-correlation", async c => {
    c.header("Cache-Control", "no-store");
    try {
      const account = await authenticate(c); if (account.response) return account.response;
      const days = Number(c.req.query("days") || 30), horizon = Number(c.req.query("horizon") || 6);
      if (![7,30,90].includes(days) || ![6,12,24].includes(horizon)) return c.json({error:"Choose a supported period and forecast horizon."},400);
      const { client, user } = account;
      const device=await accessibleNode(client,user.id);
      if(device===undefined)return c.json({error:"Multiple active homes require node selection."},409);
      if(!device)return c.json({device:null,analysis:null});
      const epoch=device.owner_since || "1970-01-01T00:00:00Z";
      const [diary, profile, forecasts] = await Promise.all([
        loadDiary(user.id), loadProfile(user.id),
        client.from("allert_forecast_evidence").select("id,device_id,owner_epoch,origin,target,captured_at,horizon_hours,population,score,tier,policy_hash")
          .eq("user_id",user.id).eq("device_id",device.device_id).eq("owner_epoch",epoch).eq("horizon_hours",horizon).gte("captured_at",device.access_since || epoch)
          .gte("target",new Date(Date.now()-days*86400000-900000).toISOString()).lte("target",new Date().toISOString())
          .order("target",{ascending:false}).limit(18001),
      ]);
      if (forecasts.error) throw forecasts.error;
      if (!profile || !["adult","pediatric"].includes(profile.demographic)) return c.json({error:"Save your patient category in Settings before viewing correlation."},409);
      if (!await currentNodeAccess(client,user.id,device)) return c.json({error:"Node ownership changed. Refresh this screen."},409);
      const analysis = correlateSymptoms(diary.logs, forecasts.data || [], { deviceId:device.device_id,ownerEpoch:epoch,accessSince:device.access_since,population:profile.demographic,horizon,days });
      return c.json({device:{device_id:device.device_id},analysis,history_truncated:diary.truncated || forecasts.data?.length >= 18001,
        collection:"Verified live forecasts are saved by the enabled background collector and when Risk Monitor loads. Collection requires an available model and eligible input. Historical forecasts are not reconstructed."});
    } catch { return c.json({error:"Correlation could not be loaded. Check its migration and backend deployment."},503); }
  });
}
