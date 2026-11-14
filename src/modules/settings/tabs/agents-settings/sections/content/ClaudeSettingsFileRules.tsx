import { FileText } from '@/shared/icons';
import { useTranslation } from 'react-i18next';

import { useClaudeSettingsPermissionRules } from '@/modules/settings/hooks/useClaudeSettingsPermissionRules';
import type { ClaudeSettingsPermissionSource } from '@/shared/types';

const RULE_GROUPS = [
  { key: 'allow', chipClassName: 'border-success bg-success/10 text-success dark:border-success dark:bg-success/20 dark:text-success' },
  { key: 'ask', chipClassName: 'border-warning bg-warning/10 text-warning dark:border-warning dark:bg-warning/20 dark:text-warning' },
  { key: 'deny', chipClassName: 'border-destructive bg-destructive/10 text-destructive dark:border-destructive dark:bg-destructive/20 dark:text-destructive' },
] as const;

function SettingsFileCard({ source }: { source: ClaudeSettingsPermissionSource }) {
  const { t } = useTranslation('settings');
  const hasRules = RULE_GROUPS.some(({ key }) => source[key].length > 0);

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card/50 p-3" data-testid={`claude-settings-file-${source.scope}`}>
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{t(`permissions.settingsFiles.sources.${source.scope}`)}</div>
        <div className="break-all font-mono text-xs text-muted-foreground">{source.path}</div>
      </div>

      {source.status === 'invalid' && (
        <p className="text-sm text-warning dark:text-warning">{t('permissions.settingsFiles.invalid')}</p>
      )}
      {source.status === 'missing' && (
        <p className="text-sm text-muted-foreground">{t('permissions.settingsFiles.missing')}</p>
      )}
      {source.status === 'ok' && !hasRules && (
        <p className="text-sm text-muted-foreground">{t('permissions.settingsFiles.empty')}</p>
      )}

      {RULE_GROUPS.filter(({ key }) => source[key].length > 0).map(({ key, chipClassName }) => (
        <div key={key} className="space-y-1" data-testid={`claude-settings-file-${source.scope}-${key}`}>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t(`permissions.settingsFiles.groups.${key}`)}
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {source[key].map((rule) => (
              <li key={rule} className={`max-w-full break-all rounded border px-2 py-0.5 font-mono text-xs ${chipClassName}`}>
                {rule}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Used by PermissionsContent (Claude variant) to show, read-only, the rules the
 * Claude CLI also applies from its own settings files, so users can see why a
 * tool runs or is refused without a matching entry in the lists above.
 */
export default function ClaudeSettingsFileRules() {
  const { t } = useTranslation('settings');
  const { sources, loadFailed } = useClaudeSettingsPermissionRules();
  // A missing managed file is the normal case outside managed installs; only
  // the user's own file is worth a "not found" line.
  const visibleSources = (sources ?? []).filter((source) => source.scope === 'user' || source.status !== 'missing');

  return (
    <div className="space-y-4" data-testid="claude-settings-file-rules">
      <div className="flex items-center gap-3">
        <FileText className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-medium text-foreground">{t('permissions.settingsFiles.title')}</h3>
      </div>
      <p className="text-sm text-muted-foreground">{t('permissions.settingsFiles.description')}</p>

      {loadFailed && (
        <p className="text-sm text-warning dark:text-warning">{t('permissions.settingsFiles.loadFailed')}</p>
      )}
      {!loadFailed && sources === null && (
        <p className="text-sm text-muted-foreground">{t('permissions.settingsFiles.loading')}</p>
      )}

      {visibleSources.length > 0 && (
        <div className="space-y-2">
          {visibleSources.map((source) => (
            <SettingsFileCard key={source.scope} source={source} />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t('permissions.settingsFiles.projectNote')}</p>
    </div>
  );
}
