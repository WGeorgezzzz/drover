import { Button } from '@/shared/ui/Button';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle,
  Circle,
  Eye,
  Flag,
  List,
  Play,
  Settings,
  Target,
  ListChecks,
  Zap,
} from '@/shared/icons';

import { cn } from '@/shared/utils';
import { useTaskMaster } from '@/modules/task-master/context/TaskMasterContext';
import TaskDetailModal from '@/modules/task-master/modals/TaskDetailModal';
import TaskMasterSetupModal from '@/modules/task-master/modals/TaskMasterSetupModal';

type NextTaskBannerProps = {
  onShowAllTasks?: (() => void) | null;
  onStartTask?: (() => void) | null;
  className?: string;
};

function PriorityIndicator({ priority }: { priority?: string }) {
  const { t } = useTranslation();
  if (priority === 'high') {
    return (
      <div className="flex h-4 w-4 items-center justify-center rounded bg-destructive/10 dark:bg-destructive/50" title={t('tasks:priorities.highTitle')}>
        <Zap className="h-2.5 w-2.5 text-destructive dark:text-destructive" />
      </div>
    );
  }

  if (priority === 'medium') {
    return (
      <div className="flex h-4 w-4 items-center justify-center rounded bg-warning/10 dark:bg-warning/50" title={t('tasks:priorities.mediumTitle')}>
        <Flag className="h-2.5 w-2.5 text-warning dark:text-warning" />
      </div>
    );
  }

  return (
    <div className="flex h-4 w-4 items-center justify-center rounded bg-muted dark:bg-background" title={t('tasks:priorities.lowTitle')}>
      <Circle className="h-2.5 w-2.5 text-muted-foreground dark:text-muted-foreground" />
    </div>
  );
}

/** Exported through the task-master barrel; the chat module's empty state renders it to surface the next task and prefill a prompt that starts it. */
export default function NextTaskBanner({ onShowAllTasks = null, onStartTask = null, className = '' }: NextTaskBannerProps) {
  const { t } = useTranslation();
  const {
    nextTask,
    tasks,
    currentProject,
    isLoadingTasks,
    projectTaskMaster,
    refreshTasks,
    setCurrentProject,
  } = useTaskMaster();

  const [showTaskDetail, setShowTaskDetail] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showSetupDetails, setShowSetupDetails] = useState(false);

  if (!currentProject || isLoadingTasks) {
    return null;
  }

  const hasTasks = Array.isArray(tasks) && tasks.length > 0;
  const hasTaskMaster = Boolean(projectTaskMaster?.hasTaskmaster || currentProject.taskmaster?.hasTaskmaster);

  const handleSetupRefresh = () => {
    // setCurrentProject re-reads the project's TaskMaster details itself, so
    // the refreshProjects() that used to precede it was the same request twice.
    setCurrentProject(currentProject);
    void refreshTasks();
  };

  if (!hasTasks && !hasTaskMaster) {
    return (
      <>
        <div className={cn('bg-primary/10 dark:bg-primary border border-primary dark:border-primary rounded-lg p-3 mb-4', className)}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <List className="h-4 w-4 text-primary dark:text-primary" />
              <p className="text-sm font-medium text-foreground dark:text-primary-foreground">{t('tasks:notConfigured.title')}</p>
            </div>

            <Button variant="ghost" size="compact"
              onClick={() => setShowSetupModal(true)}
              className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground transition-colors hover:bg-primary"
            >
              <ListChecks className="h-3 w-3" />
              {t('tasks:banner.initialize')}
            </Button>
          </div>

          <Button variant="ghost" size="compact"
            onClick={() => setShowSetupDetails((current) => !current)}
            className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline dark:text-primary"
          >
            <Settings className="h-3 w-3" />
            {showSetupDetails ? t('tasks:banner.hideDetails') : t('tasks:banner.whatIsTaskmaster')}
          </Button>

          {showSetupDetails && (
            <div className="mt-3 space-y-1 text-xs text-primary dark:text-primary">
              <p>{t('tasks:banner.detailAiPowered')}</p>
              <p>{t('tasks:banner.detailPrdDriven')}</p>
              <p>{t('tasks:banner.detailKanbanList')}</p>
            </div>
          )}
        </div>

        <TaskMasterSetupModal
          isOpen={showSetupModal}
          project={currentProject}
          onClose={() => setShowSetupModal(false)}
          onAfterClose={handleSetupRefresh}
        />
      </>
    );
  }

  if (nextTask) {
    return (
      <>
        <div className={cn('bg-muted dark:bg-background/30 border border-border dark:border-border rounded-lg p-3 mb-4', className)}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 dark:bg-primary/50">
                  <Target className="h-3 w-3 text-primary dark:text-primary" />
                </div>
                <span className="text-xs font-medium text-muted-foreground dark:text-muted-foreground">Task {nextTask.id}</span>
                <PriorityIndicator priority={nextTask.priority} />
              </div>
              <p className="line-clamp-1 text-sm font-medium text-foreground dark:text-foreground">{nextTask.title}</p>
            </div>

            <div className="flex flex-shrink-0 items-center gap-1">
              <Button variant="ghost" size="compact"
                onClick={() => onStartTask?.()}
                className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary"
              >
                <Play className="h-3 w-3" />
                {t('tasks:banner.startTask')}
              </Button>

              <Button variant="ghost" size="compact"
                onClick={() => setShowTaskDetail(true)}
                className="rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted dark:border-border dark:text-muted-foreground dark:hover:bg-background"
                title={t('tasks:banner.viewTaskDetails')}
              >
                <Eye className="h-3 w-3" />
              </Button>

              {onShowAllTasks && (
                <Button variant="ghost" size="compact"
                  onClick={onShowAllTasks}
                  className="rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted dark:border-border dark:text-muted-foreground dark:hover:bg-background"
                  title={t('tasks:banner.viewAllTasks')}
                >
                  <List className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </div>

        <TaskDetailModal
          task={nextTask}
          isOpen={showTaskDetail}
          onClose={() => setShowTaskDetail(false)}
          onStatusChange={() => {
            void refreshTasks();
          }}
        />
      </>
    );
  }

  if (hasTasks) {
    const completedTasks = tasks.filter((task) => task.status === 'done').length;

    return (
      <div className={cn('bg-primary/10 dark:bg-primary border border-primary dark:border-primary rounded-lg p-3 mb-4', className)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-primary dark:text-primary" />
            <span className="text-sm font-medium text-foreground dark:text-primary-foreground">
              {completedTasks === tasks.length ? t('tasks:banner.allComplete') : t('tasks:banner.noPending')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground dark:text-muted-foreground">
              {completedTasks}/{tasks.length}
            </span>
            {onShowAllTasks && (
              <Button variant="ghost" size="compact"
                onClick={onShowAllTasks}
                className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground transition-colors hover:bg-primary"
              >
                Review
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
