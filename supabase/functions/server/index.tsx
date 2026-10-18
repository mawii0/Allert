import {MODEL_ID,INDICATOR_HASH} from "./seed7-policy.mjs";
import { installSeed7ReadRoutes, observationReading } from "./seed7-read-routes.mjs";
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { validProfile, validHealthLog, sameHealthLog } from "./account-validation.mjs";
import { readingTableFor } from "./sensor-routing.mjs";
import { validEntryId, symptomSummary, visibleHealthLogs } from "./health-log-tools.mjs";
import { notificationPreferenceKey, defaultNotificationPreferences, validNotificationPreferences, notificationPreferenceChange } from "./notification-preferences.mjs";
import { installPushRoutes } from "./push-routes.mjs";
import { installAppFeatureRoutes } from "./app-feature-routes.mjs";
import { installHouseholdRoutes } from "./household-routes.mjs";
import { installClinicalRoutes } from "./clinical-routes.mjs";
import { accessibleNode, currentNodeAccess } from "./node-ownership.mjs";
import { automaticObservedReady as automaticAnomalyReady } from "./observed-dispatch.mjs";
import { pushConfiguration } from "./push-policy.mjs";
import { deliverAnomalyPush } from "./push-delivery.mjs";
import { deliverTestPush } from "./push-delivery.mjs";

import { normalizeNodeClaim } from "./node-link-validation.mjs";

const app = new Hono();

// Initialize Supabase client
const getSupabaseClient = () => {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
};

const getSupabaseAuthClient = () => {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );
};

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization","apikey", "X-Allert-Worker-Token"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Reject malformed JSON consistently before any route can create records.
app.use("/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  if (["POST", "PUT", "PATCH"].includes(c.req.method)) {
    try { await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
  }
  await next();
});

// Health check endpoint
app.get("/make-server-a473accf/health", (c) => {
  return c.json({ status: "ok", revision: "seed7-joint-policy-durable-v1", analytics_contract:MODEL_ID, indicator_policy_hash:INDICATOR_HASH });
});

// User Registration
app.post("/make-server-a473accf/signup", async (c) => {
  try {
    const { email, password, name } = await c.req.json();

    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== "string" || password.length < 6 || password.length > 200 || (name !== undefined && (typeof name !== "string" || name.length > 100))) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    const authClient = getSupabaseAuthClient();
    const { data, error } = await authClient.auth.signUp({
      email,
      password,
      options: { data: { name: name || "" } },
    });

    if (error) {
      console.log("Signup error:", error);
      return c.json({ error: error.message }, 400);
    }

    if (data.session || data.user?.email_confirmed_at) return c.json({ error: "Email confirmation must be enabled in Supabase Auth before registration can be used." }, 503);
    return c.json({ pending_verification: true, email });
  } catch (error: any) {
    console.log("Signup error:", error);
    return c.json({ error: error.message || "Signup failed" }, 500);
  }
});

app.post("/make-server-a473accf/verify-email", async (c) => {
  try {
    const { email, token } = await c.req.json();
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof token !== "string" || !/^\d{6,10}$/.test(token)) return c.json({ error: "Enter the email address and verification code." }, 400);
    const { data, error } = await getSupabaseAuthClient().auth.verifyOtp({ email, token, type: "email" });
    if (error || !data.user?.email_confirmed_at || !data.session) return c.json({ error: "The verification code is invalid or expired." }, 400);
    return c.json({ user: data.user, access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  } catch { return c.json({ error: "Email verification failed. Please try again." }, 500); }
});

app.post("/make-server-a473accf/resend-verification", async (c) => {
  try {
    const { email } = await c.req.json();
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ error: "Enter a valid email address." }, 400);
    const { error } = await getSupabaseAuthClient().auth.resend({ type: "signup", email });
    if (error) return c.json({ error: error.message }, 429);
    return c.json({ sent: true });
  } catch { return c.json({ error: "Unable to resend confirmation. Please try again." }, 500); }
});

// User Login
app.post("/make-server-a473accf/login", async (c) => {
  try {
    const { email, password } = await c.req.json();

    if (typeof email !== "string" || !email || typeof password !== "string" || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    const supabase = getSupabaseAuthClient();

    // Sign in with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.log("Login error:", error);
      return c.json({ error: error.message }, 401);
    }

    if (!data.session) {
      return c.json({ error: "Login failed - no session created" }, 401);
    }

    if (!data.user?.email_confirmed_at) return c.json({ error: "Verify your email before signing in.", verification_required: true }, 403);

    return c.json({
      user: data.user,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  } catch (error: any) {
    console.log("Login error:", error);
    return c.json({ error: error.message || "Login failed" }, 500);
  }
});

// Get or Update Patient Profile
app.post("/make-server-a473accf/profile", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    if (!accessToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const supabase = getSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error || !user?.id) {
      console.log("Auth error while updating profile:", error);
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json();
    if (!validProfile(body)) return c.json({ error: "Invalid profile" }, 400);
    const { demographic, name } = body;

    // Update or create profile
    const existingProfile = await kv.get(`profile:${user.id}`);
    const profileData = {
      ...(existingProfile || {}),
      userId: user.id,
      email: user.email,
      createdAt: existingProfile?.createdAt || new Date().toISOString(),
      demographic: existingProfile?.demographic || "adult",
      ...(name !== undefined && { name: name.trim() }),
      ...(demographic && { demographic }),
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`profile:${user.id}`, profileData);

    return c.json({ success: true, profile: profileData });
  } catch (error: any) {
    console.log("Profile update error:", error);
    return c.json({ error: error.message || "Profile update failed" }, 500);
  }
});

// Get Patient Profile
app.get("/make-server-a473accf/profile", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    if (!accessToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const supabase = getSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error || !user?.id) {
      console.log("Auth error while fetching profile:", error);
      return c.json({ error: "Unauthorized" }, 401);
    }

    const profile = await kv.get(`profile:${user.id}`);

    if (!profile) {
      return c.json({ error: "Profile not found" }, 404);
    }

    return c.json({ profile });
  } catch (error: any) {
    console.log("Profile fetch error:", error);
    return c.json({ error: error.message || "Profile fetch failed" }, 500);
  }
});

// Save Health Log Entry
app.post("/make-server-a473accf/health-logs", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    if (!accessToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const supabase = getSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error || !user?.id) {
      console.log("Auth error while saving health log:", error);
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json();
    if (!validHealthLog(body)) return c.json({ error: "Invalid symptom scores, observation time, or notes" }, 400);
    const { vasScore, tnssScore, riskLevel, notes, symptomSeverities, observedAt, requestId } = body;
    const id = requestId || crypto.randomUUID();
    const key = `health-log:v2:${user.id}:${id}`;
    const existing = await kv.get(key);
    if (existing) {
      if (existing.deletedAt) return c.json({ error: "This entry was deleted. Start a new entry to log again." }, 410);
      const same = sameHealthLog(existing, body);
      if (!same) return c.json({ error: "Request ID already belongs to a different entry" }, 409);
      return c.json({ success: true, entry: existing });
    }

    const logEntry = {
      id,
      userId: user.id,
      date: new Date().toISOString(),
      vasScore,
      tnssScore,
      riskLevel,
      notes: notes || null,
      ...(symptomSeverities && { symptomSeverities }),
      ...(observedAt && { observedAt }),
      scoreKind: "symptom_summary_not_environmental_probability",
      revision: 1,
    };

    // Independent keys prevent simultaneous diary submissions overwriting each other.
    const saved = await kv.setIfAbsent(key, logEntry);
    if (saved?.deletedAt) return c.json({ error: "This entry was deleted. Start a new entry to log again." }, 410);
    const same = sameHealthLog(saved, body);
    if (!same) return c.json({ error: "Request ID already belongs to a different entry" }, 409);
    return c.json({ success: true, entry: saved });
  } catch (error: any) {
    console.log("Health log save error:", error);
    return c.json({ error: error.message || "Health log save failed" }, 500);
  }
});

// Get Health Logs
app.get("/make-server-a473accf/health-logs", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    if (!accessToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const supabase = getSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error || !user?.id) {
      console.log("Auth error while fetching health logs:", error);
      return c.json({ error: "Unauthorized" }, 401);
    }

    return c.json(await loadVisibleDiary(user.id));
  } catch (error: any) {
    console.log("Health logs fetch error:", error);
    return c.json({ error: error.message || "Health logs fetch failed" }, 500);
  }
});

async function loadVisibleDiary(userId: string) {
  const legacyLogs = await kv.get(`health-logs:${userId}`) || [];
  const entries = await kv.getRecentByPrefix(`health-log:v2:${userId}:`, 500);
  const legacyIds = (Array.isArray(legacyLogs) ? legacyLogs : []).slice(0, 500).filter(entry => validEntryId(entry?.id));
  const overrides = legacyIds.length ? await kv.mget(legacyIds.map(entry => `health-log:v2:${userId}:${entry.id}`)) : [];
  return { logs: visibleHealthLogs([...entries, ...overrides], legacyLogs, 500), history_limit: 500, truncated: entries.length >= 500 || legacyIds.length >= 500 };
}

// Corrections use a stored revision so simultaneous edits cannot overwrite each other.
async function manageHealthLog(c: any, action: "update" | "delete") {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Please sign in." }, 401);
    const client = getSupabaseClient();
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    if (authError || !user?.id) return c.json({ error: "Session expired. Please sign in again." }, 401);
    const id = c.req.param("id");
    const body = await c.req.json();
    if (!validEntryId(id) || !Number.isInteger(body?.revision) || body.revision < 1 || body.revision > 1000000000) {
      return c.json({ error: "Invalid entry ID or revision." }, 400);
    }
    let payload = null;
    if (action === "update") {
      if (!validHealthLog(body)) return c.json({ error: "Invalid scores, observation time, or notes." }, 400);
      payload = {
        vasScore: body.vasScore, tnssScore: body.tnssScore,
        riskLevel: symptomSummary(body.vasScore, body.tnssScore),
        notes: body.notes?.trim() || null,
        ...(body.symptomSeverities && { symptomSeverities: body.symptomSeverities }),
        ...(body.observedAt && { observedAt: body.observedAt }),
        scoreKind: "symptom_summary_not_environmental_probability",
      };
    }
    const { data, error } = await client.rpc("manage_allert_health_log", {
      p_user_id: user.id, p_entry_id: id, p_expected_revision: body.revision, p_action: action, p_payload: payload,
    });
    if (error) return c.json({ error: "Unable to change entry. Check the diary migration and retry." }, 503);
    if (!data?.ok) return c.json({ error: data?.error || "Unable to change entry." }, [400,404,409,410].includes(data?.status) ? data.status : 503);
    return c.json({ success: true, entry: data.entry, deleted: data.deleted });
  } catch { return c.json({ error: "Unable to change entry. Try again later." }, 503); }
}
app.put("/make-server-a473accf/health-logs/:id", c => manageHealthLog(c, "update"));
app.delete("/make-server-a473accf/health-logs/:id", c => manageHealthLog(c, "delete"));
// Previous-model snapshots are retained as historical evidence, never as current fallback.
app.post("/make-server-a473accf/environment/publish", async c => {
 const expected=Deno.env.get("ALLERT_WORKER_TOKEN"),actual=c.req.header("X-Allert-Worker-Token");
 if(!expected || !actual)return c.json({error:"Unauthorized"},401);
 const digest=async value=>new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
 const a=await digest(expected),b=await digest(actual);let different=0;for(let i=0;i<a.length;i++)different|=a[i]^b[i];
 return different?c.json({error:"Unauthorized"},401):c.json({error:"Retired model publisher. Use durable analytics jobs."},410);
});
app.get("/make-server-a473accf/environment", async c => {
 const account=await notificationAccount(c);if(account.response)return account.response;
 return c.json({availability:"unavailable",snapshot:null});
});
// Get the logged-in user's sensor readings.
app.get("/make-server-a473accf/sensor-telemetry", async (c) => {
  c.header("Cache-Control", "no-store");

  try {
    const authorization = c.req.header("Authorization");
    const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

    if (!accessToken) {
      return c.json({ error: "Please sign in." }, 401);
    }

    const supabase = getSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return c.json(
        { error: "Session expired. Please sign in again." },
        401,
      );
    }

    const device = await accessibleNode(supabase,user.id);
    if(device===undefined)return c.json({error:"More than one active home is assigned to this account."},409);
    if(!device)return c.json({device:null,latest:null,history:[]});
    const scope = query => query.eq("device_id",device.device_id).eq("stream_id","live").eq("mode","live").eq("owner_epoch",device.owner_since || "1970-01-01T00:00:00Z");
    const [latestResult,historyResult]=await Promise.all([
      scope(supabase.from("allert_v2_observations").select("*")).order("block_end",{ascending:false}).limit(1),
      scope(supabase.from("allert_v2_observations").select("*")).gte("block_end",new Date(Date.now()-86400000).toISOString()).lte("block_end",new Date().toISOString()).order("block_end",{ascending:true}).limit(1000),
    ]);
    if (latestResult.error) throw latestResult.error;
    if (historyResult.error) throw historyResult.error;
    if (!await currentNodeAccess(supabase, user.id, device)) return c.json({error:"Node ownership changed. Refresh this screen."},409);

    return c.json({
      device,
      latest: observationReading(latestResult.data?.[0]),
      history: (historyResult.data ?? []).map(observationReading),
    });
  } catch (error) {
    console.error("Sensor telemetry error:", error);

    return c.json(
      { error: "Unable to load sensor readings." },
      500,
    );
  }
});
// Claim a node using a private setup code. User identity comes from the JWT.
app.post("/make-server-a473accf/nodes/claim", async (c) => {
  const token = c.req.header("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return c.json({ error: "Please sign in." }, 401);
  const supabase = getSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return c.json({ error: "Session expired. Please sign in again." }, 401);
  let body;
  try { body = await c.req.json(); }
  catch { return c.json({ error: "Invalid JSON." }, 400); }
  const claim = normalizeNodeClaim(body);
  if (!claim) return c.json({ error: "Enter your node ID and its 32-character setup code." }, 400);
  const existingHome=await accessibleNode(supabase,user.id);
  if(existingHome===undefined || existingHome?.role==="member")return c.json({error:"Leave your shared home before claiming a node."},409);
  const { data, error } = await supabase.rpc("claim_allert_node", {
    p_user_id: user.id,
    p_device_id: claim.device_id,
    p_setup_code: claim.setup_code,
  });
  if (error) {
    console.error("Node claim database error:", error.code);
    return c.json({ error: "Unable to link node. Check the node-linking database migration." }, 500);
  }
  if (!data?.ok) {
    const code = data?.status;
    const status = code === 429 ? 429 : code === 409 ? 409 : code === 404 ? 404 : code === 401 ? 401 : 400;
    return c.json({ error: data?.error || "Unable to link node." }, status);
  }
  return c.json({ ok: true, device_id: data.device_id, model_access_assigned: data.model_access_assigned === true });
});

// Only the authenticated owner may relinquish ownership. Uploads and stored readings remain.
app.post("/make-server-a473accf/nodes/unlink", async (c) => {
  const token = c.req.header("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return c.json({ error: "Please sign in." }, 401);
  const supabase = getSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return c.json({ error: "Session expired. Please sign in again." }, 401);
  const body = await c.req.json();
  if (typeof body?.device_id !== "string" || !/^ALLERT-NODE-\d{3}$/.test(body.device_id)) {
    return c.json({ error: "Invalid node ID." }, 400);
  }
  const { data, error } = await supabase.rpc("unlink_allert_node", { p_user_id: user.id, p_device_id: body.device_id });
  if (error) return c.json({ error: "Unable to unlink node. Try again later." }, 503);
  if (!data?.ok) return c.json({ error: data?.error || "Unable to unlink node." }, data?.status === 401 ? 401 : 403);
  return c.json({ ok: true, device_id: data.device_id });
});

// Notification intent is account-scoped; browser permission and delivery are separate.
async function notificationAccount(c: any) {
  const token = c.req.header("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { response: c.json({ error: "Please sign in." }, 401) };
  const client = getSupabaseClient();
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user?.id) return { response: c.json({ error: "Session expired. Please sign in again." }, 401) };
  return { client, user };
}
app.get("/make-server-a473accf/notification-preferences", async c => {
  try {
    const verified = await notificationAccount(c);
    if (verified.response) return verified.response;
    const stored = await kv.get(notificationPreferenceKey(verified.user.id));
    const preferences = stored === undefined || stored === null ? defaultNotificationPreferences() : stored;
    if (!validNotificationPreferences(preferences)) return c.json({ error: "Stored notification settings are invalid." }, 503);
    return c.json({ preferences, deliveryReady: pushConfiguration(Deno.env).ready && await automaticAnomalyReady(verified.client,Deno.env) });
  } catch { return c.json({ error: "Unable to load notification settings." }, 503); }
});
app.put("/make-server-a473accf/notification-preferences", async c => {
  try {
    const verified = await notificationAccount(c);
    if (verified.response) return verified.response;
    const change = notificationPreferenceChange(await c.req.json());
    if (!change) return c.json({ error: "Invalid notification preference or revision." }, 400);
    const { data, error } = await verified.client.rpc("set_allert_notification_preference", {
      p_user_id: verified.user.id, p_enabled: change.enabled, p_expected_revision: change.revision,
    });
    if (error) return c.json({ error: "Unable to save notification preference. Check the notification database migration." }, 503);
    if (!data?.ok) return c.json({ error: data?.error || "Unable to save notification preference." }, data?.status === 409 ? 409 : data?.status === 400 ? 400 : 503);
    if (!validNotificationPreferences(data.preferences)) return c.json({ error: "Invalid saved notification settings." }, 503);
    return c.json({ preferences: data.preferences, deliveryReady: pushConfiguration(Deno.env).ready && await automaticAnomalyReady(verified.client,Deno.env) });
  } catch { return c.json({ error: "Unable to save notification preference." }, 503); }
});

installPushRoutes(app, notificationAccount, Deno.env, deliverTestPush);
const getAlertWorkerClient = () => {
  const deadline = AbortSignal.timeout(45000);
  return createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input: any, init: any = {}) => fetch(input, {
      ...init, signal: init.signal ? AbortSignal.any([deadline, init.signal]) : deadline,
    }) },
  });
};
installAppFeatureRoutes(app, notificationAccount, getAlertWorkerClient, Deno.env, deliverAnomalyPush);
installClinicalRoutes(app, notificationAccount, loadVisibleDiary, userId => kv.get(`profile:${userId}`));
installHouseholdRoutes(app, notificationAccount, userId => kv.get(`profile:${userId}`));
installSeed7ReadRoutes(app, notificationAccount, Deno.env);
Deno.serve(app.fetch);
