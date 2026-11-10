import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ClaudeProviderAuth } from '@/modules/providers/list/claude/claude-auth.provider.js';
import { userContextStorage } from '@/shared/utils.js';

test('remote authentication uses the adapter and fails closed without falling back to local credentials', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'remote-claude-auth-'));
  const prior = process.env.CLAUDE_REMOTE_CLI_PATH;
  const adapter = path.join(dir, 'adapter.cjs');
  process.env.CLAUDE_REMOTE_CLI_PATH = adapter;
  try {
    await writeFile(adapter, 'console.log(JSON.stringify({loggedIn:true,email:"remote@example.test",authMethod:"claude.ai"}))');
    const status = await new ClaudeProviderAuth().getStatus();
    assert.equal(status.authenticated, true);
    assert.equal(status.email, 'remote@example.test');
    await writeFile(adapter, 'console.log("not a valid response")');
    const invalid = await new ClaudeProviderAuth().getStatus();
    assert.equal(invalid.authenticated, false);
    assert.match(invalid.error!, /could not be verified/);
    await writeFile(adapter, 'console.log(JSON.stringify({loggedIn:false}))');
    const loggedOut = await new ClaudeProviderAuth().getStatus();
    assert.equal(loggedOut.authenticated, false);
    assert.match(loggedOut.error!, /not authenticated/);
    await writeFile(adapter, 'process.exit(1)');
    assert.equal((await new ClaudeProviderAuth().getStatus()).authenticated, false);
  } finally {
    if (prior === undefined) delete process.env.CLAUDE_REMOTE_CLI_PATH;
    else process.env.CLAUDE_REMOTE_CLI_PATH = prior;
    await rm(dir, { recursive: true, force: true });
  }
});

test('members see the shared remote login as authenticated without its account email', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'remote-claude-auth-'));
  const prior = process.env.CLAUDE_REMOTE_CLI_PATH;
  const adapter = path.join(dir, 'adapter.cjs');
  process.env.CLAUDE_REMOTE_CLI_PATH = adapter;
  try {
    await writeFile(adapter, 'console.log(JSON.stringify({loggedIn:true,email:"remote@example.test",authMethod:"claude.ai"}))');
    const member = { role: 'member', env: process.env } as never;
    const status = await userContextStorage.run(member, () => new ClaudeProviderAuth().getStatus());
    assert.equal(status.authenticated, true);
    assert.equal(status.email, null);
  } finally {
    if (prior === undefined) delete process.env.CLAUDE_REMOTE_CLI_PATH;
    else process.env.CLAUDE_REMOTE_CLI_PATH = prior;
    await rm(dir, { recursive: true, force: true });
  }
});
