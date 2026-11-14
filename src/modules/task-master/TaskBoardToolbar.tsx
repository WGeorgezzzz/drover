import { Input as UnifiedInput } from '@/shared/ui/Input';
import { Button } from '@/shared/ui/Button';
import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Columns,
  FileText,
  Filter,
  Grid,
  HelpCircle,
  List,
  Plus,
  Search,
} from '@/shared/icons';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/utils';
import type { PrdFile, TaskBoardSortField, TaskBoardSortOrder, TaskBoardView } from '@/shared/types';
import TaskFiltersPanel from '@/modules/task-master/TaskFiltersPanel';
import TaskQuickSortBar from '@/modules/task-master/TaskQuickSortBar';

type TaskBoardToolbarProps = {
  hasProject: boolean;
  hasTaskMasterConfigured: boolean;
  totalTaskCount: number;
  filteredTaskCount: number;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  viewMode: TaskBoardView;
  onViewModeChange: (viewMode: TaskBoardView) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  priorityFilter: string;
  onPriorityFilterChange: (priority: string) => void;
  sortField: TaskBoardSortField;
  sortOrder: TaskBoardSortOrder;
  onSortChange: (field: TaskBoardSortField) => void;
  onSortConfigChange: (field: TaskBoardSortField, order: TaskBoardSortOrder) => void;
  statuses: string[];
  priorities: string[];
  onClearFilters: () => void;
  existingPrds: PrdFile[];
  onCreatePrd: () => void;
  onOpenPrd: (prd: PrdFile) => void;
  onOpenHelp: () => void;
  onOpenCreateTask: () => void;
};

/** Rendered by TaskBoard for the board's search box, view switch, filter toggle and create/help actions. */
export default function TaskBoardToolbar({
  hasProject,
  hasTaskMasterConfigured,
  totalTaskCount,
  filteredTaskCount,
  searchTerm,
  onSearchTermChange,
  viewMode,
  onViewModeChange,
  showFilters,
  onToggleFilters,
  statusFilter,
  onStatusFilterChange,
  priorityFilter,
  onPriorityFilterChange,
  sortField,
  sortOrder,
  onSortChange,
  onSortConfigChange,
  statuses,
  priorities,
  onClearFilters,
  existingPrds,
  onCreatePrd,
  onOpenPrd,
  onOpenHelp,
  onOpenCreateTask,
}: TaskBoardToolbarProps) {
  const { t } = useTranslation('tasks');
  const [isPrdDropdownOpen, setIsPrdDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsPrdDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  return (
    <>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <UnifiedInput
            type="text"
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder={t('search.placeholder')}
            className="w-full rounded-lg border border-border bg-card py-2 pl-10 pr-4 text-foreground dark:border-border dark:bg-background dark:text-primary-foreground"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-muted p-1 dark:bg-background">
            <Button variant="ghost" size="compact"
              onClick={() => onViewModeChange('kanban')}
              className={cn(
                'p-2 rounded-md',
                viewMode === 'kanban'
                  ? 'bg-card dark:bg-muted text-foreground dark:text-primary-foreground shadow-sm'
                  : 'text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-muted-foreground',
              )}
              title={t('views.kanban')}
            >
              <Columns className="h-4 w-4" />
            </Button>

            <Button variant="ghost" size="compact"
              onClick={() => onViewModeChange('list')}
              className={cn(
                'p-2 rounded-md',
                viewMode === 'list'
                  ? 'bg-card dark:bg-muted text-foreground dark:text-primary-foreground shadow-sm'
                  : 'text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-muted-foreground',
              )}
              title={t('views.list')}
            >
              <List className="h-4 w-4" />
            </Button>

            <Button variant="ghost" size="compact"
              onClick={() => onViewModeChange('grid')}
              className={cn(
                'p-2 rounded-md',
                viewMode === 'grid'
                  ? 'bg-card dark:bg-muted text-foreground dark:text-primary-foreground shadow-sm'
                  : 'text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-muted-foreground',
              )}
              title={t('views.grid')}
            >
              <Grid className="h-4 w-4" />
            </Button>
          </div>

          <Button variant="ghost" size="compact"
            onClick={onToggleFilters}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors',
              showFilters
                ? 'bg-primary/10 dark:bg-primary border-primary dark:border-primary text-primary dark:text-primary'
                : 'bg-card dark:bg-background border-border dark:border-border text-foreground dark:text-muted-foreground hover:bg-muted dark:hover:bg-muted',
            )}
          >
            <Filter className="h-4 w-4" />
            <span className="hidden sm:inline">{t('filters.button')}</span>
            <ChevronDown className={cn('w-4 h-4 transition-transform', showFilters && 'rotate-180')} />
          </Button>

          {hasProject && (
            <>
              <Button variant="ghost" size="compact"
                onClick={onOpenHelp}
                className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted hover:text-primary dark:border-border dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-primary"
                title={t('buttons.help')}
              >
                <HelpCircle className="h-4 w-4" />
              </Button>

              <div ref={dropdownRef} className="relative">
                {existingPrds.length > 0 ? (
                  <>
                    <Button variant="ghost" size="compact"
                      onClick={() => setIsPrdDropdownOpen((current) => !current)}
                      className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 font-medium text-primary-foreground hover:bg-primary"
                      title={t('buttons.prdsAvailable', { count: existingPrds.length })}
                    >
                      <FileText className="h-4 w-4" />
                      <span className="hidden sm:inline">{t('buttons.prds')}</span>
                      <span className="min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center text-xs">
                        {existingPrds.length}
                      </span>
                      <ChevronDown className={cn('w-3 h-3 transition-transform hidden sm:block', isPrdDropdownOpen && 'rotate-180')} />
                    </Button>

                    {isPrdDropdownOpen && (
                      <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-lg border border-border bg-card shadow-xl dark:border-border dark:bg-background">
                        <div className="p-2">
                          <Button variant="ghost" size="compact"
                            onClick={() => {
                              onCreatePrd();
                              setIsPrdDropdownOpen(false);
                            }}
                            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm font-medium text-primary hover:bg-primary/10 dark:text-primary dark:hover:bg-primary/30"
                          >
                            <Plus className="h-4 w-4" />
                            {t('buttons.createNewPRD')}
                          </Button>

                          <div className="my-1 border-t border-border dark:border-border" />

                          {existingPrds.map((prd) => (
                            <Button variant="ghost" size="compact"
                              key={prd.name}
                              onClick={() => {
                                onOpenPrd(prd);
                                setIsPrdDropdownOpen(false);
                              }}
                              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-foreground hover:bg-muted dark:text-muted-foreground dark:hover:bg-muted"
                            >
                              <FileText className="h-4 w-4" />
                              <span className="truncate">{prd.name}</span>
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <Button variant="ghost" size="compact"
                    onClick={onCreatePrd}
                    className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 font-medium text-primary-foreground hover:bg-primary"
                    title={t('buttons.addPRD')}
                  >
                    <FileText className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('buttons.addPRD')}</span>
                  </Button>
                )}
              </div>

              {(hasTaskMasterConfigured || totalTaskCount > 0) && (
                <Button variant="ghost" size="compact"
                  onClick={onOpenCreateTask}
                  className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 font-medium text-primary-foreground hover:bg-primary"
                  title={t('buttons.addTask')}
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('buttons.addTask')}</span>
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <TaskFiltersPanel
        showFilters={showFilters}
        statusFilter={statusFilter}
        onStatusFilterChange={onStatusFilterChange}
        priorityFilter={priorityFilter}
        onPriorityFilterChange={onPriorityFilterChange}
        sortField={sortField}
        sortOrder={sortOrder}
        onSortConfigChange={onSortConfigChange}
        statuses={statuses}
        priorities={priorities}
        filteredTaskCount={filteredTaskCount}
        totalTaskCount={totalTaskCount}
        onClearFilters={onClearFilters}
      />

      <TaskQuickSortBar sortField={sortField} sortOrder={sortOrder} onSortChange={onSortChange} />
    </>
  );
}
