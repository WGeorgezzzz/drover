import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { DurableProvider } from '../services/provider-supervisor.service.js';

const exitLine = JSON.stringify({ seq: 2, kind: 'exit', data: { code: 0 } }) + '\n';

function runDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-events-'));
  fs.writeFileSync(path.join(directory, 'output.ndjson'), JSON.stringify({ seq: 1, kind: 'message', data: { kind: 'text' } }) + '\n');
  fs.writeFileSync(path.join(directory, 'registry.json'), JSON.stringify({ state: 'running' }));
  return directory;
}
// Same order as the worker: exit reaches the journal before the terminal state.
function finishRun(directory: string) {
  fs.appendFileSync(path.join(directory, 'output.ndjson'), exitLine);
  fs.writeFileSync(path.join(directory, 'registry.json'), JSON.stringify({ state: 'exited' }));
}
async function kinds(client: DurableProvider) {
  const seen: string[] = [];
  for await (const row of client.events()) seen.push(String(row.event.kind));
  return seen;
}

test('a worker finishing during the identity check is drained instead of reported as lost', async () => {
  const directory = runDirectory();
  class FinishingProvider extends DurableProvider {
    override async identity() { finishRun(directory); return false; }
  }
  assert.deepEqual(await kinds(new FinishingProvider(directory)), ['message', 'exit']);
});

test('a worker finishing between the journal read and the state read keeps its final events', async () => {
  const directory = runDirectory();
  let reads = 0;
  class FinishingProvider extends DurableProvider {
    override registry() {
      if (++reads === 2) finishRun(directory);
      return super.registry();
    }
    override async identity() { return true; }
  }
  assert.deepEqual(await kinds(new FinishingProvider(directory)), ['message', 'exit']);
});

test('a running worker that cannot be reached still fails adoption', async () => {
  class LostProvider extends DurableProvider {
    override async identity() { return false; }
  }
  await assert.rejects(kinds(new LostProvider(runDirectory())), /Supervisor unavailable/);
});
