import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runSupervised } from '../services/provider-supervision-controller.service.js';
import { DurableProvider } from '../services/provider-supervisor.service.js';

test('a worker exiting before its first message produces an error and one terminal completion', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'supervisor-failure-'));
  fs.writeFileSync(path.join(directory, 'output.ndjson'), '');
  class FailedProvider extends DurableProvider {
    override async *events() {
      yield { offset: 1, event: { seq: 1, kind: 'exit', data: { code: 1, error: 'Database initialization failed' } } };
    }
  }
  t.mock.method(DurableProvider, 'start', async () => new FailedProvider(directory));
  const messages: Array<Record<string, unknown>> = [];
  try {
    await runSupervised('claude', 'hello', { sessionId: 'failed-before-reply' }, {
      userId: 1, isWebSocketWriter: true, send: value => { messages.push(value as Record<string, unknown>); },
    });
    assert.deepEqual(messages.map(m => m.kind), ['error', 'complete']);
    assert.equal(messages[0].content, 'Database initialization failed');
    assert.equal(messages[1].success, false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
