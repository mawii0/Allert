import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

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
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-a473accf/health", (c) => {
  return c.json({ status: "ok" });
});

// User Registration
app.post("/make-server-a473accf/signup", async (c) => {
  try {
    const { email, password, name } = await c.req.json();

    if (!email || !password) {
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

    if (!email || !password) {
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

    const { demographic, name } = await c.req.json();

    // Update or create profile
    const existingProfile = await kv.get(`profile:${user.id}`);
    const profileData = {
      ...(existingProfile || {}),
      userId: user.id,
      email: user.email,
      ...(name && { name }),
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

    const { vasScore, tnssScore, riskLevel, notes } = await c.req.json();

    const logEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: user.id,
      date: new Date().toISOString(),
      vasScore,
      tnssScore,
      riskLevel,
      notes: notes || null,
    };

    // Get existing logs
    const existingLogs = await kv.get(`health-logs:${user.id}`) || [];

    // Add new entry at the beginning (most recent first)
    const updatedLogs = [logEntry, ...existingLogs];

    // Keep only last 100 entries
    const trimmedLogs = updatedLogs.slice(0, 100);

    await kv.set(`health-logs:${user.id}`, trimmedLogs);

    return c.json({ success: true, entry: logEntry });
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

    const logs = await kv.get(`health-logs:${user.id}`) || [];

    return c.json({ logs });
  } catch (error: any) {
    console.log("Health logs fetch error:", error);
    return c.json({ error: error.message || "Health logs fetch failed" }, 500);
  }
});

Deno.serve(app.fetch);