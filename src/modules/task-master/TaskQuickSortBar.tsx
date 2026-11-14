import { Button } from '@/shared/ui/Button';
import { ArrowDown, ArrowUp, ArrowUpDown } from '@/shared/icons';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/utils';
import type { TaskBoardSortField, TaskBoardSortOrder } from '@/shared/types';

type TaskQuickSortBarProps = {
  sortField: TaskBoardSortField;
  sortOrder: TaskBoardSortOrder;
  onSortChange: (field: TaskBoardSortField) => void;
};

function getSortIcon(field: TaskBoardSortField, currentField: TaskBoardSortField, currentOrder: TaskBoardSortOrder) {
  if (field !== currentField) {
    return <ArrowUpDown className="h-4 w-4" />;
  }

  return currentOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
}

/** Rendered by TaskBoardToolbar to switch the board's sort field and direction from a single row of buttons. */
export default function TaskQuickSortBar({ sortField, sortOrder, onSortChange }: TaskQuickSortBarProps) {
  const { t } = useTranslation('tasks');

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="ghost" size="compact"
        onClick={() => onSortChange('id')}
        className={cn(
          'flex items-center gap-1 px-3 py-1.5 rounded-md text-sm',
          sortField === 'id'
            ? 'bg-primary/10 dark:bg-primary text-primary dark:text-primary'
            : 'bg-muted dark:bg-background text-muted-foreground dark:text-muted-foreground hover:bg-muted dark:hover:bg-muted',
        )}
      >
        {t('sort.id')} {getSortIcon('id', sortField, sortOrder)}
      </Button>

      <Button variant="ghost" size="compact"
        onClick={() => onSortChange('status')}
        className={cn(
          'flex items-center gap-1 px-3 py-1.5 rounded-md text-sm',
          sortField === 'status'
            ? 'bg-primary/10 dark:bg-primary text-primary dark:text-primary'
            : 'bg-muted dark:bg-background text-muted-foreground dark:text-muted-foreground hover:bg-muted dark:hover:bg-muted',
        )}
      >
        {t('sort.status')} {getSortIcon('status', sortField, sortOrder)}
      </Button>

      <Button variant="ghost" size="compact"
        onClick={() => onSortChange('priority')}
        className={cn(
          'flex items-center gap-1 px-3 py-1.5 rounded-md text-sm',
          sortField === 'priority'
            ? 'bg-primary/10 dark:bg-primary text-primary dark:text-primary'
            : 'bg-muted dark:bg-background text-muted-foreground dark:text-muted-foreground hover:bg-muted dark:hover:bg-muted',
        )}
      >
        {t('sort.priority')} {getSortIcon('priority', sortField, sortOrder)}
      </Button>
    </div>
  );
}
