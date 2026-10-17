import {pushConfiguration} from './push-policy.mjs';
export async function automaticObservedReady(client,env,now=Date.now()){
 if(env.get('ALLERT_ANOMALY_ALERTS_ENABLED')!=='true')return false;
 try{const r=await client.from('allert_v2_worker').select('last_finished_at,summary').eq('id',1).maybeSingle();const age=now-Date.parse(r.data?.last_finished_at);return !r.error && r.data?.summary?.enabled===true && r.data?.summary?.current_errors===0 && age>=0 && age<180000;}catch{return false;}
}
export async function dispatchObservedPush(client,env,send){
 const deadline=Date.now()+40000,runId=crypto.randomUUID(),summary={processed:0,events:0,accepted:0,errors:0};
 const start=await client.rpc('begin_allert_alert_run',{p_run_id:runId});
 if(start.error || !start.data?.ok)throw Error('Delivery lease unavailable');if(start.data.outcome!=='started')return{outcome:'busy'};
 try{
    const configuration = pushConfiguration(env);
    if (configuration.ready) {
      const pending = await client.from("allert_alert_recipients").select("event_id,user_id").eq("status","pending").lte("next_attempt_at",new Date().toISOString()).order("next_attempt_at").limit(33);
      if (pending.error) throw Error("Unable to load alert delivery queue.");
      for (const eventId of [...new Set((pending.data || []).map(row=>row.event_id))].slice(0,3)) {
        if (Date.now() > deadline - 11000) break;
        const reserved = await client.rpc("reserve_allert_family_event", { p_event_id:eventId,p_vapid_key:configuration.publicKey });
        if (reserved.error || !reserved.data?.ok) { summary.errors++; continue; }
        if (reserved.data.outcome !== "reserved") continue;
        await Promise.all((reserved.data.deliveries || []).map(async delivery => {
          let status = null;
          try { status = await send(delivery.subscription,delivery.bindingId,eventId,configuration); }
          catch { /* Ambiguous transport is recorded; never blindly resend a reserved delivery. */ }
          const finished = await client.rpc("finish_allert_anomaly_push", { p_delivery_id:delivery.deliveryId,p_http_status:status });
          if (finished.error || !finished.data?.ok) summary.errors++;
          else if (status >= 200 && status < 300) summary.accepted++;
          else if (status === null || status >= 500) summary.errors++;
        }));
      }
    }

 }catch{summary.errors++;}
 const done=await client.rpc('finish_allert_alert_run',{p_run_id:runId,p_cursor:start.data.cursor || '',p_summary:summary});
 if(done.error || !done.data?.ok)throw Error('Delivery heartbeat unavailable');
 return{outcome:summary.errors?'partial_failure':'processed',...summary};
}
