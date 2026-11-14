import { Button } from '@/shared/ui/Button';
import React, { useMemo } from 'react';

import type { DiffLine } from '@/shared/types';

type ToolDiffViewerProps = {
  oldContent: string;
  newContent: string;
  filePath: string;
  createDiff: (oldStr: string, newStr: string) => DiffLine[];
  onFileClick?: () => void;
  badge?: string;
  badgeColor?: 'gray' | 'green';
};

/**
 * Compact diff viewer — VS Code-style.
 *
 * Rendered by chat's ToolRenderer for edit/write tools so a turn's file changes
 * are reviewable inline.
 */
export const ToolDiffViewer: React.FC<ToolDiffViewerProps> = ({
  oldContent,
  newContent,
  filePath,
  createDiff,
  onFileClick,
  badge = 'Diff',
  badgeColor = 'gray'
}) => {
  const badgeClasses = badgeColor === 'green'
    ? 'bg-success/10 dark:bg-success/30 text-success dark:text-success'
    : 'bg-muted dark:bg-background text-muted-foreground dark:text-muted-foreground';

  const diffLines = useMemo(
    () => {
      if (oldContent === undefined || newContent === undefined) {
        return [];
      }
      return createDiff(oldContent, newContent)
    },
    [createDiff, oldContent, newContent]
  );

  return (
    <div className="overflow-hidden rounded border border-border/60 dark:border-border/50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/80 px-2.5 py-1 dark:border-border/50 dark:bg-background/40">
        {onFileClick ? (
          <Button variant="ghost" size="compact"
            onClick={onFileClick}
            className="cursor-pointer truncate font-mono text-[11px] text-primary transition-colors hover:text-primary dark:text-primary dark:hover:text-primary"
          >
            {filePath}
          </Button>
        ) : (
          <span className="truncate font-mono text-[11px] text-muted-foreground dark:text-muted-foreground">
            {filePath}
          </span>
        )}
        <span className={`rounded px-1.5 py-px text-[10px] font-medium ${badgeClasses} ml-2 flex-shrink-0`}>
          {badge}
        </span>
      </div>

      {/* Diff lines */}
      <div className="font-mono text-[11px] leading-[18px]">
        {diffLines.map((diffLine, i) => (
          <div key={i} className="flex">
            <span
              className={`w-6 flex-shrink-0 select-none text-center ${
                diffLine.type === 'removed'
                  ? 'bg-destructive/10 text-destructive dark:bg-destructive/30 dark:text-destructive'
                  : 'bg-success/10 text-success dark:bg-success/30 dark:text-success'
              }`}
            >
              {diffLine.type === 'removed' ? '-' : '+'}
            </span>
            <span
              className={`flex-1 whitespace-pre-wrap px-2 ${
                diffLine.type === 'removed'
                  ? 'bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive'
                  : 'bg-success/10 text-success dark:bg-success/20 dark:text-success'
              }`}
            >
              {diffLine.content}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
