/* Original generated project defaults retained. Public-only staging overrides below. */

const defaultProjectId = "fugziwuyiecvdopdnkmn"
const defaultPublicAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1Z3ppd3V5aWVjdmRvcGRua21uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1OTY4MzksImV4cCI6MjA5MzE3MjgzOX0.bBaDprAcZKxP-lowoXeDgLscTntMlFYamjYwhETHluc"
const deployment = (import.meta.env || {}) as Record<string,string|undefined>;
const overrideProject = deployment.VITE_SUPABASE_PROJECT_ID?.trim();
const overridePublicKey = deployment.VITE_SUPABASE_PUBLIC_KEY?.trim();
if (!!overrideProject !== !!overridePublicKey) throw Error("Supply both public Supabase staging settings.");
if (overrideProject && !/^[a-z0-9-]{3,64}$/.test(overrideProject)) throw Error("Invalid Supabase project ID.");
if (overridePublicKey) {
  let publicKey = overridePublicKey.startsWith("sb_publishable_");
  if (!publicKey) {
    try { const raw=overridePublicKey.split(".")[1].replaceAll("-","+").replaceAll("_","/");publicKey=JSON.parse(atob(raw)).role==="anon"; } catch { /* reject */ }
  }
  if (!publicKey) throw Error("Frontend overrides accept only a public publishable/anon key.");
}
export const projectId = overrideProject || defaultProjectId;
export const publicAnonKey = overridePublicKey || defaultPublicAnonKey;
