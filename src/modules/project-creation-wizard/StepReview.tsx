import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { isSshGitUrl } from '@/modules/project-creation-wizard/utils/pathUtils';
import type { WizardFormState } from '@/shared/types';

type StepReviewProps = {
  formState: WizardFormState;
  selectedTokenName: string | null;
  isCreating: boolean;
  cloneProgress: string;
};

/** Rendered by ProjectCreationWizard as step 2, summarising the chosen configuration and streaming clone progress. */
export default function StepReview({
  formState,
  selectedTokenName,
  isCreating,
  cloneProgress,
}: StepReviewProps) {
  const { t } = useTranslation();

  const authenticationLabel = useMemo(() => {
    if (formState.tokenMode === 'stored' && formState.selectedGithubToken) {
      return `${t('projectWizard.step3.usingStoredToken')} ${selectedTokenName || t('common:misc.unknownProvider')}`;
    }

    if (formState.tokenMode === 'new' && formState.newGithubToken.trim()) {
      return t('projectWizard.step3.usingProvidedToken');
    }

    if (isSshGitUrl(formState.githubUrl)) {
      return t('projectWizard.step3.sshKey', { defaultValue: 'SSH Key' });
    }

    return t('projectWizard.step3.noAuthentication');
  }, [formState, selectedTokenName, t]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted p-4 dark:border-border dark:bg-background/50">
        <h4 className="mb-3 text-sm font-semibold text-foreground dark:text-primary-foreground">
          {t('projectWizard.step3.reviewConfig')}
        </h4>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground dark:text-muted-foreground">{t('projectWizard.step3.path')}</span>
            <span className="break-all font-mono text-xs text-foreground dark:text-primary-foreground">
              {formState.workspacePath}
            </span>
          </div>

          {formState.githubUrl && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground dark:text-muted-foreground">
                  {t('projectWizard.step3.cloneFrom')}
                </span>
                <span className="break-all font-mono text-xs text-foreground dark:text-primary-foreground">
                  {formState.githubUrl}
                </span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground dark:text-muted-foreground">
                  {t('projectWizard.step3.authentication')}
                </span>
                <span className="text-xs text-foreground dark:text-primary-foreground">{authenticationLabel}</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-primary bg-primary/10 p-4 dark:border-primary dark:bg-primary/20">
        {isCreating && cloneProgress ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-primary dark:text-primary">
              {t('projectWizard.step3.cloningRepository', { defaultValue: 'Cloning repository...' })}
            </p>
            <code className="block whitespace-pre-wrap break-all font-mono text-xs text-primary dark:text-primary">
              {cloneProgress}
            </code>
          </div>
        ) : (
          <p className="text-sm text-primary dark:text-primary">
            {formState.githubUrl
              ? t('projectWizard.step3.newWithClone')
              : t('projectWizard.step3.newEmpty')}
          </p>
        )}
      </div>
    </div>
  );
}
