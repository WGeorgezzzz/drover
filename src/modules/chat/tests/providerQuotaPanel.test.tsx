import assert from 'node:assert/strict';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, test, vi } from 'vitest';
import { api } from '@/shared/api';
import { ProviderQuotaPanel } from '@/modules/chat/modals/ProviderQuotaPanel';

afterEach(() => vi.restoreAllMocks());
test('Antigravity separates native model availability from unknown remaining quota', async () => {
  vi.spyOn(api.providers, 'usageSnapshot').mockResolvedValue(new Response(JSON.stringify({ data: {
    updatedAt: null, stale: true, intervalMinutes: 30, providers: [
      { provider: 'gemini', status: 'unsupported', windows: [], note: 'CLI 未提供精确额度', models: [
        { model: 'gemini-carbon-low', label: 'Carbon Low', statusLabel: '最近调用额度不足', checkedAt: null },
        { model: 'claude-opus-high', label: 'Opus High', statusLabel: '未验证可用性', checkedAt: null },
      ] },
    ],
  } })));
  render(<ProviderQuotaPanel />);
  await screen.findByText('Antigravity / 反重力');
  assert(screen.getByText('最近调用额度不足'));
  assert(screen.getByText('未验证可用性'));
  assert.equal(screen.getAllByText('未提供 / 未提供').length, 2);
  assert.equal(screen.queryByText('0%'), null);
});
test('the model page shows zero remaining as a real result and keeps login failure distinct', async () => {
  vi.spyOn(api.providers, 'usageSnapshot').mockResolvedValue(new Response(JSON.stringify({ data: {
    updatedAt: '2026-10-24T00:00:00Z', stale: false, intervalMinutes: 30, providers: [
      { provider: 'codex', status: 'ok', windows: [{ label: '5 小时', remainingPercent: 0 }] },
      { provider: 'claude', status: 'login_required', windows: [], note: 'Login needed' },
    ],
  } })));
  const login = vi.spyOn(api.providers, 'openUsageLogin').mockResolvedValue(new Response('{}'));
  render(<ProviderQuotaPanel />);
  await screen.findByText('5 小时：0%');
  assert(screen.getByText('需要登录'));
  fireEvent.click(screen.getByText('打开专用登录窗口'));
  await waitFor(() => assert.equal(login.mock.calls[0][0], 'claude'));
});
test('an administrator-only snapshot does not show host quotas to an unauthorized user', async () => {
  vi.spyOn(api.providers, 'usageSnapshot').mockResolvedValue(new Response('{}', { status: 403 }));
  render(<ProviderQuotaPanel />);
  await screen.findByText('用量属于本机管理员账号。');
  assert.equal(screen.queryByRole('table'), null);
});
test('failed collection labels retained values as historical rather than current remaining quota', async () => {
  vi.spyOn(api.providers, 'usageSnapshot').mockResolvedValue(new Response(JSON.stringify({ data: {
    updatedAt: '2026-10-24T00:00:00Z', stale: true, intervalMinutes: 30, providers: [
      { provider: 'claude', status: 'unavailable', windows: [], lastSuccess: { checkedAt: '2026-10-23T23:00:00Z', windows: [{ label: '5小时', remainingPercent: 20 }] } },
    ],
  } })));
  render(<ProviderQuotaPanel />);
  await screen.findByText('读取未成功');
  assert(screen.getByText(/历史值/)); assert(screen.getByText(/数据已过期/));
});
