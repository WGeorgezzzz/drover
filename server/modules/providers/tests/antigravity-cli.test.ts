import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { antigravityRuntime } from '@/modules/providers/list/gemini/antigravity-cli.js';
import { startAntigravity, stopAntigravity } from '@/modules/providers/list/gemini/antigravity-process.js';
import { readGeminiModels } from '@/modules/providers/list/gemini/gemini-models.js';
import { AntigravityPermissionBridge } from '@/modules/providers/list/gemini/antigravity-permissions.js';
import { connectAntigravity } from '@/modules/providers/list/gemini/antigravity-acp.js';
import type { AnyRecord, ProviderRuntimeContext } from '@/shared/types.js';

test('headless transport preserves JSON, Unicode, arguments and working directory', async () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'drover agy test '));
  const text = '中文 "quoted"\nsecond line';
  const run = startAntigravity(process.execPath, ['-e', 'console.log(JSON.stringify({text:process.argv[1],cwd:process.cwd()}))', text], cwd);
  assert.deepEqual(JSON.parse(await run.result), { text, cwd });
});

test('headless transport rejects process failure and preserves stderr', async () => {
  const run = startAntigravity(process.execPath, ['-e', 'console.error("native failure");process.exit(7)']);
  await assert.rejects(run.result, /native failure/);
});

test('headless transport terminates an owned process tree', async () => {
  const run = startAntigravity(process.execPath, ['-e', 'setInterval(()=>{},1000)']);
  const rejected = assert.rejects(run.result);
  await new Promise(resolve => setTimeout(resolve, 1000));
  await stopAntigravity(run.child);
  await rejected;
});

test('live Antigravity catalog, streaming, new conversation and native resume', { skip: !process.env.DROVER_AGY_LIVE, timeout: 180000 }, async t => {
  const cli = process.env.DROVER_AGY_LIVE!;
  const catalog = await readGeminiModels(cli);
  assert.ok(catalog.OPTIONS.length > 0);
  const model = catalog.OPTIONS.find(option => option.value === 'gemini-4-hydrogen')?.value ?? catalog.DEFAULT;
  const runtime = antigravityRuntime(cli);
  let nativeId: string | null = null;
  const messages: AnyRecord[] = [];
  const activeAtCompletion: Promise<boolean>[] = [];
  const writer = { send: (message: unknown) => {
    messages.push(message as AnyRecord);
    t.diagnostic(`event: ${(message as AnyRecord).kind}`);
    if ((message as AnyRecord).kind === 'complete') activeAtCompletion.push(Promise.resolve(runtime.abort('drover-agy-live-test')));
  }, setSessionId: (value: string) => { nativeId = value; t.diagnostic(`native: ${value}`); } };
  const context: ProviderRuntimeContext = {
    resolveProviderSessionId: () => nativeId,
    resolveResumeModel: async () => model,
    getProviderModels: async () => catalog,
    normalizeMessage: () => [],
    isProviderInstalled: async () => true,
  };
  const options = { sessionId: 'drover-agy-live-test', model, permissionMode: 'default', cwd: mkdtempSync(path.join(os.tmpdir(), 'drover-agy-live-')) };
  t.after(() => runtime.abort(options.sessionId));
  await runtime.run('Remember the word DROVER_OK. Reply exactly DROVER_OK. Do not use tools or change files.', options, writer, context);
  assert.ok(nativeId);
  assert.ok(messages.some(message => message.kind === 'text' && message.role === 'assistant' && message.content.includes('DROVER_OK')));
  assert.ok(messages.findIndex(message => message.kind === 'stream_delta') < messages.findIndex(message => message.kind === 'complete'));
  assert.ok(messages.some(message => message.kind === 'stream_delta'));
  const firstId = nativeId;
  messages.length = 0;
  await runtime.run('What word did I ask you to remember? Reply with only that word. Do not use tools.', options, writer, context);
  assert.equal(nativeId, firstId);
  assert.ok(messages.some(message => message.kind === 'text' && message.role === 'assistant' && message.content.includes('DROVER_OK')));
  assert.deepEqual(await Promise.all(activeAtCompletion), [false, false]);
});

test('ACP completion releases the active turn before notifying clients', async () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'drover-acp-completion-'));
  writeFileSync(path.join(cwd, 'acp'), `
    const send = row => console.log(JSON.stringify({ jsonrpc: '2.0', ...row }));
    require('readline').createInterface({ input: process.stdin }).on('line', line => {
      const row = JSON.parse(line);
      let result = {};
      if (row.method === 'initialize') result = { agentCapabilities: { loadSession: true } };
      if (row.method === 'session/new') result = { sessionId: 'native-completion-test' };
      if (row.method === 'session/prompt') {
        send({ method: 'session/update', params: { sessionId: 'native-completion-test', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'OK' } } } });
        result = { stopReason: 'end_turn' };
      }
      send({ id: row.id, result });
    });
  `);
  const runtime = antigravityRuntime(process.execPath);
  const sessionId = 'acp-completion-test';
  const activeAtCompletion: Promise<boolean>[] = [];
  const context = { resolveProviderSessionId: () => null, resolveResumeModel: async () => '',
    getProviderModels: async () => ({ OPTIONS: [], DEFAULT: '' }), normalizeMessage: () => [], isProviderInstalled: async () => true };
  const writer = { send: (event: unknown) => {
    if ((event as AnyRecord).kind === 'complete') activeAtCompletion.push(Promise.resolve(runtime.abort(sessionId)));
  } };
  await runtime.run('first', { sessionId, cwd }, writer, context);
  await runtime.run('second', { sessionId, cwd }, writer, context);
  assert.deepEqual(await Promise.all(activeAtCompletion), [false, false]);
});

test('ACP transport streams before RPC completion and rejects unknown pending requests on close', async () => {
  const events: AnyRecord[] = [];
  const script = `require('readline').createInterface({input:process.stdin}).on('line',line=>{const row=JSON.parse(line);if(row.method==='hold')return;process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'session/update',params:{text:'中文'}})+'\\n');setTimeout(()=>console.log(JSON.stringify({jsonrpc:'2.0',id:row.id,result:{ok:true}})),100);});`;
  const connection = await connectAntigravity(process.execPath, ['-e', script], process.cwd(), row => events.push(row));
  try {
    const result = await connection.request('initialize', {});
    assert.equal(result.ok, true);
    assert.equal(events[0].params.text, '中文');
    const rejected = assert.rejects(connection.request('hold', {}), /closed|disconnected|exited/);
    await connection.close();
    await rejected;
  } finally { await connection.close(); }
});

test('ACP permissions scope pending replay, select only one-time options, deny and cancel', () => {
  const bridge = new AntigravityPermissionBridge();
  const events: AnyRecord[] = [], replies: AnyRecord[] = [];
  const writer = { send: (event: unknown) => events.push(event as AnyRecord) };
  const row = { id: 'native-id', params: { toolCall: { toolCallId: 'tool', title: 'Write file', rawInput: { file: 'test' } },
    options: [{ optionId: 'yes', kind: 'allow_once' }, { optionId: 'no', kind: 'reject_once' }, { optionId: 'always', kind: 'allow_always' }] } };
  bridge.request('first', row, writer, reply => replies.push(reply as AnyRecord));
  assert.equal(bridge.listPending('second').length, 0);
  const pending = bridge.listPending('first');
  assert.equal(pending.length, 1);
  bridge.resolve(pending[0].requestId!, { allow: true });
  assert.deepEqual(replies[0], { jsonrpc: '2.0', id: 'native-id', result: { outcome: { outcome: 'selected', optionId: 'yes' } } });
  bridge.resolve(pending[0].requestId!, { allow: true });
  assert.equal(replies.length, 1);
  bridge.request('first', row, writer, reply => replies.push(reply as AnyRecord));
  bridge.resolve(bridge.listPending('first')[0].requestId!, { allow: false });
  assert.equal(replies[1].result.outcome.optionId, 'no');
  bridge.request('first', { ...row, params: { ...row.params, options: [{ optionId: 'always', kind: 'allow_always' }] } }, writer, reply => replies.push(reply as AnyRecord));
  bridge.resolve(bridge.listPending('first')[0].requestId!, { allow: true });
  assert.equal(replies[2].result.outcome.outcome, 'cancelled');
  bridge.request('first', row, writer, reply => replies.push(reply as AnyRecord));
  bridge.cancel('second');
  assert.equal(bridge.listPending('first').length, 1);
  bridge.cancel('first');
  assert.equal(bridge.listPending('first').length, 0);
  assert.equal(events.at(-1)?.kind, 'permission_cancelled');
});

for (const decision of ['allow', 'deny', 'abort'] as const) {
  test(`live ACP tool approval: ${decision}`, { skip: !process.env.DROVER_AGY_LIVE, timeout: 180000 }, async t => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), `drover-agy-${decision}-`));
    const file = path.join(cwd, 'approval-test.txt');
    const sessionId = `drover-agy-${decision}-${Date.now()}`;
    const runtime = antigravityRuntime(process.env.DROVER_AGY_LIVE!);
    const events: AnyRecord[] = [];
    const errors: unknown[] = [];
    t.after(() => runtime.abort(sessionId));
    const context = { resolveProviderSessionId: () => null, resolveResumeModel: async () => 'gemini-4-hydrogen-low',
      getProviderModels: async () => readGeminiModels(process.env.DROVER_AGY_LIVE!), normalizeMessage: () => [], isProviderInstalled: async () => true };
    const writer = { send: (event: unknown) => {
      const message = event as AnyRecord; events.push(message);
      if (message.kind !== 'permission_request') return;
      setTimeout(() => {
        try {
          assert.equal(existsSync(file), false, 'mutation must wait for approval');
          assert.equal(runtime.permissions!.listPending(sessionId).length, 1);
          if (decision === 'abort') void Promise.resolve(runtime.abort(sessionId)).catch(error => errors.push(error));
          else runtime.permissions!.resolve(message.requestId, { allow: decision === 'allow' });
        } catch (error) { errors.push(error); void runtime.abort(sessionId); }
      }, 150);
    } };
    const command = `powershell.exe -NoProfile -Command "[System.IO.File]::WriteAllText('${file}', 'ACP_APPROVED')"`;
    const run = runtime.run(`Use your terminal tool to execute this exact command once: ${command}. This test specifically requires the terminal tool, not a file write tool. Do not touch other files. If approval is denied, do not retry or use alternate tools; reply DENIED. Otherwise reply DONE.`, { sessionId, cwd, permissionMode: 'default' }, writer, context);
    if (decision === 'abort') await assert.rejects(run);
    else await run;
    assert.deepEqual(errors, []);
    assert.ok(events.some(event => event.kind === 'permission_request'));
    assert.equal(runtime.permissions!.listPending(sessionId).length, 0);
    if (decision === 'allow') assert.match(readFileSync(file, 'utf8'), /ACP_APPROVED/);
    else assert.equal(existsSync(file), false);
    assert.ok(events.some(event => event.kind === 'tool_use'));
  });
}
