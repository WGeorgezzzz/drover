import assert from 'node:assert/strict';
import test from 'node:test';
import { antigravityModelStatus, recordAntigravityModelResult } from '../list/gemini/antigravity-model-status.js';

test('catalog membership never implies quota or successful inference', () => {
  const result = antigravityModelStatus('catalog-only');
  assert.equal(result.status, 'unknown');
  assert.equal(result.remainingPercent, null);
  assert.equal(result.resetsAt, null);
  assert.equal(result.checkedAt, null);
});

test('Antigravity outcomes distinguish models, quota, throttling and failures', () => {
  recordAntigravityModelResult('carbon-test', 'quota exhausted');
  recordAntigravityModelResult('hydrogen-test');
  recordAntigravityModelResult('argon-test', '429 too many requests');
  recordAntigravityModelResult('unsupported-test', 'model not supported');
  recordAntigravityModelResult('network-test', 'network timeout');
  assert.equal(antigravityModelStatus('carbon-test').status, 'quota_exhausted');
  assert.equal(antigravityModelStatus('hydrogen-test').status, 'available');
  assert.equal(antigravityModelStatus('argon-test').status, 'rate_limited');
  assert.equal(antigravityModelStatus('unsupported-test').status, 'unavailable');
  assert.equal(antigravityModelStatus('network-test').status, 'error');
  assert.equal(antigravityModelStatus('hydrogen-test').remainingPercent, null);
});

test('success replaces a previous rejection and stale results are only historical', () => {
  recordAntigravityModelResult('recovered-test', 'RESOURCE_EXHAUSTED');
  recordAntigravityModelResult('recovered-test');
  const fresh = antigravityModelStatus('recovered-test');
  assert.equal(fresh.status, 'available');
  const stale = antigravityModelStatus('recovered-test', Date.parse(fresh.checkedAt!) + 16 * 60000);
  assert.equal(stale.status, 'unknown');
  assert.equal(stale.stale, true);
  assert.match(stale.statusLabel, /已过期/);
});
