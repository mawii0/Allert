import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { currentIndicator } from '../supabase/functions/server/seed7-policy.mjs';

await build({ entryPoints: ['src/app/components/RiskHistoryChart.tsx'], outfile: 'integration/test-output/risk-history-chart.mjs', bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', external: ['react', 'react/jsx-runtime'] });
const { riskHistoryPoints } = await import('./test-output/risk-history-chart.mjs');
const end = Date.parse('2026-10-19T12:00:00Z');
const reading = (minutes, overrides = {}) => ({ id: minutes + 100, device_id: 'NODE-1', timestamp: new Date(end - minutes * 60000).toISOString(), pm2_5: 7, pm10: 8, temperature: 28, humidity: 60, data_quality_status: 'valid', ...overrides });

test('shared history plots adult and pediatric scores only for verified, complete readings from the selected node', () => {
  const points = riskHistoryPoints([
    reading(15), reading(5), reading(5, { id: 1, pm2_5: 90 }),
    reading(10, { data_quality_status: 'invalid' }),
    reading(20, { temperature: null }),
    reading(25, { device_id: 'NODE-2' }),
    reading(1500),
  ], end, 'NODE-1');
  const expected = currentIndicator(7, 8, 28, 60);
  assert.deepEqual(points.map(point => point.time), [end - 15 * 60000, end - 5 * 60000]);
  assert.deepEqual(points.map(point => [point.adult, point.pediatric]), [
    [expected.adult.score_0_100, expected.pediatric.score_0_100],
    [expected.adult.score_0_100, expected.pediatric.score_0_100],
  ]);
});
