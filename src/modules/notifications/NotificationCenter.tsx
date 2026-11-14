import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CircleCheck, MessageCircleQuestion, TriangleAlert } from '@/shared/icons';
import { useAuth } from '@/modules/auth';
import { api, readApiJson } from '@/shared/api';
import { useWebSocket } from '@/shared/context/WebSocketContext';
import { Toast } from '@/shared/ui/Toast';
import { playNotificationSound } from '@/shared/utils';
import type { NotificationPreferencesState } from '@/shared/types';

type Notice = { id: string; sessionId: string; kind: 'stop' | 'actionRequired' | 'error'; expires: number };
// Memoized sidebar rows subscribe to the same unread snapshot as the toast host.
let unread: Record<string, Notice['kind']> = {};
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const publish = () => { for (const listener of listeners) listener(); };
const defaults: NotificationPreferencesState = { channels: { inApp: true, desktop: false, webPush: false, sound: true }, events: { stop: true, actionRequired: true, error: true } };

/** Sidebar rows distinguish unread completion from an outstanding user action. */
export function SessionNotificationBadge({ sessionId }: { sessionId: string }) {
  const kind = useSyncExternalStore(subscribe, () => unread[sessionId]);
  const { t } = useTranslation('settings');
  if (!kind) return null;
  const Icon = kind === 'actionRequired' ? MessageCircleQuestion : kind === 'error' ? TriangleAlert : CircleCheck;
  return <span role="status" title={t(`notifications.notice.${kind}`)} aria-label={t(`notifications.notice.${kind}`)} className="text-primary"><Icon size={14} /></span>;
}

/** App mounts this once inside Router to deliver live events across all sessions. */
export function NotificationCenter() {
  const { subscribe: subscribeEvents } = useWebSocket();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation('settings');
  // Toast visibility is transient; unread state and deduplication survive refresh per account.
  const [toasts, setToasts] = useState<Notice[]>([]);
  const [revision, setRevision] = useState(0);
  const preferences = useRef(defaults);
  const seen = useRef(new Set<string>());
  const pending = useRef<Record<string, string[]>>({});
  const startedAt = useRef(Date.now());
  const activePath = useRef(pathname);
  activePath.current = pathname;
  const storageKey = `drover-notices:${user?.id ?? 'anonymous'}`;
  const persist = () => { try { localStorage.setItem(storageKey, JSON.stringify({ unread, pending: pending.current, seen: [...seen.current].slice(-2000) })); } catch { /* Work without browser storage too. */ } };

  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); unread = saved.unread || {}; pending.current = saved.pending || {}; seen.current = new Set(saved.seen || []); } catch { unread = {}; pending.current = {}; seen.current = new Set(); }
    publish(); setRevision(value => value + 1);
    const load = () => { void api.settings.notificationPreferences().then(readApiJson<{ preferences: NotificationPreferencesState }>).then(value => { preferences.current = value.preferences || defaults; }).catch(() => {}); };
    const syncStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      try { const saved = JSON.parse(event.newValue || '{}'); unread = saved.unread || {}; pending.current = saved.pending || {}; seen.current = new Set(saved.seen || []); publish(); setRevision(value => value + 1); } catch { /* Ignore malformed storage from another tab. */ }
    };
    load(); window.addEventListener('drover:notification-preferences', load); window.addEventListener('storage', syncStorage);
    return () => { window.removeEventListener('drover:notification-preferences', load); window.removeEventListener('storage', syncStorage); unread = {}; publish(); };
  }, [storageKey]);

  useEffect(() => {
    const acknowledge = () => {
      if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
      const sid = decodeURIComponent(activePath.current.match(/\/session\/([^/]+)/)?.[1] || '');
      // Questions remain marked until resolved by the server.
      if (sid && unread[sid] && unread[sid] !== 'actionRequired') { unread = { ...unread }; delete unread[sid]; persist(); publish(); setRevision(value => value + 1); }
    };
    acknowledge(); window.addEventListener('focus', acknowledge); document.addEventListener('visibilitychange', acknowledge);
    return () => { window.removeEventListener('focus', acknowledge); document.removeEventListener('visibilitychange', acknowledge); };
  }, [pathname, storageKey]);

  useEffect(() => subscribeEvents(event => {
    const envelope = event as unknown as Record<string, unknown>;
    const e = envelope.type === 'session_notice' && envelope.event && typeof envelope.event === 'object' ? envelope.event as Record<string, unknown> : envelope;
    const sid = typeof e.sessionId === 'string' ? e.sessionId : '';
    if (!sid) return;
    if (e.kind === 'monitor_resolved' && e.monitorId) {
      pending.current[sid] = (pending.current[sid] || []).filter(id => !id.startsWith(`monitor:${e.monitorId}:`));
      if (!pending.current[sid].length && unread[sid] === 'actionRequired') { unread = { ...unread }; delete unread[sid]; }
      persist(); publish(); setRevision(value => value + 1); return;
    }
    if (e.kind === 'permission_resolved' || e.kind === 'permission_cancelled') {
      pending.current[sid] = e.requestId ? (pending.current[sid] || []).filter(id => id !== e.requestId) : [];
      if (!pending.current[sid].length) { unread = { ...unread }; delete unread[sid]; }
      persist(); publish(); setRevision(value => value + 1); return;
    }
    const kind: Notice['kind'] | null = e.kind === 'complete' ? (e.success === false || Number(e.exitCode || 0) !== 0 ? 'error' : 'stop') : e.kind === 'permission_request' || e.kind === 'interactive_prompt' ? 'actionRequired' : e.kind === 'monitor_notice' && (e.noticeKind === 'actionRequired' || e.noticeKind === 'error') ? e.noticeKind : null;
    if (!kind || e.aborted) return;
    const time = typeof e.timestamp === 'number' ? e.timestamp : Date.parse(String(e.timestamp || ''));
    // Never turn historical replay into a fresh announcement.
    if (!Number.isFinite(time) || time < startedAt.current) return;
    const id = [sid, e.runId || '', e.kind, e.requestId || e.id || e.seq || e.timestamp].join(':');
    // Another same-origin tab may already have claimed this exact event.
    try { const saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); for (const key of saved.seen || []) seen.current.add(key); } catch { /* Storage is optional. */ }
    if (seen.current.has(id)) return;
    seen.current.add(id);
    const viewing = activePath.current === `/session/${encodeURIComponent(sid)}` && document.visibilityState === 'visible' && document.hasFocus();
    if (kind === 'actionRequired') pending.current[sid] = [...new Set([...(pending.current[sid] || []), String(e.requestId || e.id || id)])];
    unread = { ...unread }; if (pending.current[sid]?.length) unread[sid] = 'actionRequired'; else if (viewing) delete unread[sid]; else unread[sid] = kind;
    persist(); publish(); setRevision(value => value + 1);
    const p = preferences.current;
    if (!p.events[kind]) return;
    const notice: Notice = { id, sessionId: sid, kind, expires: Date.now() + 9000 };
    if (p.channels.inApp && !viewing) setToasts(old => [...old.filter(n => n.sessionId !== sid || n.kind !== kind), notice].slice(-4));
    if (p.channels.sound && !viewing && !(window as unknown as { cloudcliDesktopNotifications?: unknown }).cloudcliDesktopNotifications && !p.channels.webPush) void playNotificationSound({ force: true });
    // Electron and Web Push already receive the server orchestrator event.
    if ((document.visibilityState !== 'visible' || !document.hasFocus()) && p.channels.desktop && !(window as unknown as { cloudcliDesktopNotifications?: unknown }).cloudcliDesktopNotifications && !p.channels.webPush && 'Notification' in window && Notification.permission === 'granted') {
      try { const n = new Notification('Drover', { body: t(`notifications.notice.${kind}`), tag: id }); n.onclick = () => { window.focus(); navigate(`/session/${encodeURIComponent(sid)}`); n.close(); }; } catch { /* Mobile uses the existing push subscription. */ }
    }
  }), [subscribeEvents, storageKey, navigate, t]);

  useEffect(() => { const timer = window.setInterval(() => setToasts(old => old.filter(n => n.expires > Date.now())), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    const count = Object.keys(unread).length;
    const update = () => { const base = document.title.replace(/^\(\d+\)\s*/, ''); const next = count ? `(${count}) ${base}` : base; if (next !== document.title) document.title = next; };
    update(); const observer = new MutationObserver(update); observer.observe(document.querySelector('title') || document.head, { childList: true, subtree: true, characterData: true });
    // Browsers may choose either the SVG or PNG favicon, so update every candidate.
    const icons = [...document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')];
    const originals = icons.map(icon => ({ icon, href: icon.href, type: icon.type }));
    let created: HTMLLinkElement | undefined;
    if (count) { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32; const c = canvas.getContext('2d'); if (c) { c.fillStyle = getComputedStyle(document.body).color; c.beginPath(); c.arc(16,16,15,0,Math.PI*2); c.fill(); c.fillStyle = `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--background')})`; c.font = 'bold 18px sans-serif'; c.textAlign = 'center'; c.fillText(String(count > 99 ? '99+' : count),16,22); if (!icons.length) { created = document.createElement('link'); created.rel='icon'; document.head.append(created); icons.push(created); } for (const icon of icons) { icon.type = 'image/png'; icon.href=canvas.toDataURL(); } } }
    return () => { observer.disconnect(); document.title=document.title.replace(/^\(\d+\)\s*/, ''); for (const { icon, href, type } of originals) { icon.href = href; icon.type = type; } created?.remove(); };
  }, [revision]);

  return <div aria-live="polite" aria-label={t('notifications.title')} className="pointer-events-none fixed bottom-4 right-4 z-[10000] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">{toasts.map(n => <div key={n.id} className="pointer-events-auto"><Toast closeLabel={t('notifications.notice.close')} onClose={() => setToasts(old => old.filter(x => x.id !== n.id))} onOpen={() => { navigate(`/session/${encodeURIComponent(n.sessionId)}`); setToasts(old => old.filter(x => x.id !== n.id)); }}>{t(`notifications.notice.${n.kind}`)}</Toast></div>)}</div>;
}
