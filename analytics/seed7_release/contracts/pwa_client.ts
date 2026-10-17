// FRONTEND TEMPLATE: replace demo values only after these Supabase routes exist.
// Pass a current Supabase USER access token; never the private model API token.
export function createEnvironmentClient(
  baseUrl: string,
  getAccessToken: () => Promise<string>,
) {
  async function get<T>(path: string): Promise<T> {
    const token = await getAccessToken();
    if (!token) throw new Error('Sign in again');
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (response.status === 401) throw new Error('Session expired; refresh or sign in');
    if (!response.ok) throw new Error(`Environment request failed (${response.status})`);
    return await response.json() as T; // Add actual runtime schema validation.
  }
  const nodePath = (id: string) => `/v1/nodes/${encodeURIComponent(id)}`;
  return {
    current: <T>(id: string) => get<T>(`${nodePath(id)}/current`),
    status: <T>(id: string) => get<T>(`${nodePath(id)}/status`),
    forecasts: <T>(id: string) => get<T>(`${nodePath(id)}/forecasts/latest`),
    observedAlerts: <T>(id: string) => get<T>(`${nodePath(id)}/alerts`),
    history: <T>(id: string, from: string, to: string) => get<T>(
      `${nodePath(id)}/history?${new URLSearchParams({ from, to })}`),
  };
}
// Initial hooks can poll/refetch these methods with timestamps and availability.
// The baseUrl is the existing authorized Supabase application function, not
// localhost:8000. This template is not wired into the actual partner React repo.
