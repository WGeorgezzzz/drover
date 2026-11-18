import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

for (const configured of [undefined, '', 'C:/Users/test/.local/bin/claude.exe']) {
  test(`primary launcher honors the configured Claude executable: ${configured || 'legacy fallback'}`, async () => {
    let launched: { command: string; args: string[]; options: { env: Record<string, string> } } | undefined;
    const config = { runtime: 'D:/release', legacy: 'D:/legacy', home: 'C:/home', port: 3001,
      runtimeEnvironment: { CLAUDE_CLI_PATH: configured, ANTHROPIC_BASE_URL: 'https://example.test', ANTHROPIC_AUTH_TOKEN: 'fixture-token', CLAUDE_REMOTE_CLI_PATH: '' } };
    const modules = {
      fs: { readFileSync: (file: string) => JSON.stringify(file.endsWith('primary-service.json') ? config : {}), openSync: () => 1, writeFileSync: () => {} },
      path,
      http: { get: () => { const request = new EventEmitter(); queueMicrotask(() => request.emit('error', new Error('not listening'))); return request; } },
      child_process: { spawn: (command: string, args: string[], options: { env: Record<string, string> }) => {
        launched = { command, args, options };
        return Object.assign(new EventEmitter(), { stdin: new EventEmitter(), stdout: new EventEmitter(), stderr: new EventEmitter() });
      } },
      './rotating-log.cjs': () => ({ write: () => {} }),
    };
    await vm.runInNewContext(readFileSync('scripts/deploy/run-primary.cjs', 'utf8'), {
      require: (name: keyof typeof modules) => modules[name], __dirname: 'D:/service', console,
      process: { env: { USERPROFILE: 'C:/Users/test', CLAUDE_CLI_PATH: 'inherited' }, pid: 123, execPath: 'node.exe', on: () => {} },
      setInterval: () => 1, clearInterval: () => {},
    });
    assert.ok(launched);
    assert.equal(launched.command, 'conhost.exe');
    assert.equal(launched.args[0], '--headless');
    assert.equal(launched.options.env.CLAUDE_CLI_PATH, configured || 'D:/legacy/wenclaude-cli.js');
    assert.equal(launched.options.env.ANTHROPIC_BASE_URL, 'https://example.test');
    assert.equal(launched.options.env.ANTHROPIC_AUTH_TOKEN, 'fixture-token');
    assert.equal(launched.options.env.CLAUDE_REMOTE_CLI_PATH, '');
  });
}
