import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { AnyRecord } from '@/shared/types.js';

import { parseAntigravityModels, resolveAntigravityModel } from '../list/gemini/gemini-models.js';
import { antigravityRuntime } from '../list/gemini/antigravity-cli.js';

const catalog = parseAntigravityModels([
  'Fetching available models...',
  'gemini-4-hydrogen-high\tGemini 4 Hydrogen (High)',
  'gemini-4-hydrogen-xhigh\tGemini 4 Hydrogen (XHigh)',
  'gemini-4-hydrogen-low\tGemini 4 Hydrogen (Low)',
  'gemini-4-hydrogen-low\tGemini 4 Hydrogen (Low)',
  'claude-sonnet-5-5-medium\tClaude Sonnet 5.5 (Medium)',
  'gemini-pro-orchestrator-argon\tOrchestrator (Argon)',
].join('\n'));

test('native effort variants become one model with ordered independent effort choices', () => {
  assert.equal(catalog.OPTIONS.length, 3);
  const model = catalog.OPTIONS[0];
  assert.equal(model.value, 'gemini-4-hydrogen');
  assert.equal(model.label, 'Gemini 4 Hydrogen');
  assert.equal(model.effort?.default, 'high');
  assert.deepEqual(model.effort?.values.map(entry => entry.value), ['low', 'high', 'xhigh']);
  assert.equal(model.aliases?.length, 3);
  assert.equal(catalog.OPTIONS[2].label, 'Orchestrator (Argon)');
  assert.equal(catalog.OPTIONS[2].effort, undefined);
});

test('native mapping preserves defaults and legacy sessions but rejects unadvertised levels', () => {
  assert.equal(resolveAntigravityModel(catalog, 'gemini-4-hydrogen', 'low'), 'gemini-4-hydrogen-low');
  assert.equal(resolveAntigravityModel(catalog, 'gemini-4-hydrogen', 'default'), 'gemini-4-hydrogen-high');
  assert.equal(resolveAntigravityModel(catalog, 'gemini-4-hydrogen-low', 'default'), 'gemini-4-hydrogen-low');
  assert.equal(resolveAntigravityModel(catalog, 'gemini-4-hydrogen-low', 'high'), 'gemini-4-hydrogen-high');
  assert.equal(resolveAntigravityModel(catalog, 'gemini-pro-orchestrator-argon'), 'gemini-pro-orchestrator-argon');
  assert.throws(() => resolveAntigravityModel(catalog, 'gemini-4-hydrogen', 'medium'), /Unsupported/);
  assert.throws(() => resolveAntigravityModel(catalog, 'gemini-pro-orchestrator-argon', 'high'), /does not support/);
  assert.throws(() => resolveAntigravityModel(catalog, 'missing'), /unavailable/);
  assert.throws(() => parseAntigravityModels('Fetching available models...'), /no available models/);
});

test('ACP receives the combined native ID for independent model and effort selections on new and resumed turns', async () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'drover-agy-selection-'));
  writeFileSync(path.join(cwd, 'acp'), `
    let model;
    const send = row => console.log(JSON.stringify({ jsonrpc: '2.0', ...row }));
    require('readline').createInterface({ input: process.stdin }).on('line', line => {
      const row = JSON.parse(line);
      let result = {};
      if (row.method === 'initialize') result = { agentCapabilities: { loadSession: true } };
      if (row.method === 'session/new' || row.method === 'session/load') result = { sessionId: 'native-effort-test' };
      if (row.method === 'session/set_model') model = row.params.modelId;
      if (row.method === 'session/prompt') {
        send({ method: 'session/update', params: { sessionId: 'native-effort-test', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: model } } } });
        result = { stopReason: 'end_turn' };
      }
      send({ id: row.id, result });
    });
  `);
  const runtime = antigravityRuntime(process.execPath);
  let nativeId: string | null = null;
  const context = { resolveProviderSessionId: () => nativeId, resolveResumeModel: async () => 'gemini-4-hydrogen',
    getProviderModels: async () => catalog, normalizeMessage: () => [], isProviderInstalled: async () => true };
  for (const effort of ['low', 'xhigh']) {
    const messages: AnyRecord[] = [];
    await runtime.run('Reply with the selected model', { sessionId: 'selection-test', cwd, model: 'gemini-4-hydrogen', effort },
      { send: event => messages.push(event as AnyRecord), setSessionId: id => { nativeId = id; } }, context);
    assert.ok(messages.some(event => event.kind === 'text' && event.content === `gemini-4-hydrogen-${effort}`));
  }
});
