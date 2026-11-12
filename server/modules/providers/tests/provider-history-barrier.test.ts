import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, getConnection, initializeDatabase, sessionsDb } from '@/modules/database/index.js';

import { waitForMirroredClaudeReply } from '../services/provider-history-barrier.service.js';

const uuid = '12345678-1234-4123-a123-123456789abc';

async function fixture(run: (file: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'history-barrier-'));
  const previous = process.env.DATABASE_PATH;
  closeConnection();
  process.env.DATABASE_PATH = path.join(root, 'test.db');
  await initializeDatabase();
  getConnection().prepare("INSERT INTO users(id,username,password_hash,role) VALUES(1,'test','test','admin')").run();
  sessionsDb.createAppSession('app', 'claude', root);
  getConnection().prepare('UPDATE sessions SET owner_id=1 WHERE session_id=?').run('app');
  try { await run(path.join(root, 'native.jsonl')); }
  finally {
    closeConnection();
    if (previous === undefined) delete process.env.DATABASE_PATH; else process.env.DATABASE_PATH = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
}

test('completion waits for both the indexed path and the exact final reply', async () => {
  await fixture(async file => {
    let completed = false;
    const waiting = waitForMirroredClaudeReply({ sessionId: 'app', userId: 1, messageId: uuid + '_0', timeoutMs: 2000 }).then(() => { completed = true; });
    await fs.writeFile(file, JSON.stringify({ uuid: 'older-reply' }) + '\n');
    getConnection().prepare('UPDATE sessions SET jsonl_path=? WHERE session_id=?').run(file, 'app');
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.equal(completed, false, 'old history must not satisfy a new reply');
    await fs.appendFile(file, JSON.stringify({ uuid, message: { content: 'reply' } }) + '\n');
    await waiting;
    assert.equal(completed, true);
  });
});

test('missing mirror fails within a bound and does not alter existing history', async () => {
  await fixture(async file => {
    await fs.writeFile(file, 'original\n');
    getConnection().prepare('UPDATE sessions SET jsonl_path=? WHERE session_id=?').run(file, 'app');
    await assert.rejects(waitForMirroredClaudeReply({ sessionId: 'app', userId: 1, messageId: uuid + '_0', timeoutMs: 40 }), /同步超时/);
    assert.equal(await fs.readFile(file, 'utf8'), 'original\n');
  });
});
