import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createReplySuggestionsService, generateContextualReplies } from '@/modules/providers/services/reply-suggestions.service.js';
import { userContextStorage } from '@/shared/index.js';
import type { NormalizedMessage } from '@/shared/index.js';

const rows:NormalizedMessage[]=[
  {id:'u',sessionId:'s',provider:'claude',kind:'text',role:'user',content:'SuZhou gardens, two people, 600 yuan.',timestamp:'2026-10-24'},
  {id:'a',sessionId:'s',provider:'claude',kind:'text',role:'assistant',content:'Do you prefer garden A or garden B?',timestamp:'2026-10-24'},
];

test('authorizes before reading, coalesces requests and scopes cached suggestions by owner',async()=>{
  let calls=0;
  const service=createReplySuggestionsService({authorize:(user)=>{assert.equal(user,1);return {provider:'claude'};},readHistory:async()=>rows,
    generate:async context=>{calls++;assert.equal(context.at(-1)?.content,rows[1].content);return ['Choose garden B within 600 yuan.'];}});
  const [a,b]=await Promise.all([service.get(1,'s',rows[1].content!),service.get(1,'s',rows[1].content!)]);
  assert.deepEqual(a.replies,['Choose garden B within 600 yuan.']);assert.deepEqual(a,b);assert.equal(calls,1);
  await service.get(1,'s',rows[1].content!);assert.equal(calls,1);
  await assert.rejects(service.get(2,'s',rows[1].content!));assert.equal(calls,1);
});

test('a newer user message invalidates generation already in flight',async()=>{
  let current=rows;
  const service=createReplySuggestionsService({authorize:()=>({provider:'claude'}),readHistory:async()=>current,
    generate:async()=>{current=[...rows,{...rows[0],id:'u2',content:'Actually use Hangzhou.'}];return ['Choose garden A in Suzhou.'];}});
  assert.deepEqual(await service.get(1,'s',rows[1].content!),{status:'stale',replies:[]});
});

test('does not generate for mismatched replies or silently cross provider boundaries',async()=>{
  let calls=0;
  const common={readHistory:async()=>rows,generate:async()=>{calls++;return ['Unused'];}};
  const service=createReplySuggestionsService({...common,authorize:()=>({provider:'claude'})});
  assert.equal((await service.get(1,'s','A stale answer')).status,'stale');
  const other=createReplySuggestionsService({...common,authorize:()=>({provider:'codex'})});
  assert.equal((await other.get(1,'s',rows[1].content!)).status,'unsupported');assert.equal(calls,0);
});

test('malformed output fails rather than becoming template or partial suggestions',async()=>{
  const service=createReplySuggestionsService({authorize:()=>({provider:'claude'}),readHistory:async()=>rows,generate:async()=>['a','b','c','d']});
  await assert.rejects(service.get(1,'s',rows[1].content!));
});

test('a running session does not start auxiliary inference',async()=>{
  let calls=0;
  const service=createReplySuggestionsService({authorize:()=>({provider:'claude'}),readHistory:async()=>rows,isRunning:()=>true,generate:async()=>{calls++;return ['Unused'];}});
  assert.equal((await service.get(1,'s',rows[1].content!)).status,'stale');assert.equal(calls,0);
});


test('the conversation model is not forwarded to the suggestion generator',async()=>{
  const service=createReplySuggestionsService({authorize:()=>({provider:'claude',model:'opus'}),readHistory:async()=>rows,
    generate:async(...args)=>{assert.equal(args.length,1);return ['Choose garden B.'];}});
  assert.equal((await service.get(1,'s',rows[1].content!)).status,'ready');
});

test('relay suggestions use Terra JSON with bounded output, allow explicit override, and never retry another model', async t => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'reply-relay-'));
  await mkdir(path.join(home, 'claude'));
  await writeFile(path.join(home, 'config.toml'), 'model="gpt-6.1-sol"\nmodel_provider="test"\n[model_providers.test]\nbase_url="https://relay.invalid/v1"\n');
  await writeFile(path.join(home, 'auth.json'), '{"OPENAI_API_KEY":"test-not-real"}');
  const context = { userId: 7, role: 'member' as const, workRoot: null, allowedFolders: [], claudeConfigDir: path.join(home, 'claude'), codexHome: home, env: { CODEX_HOME: home } as NodeJS.ProcessEnv };
  const history = rows.map(row => ({ id: row.id, role: row.role as 'user' | 'assistant', content: row.content! }));
  const previous = process.env.REPLY_SUGGESTIONS_MODEL;
  delete process.env.REPLY_SUGGESTIONS_MODEL;
  t.after(() => { if (previous === undefined) delete process.env.REPLY_SUGGESTIONS_MODEL; else process.env.REPLY_SUGGESTIONS_MODEL = previous; });
  const logs: unknown[][] = [];
  t.mock.method(console, 'info', (...args: unknown[]) => { logs.push(args); });
  const mock = t.mock.method(globalThis, 'fetch', async (url: unknown, options: RequestInit) => {
    assert.equal(url, 'https://relay.invalid/v1/responses');
    assert.equal(options.redirect, 'error');
    assert.equal((options.headers as Record<string, string>).Authorization, 'Bearer test-not-real');
    const body = JSON.parse(String(options.body));
    assert.equal(body.model, context.env.REPLY_SUGGESTIONS_MODEL || process.env.REPLY_SUGGESTIONS_MODEL || 'gpt-6.1-terra');
    assert.equal(body.max_output_tokens, 1200); assert.equal(body.store, false);
    assert.deepEqual(body.reasoning, { effort: 'low' }); assert.deepEqual(body.text, { format: { type: 'json_object' } });
    assert.match(body.instructions, /NEXT USER REPLIES/); assert.deepEqual(JSON.parse(body.input).recentConversation, history);
    assert.ok(options.signal);
    return Response.json({ status: 'completed', model: 'gpt-6.1-terra', usage: { input_tokens: 42, output_tokens: 9 }, output: [{ content: [{ type: 'output_text', text: '{"replies":["Choose garden B."]}' }] }] });
  });
  assert.deepEqual(await userContextStorage.run(context, () => generateContextualReplies(history)), ['Choose garden B.']);
  process.env.REPLY_SUGGESTIONS_MODEL = 'process-override';
  await userContextStorage.run(context, () => generateContextualReplies(history));
  context.env.REPLY_SUGGESTIONS_MODEL = 'account-override';
  await userContextStorage.run(context, () => generateContextualReplies(history));
  assert.equal(mock.mock.callCount(), 3);
  const metric = logs[0][1] as { actualModel: string; durationMs: number; usage: unknown };
  assert.equal(metric.actualModel, 'gpt-6.1-terra'); assert.ok(metric.durationMs >= 0);
  assert.deepEqual(metric.usage, { input_tokens: 42, output_tokens: 9 });
  assert.doesNotMatch(JSON.stringify(logs), /SuZhou|garden|test-not-real/);
  mock.mock.restore();
  for (const failure of [404, 429, 500, 'timeout', 'connect-timeout', 'incomplete', 'invalid-json', 'invalid-replies']) {
    const failed = t.mock.method(globalThis, 'fetch', async () => {
      if (failure === 'timeout') throw new DOMException('timeout', 'TimeoutError');
      if (failure === 'connect-timeout') throw new TypeError('fetch failed', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
      if (typeof failure === 'number') return new Response('', { status: failure });
      return Response.json({ status: failure === 'incomplete' ? 'incomplete' : 'completed', output: [{ content: [{ type: 'output_text', text: failure === 'invalid-json' ? 'bad json' : '{"replies":["a","b","c","d"]}' }] }] });
    });
    await assert.rejects(userContextStorage.run(context, () => generateContextualReplies(history)));
    assert.equal(failed.mock.callCount(), 1, String(failure) + ' must not trigger any fallback');
    failed.mock.restore();
  }
  // A relay API key is required; subscription-only auth must never become a bearer token.
  await writeFile(path.join(home, 'auth.json'), '{"tokens":{"access_token":"subscription-only"}}');
  const denied = t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not fetch'); });
  await assert.rejects(userContextStorage.run(context, () => generateContextualReplies(history)));
  assert.equal(denied.mock.callCount(), 0);
});

test('context keeps at most ten text turns and 18000 characters', async()=>{
  const many = Array.from({length:20}, (_,i) => ({...rows[i%2],id:String(i),content:'x'.repeat(7000)}));
  const service=createReplySuggestionsService({authorize:()=>({provider:'claude'}),readHistory:async()=>many,
    generate:async context=>{assert.ok(context.length<=10);assert.equal(context.reduce((sum,row)=>sum+row.content.length,0),18000);assert.ok(context.every(row=>row.content.length<=6000));return ['A concrete next step.'];}});
  assert.equal((await service.get(1,'s','x'.repeat(2000))).status,'ready');
});
