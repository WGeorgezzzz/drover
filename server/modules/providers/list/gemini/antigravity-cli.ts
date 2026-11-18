import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { getCurrentUserContext } from '@/modules/auth/index.js';
import { createCompleteMessage, createNormalizedMessage, getCloudCliHomeDir } from '@/shared/index.js';
import type { IProviderRuntime } from '@/shared/interfaces.js';
import type { AnyRecord, NormalizedMessage } from '@/shared/types.js';

import { connectAntigravity } from './antigravity-acp.js';
import { AntigravityPermissionBridge } from './antigravity-permissions.js';
import { stopAntigravity } from './antigravity-process.js';
import { recordAntigravityModelResult } from './antigravity-model-status.js';
import { resolveAntigravityModel } from './gemini-models.js';

const active = new Map<string, { child?: ChildProcess; cancelled: boolean }>();
const permissions = new AntigravityPermissionBridge();

/** GeminiProvider uses the installed Antigravity CLI, retaining the existing provider/session identity. */
export function antigravityRuntime(cli: string): IProviderRuntime {
  return {
    permissions,
    async run(command, options, writer, context) {
      if (getCurrentUserContext()?.role === 'member') throw new Error('Antigravity CLI is restricted to the local owner.');
      const sessionId = String(options.sessionId);
      if (!/^[\w-]{1,120}$/.test(sessionId)) throw new Error('Invalid Antigravity session');
      if (active.has(sessionId)) throw new Error('Antigravity session is already running');
      const mode = options.permissionMode || 'default';
      if (!['default', 'bypassPermissions'].includes(mode)) throw new Error('Unsupported Antigravity permission mode');
      const nativeId = context.resolveProviderSessionId(sessionId);
      if (nativeId && !/^[\w-]{1,120}$/.test(nativeId)) throw new Error('Invalid Antigravity conversation');
      let model = await context.resolveResumeModel(sessionId, options.model);
      if (active.has(sessionId)) throw new Error('Antigravity session is already running');
      const args = ['acp', '--stdio'];
      if (mode === 'bypassPermissions') args.push('--dangerously-skip-permissions');
      const transcript = path.join(getCloudCliHomeDir(), 'gemini/transcripts', `${sessionId}.jsonl`);
      const persistEvent = (event: NormalizedMessage) => {
        mkdirSync(path.dirname(transcript), { recursive: true });
        appendFileSync(transcript, JSON.stringify({ message: event }) + '\n');
        writer.send(event);
      };
      const persist = (role: string, text: string) => {
        const row = { id: randomUUID(), role, text, timestamp: new Date().toISOString() };
        mkdirSync(path.dirname(transcript), { recursive: true });
        appendFileSync(transcript, JSON.stringify(row) + '\n');
        writer.send(createNormalizedMessage({ id: row.id, provider: 'gemini', sessionId, kind: role === 'error' ? 'error' : 'text', role: role === 'error' ? 'assistant' : role, content: text, timestamp: row.timestamp }));
      };
      let connection: Awaited<ReturnType<typeof connectAntigravity>> | undefined;
      let prompting = false;
      let conversationId = nativeId;
      let text = '';
      let failure: Error | undefined;
      const tools = new Map<string, AnyRecord>();
      const entry: { child?: ChildProcess; cancelled: boolean } = { cancelled: false };
      active.set(sessionId, entry);
      const flush = () => {
        if (!text) return;
        writer.send(createNormalizedMessage({ kind: 'stream_end', provider: 'gemini', sessionId }));
        persist('assistant', text); text = '';
      };
      try {
        persist('user', command);
        if (model || (options.effort && options.effort !== 'default')) {
          const catalog = await context.getProviderModels();
          model = resolveAntigravityModel(catalog, model || catalog.DEFAULT, options.effort);
        }
        const cwd = path.resolve(options.cwd || options.projectPath || process.cwd());
        connection = await connectAntigravity(cli, args, cwd, row => {
          if (row.method === 'session/request_permission' && row.id != null) {
            if (!prompting || entry.cancelled || row.params?.sessionId !== conversationId) {
              connection!.send({ jsonrpc: '2.0', id: row.id, result: { outcome: { outcome: 'cancelled' } } });
            } else permissions.request(sessionId, row, writer, value => connection!.send(value));
            return;
          }
          if (row.method && row.id != null) {
            connection!.send({ jsonrpc: '2.0', id: row.id, error: { code: -32601, message: 'Client method not supported' } });
            return;
          }
          if (!prompting || row.method !== 'session/update' || row.params?.sessionId !== conversationId) return;
          const update = row.params.update;
          if (update?.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text') {
            text += update.content.text;
            writer.send(createNormalizedMessage({ kind: 'stream_delta', provider: 'gemini', sessionId, role: 'assistant', content: update.content.text }));
          } else if (['tool_call', 'tool_call_update'].includes(update?.sessionUpdate) && update.toolCallId) {
            flush();
            const previous = tools.get(update.toolCallId);
            const tool = { ...previous, ...update };
            tools.set(tool.toolCallId, tool);
            if (!previous) persistEvent(createNormalizedMessage({ kind: 'tool_use', provider: 'gemini', sessionId,
              role: 'assistant', toolId: tool.toolCallId, toolName: tool.title || tool.kind || 'Antigravity tool', toolInput: tool.rawInput || {} }));
            if (['completed', 'failed'].includes(tool.status) && previous?.status !== tool.status) {
              const content = JSON.stringify(tool.rawOutput ?? tool.content ?? '');
              persistEvent(createNormalizedMessage({ kind: 'tool_result', provider: 'gemini', sessionId, toolId: tool.toolCallId,
                content, toolResult: { content, isError: tool.status === 'failed' }, isError: tool.status === 'failed' }));
            }
          }
        });
        entry.child = connection.child;
        if (entry.cancelled) throw new Error('Antigravity request cancelled');
        const initialized = await connection.request('initialize', { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: 'drover', version: '1.0' } });
        if (nativeId && !initialized.agentCapabilities?.loadSession) throw new Error('Installed Antigravity does not support session resume');
        const session = await connection.request(nativeId ? 'session/load' : 'session/new', { cwd, mcpServers: [], ...(nativeId ? { sessionId: nativeId } : {}) });
        conversationId = nativeId || session.sessionId;
        if (!conversationId || (session.sessionId && session.sessionId !== conversationId)) throw new Error('Antigravity returned an invalid conversation');
        writer.setSessionId?.(conversationId);
        if (model) await connection.request('session/set_model', { sessionId: conversationId, modelId: model });
        else model = session.models?.currentModelId || '';
        if (mode === 'default') await connection.request('session/set_mode', { sessionId: conversationId, modeId: 'default' });
        prompting = true;
        const result = await connection.request('session/prompt', { sessionId: conversationId, prompt: [{ type: 'text', text: command }] });
        if (entry.cancelled) throw new Error('Antigravity request cancelled');
        if (result.stopReason !== 'end_turn') throw new Error(`Antigravity stopped: ${result.stopReason || 'unknown'}`);
        flush();
      } catch (error) {
        flush();
        failure = error instanceof Error ? error : new Error(String(error));
        persist('error', failure.message);
      } finally {
        if (prompting && !entry.cancelled && model) recordAntigravityModelResult(model, failure?.message);
        prompting = false;
        permissions.cancel(sessionId);
        try { await connection?.close(); } finally { active.delete(sessionId); }
      }
      writer.send(createCompleteMessage({ provider: 'gemini', sessionId, exitCode: failure ? 1 : 0 }));
      if (failure) throw failure;
    },
    async abort(sessionId) {
      const entry = active.get(sessionId);
      if (!entry) return false;
      entry.cancelled = true;
      permissions.cancel(sessionId);
      if (entry.child) await stopAntigravity(entry.child);
      return true;
    },
  };
}
