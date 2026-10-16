// Only known browser push providers; never accept arbitrary fetch URLs.
export function validPushSubscription(value) {
  if (!value || typeof value.endpoint !== "string" || value.endpoint.length > 2048) return false;
  try {
    const url = new URL(value.endpoint);
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash ||
        !((url.hostname === "fcm.googleapis.com" && /^\/(?:fcm\/send|wp)\/[A-Za-z0-9_:.-]+$/.test(url.pathname)) ||
          (url.hostname === "updates.push.services.mozilla.com" && /^\/wpush\/v[12]\/[A-Za-z0-9_=-]+$/.test(url.pathname)) ||
          (url.hostname === "web.push.apple.com" && /^\/[A-Za-z0-9_-]+$/.test(url.pathname)))) return false;
    const decode = (text, length) => typeof text === "string" && /^[A-Za-z0-9_-]+$/.test(text) &&
      atob(text.replace(/-/g, "+").replace(/_/g, "/")).length === length;
    return decode(value.keys?.p256dh, 65) && atob(value.keys.p256dh.replace(/-/g, "+").replace(/_/g, "/")).charCodeAt(0) === 4 && decode(value.keys?.auth, 16);
  } catch { return false; }
}
export const validPushId = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const defaultQuietHours = () => ({ enabled: false, start: "22:00", end: "07:00", revision: 0, timezone: "Asia/Manila" });
export function pushConfiguration(env) {
  const publicKey = env.get("ALLERT_VAPID_PUBLIC_KEY") || "";
  const privateKey = env.get("ALLERT_VAPID_PRIVATE_KEY") || "";
  const subject = env.get("ALLERT_VAPID_SUBJECT") || "";
  const ready = /^[A-Za-z0-9_-]{87}$/.test(publicKey) && /^[A-Za-z0-9_-]{43}$/.test(privateKey) &&
    (/^mailto:[^\s@]+@[^\s@]+$/.test(subject) || /^https:\/\/[^\s]+$/.test(subject));
  return { ready, publicKey: ready ? publicKey : null, privateKey, subject };
}
export function validQuietHours(value) {
  const time = value => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  return !!value && typeof value.enabled === "boolean" && time(value.start) && time(value.end) && value.start !== value.end &&
    Number.isInteger(value.revision) && value.revision >= 0 && value.revision <= 1000000000;
}
