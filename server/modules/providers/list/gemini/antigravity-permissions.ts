import { randomUUID } from 'node:crypto';

import { createNormalizedMessage } from '@/shared/index.js';
import type { AnyRecord, NormalizedMessage, ProviderPermissionDecision, ProviderRuntimeWriter } from '@/shared/types.js';

/** Shared by the Antigravity runtime and approval tests to scope native requests to app sessions. */
export class AntigravityPermissionBridge {
  private pending = new Map<string, {
    sessionId: string; event: NormalizedMessage; writer: ProviderRuntimeWriter;
    row: AnyRecord; send: (row: unknown) => void;
  }>();

  request(sessionId: string, row: AnyRecord, writer: ProviderRuntimeWriter, send: (row: unknown) => void) {
    const tool = row.params.toolCall || {};
    const requestId = `antigravity-${randomUUID()}`;
    const event = createNormalizedMessage({ kind: 'permission_request', provider: 'gemini', sessionId, requestId,
      toolName: tool.title || tool.kind || 'Antigravity tool', toolId: tool.toolCallId,
      input: tool.rawInput || { title: tool.title, content: tool.content, locations: tool.locations } });
    this.pending.set(requestId, { sessionId, row, event, writer, send });
    writer.send(event);
  }

  resolve(requestId: string, decision: ProviderPermissionDecision) {
    const request = this.pending.get(requestId);
    if (!request) return;
    this.pending.delete(requestId);
    const options = Array.isArray(request.row.params.options) ? request.row.params.options : [];
    const option = options.find((entry: AnyRecord) => entry.kind === (decision.allow ? 'allow_once' : 'reject_once'));
    try {
      request.send({ jsonrpc: '2.0', id: request.row.id, result: { outcome: option
        ? { outcome: 'selected', optionId: option.optionId } : { outcome: 'cancelled' } } });
    } finally {
      request.writer.send(createNormalizedMessage({ kind: 'permission_resolved', provider: 'gemini', sessionId: request.sessionId, requestId }));
    }
  }

  listPending(sessionId: string) {
    return [...this.pending.values()].filter(request => request.sessionId === sessionId).map(request => request.event);
  }

  cancel(sessionId: string) {
    for (const [requestId, request] of this.pending) {
      if (request.sessionId !== sessionId) continue;
      this.pending.delete(requestId);
      try { request.send({ jsonrpc: '2.0', id: request.row.id, result: { outcome: { outcome: 'cancelled' } } }); } catch {}
      request.writer.send(createNormalizedMessage({ kind: 'permission_cancelled', provider: 'gemini', sessionId, requestId }));
    }
  }
}
