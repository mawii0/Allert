import { projectId, publicAnonKey } from "/utils/supabase/info";
import { getAuthToken, getCurrentUser } from "./auth";
import { privateApi } from "./private-api";
import { requestNotificationPermission } from "./notification-permission";

type Binding = { id: string; owner: string; publicKey: string };
export const pushSupported = () => typeof window !== "undefined" && window.isSecureContext &&
  "Notification" in window && "serviceWorker" in navigator && "PushManager" in window && "locks" in navigator;
const accountIs = (owner: string | null) => {
  if (!owner || owner !== getCurrentUser().id) throw Error("Account changed. Refresh notification settings.");
};
const locked = <T,>(action: () => Promise<T>) => navigator.locks.request("allert-push", action);
const isOurWorker = (registration?: ServiceWorkerRegistration) => registration?.active?.scriptURL === new URL("/allert-sw.js", location.origin).href;

async function registration(create = false): Promise<ServiceWorkerRegistration | undefined> {
  let result = await navigator.serviceWorker.getRegistration("/");
  if (!create) return isOurWorker(result) ? result : undefined;
  if (result?.active && !isOurWorker(result)) throw Error("Another service worker uses this site. Check its deployment before connecting push.");
  result = await navigator.serviceWorker.register("/allert-sw.js", { scope: "/", updateViaCache: "none" });
  if (!result.active) {
    const worker = result.installing || result.waiting;
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => { cleanup(); reject(Error("Push worker did not activate. Refresh and try again.")); }, 10000);
      const cleanup = () => { window.clearTimeout(timer); worker?.removeEventListener("statechange", changed); };
      const changed = () => {
        if (worker?.state === "activated") { cleanup(); resolve(); }
        else if (worker?.state === "redundant") { cleanup(); reject(Error("Push worker installation failed.")); }
      };
      worker?.addEventListener("statechange", changed); changed();
    });
  }
  return result;
}
async function workerState(reg: ServiceWorkerRegistration, message: object): Promise<Binding | null> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const done = () => { window.clearTimeout(timer); channel.port1.close(); channel.port2.close(); };
    const timer = window.setTimeout(() => { done(); reject(Error("Push worker is unavailable. Refresh this page.")); }, 5000);
    channel.port1.onmessage = event => {
      done();
      if (event.data?.ok) resolve(event.data.binding || null);
      else reject(Error("Browser push storage is unavailable."));
    };
    if (!reg.active) { done(); reject(Error("Push worker is not active.")); return; }
    reg.active.postMessage(message, [channel.port2]);
  });
}
const bytes = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
const sameKey = (key: ArrayBuffer | null, expected: string) => !!key && Array.from(new Uint8Array(key)).join() === Array.from(bytes(expected)).join();

export async function browserPushConnected() {
  if (!pushSupported()) return false;
  const owner = getCurrentUser().id;
  return locked(async () => {
    const reg = await registration(); accountIs(owner);
    if (!reg) return false;
    const binding = await workerState(reg, { type: "read" }); accountIs(owner);
    const subscription = await reg.pushManager.getSubscription(); accountIs(owner);
    if (!subscription || binding?.owner !== owner || window.Notification.permission !== "granted") return false;
    const result = await privateApi<{ connected: boolean }>("/push/status", { method: "POST", body: { bindingId: binding.id } });
    accountIs(owner);
    return result.connected === true;
  });
}
export async function connectBrowser(publicKey: string) {
  if (!pushSupported()) throw Error("Connect using Chrome over HTTPS or localhost.");
  const owner = getCurrentUser().id;
  // Keep the native permission request directly attached to the button action.
  const permission = requestNotificationPermission();
  if (await permission !== "granted") throw Error("Notification permission was not granted.");
  accountIs(owner);
  return locked(async () => {
    accountIs(owner);
    const reg = (await registration(true))!; accountIs(owner);
    let binding = await workerState(reg, { type: "read" }); accountIs(owner);
    let subscription = await reg.pushManager.getSubscription(); accountIs(owner);
    if (subscription && (binding?.owner !== owner || !sameKey(subscription.options.applicationServerKey, publicKey))) {
      if (binding?.owner === owner) await privateApi("/push/subscriptions", { method: "DELETE", body: { bindingId: binding.id } });
      accountIs(owner);
      await workerState(reg, { type: "clear" });
      if (!await subscription.unsubscribe()) throw Error("The previous browser subscription could not be removed.");
      subscription = null;
    }
    accountIs(owner);
    subscription ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(publicKey) });
    accountIs(owner);
    const result = await privateApi<{ bindingId: string }>("/push/subscriptions", { method: "POST", body: { subscription: subscription.toJSON() } });
    accountIs(owner);
    if (!/^[0-9a-f-]{36}$/i.test(result.bindingId)) throw Error("Invalid browser connection response.");
    binding = { id: result.bindingId, owner: owner!, publicKey };
    await workerState(reg, { type: "save", binding });
    // A logout during the last write must also clear its result.
    if (getCurrentUser().id !== owner) { await workerState(reg, { type: "clear", owner }); throw Error("Account changed. Connect again."); }
    return true;
  });
}
export async function disconnectBrowser() {
  if (!pushSupported()) return true;
  const owner = getCurrentUser().id;
  return locked(async () => {
    accountIs(owner);
    const reg = await registration(); accountIs(owner);
    if (!reg) return true;
    const binding = await workerState(reg, { type: "read" }); accountIs(owner);
    if (binding && binding.owner !== owner) throw Error("Account changed. Refresh this page.");
    let failure;
    try {
      if (binding) await privateApi("/push/subscriptions", { method: "DELETE", body: { bindingId: binding.id } });
    } catch (error) { failure = error; }
    await workerState(reg, { type: "clear", owner });
    const subscription = await reg.pushManager.getSubscription();
    if (subscription && !await subscription.unsubscribe()) throw Error("Browser unsubscribe failed. Block this site's notification permission and reconnect later.");
    return !failure;
  });
}
export async function testBrowserPush() {
  const owner = getCurrentUser().id;
  return locked(async () => {
    accountIs(owner);
    const reg = await registration(); accountIs(owner);
    const binding = reg && await workerState(reg, { type: "read" }); accountIs(owner);
    if (!binding || binding.owner !== owner) throw Error("Connect this browser first.");
    const result = await privateApi<{ outcome: string }>("/push/test", { method: "POST", body: { bindingId: binding.id, requestId: crypto.randomUUID() } });
    accountIs(owner);
    return result.outcome;
  });
}

// Runs even when Settings is closed. Credentials never enter worker storage.
export function startPushSessionGuard() {
  if (!pushSupported()) return;
  let knownOwner = getCurrentUser().id;
  const revoke = (owner: string | null, token: string | null) => {
    void locked(async () => {
      const reg = await registration();
      if (!reg) return;
      const binding = await workerState(reg, { type: "read" });
      if (binding && owner && binding.owner !== owner) return;
      if (binding && owner && token) {
        // Captured before synchronous logout clears the session. No response can restore it.
        void fetch(`https://${projectId}.supabase.co/functions/v1/make-server-a473accf/push/subscriptions`, {
          method: "DELETE", keepalive: true, headers: { Authorization: `Bearer ${token}`, apikey: publicAnonKey, "Content-Type": "application/json" },
          body: JSON.stringify({ bindingId: binding.id }), signal: AbortSignal.timeout(10000),
        }).catch(() => {});
      }
      await workerState(reg, { type: "clear", owner });
      await (await reg.pushManager.getSubscription())?.unsubscribe();
    }).catch(() => {});
  };
  const beforeSignout = () => revoke(getCurrentUser().id, getAuthToken());
  window.addEventListener("allert-before-signout", beforeSignout);
  const sync = () => {
    const next = getCurrentUser().id;
    if (next !== knownOwner) { revoke(knownOwner, null); knownOwner = next; }
  };
  window.addEventListener("allert-session-changed", sync);
  window.addEventListener("storage", sync);
  window.addEventListener("focus", sync);
  // On a cold start, discard a binding belonging to an account no longer signed in.
  void locked(async () => {
    const reg = await registration();
    if (!reg) return;
    const binding = await workerState(reg, { type: "read" });
    if (binding && binding.owner !== getCurrentUser().id) {
      await workerState(reg, { type: "clear", owner: binding.owner });
      await (await reg.pushManager.getSubscription())?.unsubscribe();
    }
  }).catch(() => {});
  return () => {
    window.removeEventListener("allert-before-signout", beforeSignout);
    window.removeEventListener("allert-session-changed", sync);
    window.removeEventListener("storage", sync);
    window.removeEventListener("focus", sync);
  };
}
