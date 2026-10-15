import { defaultQuietHours, validQuietHours, validPushId, validPushSubscription, pushConfiguration } from "./push-policy.mjs";

export function installPushRoutes(app, authenticate, env, send) {
  const root = "/make-server-a473accf/push";
  const guard = handler => async c => {
    try {
      const account = await authenticate(c);
      if (account.response) return account.response;
      return await handler(c, account);
    } catch { return c.json({ error: "Push request failed. Check the backend deployment and try again." }, 503); }
  };
  const failure = (c, data, error) => error ? c.json({ error: "Push database unavailable. Check the push migration." }, 503) :
    !data?.ok ? c.json({ error: data?.error || "Push request could not be completed." }, [400, 403, 404, 409, 429].includes(data?.status) ? data.status : 503) : null;

  app.get(root, guard(async (c, { client, user }) => {
    const { data, error } = await client.from("allert_push_settings").select("quiet_enabled,quiet_start,quiet_end,revision").eq("user_id", user.id).maybeSingle();
    if (error) return c.json({ error: "Push database unavailable. Check the push migration." }, 503);
    const config = pushConfiguration(env);
    const quietHours = data ? { enabled: data.quiet_enabled, start: data.quiet_start, end: data.quiet_end, revision: data.revision, timezone: "Asia/Manila" } : defaultQuietHours();
    return c.json({ configured: config.ready, publicKey: config.publicKey, quietHours, automaticAlertsReady: false });
  }));
  app.put(`${root}/quiet-hours`, guard(async (c, { client, user }) => {
    const body = await c.req.json();
    if (!validQuietHours(body)) return c.json({ error: "Choose different start and end times and refresh the saved revision." }, 400);
    const { data, error } = await client.rpc("set_allert_quiet_hours", {
      p_user_id: user.id, p_enabled: body.enabled, p_start: body.start, p_end: body.end, p_revision: body.revision,
    });
    return failure(c, data, error) || c.json({ quietHours: data.quietHours });
  }));
  app.post(`${root}/status`, guard(async (c, { client, user }) => {
    const { bindingId } = await c.req.json();
    if (!validPushId(bindingId)) return c.json({ error: "Invalid browser connection." }, 400);
    const { data, error } = await client.from("allert_push_subscriptions").select("id,vapid_key").eq("user_id", user.id).eq("id", bindingId).maybeSingle();
    if (error) return c.json({ error: "Unable to check browser connection." }, 503);
    const config = pushConfiguration(env);
    return c.json({ connected: !!data && config.ready && data.vapid_key === config.publicKey });
  }));
  app.post(`${root}/subscriptions`, guard(async (c, { client, user }) => {
    const config = pushConfiguration(env);
    if (!config.ready) return c.json({ error: "Push keys are not configured in Supabase Secrets." }, 503);
    const body = await c.req.json();
    if (!validPushSubscription(body.subscription)) return c.json({ error: "This subscription is not supported. Connect using Windows Chrome." }, 400);
    const { endpoint, keys } = body.subscription;
    const { data, error } = await client.rpc("connect_allert_push", {
      p_user_id: user.id, p_subscription: { endpoint, keys: { auth: keys.auth, p256dh: keys.p256dh } }, p_vapid_key: config.publicKey,
    });
    return failure(c, data, error) || c.json({ bindingId: data.bindingId });
  }));
  app.delete(`${root}/subscriptions`, guard(async (c, { client, user }) => {
    const { bindingId } = await c.req.json();
    if (!validPushId(bindingId)) return c.json({ error: "Invalid browser connection." }, 400);
    const { error } = await client.from("allert_push_subscriptions").delete().eq("user_id", user.id).eq("id", bindingId);
    return error ? c.json({ error: "Unable to disconnect this browser." }, 503) : c.json({ ok: true });
  }));
  app.post(`${root}/test`, guard(async (c, { client, user }) => {
    const { bindingId, requestId } = await c.req.json();
    if (!validPushId(bindingId) || !validPushId(requestId)) return c.json({ error: "Invalid test request." }, 400);
    const config = pushConfiguration(env);
    if (!config.ready) return c.json({ error: "Push keys are not configured in Supabase Secrets." }, 503);
    // Atomic owner, preference, quiet-hour, replay and rate checks happen before transport.
    const { data, error } = await client.rpc("reserve_allert_test_push", { p_user_id: user.id, p_binding_id: bindingId, p_request_id: requestId, p_vapid_key: config.publicKey });
    const rejected = failure(c, data, error);
    if (rejected) return rejected;
    if (data.outcome !== "reserved") return c.json({ outcome: data.outcome });
    let status;
    try { status = await send(data.subscription, bindingId, config); }
    catch { return c.json({ error: "Delivery could not be confirmed. Check Chrome, then wait 60 seconds before another test." }, 502); }
    if (status === 404 || status === 410) {
      await client.from("allert_push_subscriptions").delete().eq("user_id", user.id).eq("id", bindingId);
      return c.json({ error: "This browser subscription expired. Disconnect and connect this browser again." }, 410);
    }
    if (status < 200 || status >= 300) return c.json({ error: "The push service rejected the test. Check the VAPID keys and reconnect this browser." }, 502);
    return c.json({ outcome: "accepted" });
  }));
}
