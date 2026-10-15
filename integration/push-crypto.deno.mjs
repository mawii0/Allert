// Optional runtime check: deno run --allow-read --allow-env integration/push-crypto.deno.mjs
// Generates ephemeral test keys only; sends no network push and prints no keys.
import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import webpush from "npm:web-push@3.6.7";
import ece from "npm:http_ece@1.2.0";
import { deliverTestPush } from "../supabase/functions/server/push-delivery.mjs";
const receiver = createECDH("prime256v1"); receiver.generateKeys();
const auth = randomBytes(16).toString("base64url");
const vapid = webpush.generateVAPIDKeys();
const binding = "11111111-1111-4111-8111-111111111111";
let calls = 0;
const status = await deliverTestPush({ endpoint: "https://fcm.googleapis.com/fcm/send/test-only", keys: { p256dh: receiver.getPublicKey().toString("base64url"), auth } }, binding,
  { ready: true, publicKey: vapid.publicKey, privateKey: vapid.privateKey, subject: "https://allert-ten.vercel.app/" },
  async (url, options) => {
    calls++;
    assert.equal(url, "https://fcm.googleapis.com/fcm/send/test-only");
    assert.equal(options.redirect, "error"); assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers["Content-Encoding"], "aes128gcm");
    assert.equal(String(options.headers.TTL), "60");
    const decrypted = ece.decrypt(Buffer.from(options.body), { version: "aes128gcm", privateKey: receiver, authSecret: auth });
    const payload = JSON.parse(decrypted.toString());
    assert.equal(payload.bindingId, binding); assert.equal(payload.kind, "test");
    assert.deepEqual(Object.keys(payload).sort(), ["bindingId", "kind", "sentAt", "version"]);
    return new Response(null, { status: 201 });
  });
assert.equal(status, 201); assert.equal(calls, 1);
console.log("PASS: Deno encrypted Web Push round trip and bounded transport; no live push sent.");
