import { CircleCheck as UnifiedCircleCheck, Circle as UnifiedCircle } from '@/shared/icons';
import * as React from 'react';

import { cn } from '@/shared/utils';
import type { QueueItemStatus } from '@/shared/types';

/* ─── Context ────────────────────────────────────────────────────── */

type QueueItemContextValue = {
  status: QueueItemStatus;
};

const QueueItemContext = React.createContext<QueueItemContextValue | null>(null);

function useQueueItem() {
  const ctx = React.useContext(QueueItemContext);
  if (!ctx) throw new Error('QueueItem sub-components must be used within <QueueItem>');
  return ctx;
}

/* ─── Queue ──────────────────────────────────────────────────────── */

/** Renders a tool's todo list as a progress queue; used by TodoList. */
export const Queue = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="queue"
      role="list"
      className={cn('space-y-0.5', className)}
      {...props}
    />
  ),
);
Queue.displayName = 'Queue';

/* ─── QueueItem ──────────────────────────────────────────────────── */

export type QueueItemProps = {
  status?: QueueItemStatus;
} & React.HTMLAttributes<HTMLDivElement>;

/** One row of Queue, used by TodoList. */
export const QueueItem = React.forwardRef<HTMLDivElement, QueueItemProps>(
  ({ status = 'pending', className, children, ...props }, ref) => {
    const value = React.useMemo(() => ({ status }), [status]);

    return (
      <QueueItemContext.Provider value={value}>
        <div
          ref={ref}
          data-slot="queue-item"
          data-status={status}
          role="listitem"
          className={cn('flex items-start gap-2 py-0.5', className)}
          {...props}
        >
          {children}
        </div>
      </QueueItemContext.Provider>
    );
  },
);
QueueItem.displayName = 'QueueItem';

/* ─── QueueItemIndicator ─────────────────────────────────────────── */

/** Status dot of a QueueItem, used by TodoList. */
export const QueueItemIndicator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const { status } = useQueueItem();

    return (
      <div
        ref={ref}
        data-slot="queue-item-indicator"
        aria-hidden="true"
        className={cn('mt-0.5 flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center', className)}
        {...props}
      >
        {status === 'completed' && (
          <UnifiedCircleCheck className="h-3.5 w-3.5 text-success dark:text-success" />
        )}
        {status === 'in_progress' && (
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary dark:bg-primary" />
        )}
        {status === 'pending' && (
          <UnifiedCircle className="h-3.5 w-3.5 text-muted-foreground/50" />
        )}
      </div>
    );
  },
);
QueueItemIndicator.displayName = 'QueueItemIndicator';

/* ─── QueueItemContent ───────────────────────────────────────────── */

/** Label of a QueueItem, used by TodoList. */
export const QueueItemContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const { status } = useQueueItem();

    return (
      <div
        ref={ref}
        data-slot="queue-item-content"
        className={cn(
          'min-w-0 flex-1 text-xs',
          status === 'completed' && 'text-muted-foreground line-through',
          status === 'in_progress' && 'font-medium text-foreground',
          status === 'pending' && 'text-foreground',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
QueueItemContent.displayName = 'QueueItemContent';
