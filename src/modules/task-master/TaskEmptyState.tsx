import { Button } from '@/shared/ui/Button';
import { FileText, Settings, ListChecks } from '@/shared/icons';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/utils';
import type { PrdFile } from '@/shared/types';

type TaskEmptyStateProps = {
  className?: string;
  hasTaskMasterDirectory: boolean;
  existingPrds: PrdFile[];
  onOpenSetupModal: () => void;
  onCreatePrd: () => void;
  onOpenPrd: (prd: PrdFile) => void;
};

/** Rendered by TaskBoard when the project has no tasks, offering the TaskMaster setup and PRD entry points. */
export default function TaskEmptyState({
  className = '',
  hasTaskMasterDirectory,
  existingPrds,
  onOpenSetupModal,
  onCreatePrd,
  onOpenPrd,
}: TaskEmptyStateProps) {
  const { t } = useTranslation('tasks');

  if (!hasTaskMasterDirectory) {
    return (
      <div className={cn('text-center py-12', className)}>
        <div className="mx-auto max-w-md">
          <div className="mb-4 text-primary dark:text-primary">
            <Settings className="mx-auto mb-4 h-12 w-12" />
          </div>

          <h3 className="mb-2 text-lg font-semibold text-foreground dark:text-primary-foreground">{t('notConfigured.title')}</h3>
          <p className="mb-6 text-sm text-muted-foreground dark:text-muted-foreground">{t('notConfigured.description')}</p>

          <div className="mb-6 rounded-lg bg-primary/10 p-4 text-left dark:bg-primary">
            <h4 className="mb-3 text-sm font-medium text-primary dark:text-primary">{t('notConfigured.whatIsTitle')}</h4>
            <div className="space-y-1 text-xs text-primary dark:text-primary">
              <p>- {t('notConfigured.features.aiPowered')}</p>
              <p>- {t('notConfigured.features.prdTemplates')}</p>
              <p>- {t('notConfigured.features.dependencyTracking')}</p>
              <p>- {t('notConfigured.features.progressVisualization')}</p>

            </div>
          </div>

          <Button variant="ghost" size="compact"
            onClick={onOpenSetupModal}
            className="mx-auto flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary"
          >
            <ListChecks className="h-4 w-4" />
            {t('notConfigured.initializeButton')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('text-center py-12', className)}>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 rounded-xl border border-primary bg-gradient-to-r from-blue-50 to-indigo-50 p-6 text-left dark:border-primary dark:from-blue-950/50 dark:to-indigo-950/50">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 dark:bg-primary/50">
              <FileText className="h-5 w-5 text-primary dark:text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground dark:text-primary-foreground">{t('gettingStarted.title')}</h2>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground">{t('gettingStarted.subtitle')}</p>
            </div>
          </div>

          <div className="mb-4 space-y-3">
            <div className="rounded-lg border border-primary bg-card p-3 dark:border-primary/50 dark:bg-background/60">
              <h4 className="mb-1 font-medium text-foreground dark:text-primary-foreground">1. {t('gettingStarted.steps.createPRD.title')}</h4>
              <p className="mb-3 text-sm text-muted-foreground dark:text-muted-foreground">{t('gettingStarted.steps.createPRD.description')}</p>

              <Button variant="ghost" size="compact"
                onClick={onCreatePrd}
                className="inline-flex items-center gap-2 rounded bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/10 dark:bg-primary/30 dark:text-primary dark:hover:bg-primary/50"
              >
                <FileText className="h-3 w-3" />
                {t('gettingStarted.steps.createPRD.addButton')}
              </Button>

              {existingPrds.length > 0 && (
                <div className="mt-3 border-t border-border pt-3 dark:border-border">
                  <p className="mb-2 text-xs text-muted-foreground dark:text-muted-foreground">{t('gettingStarted.steps.createPRD.existingPRDs')}</p>
                  <div className="flex flex-wrap gap-2">
                    {existingPrds.map((prd) => (
                      <Button variant="ghost" size="compact"
                        key={prd.name}
                        onClick={() => onOpenPrd(prd)}
                        className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs text-foreground hover:bg-muted dark:bg-muted dark:text-muted-foreground dark:hover:bg-muted"
                      >
                        <FileText className="h-3 w-3" />
                        {prd.name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-primary bg-card p-3 dark:border-primary/50 dark:bg-background/60">
              <h4 className="mb-1 font-medium text-foreground dark:text-primary-foreground">2. {t('gettingStarted.steps.generateTasks.title')}</h4>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground">{t('gettingStarted.steps.generateTasks.description')}</p>
            </div>

            <div className="rounded-lg border border-primary bg-card p-3 dark:border-primary/50 dark:bg-background/60">
              <h4 className="mb-1 font-medium text-foreground dark:text-primary-foreground">3. {t('gettingStarted.steps.analyzeTasks.title')}</h4>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground">{t('gettingStarted.steps.analyzeTasks.description')}</p>
            </div>

            <div className="rounded-lg border border-primary bg-card p-3 dark:border-primary/50 dark:bg-background/60">
              <h4 className="mb-1 font-medium text-foreground dark:text-primary-foreground">4. {t('gettingStarted.steps.startBuilding.title')}</h4>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground">{t('gettingStarted.steps.startBuilding.description')}</p>
            </div>
          </div>

          <Button variant="ghost" size="compact"
            onClick={onCreatePrd}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary"
          >
            <FileText className="h-4 w-4" />
            {t('buttons.addPRD')}
          </Button>
        </div>

        <p className="text-sm text-muted-foreground dark:text-muted-foreground">{t('gettingStarted.tip')}</p>
      </div>
    </div>
  );
}
