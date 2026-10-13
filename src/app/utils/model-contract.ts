// Proposed wire types for the partner API. These do not implement Supabase routes.
export type Population = 'adult' | 'pediatric';
export type Tier = 'low' | 'moderate' | 'high' | 'very_high';
export type Pollutant = 'pm2_5' | 'pm10';
export type Horizon = 6 | 12 | 24;
export interface HistoryBlock {
  node_id: string;
  block_start: string; // timezone-aware ISO UTC
  block_end: string;
  received_at?: string; // REQUIRED for live mode; server time, not device-supplied
  pm2_5: number; pm10: number;
  temperature_c: number; humidity_percent: number;
  quality: 'ok' | 'OK' | 'ORIGINAL';
}
export interface ForecastRequest {
  node_id: string;
  mode: 'live' | 'historical_fixture';
  forecast_origin: string;
  history: HistoryBlock[];
}
export interface ForecastValue {
  pollutant: Pollutant;
  horizon_hours: Horizon;
  value: number;
  units: 'ug/m3';
  target_block_start: string;
  target_block_end: string;
}
export interface ForecastResponse {
  status: 'ok';
  model_id: 'median-residual-single-v1';
  node_id: string;
  mode: 'live' | 'historical_fixture';
  forecast_origin: string;
  generated_at: string;
  input_last_block_end: string;
  checkpoint_sha256: string;
  device: string;
  forecasts: ForecastValue[]; // exactly six; enforce runtime validation too
  is_future_allergy_probability: false;
  trained_or_recalibrated: false;
}
export interface IndicatorValue {
  indicator_0_1: number;
  score_0_100: number;
  tier: Tier;
}
export interface RiskResponse {
  status: 'calculation_only';
  rule_id: 'environmental-indicator-v1' | 'environmental-indicator-adult-22p5-30-37p5-20261014';
  rule_sha256: string;
  adult: IndicatorValue;
  pediatric: IndicatorValue;
  not_a_symptom_probability: true;
}
export type AnalyticsAvailability =
  | 'ready' | 'warming_up' | 'insufficient_history' | 'stale'
  | 'offline' | 'unavailable' | 'invalid_input' | 'invalid_model_output';
// The Supabase/PWA read API must wrap stored values with explicit availability,
// telemetry ID, actual timestamps and user/node access. Never substitute zeros.
