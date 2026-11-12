import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runSupervised } from '../services/provider-supervision-controller.service.js';
import { supervisedRuntimeState } from '../services/provider-supervision-state.service.js';
import { DurableProvider } from '../services/provider-supervisor.service.js';

test('an immediate next turn replaces an exited owner without old cleanup deleting the new run', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'continuation-exit-'));
  const sid = 'continuation-exit-test';
  const spec = { provider: 'claude', userId: 1, options: { sessionId: sid } };
  let releaseFirst!: () => void;
  const firstDrain = new Promise<void>(resolve => { releaseFirst = resolve; });
  let releaseSecond!: () => void;
  const secondDrain = new Promise<void>(resolve => { releaseSecond = resolve; });
  let enteredSecond!: () => void;
  const secondEntered = new Promise<void>(resolve => { enteredSecond = resolve; });
  let completedFirst!: () => void;
  const firstCompleted = new Promise<void>(resolve => { completedFirst = resolve; });
  const messages: Array<Record<string, unknown>> = [];
  class FakeProvider extends DurableProvider {
    constructor(readonly index: number) {
      super(path.join(root, String(index)));
      fs.mkdirSync(this.directory);
      fs.writeFileSync(path.join(this.directory, 'output.ndjson'), '');
    }
    override registry() { return { state: this.index === 0 ? 'exited' : 'running' }; }
    override async control() { throw new Error('Exited owner must not receive a continuation'); }
    override async *events() {
      yield { offset: 1, event: { kind: 'turn-start', data: { id: 'initial', spec } } };
      if (this.index === 1) { enteredSecond(); await secondDrain; }
      yield { offset: 2, event: { kind: 'message', data: { kind: 'complete', success: true } } };
      if (this.index === 0) await firstDrain;
      yield { offset: 3, event: { kind: 'exit', data: { code: 0 } } };
    }
  }
  const clients = [new FakeProvider(0), new FakeProvider(1)];
  let starts = 0;
  t.mock.method(DurableProvider, 'start', async () => clients[starts++]);
  const writer = { userId: 1, isWebSocketWriter: true, send(value: unknown) {
    const message = value as Record<string, unknown>; messages.push(message);
    if (message.kind === 'complete') completedFirst();
  } };
  try {
    const first = runSupervised('claude', 'first', { sessionId: sid }, writer);
    await firstCompleted;
    const second = runSupervised('claude', 'next', { sessionId: sid }, writer);
    await secondEntered;
    releaseFirst(); await first;
    assert.equal(supervisedRuntimeState.entries.get(sid)?.client, clients[1]);
    releaseSecond(); await second;
    assert.equal(starts, 2);
    assert.equal(messages.filter(m => m.kind === 'complete').length, 2);
    assert.equal(supervisedRuntimeState.entries.has(sid), false);
  } finally {
    releaseFirst(); releaseSecond();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
