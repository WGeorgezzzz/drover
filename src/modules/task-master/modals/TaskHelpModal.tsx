import { Dialog as UnifiedDialog, DialogContent as UnifiedDialogContent } from '@/shared/ui/Dialog';
import { Button } from '@/shared/ui/Button';
import { ExternalLink, FileText, X } from '@/shared/icons';
import { useTranslation } from 'react-i18next';

type TaskHelpModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreatePrd: () => void;
};

type HelpStep = {
  index: number;
  title: string;
  description: string;
  accent: string;
};

/** Rendered by TaskBoard to walk through the PRD-to-tasks workflow. */
export default function TaskHelpModal({ isOpen, onClose, onCreatePrd }: TaskHelpModalProps) {
  const { t } = useTranslation('tasks');

  if (!isOpen) {
    return null;
  }

  const steps: HelpStep[] = [
    {
      index: 1,
      title: t('gettingStarted.steps.createPRD.title'),
      description: t('gettingStarted.steps.createPRD.description'),
      accent: 'border-primary dark:border-primary bg-primary/10 dark:bg-primary/40',
    },
    {
      index: 2,
      title: t('gettingStarted.steps.generateTasks.title'),
      description: t('gettingStarted.steps.generateTasks.description'),
      accent: 'border-success dark:border-success bg-success/10 dark:bg-success/40',
    },
    {
      index: 3,
      title: t('gettingStarted.steps.analyzeTasks.title'),
      description: t('gettingStarted.steps.analyzeTasks.description'),
      accent: 'border-warning dark:border-warning bg-warning/10 dark:bg-warning/40',
    },
    {
      index: 4,
      title: t('gettingStarted.steps.startBuilding.title'),
      description: t('gettingStarted.steps.startBuilding.description'),
      accent: 'border-primary dark:border-primary bg-primary/10 dark:bg-primary/40',
    },
  ];

  return (
    <UnifiedDialog open onOpenChange={(open) => { if (!open) { onClose(); } }}>
      <UnifiedDialogContent wrapperClassName="z-50"  className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg border border-border bg-card shadow-xl dark:border-border dark:bg-background">
        <div className="flex items-center justify-between border-b border-border p-6 dark:border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 dark:bg-primary/50">
              <FileText className="h-5 w-5 text-primary dark:text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground dark:text-primary-foreground">{t('helpGuide.title')}</h2>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground">{t('helpGuide.subtitle')}</p>
            </div>
          </div>

          <Button variant="ghost" size="compact"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted dark:hover:text-muted-foreground"
            title="Close"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="max-h-[calc(90vh-120px)] space-y-4 overflow-y-auto p-6">
          {steps.map((step) => (
            <div key={step.index} className={`rounded-lg border p-4 ${step.accent}`}>
              <div className="flex gap-4">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {step.index}
                </div>
                <div>
                  <h4 className="mb-2 font-medium text-foreground dark:text-primary-foreground">{step.title}</h4>
                  <p className="text-sm text-foreground dark:text-muted-foreground">{step.description}</p>

                  {step.index === 1 && (
                    <Button variant="ghost" size="compact"
                      onClick={() => {
                        onCreatePrd();
                        onClose();
                      }}
                      className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 text-sm text-primary hover:bg-primary/10 dark:bg-primary/30 dark:text-primary dark:hover:bg-primary/50"
                    >
                      <FileText className="h-4 w-4" />
                      {t('buttons.addPRD')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}

          <div className="rounded-lg border border-border bg-muted p-4 dark:border-border dark:bg-background/50">
            <h4 className="mb-2 font-medium text-foreground dark:text-primary-foreground">{t('helpGuide.proTips.title')}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground dark:text-muted-foreground">
              <li>{t('helpGuide.proTips.search')}</li>
              <li>{t('helpGuide.proTips.views')}</li>
              <li>{t('helpGuide.proTips.filters')}</li>
              <li>{t('helpGuide.proTips.details')}</li>
            </ul>
          </div>

          <div className="rounded-lg border border-primary bg-primary/10 p-4 dark:border-primary dark:bg-primary/40">
            <h4 className="mb-2 font-medium text-primary dark:text-primary">{t('helpGuide.learnMore.title')}</h4>
            <p className="mb-3 text-sm text-primary dark:text-primary">{t('helpGuide.learnMore.description')}</p>
            <a
              href="https://github.com/eyaltoledano/claude-task-master"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary"
            >
              {t('helpGuide.learnMore.githubButton')}
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </UnifiedDialogContent>
    </UnifiedDialog>
  );
}
