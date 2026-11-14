import { useTranslation } from 'react-i18next';

import type { LLMProvider, ProviderAuthStatusMap } from '@/shared/types';
import AgentConnectionCard from '@/modules/onboarding/AgentConnectionCard';

type AgentConnectionsStepProps = {
  providerStatuses: ProviderAuthStatusMap;
  onOpenProviderLogin: (provider: LLMProvider) => void;
};

const providerCards = [
  {
    provider: 'claude' as const,
    title: 'Claude Code',
    connectedClassName: 'bg-primary/10 dark:bg-primary/20 border-primary dark:border-primary',
    iconContainerClassName: 'bg-primary/10 dark:bg-primary/30',
    loginButtonClassName: 'bg-primary hover:bg-primary',
  },
  {
    provider: 'cursor' as const,
    title: 'Cursor',
    connectedClassName: 'bg-primary/10 dark:bg-primary/20 border-primary dark:border-primary',
    iconContainerClassName: 'bg-primary/10 dark:bg-primary/30',
    loginButtonClassName: 'bg-primary hover:bg-primary',
  },
  {
    provider: 'codex' as const,
    title: 'OpenAI Codex',
    connectedClassName: 'bg-muted dark:bg-background/50 border-border dark:border-border',
    iconContainerClassName: 'bg-muted dark:bg-background',
    loginButtonClassName: 'bg-background hover:bg-background dark:bg-muted dark:hover:bg-muted',
  },
  {
    provider: 'opencode' as const,
    title: 'OpenCode',
    connectedClassName: 'bg-muted dark:bg-background/50 border-border dark:border-border',
    iconContainerClassName: 'bg-muted dark:bg-background',
    loginButtonClassName: 'bg-background hover:bg-background dark:bg-muted dark:hover:bg-muted',
  },
];

/** Rendered by Onboarding as its second step, listing every CLI provider the user can log into. */
export default function AgentConnectionsStep({
  providerStatuses,
  onOpenProviderLogin,
}: AgentConnectionsStepProps) {
  const { t } = useTranslation('auth');
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="font-serif text-xl font-bold tracking-tight text-foreground">{t('onboarding.agentsStepTitle')}</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {t('onboarding.agentsStepDescription')}
        </p>
      </div>

      <div className="-mr-1 max-h-[38vh] space-y-2 overflow-y-auto pr-1">
        {providerCards.map((providerCard) => (
          <AgentConnectionCard
            key={providerCard.provider}
            provider={providerCard.provider}
            title={providerCard.title}
            status={providerStatuses[providerCard.provider]}
            connectedClassName={providerCard.connectedClassName}
            iconContainerClassName={providerCard.iconContainerClassName}
            loginButtonClassName={providerCard.loginButtonClassName}
            onLogin={() => onOpenProviderLogin(providerCard.provider)}
          />
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">{t('onboarding.agentsLaterHint')}</p>
    </div>
  );
}
