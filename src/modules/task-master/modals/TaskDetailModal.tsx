import { Dialog as UnifiedDialog, DialogContent as UnifiedDialogContent } from '@/shared/ui/Dialog';
import { Input as UnifiedInput } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';
import { Button } from '@/shared/ui/Button';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Copy,
  Edit,
  Pause,
  Save,
  X,
} from '@/shared/icons';

import { cn,copyTextToClipboard } from '@/shared/utils';
import { api } from '@/shared/api';
import { useTaskMaster } from '@/modules/task-master/context/TaskMasterContext';
import type { TaskId, TaskMasterTask, TaskReference } from '@/shared/types';

type TaskDetailModalProps = {
  task: TaskMasterTask | null;
  isOpen?: boolean;
  className?: string;
  onClose: () => void;
  onEdit?: ((task: TaskMasterTask) => void) | null;
  onStatusChange?: ((taskId: TaskId, status: string) => void) | null;
  onTaskClick?: ((task: TaskReference) => void) | null;
};

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'done', label: 'Done' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'deferred', label: 'Deferred' },
  { value: 'cancelled', label: 'Cancelled' },
];

function getStatusIcon(status?: string) {
  if (status === 'done') return CheckCircle;
  if (status === 'in-progress') return Clock;
  if (status === 'review') return AlertCircle;
  if (status === 'deferred') return Pause;
  if (status === 'cancelled') return X;
  return Circle;
}

function getPriorityBadgeClass(priority?: string): string {
  if (priority === 'high') return 'text-destructive dark:text-destructive bg-destructive/10 dark:bg-destructive';
  if (priority === 'medium') return 'text-warning dark:text-warning bg-warning/10 dark:bg-warning';
  if (priority === 'low') return 'text-primary dark:text-primary bg-primary/10 dark:bg-primary';
  return 'text-muted-foreground dark:text-muted-foreground bg-muted dark:bg-background';
}

/** Rendered by TaskMasterPanel and NextTaskBanner to show and edit one task's full details and subtasks. */
export default function TaskDetailModal({
  task,
  isOpen = true,
  className = '',
  onClose,
  onEdit = null,
  onStatusChange = null,
  onTaskClick = null,
}: TaskDetailModalProps) {
  const { currentProject, refreshTasks } = useTaskMaster();

  // Subtask generation feedback remains visible in the task details.
  const [expandNotice, setExpandNotice] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showTestStrategy, setShowTestStrategy] = useState(false);
  const [editableTask, setEditableTask] = useState<TaskMasterTask | null>(task);

  useEffect(() => {
    setEditableTask(task);
    setIsEditMode(false);
  }, [task]);

  const StatusIcon = useMemo(() => getStatusIcon(task?.status), [task?.status]);

  if (!isOpen || !task || !editableTask) {
    return null;
  }

  const handleSaveChanges = async () => {
    if (!currentProject?.projectId) {
      return;
    }

    const updates: Record<string, string> = {};

    if (editableTask.title !== task.title) {
      updates.title = editableTask.title;
    }

    if (editableTask.description !== task.description) {
      updates.description = editableTask.description ?? '';
    }

    if (editableTask.details !== task.details) {
      updates.details = editableTask.details ?? '';
    }

    if (Object.keys(updates).length === 0) {
      setIsEditMode(false);
      return;
    }

    setIsSaving(true);
    try {
      const response = await api.taskmaster.updateTask(currentProject.projectId, task.id, updates);
      if (!response.ok) {
        const errorPayload = (await response.json()) as { message?: string };
        throw new Error(errorPayload.message ?? 'Failed to update task');
      }

      setIsEditMode(false);
      await refreshTasks();
      onEdit?.(editableTask);
    } catch (error) {
      console.error('Failed to save task changes:', error);
      alert(error instanceof Error ? error.message : 'Failed to update task');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusSelect = async (nextStatus: string) => {
    if (!currentProject?.projectId || nextStatus === task.status) {
      return;
    }

    try {
      const response = await api.taskmaster.updateTask(currentProject.projectId, task.id, { status: nextStatus });
      if (!response.ok) {
        const errorPayload = (await response.json()) as { message?: string };
        throw new Error(errorPayload.message ?? 'Failed to update task status');
      }

      await refreshTasks();
      onStatusChange?.(task.id, nextStatus);
    } catch (error) {
      console.error('Failed to update task status:', error);
      alert(error instanceof Error ? error.message : 'Failed to update task status');
    }
  };

  return (
    <UnifiedDialog open onOpenChange={(open) => { if (!open) { onClose(); } }}>
      <UnifiedDialogContent wrapperClassName="z-[100]"  className={cn(
          'w-full md:max-w-4xl h-full md:h-[90vh] bg-card dark:bg-background border border-border dark:border-border md:rounded-lg shadow-xl flex flex-col',
          className,
        )}>
        <div className="flex items-center justify-between border-b border-border p-4 dark:border-border md:p-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <StatusIcon className="h-6 w-6 text-primary dark:text-primary" />
            <div className="min-w-0 flex-1">
              <Button variant="ghost" size="compact"
                onClick={() => copyTextToClipboard(String(task.id))}
                className="mb-2 inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs text-muted-foreground hover:bg-muted dark:bg-background dark:text-muted-foreground dark:hover:bg-muted"
                title="Copy task ID"
              >
                <span>Task {task.id}</span>
                <Copy className="h-3 w-3" />
              </Button>

              {isEditMode ? (
                <UnifiedInput
                  type="text"
                  value={editableTask.title}
                  onChange={(event) => setEditableTask({ ...editableTask, title: event.target.value })}
                  className="w-full border-b-2 border-primary bg-transparent text-lg font-semibold text-foreground focus:outline-none dark:text-primary-foreground"
                />
              ) : (
                <h1 className="line-clamp-2 text-lg font-semibold text-foreground dark:text-primary-foreground md:text-xl">{task.title}</h1>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isEditMode ? (
              <>
                <Button variant="ghost" size="compact"
                  onClick={handleSaveChanges}
                  disabled={isSaving}
                  className="rounded-md p-2 text-success hover:bg-success/10 disabled:opacity-50 dark:hover:bg-success"
                  title="Save"
                >
                  <Save className={cn('w-5 h-5', isSaving && 'animate-spin')} />
                </Button>
                <Button variant="ghost" size="compact"
                  onClick={() => {
                    setEditableTask(task);
                    setIsEditMode(false);
                  }}
                  disabled={isSaving}
                  className="rounded-md p-2 text-muted-foreground hover:bg-muted dark:hover:bg-background"
                  title="Cancel editing"
                >
                  <X className="h-5 w-5" />
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="compact"
                onClick={() => setIsEditMode(true)}
                className="rounded-md p-2 text-muted-foreground hover:bg-muted dark:hover:bg-background"
                title="Edit task"
              >
                <Edit className="h-5 w-5" />
              </Button>
            )}
            <Button variant="ghost" size="compact" disabled={isSaving} className="mx-2 text-xs text-primary" onClick={async () => {
              if (!currentProject) return; setIsSaving(true); setExpandNotice('正在展开子任务…');
              try { const r = await api.taskmaster.expandTask(currentProject.projectId, task.id); const data = await r.json(); if (!r.ok) throw new Error(data.message || data.error?.message || '展开失败'); await refreshTasks(); setEditableTask(data.task); setExpandNotice('子任务已更新'); } catch (error) { setExpandNotice(String(error)); } finally { setIsSaving(false); }
            }}>展开子任务</Button>{expandNotice && <span role="status" className="text-xs">{expandNotice}</span>}
            <Button variant="ghost" size="compact" onClick={onClose} className="rounded-md p-2 text-muted-foreground hover:bg-muted dark:hover:bg-background" title="Close">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-4 md:p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground dark:text-muted-foreground">Status</label>
              <Select
                value={task.status ?? 'pending'}
                onChange={(event) => {
                  void handleStatusSelect(event.target.value);
                }}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-foreground dark:border-border dark:bg-background dark:text-primary-foreground"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground dark:text-muted-foreground">Priority</label>
              <div className={cn('px-3 py-2 rounded-md text-sm font-medium capitalize', getPriorityBadgeClass(task.priority))}>
                {task.priority ?? 'Not set'}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground dark:text-muted-foreground">Dependencies</label>
              {Array.isArray(task.dependencies) && task.dependencies.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {task.dependencies.map((dependency) => (
                    <Button variant="ghost" size="compact"
                      key={String(dependency)}
                      onClick={() => onTaskClick?.({ id: dependency })}
                      className="rounded bg-primary/10 px-2 py-1 text-sm text-primary hover:bg-primary/10 dark:bg-primary dark:text-primary dark:hover:bg-primary"
                    >
                      <ArrowRight className="mr-1 inline h-3 w-3" />
                      {dependency}
                    </Button>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground dark:text-muted-foreground">No dependencies</span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground dark:text-muted-foreground">Description</label>
            {isEditMode ? (
              <textarea
                rows={4}
                value={editableTask.description ?? ''}
                onChange={(event) => setEditableTask({ ...editableTask, description: event.target.value })}
                className="w-full rounded-md border border-border bg-card px-3 py-2 dark:border-border dark:bg-background"
              />
            ) : (
              <p className="whitespace-pre-wrap text-foreground dark:text-muted-foreground">{task.description || 'No description provided'}</p>
            )}
          </div>

          {editableTask.subtasks?.length ? <section className="rounded-lg border p-3"><h3 className="mb-2 text-sm font-medium">子任务</h3>{editableTask.subtasks.map(sub => <p key={sub.id} className="my-1 text-sm">{sub.id} · {sub.title} · {sub.status}</p>)}</section> : null}
          {task.details && (
            <div className="rounded-lg border border-border dark:border-border">
              <Button variant="ghost" size="compact"
                onClick={() => setShowDetails((current) => !current)}
                className="flex w-full items-center justify-between p-4 text-left hover:bg-muted dark:hover:bg-background"
              >
                <span className="text-sm font-medium text-foreground dark:text-muted-foreground">Implementation Details</span>
                {showDetails ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
              {showDetails && (
                <div className="border-t border-border p-4 dark:border-border">
                  <p className="whitespace-pre-wrap text-foreground dark:text-muted-foreground">{task.details}</p>
                </div>
              )}
            </div>
          )}

          {task.testStrategy && (
            <div className="rounded-lg border border-border dark:border-border">
              <Button variant="ghost" size="compact"
                onClick={() => setShowTestStrategy((current) => !current)}
                className="flex w-full items-center justify-between p-4 text-left hover:bg-muted dark:hover:bg-background"
              >
                <span className="text-sm font-medium text-foreground dark:text-muted-foreground">Test Strategy</span>
                {showTestStrategy ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
              {showTestStrategy && (
                <div className="border-t border-border bg-primary/10 p-4 dark:border-border dark:bg-primary/30">
                  <p className="whitespace-pre-wrap text-foreground dark:text-muted-foreground">{task.testStrategy}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </UnifiedDialogContent>
    </UnifiedDialog>
  );
}
