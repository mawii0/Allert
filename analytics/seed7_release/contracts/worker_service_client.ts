// SERVER/WORKER ONLY. Never import this module into React/Vite client code.
// For an outbound Python polling worker, call ModelRuntime directly instead.
import type { ForecastRequest, ForecastResponse } from './analytics';

export async function computePrivateForecast(
  body: ForecastRequest,
  modelServiceUrl: string,
  internalToken: string,
): Promise<ForecastResponse> {
  // Caller must already verify job/node access and query only valid available
  // history from Supabase. Do not accept arbitrary PWA history as trusted input.
  const response = await fetch(`${modelServiceUrl.replace(/\/$/, '')}/v1/forecast`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${internalToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Private inference failed (${response.status})`);
  const result = await response.json() as ForecastResponse;
  if (result.model_id !== 'median-residual-seed7-epoch15-20261013-v1' || result.forecasts.length !== 6
      || result.node_id !== body.node_id) throw new Error('Unexpected model response');
  // Persist run + six values + job completion under one deduplicated DB operation.
  // This helper does not implement persistence, retry leasing or user authorization.
  return result;
}
