import { sessionsDb } from '@/modules/database/index.js';
import { createNotificationEvent, notifyUserIfEnabled } from '@/modules/notifications/index.js';
import { connectedClients, clientUserIds } from '@/modules/websocket/index.js';
import type { MonitorRecord } from '@/shared/types.js';

/** Dispatcher and supervised workers report alerts against the source session. */
export function notifyMonitorAttention(row: MonitorRecord, runId: string, state: string, failure?: string | null): void {
  const action = /["']?(?:escalate|requiresUserAction|actionRequired|requiresConfirmation|confirm)["']?\s*[:=]\s*true\b/i.test(state);
  const error = Boolean(failure) || /["']?error["']?\s*[:=]\s*(?:true|"[^"\n]+")/i.test(state);
  if (!action && !error) return;
  const provider = sessionsDb.getSessionById(row.session_id)?.provider || 'system';
  const kind = action ? 'actionRequired' : 'error';
  const id = `monitor:${row.id}:${runId}:${kind}`;
  const event = { id, kind: 'monitor_notice', monitorId: row.id, noticeKind: kind, sessionId: row.session_id, runId, timestamp: new Date().toISOString() };
  for (const client of connectedClients) {
    if (client.readyState === 1 && clientUserIds.get(client) === row.user_id) client.send(JSON.stringify({ type: 'session_notice', event }));
  }
  notifyUserIfEnabled({ userId: row.user_id, event: createNotificationEvent({
    provider, sessionId: row.session_id, kind: action ? 'action_required' : 'error',
    code: 'agent.notification', dedupeKey: id, requiresUserAction: action,
    meta: { message: failure || row.name, sessionName: row.name }, severity: error ? 'error' : 'warning',
  }) });
}

/** An explicit monitor action acknowledges its outstanding confirmation alerts. */
export function notifyMonitorResolved(row: MonitorRecord): void {
  const event = { kind: 'monitor_resolved', monitorId: row.id, sessionId: row.session_id, timestamp: new Date().toISOString() };
  for (const client of connectedClients) {
    if (client.readyState === 1 && clientUserIds.get(client) === row.user_id) client.send(JSON.stringify({ type: 'session_notice', event }));
  }
}
