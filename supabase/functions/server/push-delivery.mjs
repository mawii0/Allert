import { validPushSubscription } from "./push-policy.mjs";
import webpush from "npm:web-push@3.6.7";

// Build encrypted Web Push with the maintained library, then use a bounded transport.
// Static pinned import lets the Edge Function bundler include the dependency.
export async function deliverTestPush(subscription, bindingId, configuration, transport = fetch) {
  if (!configuration.ready || !validPushSubscription(subscription)) throw new Error("Invalid push configuration or subscription.");
  const payload = JSON.stringify({ version: 1, kind: "test", bindingId, sentAt: Date.now() });
  const request = webpush.generateRequestDetails(subscription, payload, {
    vapidDetails: { subject: configuration.subject, publicKey: configuration.publicKey, privateKey: configuration.privateKey },
    contentEncoding: "aes128gcm", TTL: 60, urgency: "normal",
  });
  const response = await transport(request.endpoint, {
    method: "POST", headers: request.headers, body: new Uint8Array(request.body),
    redirect: "error", signal: AbortSignal.timeout(10000),
  });
  await response.body?.cancel();
  return response.status;
}
