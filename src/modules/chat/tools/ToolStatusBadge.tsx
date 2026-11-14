import { cn } from '@/shared/utils';
import type { ToolStatus } from '@/shared/types';


const STATUS_CONFIG: Record<ToolStatus, { label: string; className: string }> = {
  running: {
    label: 'Running',
    className: 'bg-primary/10 text-primary dark:bg-primary/30 dark:text-primary',
  },
  completed: {
    label: 'Completed',
    className: 'bg-success/10 text-success dark:bg-success/30 dark:text-success',
  },
  error: {
    label: 'Error',
    className: 'bg-destructive/10 text-destructive dark:bg-destructive/30 dark:text-destructive',
  },
  denied: {
    label: 'Denied',
    className: 'bg-warning/10 text-warning dark:bg-warning/30 dark:text-warning',
  },
};

type ToolStatusBadgeProps = {
  status: ToolStatus;
  className?: string;
};

/**
 * Used by chat's ToolRenderer, BashCommandDisplay and OneLineDisplay to label a
 * tool call's pending, running, error or denied state.
 */
export function ToolStatusBadge({ status, className }: ToolStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-px text-[10px] font-medium',
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
