import { createClient } from "npm:@supabase/supabase-js@2";
import { handleIngest } from "./validation.mjs";

// This endpoint authenticates physical devices, independently of browser sessions.
// The privileged key stays in Supabase. Never flash it to the node.
Deno.serve((request) => handleIngest(request, async (deviceId, hash, reading) => {
  const client = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.rpc("ingest_allert_reading", {
    p_device_id: deviceId, p_token_hash: hash, p_reading: reading,
  });
  if (error) throw new Error("Database ingestion failed");
  return data;
}));
