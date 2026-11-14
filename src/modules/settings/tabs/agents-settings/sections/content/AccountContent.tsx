import { AlertTriangle, LogIn } from '@/shared/icons';
import { useTranslation } from 'react-i18next';

import { Badge, Button, LLMProviderLogo } from '@/shared/ui';
import type { AgentProvider, ProviderAuthStatus, ProviderAuthSubscriptionOverride } from '@/shared/types';

type AccountContentProps = {
  agent: AgentProvider;
  authStatus: ProviderAuthStatus;
  onLogin: () => void;
};

type AgentVisualConfig = {
  name: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  subtextClass: string;
  buttonClass: string;
  description?: string;
};

const agentConfig: Record<AgentProvider, AgentVisualConfig> = {
  gemini: {name:'Gemini',bgClass:'bg-primary/10 dark:bg-primary',borderClass:'border-primary dark:border-primary',textClass:'text-primary dark:text-primary',subtextClass:'text-primary dark:text-primary',buttonClass:'bg-primary hover:bg-primary'},
  claude: {
    name: 'Claude',
    bgClass: 'bg-primary/10 dark:bg-primary/20',
    borderClass: 'border-primary dark:border-primary',
    textClass: 'text-primary dark:text-primary',
    subtextClass: 'text-primary dark:text-primary',
    buttonClass: 'bg-primary hover:bg-primary active:bg-primary',
  },
  cursor: {
    name: 'Cursor',
    bgClass: 'bg-primary/10 dark:bg-primary/20',
    borderClass: 'border-primary dark:border-primary',
    textClass: 'text-primary dark:text-primary',
    subtextClass: 'text-primary dark:text-primary',
    buttonClass: 'bg-primary hover:bg-primary active:bg-primary',
  },
  codex: {
    name: 'Codex',
    bgClass: 'bg-muted/50',
    borderClass: 'border-border dark:border-border',
    textClass: 'text-foreground dark:text-foreground',
    subtextClass: 'text-foreground dark:text-muted-foreground',
    buttonClass: 'bg-background hover:bg-background active:bg-background dark:bg-muted dark:hover:bg-muted dark:active:bg-muted',
  },
  'deepseek-harness': {
    name: 'DeepSeek Harness', description: '使用本机 Harness 配置运行任务',
    bgClass: 'bg-primary/10 dark:bg-primary/20', borderClass: 'border-primary dark:border-primary',
    textClass: 'text-primary dark:text-primary', subtextClass: 'text-primary dark:text-primary', buttonClass: 'bg-primary hover:bg-primary',
  },
  workbuddy: {
    name: 'WorkBuddy', description: 'Use the WorkBuddy account signed in on this Windows computer. Conversations only.',
    bgClass: 'bg-primary/10 dark:bg-primary/20', borderClass: 'border-primary dark:border-primary',
    textClass: 'text-primary dark:text-primary', subtextClass: 'text-primary dark:text-primary',
    buttonClass: 'bg-primary hover:bg-primary',
  },
  opencode: {
    name: 'OpenCode',
    description: 'OpenCode CLI assistant',
    bgClass: 'bg-muted dark:bg-background/20',
    borderClass: 'border-border dark:border-border',
    textClass: 'text-foreground dark:text-foreground',
    subtextClass: 'text-foreground dark:text-muted-foreground',
    buttonClass: 'bg-background hover:bg-background active:bg-background dark:bg-muted dark:hover:bg-muted',
  },
};

type SubscriptionOverrideNoticeProps = {
  override: ProviderAuthSubscriptionOverride;
};

// Issue #568: Claude Code prefers ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN over
// the `claude /login` subscription and says nothing about it, so a subscriber
// who also has a key in the server env is billed pay-as-you-go without knowing.
// The server only reports the override while a usable login is really being
// bypassed, so this stays out of the way for key-only and login-only setups.
function SubscriptionOverrideNotice({ override }: SubscriptionOverrideNoticeProps) {
  const { t } = useTranslation('settings');
  const source = t(`agents.subscriptionOverride.source.${override.source}`);
  const description = override.subscriptionEmail
    ? t('agents.subscriptionOverride.descriptionWithEmail', {
      variable: override.variable,
      source,
      email: override.subscriptionEmail,
    })
    : t('agents.subscriptionOverride.description', { variable: override.variable, source });

  return (
    <div
      role="alert"
      data-testid="provider-auth-subscription-override"
      className="rounded-lg border border-warning bg-warning/10 p-3 dark:border-warning dark:bg-warning/30"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning dark:text-warning" />
        <div className="space-y-1 text-sm text-warning dark:text-warning">
          <div className="font-medium">{t('agents.subscriptionOverride.title')}</div>
          <p>{description}</p>
          <p>{t(`agents.subscriptionOverride.fix.${override.source}`, { variable: override.variable })}</p>
        </div>
      </div>
    </div>
  );
}

/** Rendered by AgentCategoryContentSection for the "account" category to show sign-in state for one provider. */
export default function AccountContent({ agent, authStatus, onLogin }: AccountContentProps) {
  const { t } = useTranslation('settings');
  const config = agentConfig[agent];

  return (
    <div className="space-y-6">
      <div className="mb-4 flex items-center gap-3">
        <LLMProviderLogo provider={agent} className="h-6 w-6" />
        <div>
          <h3 className="text-lg font-medium text-foreground">{config.name}</h3>
          <p className="text-sm text-muted-foreground">
            {t(`agents.account.${agent}.description`, {
              defaultValue: config.description || `${config.name} CLI assistant`,
            })}
          </p>
        </div>
      </div>

      <div className={`${config.bgClass} border ${config.borderClass} rounded-lg p-4`}>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className={`font-medium ${config.textClass}`}>
                {t('agents.connectionStatus')}
              </div>
              <div className={`text-sm ${config.subtextClass}`}>
                {authStatus.loading ? (
                  t('agents.authStatus.checkingAuth')
                ) : authStatus.authenticated ? (
                  t('agents.authStatus.loggedInAs', {
                    email: authStatus.email || t('agents.authStatus.authenticatedUser'),
                  })
                ) : (
                  t('agents.authStatus.notConnected')
                )}
              </div>
            </div>
            <div>
              {authStatus.loading ? (
                <Badge variant="secondary" className="bg-muted">
                  {t('agents.authStatus.checking')}
                </Badge>
              ) : authStatus.authenticated ? (
                <Badge variant="secondary" className="bg-success/10 text-success dark:bg-success/30 dark:text-success">
                  {t('agents.authStatus.connected')}
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-muted text-foreground dark:bg-background dark:text-muted-foreground">
                  {t('agents.authStatus.disconnected')}
                </Badge>
              )}
            </div>
          </div>

          {!authStatus.loading && authStatus.subscriptionOverride && (
            <SubscriptionOverrideNotice override={authStatus.subscriptionOverride} />
          )}

          {authStatus.method !== 'api_key' && (
            <div className="border-t border-border/50 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className={`font-medium ${config.textClass}`}>
                    {authStatus.authenticated ? t('agents.login.reAuthenticate') : t('agents.login.title')}
                  </div>
                  <div className={`text-sm ${config.subtextClass}`}>
                    {authStatus.authenticated
                      ? t('agents.login.reAuthDescription')
                      : t('agents.login.description', { agent: config.name })}
                  </div>
                </div>
                <Button
                  onClick={onLogin}
                  className={`${config.buttonClass} text-primary-foreground`}
                  size="sm"
                >
                  <LogIn className="mr-2 h-4 w-4" />
                  {authStatus.authenticated ? t('agents.login.reLoginButton') : t('agents.login.button')}
                </Button>
              </div>
            </div>
          )}

          {authStatus.error && (
            <div className="border-t border-border/50 pt-4">
              <div className="text-sm text-destructive dark:text-destructive">
                {t('agents.error', { error: authStatus.error })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
