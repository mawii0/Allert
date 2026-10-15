import { projectId, publicAnonKey } from "/utils/supabase/info";

export interface RecoverySession { accessToken: string; userId: string; email: string; expiresAt: number; }
export class RecoveryError extends Error {
  constructor(message: string, public status = 0, public code = "") { super(message); this.name = "RecoveryError"; }
}
export const recoveryEmail = (value: string) => value.trim().toLowerCase();
export function validRecoveryEmail(value: string) {
  return typeof value === "string" && value.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
export function recoveryPasswordError(password: string, confirmation: string) {
  if (password.length < 6 || password.length > 200) return "Use a password between 6 and 200 characters.";
  if (password !== confirmation) return "The passwords do not match.";
  return "";
}

// Recovery never uses the app's existing access/refresh tokens or persistent storage.
async function authRequest(path: string, options: { method: string; body?: object; token?: string; signal?: AbortSignal; timeout?: number }) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, options.timeout || 15000);
  try {
    const response = await fetch(`https://${projectId}.supabase.co/auth/v1${path}`, {
      method: options.method, cache: "no-store", redirect: "error", signal: controller.signal,
      headers: { apikey: publicAnonKey, "Content-Type": "application/json", ...(options.token && { Authorization: `Bearer ${options.token}` }) },
      ...(options.body && { body: JSON.stringify(options.body) }),
    });
    const raw = await response.text();
    let result: any;
    try { result = raw ? JSON.parse(raw) : null; }
    catch { throw new RecoveryError("The recovery service returned an unreadable response. Try again later.", response.status); }
    if (!response.ok) {
      const code = typeof result?.error_code === "string" ? result.error_code : typeof result?.code === "string" ? result.code : "";
      const message = response.status === 429 ? "Too many recovery attempts. Wait before trying again." :
        code === "same_password" ? "Choose a password different from your current password." :
        code === "weak_password" ? "This password does not meet your account's password requirements. Choose a stronger password." :
        path === "/verify" ? "The recovery code is invalid or expired. Check it or request a new code." :
        path === "/user" && [401, 403].includes(response.status) ? "Recovery session expired. Request a new code." :
        "The recovery request could not be completed. Check your connection and try again later.";
      throw new RecoveryError(message, response.status, code);
    }
    return result;
  } catch (error) {
    if (error instanceof RecoveryError) throw error;
    throw new RecoveryError(controller.signal.aborted ? "The recovery request timed out or was cancelled. Try again." : "Unable to reach the recovery service. Check your connection and try again.");
  } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); }
}

export async function requestRecoveryCode(email: string, signal?: AbortSignal) {
  if (!validRecoveryEmail(email)) throw new RecoveryError("Enter a valid email address.");
  try { await authRequest("/recover", { method: "POST", body: { email: recoveryEmail(email) }, signal }); }
  catch (error) {
    // Keep the UI response independent of whether an account exists.
    if (error instanceof RecoveryError && ["user_not_found", "email_not_confirmed"].includes(error.code)) return;
    throw error;
  }
}
export async function verifyRecoveryCode(email: string, code: string, signal?: AbortSignal): Promise<RecoverySession> {
  if (!validRecoveryEmail(email)) throw new RecoveryError("Enter a valid email address.");
  const token = code.replace(/\s/g, "");
  if (!/^\d{6,10}$/.test(token)) throw new RecoveryError("Enter the numeric recovery code from your email.");
  const result = await authRequest("/verify", { method: "POST", body: { email: recoveryEmail(email), token, type: "recovery" }, signal });
  const accessToken = result?.access_token;
  let expiry = 0;
  try { expiry = JSON.parse(atob(accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp * 1000; } catch { /* Reject below. */ }
  if (typeof accessToken !== "string" || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(accessToken) ||
      typeof result?.user?.id !== "string" || typeof result?.user?.email !== "string" || recoveryEmail(result.user.email) !== recoveryEmail(email) ||
      !Number.isFinite(expiry) || expiry <= Date.now()) throw new RecoveryError("Unable to verify the recovery session. Request a new code.");
  return { accessToken, userId: result.user.id, email: result.user.email, expiresAt: Math.min(expiry, Date.now() + 15 * 60 * 1000) };
}
export async function closeRecoverySession(session: RecoverySession) {
  try { await authRequest("/logout?scope=local", { method: "POST", token: session.accessToken, timeout: 5000 }); } catch { /* No credential is retained locally. */ }
}
export async function resetRecoveredPassword(session: RecoverySession, password: string, confirmation: string, signal?: AbortSignal) {
  const invalid = recoveryPasswordError(password, confirmation);
  if (invalid) throw new RecoveryError(invalid);
  if (!session || session.expiresAt <= Date.now()) throw new RecoveryError("Recovery session expired. Request a new code.", 401);
  const result = await authRequest("/user", { method: "PUT", body: { password }, token: session.accessToken, signal });
  if (result?.id !== session.userId) throw new RecoveryError("The password update could not be confirmed. Try signing in before requesting another code.");
  // Password success stays success even if subsequent session cleanup is unavailable.
  let sessionsRevoked = true;
  try { await authRequest("/logout?scope=global", { method: "POST", token: session.accessToken, signal }); }
  catch { sessionsRevoked = false; }
  return { sessionsRevoked };
}
