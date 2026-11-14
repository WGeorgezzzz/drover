import { Terminal as UnifiedTerminal } from '@/shared/icons';
import { useTranslation } from 'react-i18next';

type StandaloneShellEmptyStateProps = {
  className: string;
};

/** Rendered by StandaloneShell when no project is selected, because a shell needs a working directory. */
export default function StandaloneShellEmptyState({ className }: StandaloneShellEmptyStateProps) {
  const { t } = useTranslation();
  return (
    <div className={`flex h-full items-center justify-center ${className}`}>
      <div className="text-center text-muted-foreground dark:text-muted-foreground">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted dark:bg-background">
          <UnifiedTerminal className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="mb-2 text-lg font-semibold">{t('misc.noProjectSelected')}</h3>
        <p>{t('misc.projectRequiredForShell')}</p>
      </div>
    </div>
  );
}
