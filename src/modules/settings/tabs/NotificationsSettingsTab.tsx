import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Switch } from '@/shared/ui';
import SettingsSection from '@/shared/ui/SettingsSection';
import SettingsCard from '@/shared/ui/SettingsCard';
import SettingsRow from '@/shared/ui/SettingsRow';
import { playChatCompletionSound } from '@/shared/utils';
import type { NotificationPreferencesState } from '@/shared/types';

type NotificationsSettingsTabProps = {
  notificationPreferences: NotificationPreferencesState;
  onNotificationPreferencesChange: (value: NotificationPreferencesState) => void;
  pushPermission: NotificationPermission | 'unsupported';
  isPushSubscribed: boolean;
  isPushLoading: boolean;
  onEnablePush: () => void;
  onDisablePush: () => void;
  isDesktop?: boolean;
  desktopNotifications?: { enabled: boolean; supported: boolean; connectedCount?: number; targetCount?: number; lastError?: string | null } | null;
  onEnableDesktopNotifications?: () => void;
  onDisableDesktopNotifications?: () => void;
  onTestDesktopNotification?: () => void;
};

/** Settings owns the event preferences used by browser, desktop and push delivery. */
export default function NotificationsSettingsTab({ notificationPreferences: p, onNotificationPreferencesChange: change, pushPermission, isPushSubscribed, isPushLoading, onEnablePush, onDisablePush, isDesktop = false, desktopNotifications, onEnableDesktopNotifications, onDisableDesktopNotifications, onTestDesktopNotification }: NotificationsSettingsTabProps) {
  const { t } = useTranslation('settings');
  // Browser permission can only be refreshed after the user's explicit gesture.
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => 'Notification' in window ? Notification.permission : 'unsupported');
  const channel = (key: keyof typeof p.channels, value: boolean) => change({ ...p, channels: { ...p.channels, [key]: value } });
  return <div className="space-y-6">
    <SettingsSection title={t('notifications.title')} description={t('notifications.description')}>
      <SettingsCard divided>
        <SettingsRow label={t('notifications.notice.inApp')}><Switch aria-label={t('notifications.notice.inApp')} checked={p.channels.inApp} onCheckedChange={value => channel('inApp', value)} /></SettingsRow>
        <SettingsRow label={isDesktop ? t('notifications.desktop.title') : t('notifications.notice.system')} description={isDesktop ? desktopNotifications?.lastError || undefined : `${t('notifications.notice.permission')}: ${t(`notifications.notice.${permission}`)}`}>
          <Switch aria-label={isDesktop ? t('notifications.desktop.title') : t('notifications.notice.system')} checked={isDesktop ? Boolean(desktopNotifications?.enabled) : p.channels.desktop} disabled={isDesktop ? desktopNotifications?.supported === false : permission === 'unsupported'} onCheckedChange={value => { if (isDesktop) { if (value) onEnableDesktopNotifications?.(); else onDisableDesktopNotifications?.(); } else channel('desktop', value); }} />
        </SettingsRow>
        {isDesktop && <div className="flex flex-wrap gap-2 px-4 py-3">
          <span className="text-sm text-muted-foreground">{t(`notifications.notice.${desktopNotifications?.supported === false ? 'unsupported' : desktopNotifications?.enabled ? 'granted' : 'default'}`)}</span>
          <Button variant="outline" size="sm" disabled={desktopNotifications?.enabled || desktopNotifications?.supported === false} onClick={onEnableDesktopNotifications}>{t('notifications.notice.request')}</Button>
          <Button variant="outline" size="sm" disabled={!desktopNotifications?.enabled} onClick={onTestDesktopNotification}>{t('notifications.notice.test')}</Button>
        </div>}
        {!isDesktop && <div className="flex flex-wrap gap-2 px-4 py-3">
          <Button variant="outline" size="sm" disabled={permission !== 'default'} onClick={async () => setPermission(await Notification.requestPermission())}>{t('notifications.notice.request')}</Button>
          <Button variant="outline" size="sm" disabled={permission !== 'granted'} onClick={() => { const n = new Notification('Drover', { body: t('notifications.notice.stop'), tag: 'drover-test' }); n.onclick = () => { window.focus(); n.close(); }; }}>{t('notifications.notice.test')}</Button>
        </div>}
        {!isDesktop && <SettingsRow label={t('notifications.webPush.title')} description={pushPermission === 'unsupported' ? t('notifications.webPush.unsupported') : pushPermission === 'denied' ? t('notifications.webPush.denied') : undefined}><Switch aria-label={t('notifications.webPush.title')} disabled={isPushLoading || pushPermission === 'unsupported' || pushPermission === 'denied'} checked={isPushSubscribed} onCheckedChange={value => { if (value) onEnablePush(); else onDisablePush(); }} /></SettingsRow>}
        <SettingsRow label={t('notifications.sound.title')} description={t('notifications.sound.description')}><Switch aria-label={t('notifications.sound.title')} checked={p.channels.sound} onCheckedChange={value => channel('sound', value)} /></SettingsRow>
        <div className="px-4 py-3"><Button variant="outline" size="sm" onClick={() => { void playChatCompletionSound({ force: true }); }}>{t('notifications.sound.test')}</Button></div>
      </SettingsCard>
    </SettingsSection>
    <SettingsSection title={t('notifications.events.title')}><SettingsCard divided>{(['stop', 'actionRequired', 'error'] as const).map(key => <SettingsRow key={key} label={t(`notifications.events.${key}`)}><Switch aria-label={t(`notifications.events.${key}`)} checked={p.events[key]} onCheckedChange={value => change({ ...p, events: { ...p.events, [key]: value } })} /></SettingsRow>)}</SettingsCard></SettingsSection>
  </div>;
}
