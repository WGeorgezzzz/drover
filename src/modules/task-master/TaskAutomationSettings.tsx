import { useCallback, useEffect, useState } from 'react';
import { api } from '@/shared/api';
import { useTranslation } from 'react-i18next';
import { Switch, SettingsRow } from '@/shared/ui';
import type { TaskMasterAutoSettings } from '@/shared/types';

type Props = { root?: string | null };
/** Settings and the conversation task panel share account and per-project automation controls. */
export function TaskAutomationSettings({ root }: Props) {
  const { t } = useTranslation('settings');
  // Server-owned preferences are edited only after hydration succeeds.
  const [settings, setSettings] = useState<TaskMasterAutoSettings | null>(null);
  // Network errors are shown inline instead of silently losing a settings change.
  const [error, setError] = useState('');
  const load = useCallback(async () => { try { const r = await api.taskmaster.autoSettings(); if (!r.ok) throw new Error(t('taskAutomation.loadFailed')); setSettings(await r.json()); } catch (e) { setError(String(e)); } }, [t]);
  useEffect(() => { void load(); }, [load]);
  const save = async (next: TaskMasterAutoSettings) => { try { const r = await api.taskmaster.saveAutoSettings(next); if (!r.ok) throw new Error(t('taskAutomation.saveFailed')); setSettings(await r.json()); setError(''); } catch (e) { setError(String(e)); } };
  if (!settings) return <p className="text-xs text-muted-foreground">{error || t('taskAutomation.loading')}</p>;
  return <div className="space-y-3 text-sm">
    <SettingsRow label={t('taskAutomation.enabled')}><Switch aria-label={t('taskAutomation.enabled')} checked={settings.enabled} onCheckedChange={value => void save({ ...settings, enabled: value })}/></SettingsRow>
    <SettingsRow label={t('taskAutomation.suggestOnly')}><Switch aria-label={t('taskAutomation.suggestOnly')} checked={settings.suggestOnly} onCheckedChange={value => void save({ ...settings, suggestOnly: value })}/></SettingsRow>
    {root && <SettingsRow label={t('taskAutomation.project')}><Switch aria-label={t('taskAutomation.project')} checked={!settings.disabledProjects.includes(root)} onCheckedChange={value => void save({ ...settings, disabledProjects: value ? settings.disabledProjects.filter(p => p !== root) : [...settings.disabledProjects, root] })}/></SettingsRow>}
    <p className="text-xs text-muted-foreground">{t('taskAutomation.description')}</p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </div>;
}
