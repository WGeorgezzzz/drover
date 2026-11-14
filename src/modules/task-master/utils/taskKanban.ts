import type { TFunction } from 'i18next';

import type { TaskKanbanColumn, TaskMasterTask } from '@/shared/types';

const KANBAN_COLUMN_CONFIG = [
  {
    id: 'pending',
    titleKey: 'kanban.pending',
    status: 'pending',
    color: 'bg-muted dark:bg-background/50 border-border dark:border-border',
    headerColor: 'bg-muted dark:bg-background text-foreground dark:text-foreground',
  },
  {
    id: 'in-progress',
    titleKey: 'kanban.inProgress',
    status: 'in-progress',
    color: 'bg-primary/10 dark:bg-primary/50 border-primary dark:border-primary',
    headerColor: 'bg-primary/10 dark:bg-primary text-primary dark:text-primary',
  },
  {
    id: 'done',
    titleKey: 'kanban.done',
    status: 'done',
    color: 'bg-success/10 dark:bg-success/50 border-success dark:border-success',
    headerColor: 'bg-success/10 dark:bg-success text-success dark:text-success',
  },
  {
    id: 'blocked',
    titleKey: 'kanban.blocked',
    status: 'blocked',
    color: 'bg-destructive/10 dark:bg-destructive/50 border-destructive dark:border-destructive',
    headerColor: 'bg-destructive/10 dark:bg-destructive text-destructive dark:text-destructive',
  },
  {
    id: 'deferred',
    titleKey: 'kanban.deferred',
    status: 'deferred',
    color: 'bg-warning/10 dark:bg-warning/50 border-warning dark:border-warning',
    headerColor: 'bg-warning/10 dark:bg-warning text-warning dark:text-warning',
  },
  {
    id: 'cancelled',
    titleKey: 'kanban.cancelled',
    status: 'cancelled',
    color: 'bg-muted dark:bg-background/50 border-border dark:border-border',
    headerColor: 'bg-muted dark:bg-background text-foreground dark:text-foreground',
  },
] as const;

const CORE_WORKFLOW_STATUSES = new Set(['pending', 'in-progress', 'done']);

export function buildKanbanColumns(tasks: TaskMasterTask[], t: TFunction<'tasks'>): TaskKanbanColumn[] {
  const tasksByStatus = tasks.reduce<Record<string, TaskMasterTask[]>>((accumulator, task) => {
    const status = task.status ?? 'pending';
    if (!accumulator[status]) {
      accumulator[status] = [];
    }
    accumulator[status].push(task);
    return accumulator;
  }, {});

  return KANBAN_COLUMN_CONFIG.filter((column) => {
    const hasTasks = (tasksByStatus[column.status] ?? []).length > 0;
    return hasTasks || CORE_WORKFLOW_STATUSES.has(column.status);
  }).map((column) => ({
    id: column.id,
    title: t(column.titleKey),
    status: column.status,
    color: column.color,
    headerColor: column.headerColor,
    tasks: tasksByStatus[column.status] ?? [],
  }));
}
