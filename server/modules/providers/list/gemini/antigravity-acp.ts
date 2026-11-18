import { randomUUID } from 'node:crypto';
import { createServer, type Socket } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import type { AnyRecord } from '@/shared/types.js';

import { startAntigravity, stopAntigravity } from './antigravity-process.js';

/** The Antigravity runtime and transport tests use this headless duplex ACP connection. */
export async function connectAntigravity(cli: string, args: string[], cwd: string, receive: (row: AnyRecord) => void) {
  const pipe = process.platform === 'win32' ? `\\\\.\\pipe\\drover-agy-${randomUUID()}` : path.join(os.tmpdir(), `drover-agy-${randomUUID()}.sock`);
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(pipe, resolve); });
  let socket: Socket | undefined;
  let sequence = 0;
  let buffer = '';
  let failure: Error | undefined;
  const pending = new Map<number, { resolve: (value: AnyRecord) => void; reject: (error: Error) => void }>();
  const fail = (error: Error) => {
    failure = error;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  let rejectConnection: (error: Error) => void = () => {};
  const connected = new Promise<void>((resolve, reject) => {
    rejectConnection = reject;
    server.once('connection', connection => {
      socket = connection;
      server.close();
      connection.setEncoding('utf8');
      connection.on('error', fail);
      connection.on('close', () => fail(new Error('Antigravity ACP disconnected')));
      connection.on('data', data => {
        buffer += data;
        try {
          if (buffer.length > 16 * 1024 * 1024) throw new Error('Antigravity ACP frame too large');
          let end: number;
          while ((end = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
            if (!line.trim()) continue;
            const row = JSON.parse(line);
            if (!row.method && pending.has(row.id)) {
              const request = pending.get(row.id)!; pending.delete(row.id);
              if (row.error) request.reject(new Error(row.error.message || 'Antigravity ACP request failed'));
              else request.resolve(row.result || {});
            } else receive(row);
          }
        } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); connection.destroy(); }
      });
      resolve();
    });
  });
  const run = startAntigravity(cli, args, cwd, pipe);
  const exited = run.result.then(() => {
    const error = new Error('Antigravity ACP exited'); fail(error); rejectConnection(error);
  }, error => { fail(error); rejectConnection(error); });
  const timeout = setTimeout(() => rejectConnection(new Error('Antigravity ACP connection timed out')), 30000);
  try { await connected; } catch (error) {
    server.close(); await stopAntigravity(run.child); await exited; throw error;
  } finally { clearTimeout(timeout); }
  const send = (row: unknown) => {
    if (failure || !socket || socket.destroyed) throw failure || new Error('Antigravity ACP disconnected');
    socket.write(JSON.stringify(row) + '\n');
  };
  return {
    child: run.child,
    send,
    async request(method: string, params: unknown): Promise<AnyRecord> {
      const id = ++sequence;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await new Promise<AnyRecord>((resolve, reject) => {
          pending.set(id, { resolve, reject });
          timer = setTimeout(() => { pending.delete(id); reject(new Error(`Antigravity ${method} timed out`)); }, 10 * 60 * 1000);
          send({ jsonrpc: '2.0', id, method, params });
        });
      } finally { clearTimeout(timer); pending.delete(id); }
    },
    async close() {
      fail(new Error('Antigravity ACP closed'));
      await stopAntigravity(run.child);
      socket?.destroy(); server.close(); await exited;
    },
  };
}
