// Push only. No fetch handler, response cache, access tokens, or health records.
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
  if (message?.version !== 1 || !["test", "anomaly"].includes(message.kind) || !Number.isFinite(message.sentAt) ||
      (message.kind === "anomaly" && (typeof message.eventId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(message.eventId))) ||
      Date.now() - message.sentAt > 120000 || message.sentAt - Date.now() > 30000) return;
  const binding = await state("read");
  if (!binding || binding.id !== message.bindingId) return;
  // Text and destination are fixed locally: the payload cannot inject health data or URLs.
  const anomaly = message.kind === "anomaly";
  await self.registration.showNotification(anomaly ? "ALLERT sensor notice" : "ALLERT test notification", {
    body: anomaly ? "An unusual change was detected in your sensor measurements. Open ALLERT to review." : "Browser push is working. This is a test notification.",
    tag: anomaly ? `allert-anomaly-${message.eventId}` : "allert-test", data: { bindingId: binding.id, kind: message.kind },
  });
})()));
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const binding = await state("read");
    if (!binding || binding.id !== event.notification.data?.bindingId) return;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    const destination = event.notification.data?.kind === "anomaly" ? "/app/environmental#sensor-notices" : "/";
    if (existing) {
      if (destination !== "/" && existing.navigate) await existing.navigate(self.location.origin + destination);
      await existing.focus();
    } else await self.clients.openWindow(self.location.origin + destination);
  })());
});
