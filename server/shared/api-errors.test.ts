import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeApiError } from './api-errors.js';

test('API error envelope keeps details and endpoint fields without changing successful responses', () => {
  const success = { data: { id: 1 } };
  assert.equal(normalizeApiError(success, 200), success);
  assert.deepEqual(normalizeApiError({ error: { message: 'Missing session', code: 'NOT_FOUND' }, success: false }, 404), {
    error: 'Missing session', code: 'NOT_FOUND', details: { message: 'Missing session', code: 'NOT_FOUND' }, success: false,
  });
  assert.deepEqual(normalizeApiError({ message: 'Denied', retryAfter: 5 }, 403), { message: 'Denied', retryAfter: 5, error: 'Denied', code: 'HTTP_403' });
});
