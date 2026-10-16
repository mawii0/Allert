// Generic offline navigation fallback only. No cached responses, tokens, or health records.
const offlineDocument = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ALLERT — Offline</title><body style="background:#09090b;color:#f4f4f5;font:16px system-ui;padding:32px;max-width:480px;margin:auto"><h1>ALLERT</h1><h2>You are offline</h2><p>Connect to the internet and reload to open your account and current readings.</p><p>No diary save or account change has been confirmed on this page.</p><button onclick="location.reload()" style="padding:12px">Try again</button></body></html>';
self.addEventListener("fetch", event => {
  if(event.request.mode!=="navigate" || new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith(fetch(event.request).catch(()=>new Response(offlineDocument,{status:503,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}})));
});
const database = () => new Promise((resolve, reject) => {
  const request = indexedDB.open("allert-push", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("state");
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function state(action, value) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("state", action === "read" ? "readonly" : "readwrite");
      const store = transaction.objectStore("state");
      let result;
      const request = store.get("binding");
      request.onsuccess = () => {
        result = request.result || null;
        if (action === "save") { result = value; store.put(value, "binding"); }
        if (action === "clear" && (!value || result?.owner === value)) { result = null; store.delete("binding"); }
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("message", event => {
  if (!event.source?.url || new URL(event.source.url).origin !== self.location.origin || !event.ports[0]) return;
  event.waitUntil((async () => {
    try {
      const { type, binding, owner } = event.data || {};
      let result;
      if (type === "read") result = await state("read");
      else if (type === "save" && typeof binding?.owner === "string" && typeof binding?.id === "string") result = await state("save", binding);
      else if (type === "clear") {
        result = await state("clear", owner);
        for (const notification of await self.registration.getNotifications()) notification.close();
      } else throw Error("Invalid push state message.");
      event.ports[0].postMessage({ ok: true, binding: result });
    } catch { event.ports[0].postMessage({ ok: false }); }
  })());
});
self.addEventListener("push", event => event.waitUntil((async () => {
  let message;
  try { message = event.data?.json(); } catch { return; }
  if (message?.version !== 1 || !["test", "anomaly", "forecast"].includes(message.kind) || !Number.isFinite(message.sentAt) ||
      ((message.kind === "anomaly" || message.kind === "forecast") && (typeof message.eventId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(message.eventId))) ||
      Date.now() - message.sentAt > 120000 || message.sentAt - Date.now() > 30000) return;
  const binding = await state("read");
  if (!binding || binding.id !== message.bindingId) return;
  // Text and destination are fixed locally: the payload cannot inject health data or URLs.
  const anomaly = message.kind === "anomaly", forecast = message.kind === "forecast";
  await self.registration.showNotification(anomaly ? "ALLERT sensor notice" : forecast ? "ALLERT forecast notice" : "ALLERT test notification", {
    body: anomaly ? "An unusual change was detected in your sensor measurements. Open ALLERT to review." : forecast ? "A verified environmental forecast reached an alert tier. Open ALLERT to review." : "Browser push is working. This is a test notification.",
    tag: anomaly ? `allert-anomaly-${message.eventId}` : forecast ? `allert-forecast-${message.eventId}` : "allert-test", data: { bindingId: binding.id, kind: message.kind },
  });
})()));
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const binding = await state("read");
    if (!binding || binding.id !== event.notification.data?.bindingId) return;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    const destination = event.notification.data?.kind === "anomaly" ? "/app/environmental#sensor-notices" : event.notification.data?.kind === "forecast" ? "/app/environmental#forecast-notices" : "/";
    if (existing) {
      if (destination !== "/" && existing.navigate) await existing.navigate(self.location.origin + destination);
      await existing.focus();
    } else await self.clients.openWindow(self.location.origin + destination);
  })());
});
