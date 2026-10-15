export const notificationPreferenceKey = userId => `notification-preferences:v1:${userId}`;
export const defaultNotificationPreferences = () => ({ enabled: false, revision: 0, updatedAt: null });

export function validNotificationPreferences(value) {
  return !!value && typeof value.enabled === "boolean" &&
    Number.isInteger(value.revision) && value.revision >= 0 && value.revision <= 1000000000 &&
    (value.revision === 0 ? value.enabled === false && value.updatedAt === null :
      typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt)));
}

export function notificationPreferenceChange(body) {
  if (!body || typeof body.enabled !== "boolean" || !Number.isInteger(body.revision) || body.revision < 0 || body.revision >= 1000000000) return null;
  return { enabled: body.enabled, revision: body.revision };
}
