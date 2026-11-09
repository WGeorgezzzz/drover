import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createQuotaService } from '../quota.service.js';
import { parseRemoteClaudeUsage } from '../remote-claude-usage.js';

const NOW = Date.parse('2026-11-09T07:16:00Z');
const REPORT = [
  'You are currently using your subscription to power your Claude Code usage', '',
  'Current session: 4% used · resets Nov 9, 11:30am (Europe/Berlin)',
  'Current week (all models): 26% used · resets Nov 10, 7am (Europe/Berlin)',
  'Current week (Fable): 0% used · resets Nov 10, 7am (Europe/Berlin)', '',
  "What's contributing to your limits usage?", '  67%  Turn off windows_local when you don\'t need it',
].join('\n');
const output = (result: string, extra: Record<string, unknown> = {}) => 'wcc: independent env\n' + JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result, ...extra }) + '\n';

function fixture(load: () => Promise<string>) {
  let now = NOW, runs = 0;
  const forbidden = async () => { throw Error('Remote mode must not read local credentials or call Anthropic'); };
  const paths = () => ({ adminClaude: '/claude', adminCodex: '/codex', configRoot: '/users', root: '/users/1', claudeConfigDir: '/claude', codexHome: '/codex/1' });
  const service = createQuotaService({ relayBaseUrl: '', paths: paths as never, db: (() => { throw Error('unused'); }) as never, secretFile: '/secret', password: forbidden, readJson: forbidden, request: forbidden, now: () => now,
    remoteClaudeUsage: () => { runs++; return load(); } });
  return { service, runs: () => runs, advance: (ms: number) => { now += ms; } };
}

test('parses the report into windows and converts reset times from the named zone', () => {
  assert.deepEqual(parseRemoteClaudeUsage(output(REPORT), NOW), [
    { label: '5h', percent: 4, resetsAt: '2026-11-09T10:30:00.000Z' },
    { label: '7 天', percent: 26, resetsAt: '2026-11-10T06:00:00.000Z' },
    { label: 'Fable', percent: 0, resetsAt: '2026-11-10T06:00:00.000Z' },
  ]);
});

test('reset times roll into next year and stay unknown when unreadable', () => {
  const report = 'Current session: 1% used · resets Jan 1, 12am (UTC)\nCurrent week (all models): 2% used · resets soon\nCurrent week (Fable): 3% used · resets Nov 10, 7am (Not/AZone)';
  const windows = parseRemoteClaudeUsage(output(report), Date.parse('2026-12-31T20:00:00Z'));
  assert.equal(windows?.[0].resetsAt, '2027-01-01T00:00:00.000Z');
  assert.equal(windows?.[1].resetsAt, null);
  assert.equal(windows?.[2].resetsAt, null);
});

test('an error result, missing windows or non-protocol output is not a report', () => {
  assert.equal(parseRemoteClaudeUsage(output(REPORT, { is_error: true }), NOW), null);
  assert.equal(parseRemoteClaudeUsage(output('Current session: 4% used'), NOW), null);
  assert.equal(parseRemoteClaudeUsage('ssh: connect failed\n{broken', NOW), null);
});

test('remote mode refreshes every 30 minutes and stays fresh in between', async () => {
  const f = fixture(async () => output(REPORT));
  const first = await f.service.overview({ userId: 1, role: 'admin' });
  assert.deepEqual(first.claude.data?.windows.map(item => [item.label, item.percent]), [['5h', 4], ['7 天', 26], ['Fable', 0]]);
  f.advance(29 * 60000);
  const cached = await f.service.overview({ userId: 1, role: 'admin' });
  assert.equal(f.runs(), 1);
  assert.equal(cached.claude.stale, false);
  assert.equal(cached.claude.staleAfterMs, 45 * 60000);
  f.advance(60000);
  await f.service.refreshClaude();
  assert.equal(f.runs(), 2);
});

test('a failed refresh keeps the last data and exposes only a fixed message', async () => {
  let fail = false;
  const f = fixture(async () => { if (fail) throw Error('ssh root@secret-host failed'); return output(REPORT); });
  await f.service.refreshClaude();
  fail = true; f.advance(30 * 60000);
  const result = await f.service.refreshClaude();
  assert.equal(result.data?.windows[0].percent, 4);
  assert.equal(result.error, '无法经 SSH 读取 Contabo 的 Claude 额度');
  assert(!JSON.stringify(result).includes('secret-host'));
});
