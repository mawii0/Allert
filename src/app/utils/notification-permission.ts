export type BrowserNotificationPermission = NotificationPermission | "unsupported" | "insecure";

export function notificationPermission(): BrowserNotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (!window.isSecureContext) return "insecure";
  return window.Notification.permission;
}

// Invoke from a switch/button action, before awaiting any network request.
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  const permission = notificationPermission();
  if (permission === "unsupported") throw new Error("Notifications are unavailable in this browser.");
  if (permission === "insecure") throw new Error("Open ALLERT over HTTPS or localhost to request notification permission.");
  if (permission === "denied") throw new Error("Notifications are blocked. Change this site's notification permission in your browser settings.");
  return permission === "granted" ? permission : window.Notification.requestPermission();
}

export function notificationStatus(enabled: boolean, permission: BrowserNotificationPermission): string {
  if (permission === "unsupported") return "Notifications are unavailable in this browser.";
  if (permission === "insecure") return "Use HTTPS or localhost for browser permission.";
  if (permission === "denied") return "Blocked in this browser. Change the site's browser permission to allow notifications.";
  if (!enabled) return "Off for your account.";
  return permission === "granted"
    ? "Account preference on; browser permission granted."
    : "Account preference on; permission is needed in this browser.";
}
