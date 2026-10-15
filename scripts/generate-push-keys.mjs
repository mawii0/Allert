import { createECDH } from "node:crypto";
// Run locally once; copy these values into Supabase Secrets, never into frontend code.
const key = createECDH("prime256v1");
key.generateKeys();
console.log("ALLERT_VAPID_PUBLIC_KEY=" + key.getPublicKey().toString("base64url"));
console.log("ALLERT_VAPID_PRIVATE_KEY=" + key.getPrivateKey().toString("base64url"));
console.log("ALLERT_VAPID_SUBJECT=https://allert-ten.vercel.app/");
