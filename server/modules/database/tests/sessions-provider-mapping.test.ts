import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { Worker } from 'node:worker_threads';

import { closeConnection, getConnection } from '@/modules/database/connection.js';
import { initializeDatabase, initializeWorkerDatabase } from '@/modules/database/init-db.js';
import { sessionsDb } from '@/modules/database/repositories/sessions.db.js';

async function withIsolatedDatabase(runTest: () => void | Promise<void>): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'sessions-mapping-'));
  const databasePath = path.join(tempDirectory, 'auth.db');

  closeConnection();
  process.env.DATABASE_PATH = databasePath;
  await initializeDatabase();

  try {
    await runTest();
  } finally {
    closeConnection();
    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

test('disk-discovered sessions are keyed by the provider id for both columns', async () => {
  await withIsolatedDatabase(() => {
    sessionsDb.createSession('provider-abc', 'claude', '/workspace/demo', 'From Disk');

    const row = sessionsDb.getSessionById('provider-abc');
    assert.equal(row?.session_id, 'provider-abc');
    assert.equal(row?.provider_session_id, 'provider-abc');

    const byProviderId = sessionsDb.getSessionByProviderSessionId('provider-abc');
    assert.equal(byProviderId?.session_id, 'provider-abc');
  });
});

test('app sessions get the provider id assigned without creating a duplicate row', async () => {
  await withIsolatedDatabase(() => {
    sessionsDb.createAppSession('app-id-1', 'claude', '/workspace/demo', 'Initial Nexagent message');
    sessionsDb.assignProviderSessionId('app-id-1', 'provider-xyz');

    // A later synchronizer pass that discovers the transcript on disk must
    // update the app row in place instead of inserting a provider-keyed row.
    const returnedId = sessionsDb.createSession(
      'provider-xyz',
      'claude',
      '/workspace/demo',
      'Synced Name',
      undefined,
      undefined,
      '/fake/path/provider-xyz.jsonl',
    );

    assert.equal(returnedId, 'app-id-1');
    assert.equal(sessionsDb.getAllSessions().length, 1);

    const row = sessionsDb.getSessionById('app-id-1');
    assert.equal(row?.provider_session_id, 'provider-xyz');
    assert.equal(row?.jsonl_path, '/fake/path/provider-xyz.jsonl');
    assert.equal(row?.custom_name, 'Initial Nexagent message');
  });
});

test('assignProviderSessionId merges a watcher-created duplicate into the app row', async () => {
  await withIsolatedDatabase(() => {
    sessionsDb.createAppSession('app-id-2', 'codex', '/workspace/demo');

    // Simulate the race: the filesystem watcher indexed the provider
    // transcript before the runtime announced its session id to the gateway.
    sessionsDb.createSession(
      'provider-race',
      'codex',
      '/workspace/demo',
      'Watcher Name',
      undefined,
      undefined,
      '/fake/provider-race.jsonl',
    );
    assert.equal(sessionsDb.getAllSessions().length, 2);

    sessionsDb.assignProviderSessionId('app-id-2', 'provider-race');

    const rows = sessionsDb.getAllSessions();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.session_id, 'app-id-2');
    assert.equal(rows[0]?.provider_session_id, 'provider-race');
    // Transcript path and name from the duplicate are adopted.
    assert.equal(rows[0]?.jsonl_path, '/fake/provider-race.jsonl');
    assert.equal(rows[0]?.custom_name, 'Watcher Name');
  });
});

test('legacy provider-keyed rows stay resolvable through both lookups', async () => {
  await withIsolatedDatabase(() => {
    sessionsDb.createSession('legacy-1', 'opencode', '/workspace/demo');

    assert.equal(sessionsDb.getSessionById('legacy-1')?.provider, 'opencode');
    assert.equal(sessionsDb.getSessionByProviderSessionId('legacy-1')?.session_id, 'legacy-1');
  });
});

test('provider mapping waits for a concurrent writer instead of failing its lock upgrade', async () => {
  await withIsolatedDatabase(async () => {
    sessionsDb.createAppSession('app-contended', 'claude', '/workspace/demo');
    // Another supervisor holds the write reservation. A deferred transaction
    // can read, but cannot upgrade that read lock while this writer exists.
    const worker = new Worker(`
      const {parentPort,workerData}=require('node:worker_threads');
      const Database=require(workerData.module);
      const db=new Database(workerData.path);
      db.exec('BEGIN IMMEDIATE');
      parentPort.postMessage('locked');
      setTimeout(()=>{db.exec('COMMIT');db.close();},400);
    `, { eval: true, workerData: {
      module: createRequire(import.meta.url).resolve('better-sqlite3'),
      path: process.env.DATABASE_PATH,
    } });
    const exited = once(worker, 'exit');
    try {
      await once(worker, 'message');
      sessionsDb.assignProviderSessionId('app-contended', 'provider-contended');
      assert.equal(sessionsDb.getSessionById('app-contended')?.provider_session_id, 'provider-contended');
    } finally {
      await exited;
    }
  });
});

test('worker database attachment does not re-run migrations or ownership writes', async () => {
  await withIsolatedDatabase(() => {
    getConnection().pragma('query_only = ON');
    assert.doesNotThrow(() => initializeWorkerDatabase());
    assert.ok(getConnection().prepare('SELECT count(*) count FROM sessions').get());
  });
});
