import assert from 'node:assert/strict';

import { renderHook } from '@testing-library/react';
import { test, vi } from 'vitest';

import { useChatRealtimeHandlers } from '@/modules/chat/hooks/useChatRealtimeHandlers';
import type { ServerEvent, ProjectSession, PendingPermissionRequest, LLMProvider } from '@/shared/types';
import type { SessionStore } from '@/modules/chat/hooks/useSessionStore';

/**
 * Answering a permission prompt resolves it over the inbound socket only, but
 * the `permission_request` frame stays in the run's replay buffer. A mid-run
 * page refresh replays the whole buffer, so without a retracting
 * `permission_resolved` frame the already-answered prompt resurrected on every
 * refresh (and lingered forever in a second tab watching the same run).
 */

const renderHandlers = (provider: LLMProvider = 'claude') => {
  let listener: ((event: ServerEvent) => void) | null = null;
  let pending: PendingPermissionRequest[] = [];
  const lastSeq = new Map<string, number>();
  const streams: unknown[][] = [];

  renderHook(() => useChatRealtimeHandlers({
    isActive: true,
    subscribe: (fn) => {
      listener = fn;
      return () => { listener = null; };
    },
    provider,
    selectedSession: { id: 'viewed-session' } as ProjectSession,
    currentSessionId: 'viewed-session',
    setTokenBudget: () => {},
    pendingPermissionRequests: [],
    setPendingPermissionRequests: (next) => {
      pending = typeof next === 'function' ? next(pending) : next;
    },
    streamTimerRef: { current: null },
    accumulatedStreamRef: { current: '' },
    lastSeqRef: { current: lastSeq },
    statusCheckSentAtRef: { current: new Map() },
    requestLatestMessages: async () => {},
    sessionStore: { appendRealtime: () => {}, updateStreaming: (...args: unknown[]) => streams.push(args), finalizeStreaming: () => {} } as unknown as SessionStore,
  }));

  const dispatch = (event: ServerEvent) => listener?.(event);
  return { dispatch, getPending: () => pending, lastSeq, streams };
};

const requestEvent = (requestId: string, seq: number): ServerEvent => ({
  kind: 'permission_request',
  requestId,
  toolName: 'AskUserQuestion',
  input: { questions: [] },
  sessionId: 'viewed-session',
  seq,
} as unknown as ServerEvent);

const resolvedEvent = (requestId: string, seq: number): ServerEvent => ({
  kind: 'permission_resolved',
  requestId,
  sessionId: 'viewed-session',
  seq,
} as unknown as ServerEvent);

test('a replayed request followed by its resolution leaves no pending prompt', () => {
  const { dispatch, getPending } = renderHandlers();

  // Reconnect after a mid-run refresh: the ack carries no pending approvals,
  // then the replay re-delivers the answered request and its resolution.
  dispatch({
    kind: 'chat_subscribed',
    sessionId: 'viewed-session',
    isProcessing: true,
    pendingPermissions: [],
  } as unknown as ServerEvent);
  dispatch(requestEvent('req-answered', 1));
  dispatch(resolvedEvent('req-answered', 2));

  assert.deepEqual(getPending(), []);
});

test('an unanswered request stays pending through a resolution for another id', () => {
  const { dispatch, getPending } = renderHandlers();

  dispatch(requestEvent('req-open', 1));
  dispatch(resolvedEvent('req-other', 2));

  const pending = getPending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].requestId, 'req-open');
});

test('a reconnect ack resets replay progress after a server restart or a new run', () => {
  const {dispatch,lastSeq}=renderHandlers();
  dispatch(requestEvent('old-run',80));
  assert.equal(lastSeq.get('viewed-session'),80);
  dispatch({kind:'chat_subscribed',sessionId:'viewed-session',isProcessing:true,lastSeq:0,pendingPermissions:[]});
  assert.equal(lastSeq.get('viewed-session'),0);
  dispatch(requestEvent('new-run',1));
  assert.equal(lastSeq.get('viewed-session'),1);
});

test('Antigravity streams incrementally and restores then cancels an unanswered approval', () => {
  vi.useFakeTimers();
  try {
    const { dispatch, getPending, streams } = renderHandlers('gemini');
    dispatch({ kind: 'stream_delta', provider: 'gemini', sessionId: 'viewed-session', content: 'First' } as ServerEvent);
    vi.advanceTimersByTime(100);
    assert.deepEqual(streams.at(-1), ['viewed-session', 'First', 'gemini']);
    dispatch({ kind: 'stream_delta', provider: 'gemini', sessionId: 'viewed-session', content: ' second' } as ServerEvent);
    vi.advanceTimersByTime(100);
    assert.deepEqual(streams.at(-1), ['viewed-session', 'First second', 'gemini']);
    dispatch({ kind: 'chat_subscribed', sessionId: 'viewed-session', isProcessing: true,
      pendingPermissions: [{ ...requestEvent('agy-pending', 1), provider: 'gemini', toolName: 'Write file' }] } as ServerEvent);
    assert.equal(getPending()[0]?.requestId, 'agy-pending');
    dispatch({ kind: 'permission_cancelled', provider: 'gemini', sessionId: 'viewed-session', requestId: 'agy-pending' } as ServerEvent);
    assert.deepEqual(getPending(), []);
  } finally { vi.useRealTimers(); }
});
