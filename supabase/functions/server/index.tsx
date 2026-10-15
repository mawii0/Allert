import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { validSnapshot } from "./environment-validation.mjs";
import { validProfile, validHealthLog, sameHealthLog } from "./account-validation.mjs";
import { assignmentKey, hasNodeAccess } from "./node-access.mjs";
import { readingTableFor } from "./sensor-routing.mjs";
import { validEntryId, symptomSummary, visibleHealthLogs } from "./health-log-tools.mjs";
import { notificationPreferenceKey, defaultNotificationPreferences, validNotificationPreferences, notificationPreferenceChange } from "./notification-preferences.mjs";
import { installPushRoutes } from "./push-routes.mjs";
import { deliverTestPush } from "./push-delivery.mjs";

import { normalizeNodeClaim } from "./node-link-validation.mjs";
import {
  buildMonitor,
  modelPayload,
  validModelForecast,
  median,
  modelInputStatus,
} from "./risk-monitor.mjs";

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
  return c.json({ status: "ok", revision: "persistent-node-assignment-v1" });
});

// User Registration
app.post("/make-server-a473accf/signup", async (c) => {
  try {
    const { email, password, name } = await c.req.json();

    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== "string" || password.length < 6 || password.length > 200 || (name !== undefined && (typeof name !== "string" || name.length > 100))) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    const supabase = getSupabaseClient();

    // Create user with Supabase Auth
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name: name || "" },
      // Automatically confirm email since email server hasn't been configured
      email_confirm: true,
    });

    if (error) {
      console.log("Signup error:", error);
      return c.json({ error: error.message }, 400);
    }

    // Store user profile in KV store
    if (data.user) {
      await kv.set(`profile:${data.user.id}`, {
        userId: data.user.id,
        email: data.user.email,
        name: name || "",
        demographic: "adult",
        createdAt: new Date().toISOString(),
      });
    }

    // Sign in the user to get access token
    const authClient = getSupabaseAuthClient();
    const { data: sessionData, error: signInError } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !sessionData.session) {
      return c.json({ error: "User created but login failed. Please try logging in." }, 500);
    }

    return c.json({
      user: data.user,
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
    });
  } catch (error: any) {
    console.log("Signup error:", error);
    return c.json({ error: error.message || "Signup failed" }, 500);
  }
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

    const legacyLogs = await kv.get(`health-logs:${user.id}`) || [];
    const entries = await kv.getRecentByPrefix(`health-log:v2:${user.id}:`, 500);
    const legacyIds = (Array.isArray(legacyLogs) ? legacyLogs : []).slice(0, 500).filter(entry => validEntryId(entry?.id));
    const overrides = legacyIds.length ? await kv.mget(legacyIds.map(entry => `health-log:v2:${user.id}:${entry.id}`)) : [];
    const logs = visibleHealthLogs([...entries, ...overrides], legacyLogs, 500);

    return c.json({ logs, history_limit: 500, truncated: entries.length >= 500 });
  } catch (error: any) {
    console.log("Health logs fetch error:", error);
    return c.json({ error: error.message || "Health logs fetch failed" }, 500);
  }
});

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
// Initial single-node staging bridge. Replace this cache with reviewed durable
// telemetry/jobs/run tables before operating continuous live analytics.
app.post("/make-server-a473accf/environment/publish", async (c) => {
  const expected = Deno.env.get("ALLERT_WORKER_TOKEN");
  const actual = c.req.header("X-Allert-Worker-Token");
  if (!expected || !actual) return c.json({ error: "Unauthorized" }, 401);
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const a = await digest(actual), b = await digest(expected);
  let different = 0;
  for (let i = 0; i < a.length; i++) different |= a[i] ^ b[i];
  if (different) return c.json({ error: "Unauthorized" }, 401);
  let snapshot;
  try { snapshot = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
  if (!validSnapshot(snapshot)) return c.json({ error: "Invalid model snapshot" }, 400);
  await kv.set(`environment:v1:${snapshot.mode}`, snapshot);
  return c.json({ status: "stored", mode: snapshot.mode });
});

app.get("/make-server-a473accf/environment", async (c) => {
  const token = c.req.header("Authorization")?.split(" ")[1];
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  const { data: { user }, error } = await getSupabaseClient().auth.getUser(token);
  if (error || !user) return c.json({ error: "Unauthorized" }, 401);
  const assignment = await kv.get(assignmentKey(user.id));
  if (!hasNodeAccess(assignment, user.id)) return c.json({ error: "Node access has not been assigned", code: assignment ? "node_assignment_invalid" : "node_assignment_missing" }, 403);
  const mode = Deno.env.get("ALLERT_DISPLAY_REPLAY") === "true" ? "historical_fixture" : "live";
  const snapshot = await kv.get(`environment:v1:${mode}`);
  if (!snapshot) return c.json({ availability: "unavailable", snapshot: null });
  if (!validSnapshot(snapshot)) return c.json({ error: "Stored model data is invalid" }, 503);
  const stale = Date.now() - Date.parse(snapshot.current.block_end) > 15 * 60000;
  c.header("Cache-Control", "no-store");
  return c.json({ availability: mode === "historical_fixture" ? "historical_replay" : stale ? "stale" : "ready", snapshot });
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

    const { data: devices, error: deviceError } = await supabase
      .from("sensor_devices")
      .select("device_id, location_label, is_active, owner_since")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(2);

    if (deviceError) throw deviceError;

    if (!devices?.length) {
      return c.json({
        device: null,
        latest: null,
        history: [],
      });
    }

    if (devices.length > 1) {
      return c.json(
        { error: "More than one active node is assigned to this account." },
        409,
      );
    }

    const device = devices[0];
    const readingTable = await readingTableFor(supabase, device.device_id);

    const columns =
      "id,device_id,timestamp,pm2_5,pm10,temperature,humidity," +
      "sample_count,expected_samples,pm25_stddev,data_quality_status";

    const now = new Date();
    const since = new Date(
      now.getTime() - 24 * 60 * 60 * 1000,
    ).toISOString();

    const [latestResult, historyResult] = await Promise.all([
      supabase
        .from(readingTable)
        .select(columns)
        .eq("device_id", device.device_id)
        .gte("timestamp", device.owner_since ?? "1970-01-01T00:00:00Z")
        .order("timestamp", { ascending: false })
        .order("id", { ascending: false })
        .limit(1),

      supabase
        .from(readingTable)
        .select(columns)
        .eq("device_id", device.device_id)
        .gte("timestamp", since)
        .gte("timestamp", device.owner_since ?? "1970-01-01T00:00:00Z")
        .lte("timestamp", now.toISOString())
        .order("timestamp", { ascending: true })
        .order("id", { ascending: true })
        .limit(1000),
    ]);

    if (latestResult.error) throw latestResult.error;
    if (historyResult.error) throw historyResult.error;

    return c.json({
      device,
      latest: latestResult.data?.[0] ?? null,
      history: historyResult.data ?? [],
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
// Build Risk Monitor results from the user's authorized telemetry.
app.get("/make-server-a473accf/risk-monitor", async (c) => {
  c.header("Cache-Control", "no-store");

  try {
    const response = await app.request(
      "https://internal/make-server-a473accf/sensor-telemetry",
      {
        headers: {
          Authorization: c.req.header("Authorization") ?? "",
        },
      },
    );

    const telemetry = await response.json();

    if (!response.ok) {
      return c.json(telemetry, response.status);
    }

    const now = Date.now();
    let model = null;
    let modelStatus = "warming_up";
    let inputStatus = null;

    const current = buildMonitor(telemetry, null, now);
    const configuredSensor = Deno.env.get("ALLERT_FORECAST_SENSOR_ID");

    if (
      current.availability === "ready" &&
      telemetry.device.device_id === configuredSensor
    ) {
      const origin =
        Math.floor(Date.parse(telemetry.latest.timestamp) / 900000) * 900000;

      if (now - origin <= 600000) {
        const cacheKey = `sensor-model:v1:${configuredSensor}`;
        const cached = await kv.get(cacheKey);

        if (
          validModelForecast(cached, configuredSensor, now) &&
          Date.parse(cached.forecast_origin) === origin
        ) {
          model = cached;
        } else {
          const since = new Date(origin - 54 * 3600000).toISOString();

          const { data: rows, error } = await getSupabaseClient()
            .from(await readingTableFor(getSupabaseClient(), configuredSensor))
            .select(
              "device_id,timestamp,pm2_5,pm10,temperature,humidity," +
              "sample_count,expected_samples,data_quality_status,created_at",
            )
            .eq("device_id", configuredSensor)
            .gte("timestamp", telemetry.device.owner_since ?? "1970-01-01T00:00:00Z")
            .gt("timestamp", since)
            .lte("timestamp", new Date(origin + 299999).toISOString())
            .order("timestamp", { ascending: true })
            .limit(4096);

          if (error) throw error;

          inputStatus = modelInputStatus(rows ?? [], origin, now);
          modelStatus = inputStatus.status;
          const payload = modelPayload(rows ?? [], origin, now);

          if (payload) {
            modelStatus = "unavailable";

            const base = Deno.env.get("ALLERT_MODEL_BASE_URL");
            const token = Deno.env.get("ALLERT_MODEL_API_TOKEN");

            if (base?.startsWith("https://") && token) {
              try {
                const reply = await fetch(
                  base.replace(/\/$/, "") + "/v1/forecast",
                  {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${token}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(20000),
                  },
                );

                const forecast = await reply.json();
                if (!forecast || typeof forecast !== "object" || Array.isArray(forecast)) throw new Error("Invalid model response");
                forecast.sensor_device_id = configuredSensor;
                modelStatus = reply.ok ? "model_output_unverified" : "model_service_error";

                if (
                  reply.ok &&
                  validModelForecast(forecast, configuredSensor, now)
                ) {
                  const last = payload.history.slice(-12);

                  forecast.input_baseline = {
                    pm2_5: median(last.map((r) => r.pm2_5)),
                    pm10: median(last.map((r) => r.pm10)),
                    temperature: median(last.map((r) => r.temperature_c)),
                    humidity: median(last.map((r) => r.humidity_percent)),
                    reading_count: 12,
                    expected_readings: 12,
                    available_minutes: 60,
                    window_start: new Date(origin - 3600000).toISOString(),
                    window_end: new Date(origin).toISOString(),
                  };

                  model = forecast;
                  await kv.set(cacheKey, forecast);
                }
              } catch {
                // Keep the median estimate while model inference retries.
              }
            } else modelStatus = "model_not_configured";
          }
        }
      } else {
        modelStatus = "waiting_for_model_grid";
      }
    } else if (current.availability === "ready") {
      modelStatus = "sensor_not_enabled_for_model";
    }

    return c.json({ ...buildMonitor(telemetry, model, now, modelStatus), model_input: inputStatus });
  } catch {
    return c.json(
      { error: "Unable to load risk monitor readings." },
      503,
    );
  }
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
    return c.json({ preferences, deliveryReady: false });
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
    return c.json({ preferences: data.preferences, deliveryReady: false });
  } catch { return c.json({ error: "Unable to save notification preference." }, 503); }
});

installPushRoutes(app, notificationAccount, Deno.env, deliverTestPush);
Deno.serve(app.fetch);
