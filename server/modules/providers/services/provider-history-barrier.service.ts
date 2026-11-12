import fs from 'node:fs/promises';

import { getConnection } from '@/modules/database/index.js';

/**
 * The supervision controller uses this after a remote Claude result: the
 * transport sends that result before its transcript chunks arrive locally.
 * Do not announce completion until REST history can read the final reply.
 * This checks a concrete native message UUID, never an arbitrary sleep or a
 * previous turn's nonempty transcript. A bounded failure cannot rerun a task.
 */
export async function waitForMirroredClaudeReply(options: {
  sessionId: string;
  userId: number;
  messageId: string;
  timeoutMs?: number;
}): Promise<void> {
  const nativeId = options.messageId.replace(/_\d+$/, '');
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(nativeId)) return;
  const marker = new RegExp('"uuid"\\s*:\\s*"' + nativeId + '"');
  const started = Date.now();
  const timeout = options.timeoutMs ?? 30_000;
  let lastStat = '';
  do {
    const row = getConnection().prepare(
      'SELECT jsonl_path FROM sessions WHERE session_id = ? AND owner_id = ?',
    ).get(options.sessionId, options.userId) as { jsonl_path: string | null } | undefined;
    if (row?.jsonl_path) {
      try {
        const handle = await fs.open(row.jsonl_path, 'r');
        try {
          const stat = await handle.stat();
          const stamp = `${row.jsonl_path}:${stat.size}:${stat.mtimeMs}`;
          if (stamp !== lastStat) {
            lastStat = stamp;
            // Native UUIDs are at the end of their JSONL records. Read only
            // the recent tail even when the older conversation is very large.
            const size = Math.min(stat.size, 4 * 1024 * 1024);
            const buffer = Buffer.alloc(size);
            const { bytesRead } = await handle.read(buffer, 0, size, stat.size - size);
            const text = buffer.subarray(0, bytesRead).toString('utf8');
            const completeRows = text.slice(0, text.lastIndexOf('\n') + 1);
            if (marker.test(completeRows)) return;
          }
        } finally { await handle.close(); }
      } catch (error) {
        // The watcher can publish a path just before the first chunk, or
        // replace a file while this reader opens it. Retry only those races.
        if (!['ENOENT', 'EBUSY', 'EPERM'].includes((error as NodeJS.ErrnoException).code || '')) throw error;
      }
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(100, timeout)));
  } while (Date.now() - started < timeout);
  throw new Error('模型已回复，但本机聊天记录同步超时。请稍后刷新；不要重复执行原任务。');
}
