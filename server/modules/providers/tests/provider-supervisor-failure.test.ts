import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { initializeDatabase } from '@/modules/database/index.js';

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

test('a successful durable turn stays successful when its transcript mirror is delayed', async t => {
  await initializeDatabase();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'supervisor-history-delay-'));
  fs.writeFileSync(path.join(directory, 'output.ndjson'), '');
  class CompletedProvider extends DurableProvider {
    override async *events() {
      yield { offset: 1, event: { seq: 1, kind: 'message', data: {
        id: '12345678-1234-4123-a123-123456789abc_0', kind: 'text', role: 'assistant', content: 'EFFECT_ALREADY_DONE',
      } } };
      yield { offset: 2, event: { seq: 2, kind: 'message', data: { kind: 'complete', success: true, exitCode: 0 } } };
      yield { offset: 3, event: { seq: 3, kind: 'exit', data: { code: 0 } } };
    }
  }
  let starts = 0;
  t.mock.method(DurableProvider, 'start', async () => { starts++; return new CompletedProvider(directory); });
  const previous = process.env.CLAUDE_REMOTE_CLI_PATH;
  process.env.CLAUDE_REMOTE_CLI_PATH = 'fixture-remote-transport';
  let clock = Date.now();
  t.mock.method(Date, 'now', () => { clock += 31000; return clock; });
  const messages: Array<Record<string, unknown>> = [];
  try {
    await runSupervised('claude', 'one effect', { sessionId: 'successful-delayed-mirror' }, {
      userId: 1, isWebSocketWriter: true, send: value => { messages.push(value as Record<string, unknown>); },
    });
    assert.equal(starts, 1);
    assert.equal(messages.some(m => m.kind === 'error'), false);
    assert.equal(messages.find(m => m.kind === 'status')?.status, 'history_sync_pending');
    const completions = messages.filter(m => m.kind === 'complete');
    assert.equal(completions.length, 1);
    assert.equal(completions[0].success, true);
    assert.equal(completions[0].exitCode, 0);
    assert.equal(completions[0].historySyncPending, true);
  } finally {
    if (previous === undefined) delete process.env.CLAUDE_REMOTE_CLI_PATH; else process.env.CLAUDE_REMOTE_CLI_PATH = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
