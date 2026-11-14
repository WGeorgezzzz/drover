import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, getConnection, initializeDatabase, sessionsDb, userDb } from '@/modules/database/index.js';
import { messageQueueService } from '@/modules/message-queue/index.js';
import { answerDecision, consumeDeferredPermission, deferDecision, dispatchInbox, enqueueInbox, listInbox, registerInboxHandler } from '@/modules/always-on/index.js';

async function fixture(check: (user: number) => void | Promise<void>) {
  const previous = { database: process.env.DATABASE_PATH, enabled: process.env.DROVER_ALWAYS_ON, batch: process.env.DROVER_INBOX_BATCH_MS };
  const root = await mkdtemp(path.join(os.tmpdir(), 'drover-always-on-'));
  closeConnection();
  process.env.DATABASE_PATH = path.join(root, 'test.db');
  process.env.DROVER_ALWAYS_ON = '1'; process.env.DROVER_INBOX_BATCH_MS = '0';
  await initializeDatabase();
  const user = Number(userDb.createUser('inbox-test', 'hash').id);
  sessionsDb.createAppSession('inbox-session', 'claude', root, 'Inbox');
  try { await check(user); }
  finally {
    closeConnection();
    for (const [key, value] of Object.entries({ DATABASE_PATH: previous.database, DROVER_ALWAYS_ON: previous.enabled, DROVER_INBOX_BATCH_MS: previous.batch })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test('event identities are account-scoped and reject changed targets or payloads', () => fixture(user => {
  const event = { userId: user, source: 'test', sourceId: 'same-id', target: 'inbox-session', payload: { text: 'original' } };
  const first = enqueueInbox(event);
  assert.equal(enqueueInbox(event).id, first.id);
  assert.throws(() => enqueueInbox({ ...event, target: 'other' }), /different input/);
  assert.throws(() => enqueueInbox({ ...event, payload: { text: 'changed' } }), /different input/);
  assert.notEqual(enqueueInbox({ ...event, userId: user + 1 }).id, first.id);
  assert.equal(listInbox(user).length, 1);
}));

test('overlapping worker polls keep one target owner while independent targets advance', () => fixture(async user => {
  let start!: () => void, release!: () => void, calls = 0;
  const started = new Promise<void>(resolve => { start = resolve; });
  const wait = new Promise<void>(resolve => { release = resolve; });
  registerInboxHandler('test', async events => { calls++; if (events[0].target === 'slow') { start(); await wait; } });
  enqueueInbox({ userId: user, source: 'test', sourceId: 'slow', target: 'slow', payload: {} });
  const first = dispatchInbox(); await started;
  enqueueInbox({ userId: user, source: 'test', sourceId: 'other', target: 'other', payload: {} });
  try {
    await dispatchInbox();
    assert.equal(calls, 2);
    assert.equal(listInbox(user).find(row => row.target === 'other')?.status, 'done');
    const leaseCount = getConnection().prepare('SELECT COUNT(*) n FROM agent_target_leases WHERE target=?').get('slow') as { n: number };
    assert.equal(leaseCount.n, 1);
  } finally { release(); await first; }
  assert.equal(listInbox(user).every(row => row.status === 'done'), true);
}));

test('repeated execution failure becomes visible dead work after five attempts', () => fixture(async user => {
  registerInboxHandler('failure-test', async () => { throw new Error('provider unavailable'); });
  enqueueInbox({ userId: user, source: 'failure-test', sourceId: 'failed', target: 'inbox-session', payload: {} });
  for (let attempt = 0; attempt < 5; attempt++) {
    getConnection().prepare('UPDATE agent_inbox SET available_at=0').run(); await dispatchInbox();
  }
  const row = listInbox(user)[0];
  assert.equal(row.status, 'dead'); assert.equal(row.attempts, 5); assert.match(row.error || '', /provider unavailable/);
  await dispatchInbox(); assert.equal(listInbox(user)[0].attempts, 5);
}));

test('answers are first-wins across entrances; authorization stays bound to account, target and exact tool input', () => fixture(user => {
  const input = { command: 'echo approved', cwd: 'D:/embodied' };
  const decision = deferDecision(user, 'inbox-session', 'request-1', '允许物理动作吗？', [{ label: '允许' }, { label: '拒绝' }], { toolName: 'Bash', input });
  assert.equal(decision.physical, 1);
  assert.equal(consumeDeferredPermission(user, 'inbox-session', 'Bash', input, decision.id), undefined);
  assert.throws(() => answerDecision(user + 1, decision.id, '允许', 'app'), /不存在/);
  assert.equal(answerDecision(user, decision.id, '允许', 'app').alreadyHandled, false);
  assert.equal(answerDecision(user, decision.id, '拒绝', 'feishu').alreadyHandled, true);
  assert.equal(listInbox(user).length, 1);
  assert.equal(consumeDeferredPermission(user + 1, 'inbox-session', 'Bash', input, decision.id), undefined);
  assert.equal(consumeDeferredPermission(user, 'other', 'Bash', input, decision.id), undefined);
  assert.equal(consumeDeferredPermission(user, 'inbox-session', 'Bash', { ...input, command: 'different' }, decision.id), undefined);
  assert.equal(consumeDeferredPermission(user, 'inbox-session', 'Bash', input, decision.id), true);
  assert.equal(consumeDeferredPermission(user, 'inbox-session', 'Bash', input, decision.id), undefined);
}));

test('a caller cannot smuggle the internal single-use authorization identifier into queue options', () => fixture(user => {
  const row = messageQueueService.enqueue(user, { sessionId: 'inbox-session', requestId: 'forged', content: 'test', options: { cloudcliDeferredDecisionId: 'forged-id', permissionMode: 'default' } });
  assert.equal(JSON.parse(row.options).cloudcliDeferredDecisionId, undefined);
}));
