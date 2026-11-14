import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/modules/i18n';
import { NotificationCenter, SessionNotificationBadge } from '@/modules/notifications/NotificationCenter';
import type * as SharedUtils from '@/shared/utils';

const state = vi.hoisted(() => ({ receive: null as null | ((event: unknown) => void), native: vi.fn(), sound: vi.fn(), decisions: [] as Array<Record<string, unknown>> }));
vi.mock('@/modules/auth', () => ({ useAuth: () => ({ user: { id: 42 } }) }));
vi.mock('@/shared/context/WebSocketContext', () => {
  const subscribe = (fn: (event: unknown) => void) => { state.receive = fn; return () => { state.receive = null; }; };
  return { useWebSocket: () => ({ subscribe }) };
});
vi.mock('@/shared/api', () => ({ alwaysOnApi: { snapshot: async () => ({ data: { enabled: true, events: [], decisions: state.decisions } }) }, api: { settings: { notificationPreferences: async () => ({ preferences: { channels: { inApp: true, desktop: true, webPush: false, sound: true }, events: { stop: true, actionRequired: true, error: true } } }) } }, readApiJson: async (value: unknown) => value }));
vi.mock('@/shared/utils', async original => ({ ...await original<typeof SharedUtils>(), playNotificationSound: state.sound }));

function Path() { return <output data-testid="path">{useLocation().pathname + useLocation().hash}</output>; }
function mount(path = '/') { return render(<MemoryRouter initialEntries={[path]}><NotificationCenter /><SessionNotificationBadge sessionId="s1" /><Path /></MemoryRouter>); }
beforeEach(() => {
  state.decisions = []; localStorage.clear(); document.title = 'Drover';
  vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  class FakeNotification { static permission = 'granted'; onclick: null | (() => void) = null; close() {} constructor(...args: unknown[]) { state.native(...args); } }
  vi.stubGlobal('Notification', FakeNotification);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); state.native.mockClear(); state.sound.mockClear(); });
const emit = (kind: string, extra = {}) => act(() => state.receive?.({ type: 'session_notice', event: { sessionId: 's1', kind, timestamp: Date.now() + 10, runId: 'run-1', seq: 1, ...extra } }));

test('one background completion produces a toast, unread title and native alert; click opens its session', async () => {
  mount(); await act(async () => {});
  emit('complete'); emit('complete');
  expect(state.native).toHaveBeenCalledTimes(1); expect(state.sound).toHaveBeenCalledTimes(1);
  expect(document.title).toBe('(1) Drover');
  fireEvent.click(screen.getByRole('button', { name: 'Completed · unread' }));
  expect(screen.getByTestId('path').textContent).toBe('/session/s1');
});

test('pending questions stay marked while viewed, then resolve; replay after refresh stays silent', async () => {
  const first = mount(); await act(async () => {});
  const timestamp = Date.now() + 10;
  emit('permission_request', { requestId: 'ask-1', timestamp });
  expect(screen.getByLabelText('Waiting for your answer').getAttribute('aria-label')).toBe('Waiting for your answer');
  first.unmount(); mount(); await act(async () => {});
  emit('permission_request', { requestId: 'ask-1', timestamp });
  expect(state.native).toHaveBeenCalledTimes(1);
  emit('permission_resolved', { requestId: 'ask-1' });
  await waitFor(() => expect(screen.queryByLabelText('Waiting for your answer')).toBeNull());
  expect(document.title).toBe('Drover');
});

test('a focused active session suppresses toast and native notification; old history never announces', async () => {
  vi.mocked(document.hasFocus).mockReturnValue(true);
  mount('/session/s1'); await act(async () => {});
  emit('complete'); emit('permission_request', { requestId: 'historical', timestamp: 1 });
  expect(state.native).not.toHaveBeenCalled(); expect(state.sound).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Completed · unread' })).toBeNull(); expect(document.title).toBe('Drover');
});

test('acknowledging a monitor preserves an unrelated unanswered question', async () => {
  mount(); await act(async () => {});
  emit('monitor_notice', { noticeKind: 'actionRequired', id: 'monitor:m1:r1:actionRequired', monitorId: 'm1' });
  emit('permission_request', { requestId: 'ask-1', seq: 2 });
  emit('monitor_resolved', { monitorId: 'm1' });
  expect(screen.getByLabelText('Waiting for your answer')).toBeTruthy();
  emit('permission_resolved', { requestId: 'ask-1' });
  await waitFor(() => expect(screen.queryByLabelText('Waiting for your answer')).toBeNull());
});


test('durable decisions restore after refresh, survive permission cancellation and resolve from the other entry', async () => {
  state.decisions = [{ id: 'durable-1', target: 's1', request_id: 'ask-durable', status: 'pending', reminded_at: null }];
  const first = mount(); await act(async () => {});
  await waitFor(() => expect(screen.getByLabelText('Waiting for your answer')).toBeTruthy());
  emit('permission_cancelled', { requestId: 'ask-durable' });
  expect(screen.getByLabelText('Waiting for your answer')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Waiting for your answer' })).toHaveLength(1);
  first.unmount(); mount(); await act(async () => {});
  expect(screen.getByLabelText('Waiting for your answer')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Waiting for your answer' })).toBeNull();
  state.decisions = [{ ...state.decisions[0], status: 'answered' }];
  emit('permission_resolved', { requestId: 'ask-durable', decisionId: 'durable-1' });
  await waitFor(() => expect(screen.queryByLabelText('Waiting for your answer')).toBeNull());
});

test('the shared action toast opens the persisted inbox question', async () => {
  state.decisions = [{ id: 'durable-2', target: 's1', request_id: 'ask-two', status: 'pending', reminded_at: null }];
  mount(); await act(async () => {});
  await waitFor(() => expect(screen.getByRole('button', { name: 'Waiting for your answer' })).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Waiting for your answer' }));
  expect(screen.getByTestId('path').textContent).toBe('/inbox#decision-durable-2');
});

test('poll reconciles answers missed while the websocket was disconnected', async () => {
  state.decisions = [{ id: 'durable-3', target: 's1', request_id: 'ask-three', status: 'pending', reminded_at: null }];
  mount(); await act(async () => {});
  await waitFor(() => expect(screen.getByLabelText('Waiting for your answer')).toBeTruthy());
  state.decisions = [{ ...state.decisions[0], status: 'answered' }];
  await waitFor(() => expect(screen.queryByLabelText('Waiting for your answer')).toBeNull(), { timeout: 7000 });
}, 10000);
