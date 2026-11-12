import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { DurableProvider } from '../services/provider-supervisor.service.js';

test('a bootstrap exit is recorded and fails promptly instead of waiting without diagnostics', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'supervisor-start-'));
  const calls: Array<{ command: string; args: readonly string[]; options: { stdio: string[] } }> = [];
  t.mock.method(childProcess, 'spawn', (command: string, args: readonly string[], options: { stdio: string[] }) => {
    calls.push({ command, args, options });
    const child = Object.assign(new EventEmitter(), { unref() {}, kill() {} });
    setTimeout(() => child.emit('exit', 3221225794, null), 5);
    return child;
  });
  syncBuiltinESMExports();
  const started = Date.now();
  try {
    await assert.rejects(DurableProvider.start(root, { command: process.execPath }), /3221225794|c0000142/i);
    assert.ok(Date.now() - started < 3000, 'bootstrap failure must not consume the startup timeout');
    if (process.platform === 'win32') {
      assert.match(calls[0].command, /conhost\.exe$/i);
      assert.equal(calls[0].args[0], '--headless');
      assert.equal(calls[0].options.stdio[0], 'pipe', 'conhost must not receive immediate input EOF');
    }
    const directory = path.join(root, fs.readdirSync(root)[0]);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'bootstrap-exit.json'), 'utf8')).code, 3221225794);
    assert.ok(fs.existsSync(path.join(directory, 'startup-cancelled.json')));
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
