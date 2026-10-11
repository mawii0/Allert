import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { validSnapshot } from "./environment-validation.mjs";
import { validProfile, validHealthLog, sameHealthLog } from "./account-validation.mjs";
import { assignmentKey, hasNodeAccess } from "./node-access.mjs";

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
    };

    // Independent keys prevent simultaneous diary submissions overwriting each other.
    const saved = await kv.setIfAbsent(key, logEntry);
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
    const entries = await kv.getRecentByPrefix(`health-log:v2:${user.id}:`);
    const logs = [...entries, ...legacyLogs].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 100);

    return c.json({ logs });
  } catch (error: any) {
    console.log("Health logs fetch error:", error);
    return c.json({ error: error.message || "Health logs fetch failed" }, 500);
  }
});
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
      .select("device_id, location_label, is_active")
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

    const columns =
      "id,device_id,timestamp,pm2_5,pm10,temperature,humidity," +
      "sample_count,expected_samples,pm25_stddev,data_quality_status";

    const now = new Date();
    const since = new Date(
      now.getTime() - 24 * 60 * 60 * 1000,
    ).toISOString();

    const [latestResult, historyResult] = await Promise.all([
      supabase
        .from("sensor_readings")
        .select(columns)
        .eq("device_id", device.device_id)
        .order("timestamp", { ascending: false })
        .order("id", { ascending: false })
        .limit(1),

      supabase
        .from("sensor_readings")
        .select(columns)
        .eq("device_id", device.device_id)
        .gte("timestamp", since)
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
Deno.serve(app.fetch);
