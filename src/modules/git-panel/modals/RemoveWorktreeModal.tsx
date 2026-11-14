import { Checkbox as UnifiedCheckbox } from '@/shared/ui/Checkbox';
import { Dialog as UnifiedDialog, DialogContent as UnifiedDialogContent } from '@/shared/ui/Dialog';
import { Button } from '@/shared/ui/Button';
import { RefreshCw, Trash2 } from '@/shared/icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { RemoveWorktreeOptions, WorktreeInfo } from '@/shared/types';

type RemoveWorktreeModalProps = {
  /** Worktree being removed; null keeps the modal closed. */
  worktree: WorktreeInfo | null;
  isRemoving: boolean;
  onClose: () => void;
  onRemove: (worktreePath: string, options: RemoveWorktreeOptions) => Promise<boolean>;
};

/** Rendered by WorktreesView to confirm removing a worktree and choose whether to delete its branch. */
export default function RemoveWorktreeModal({
  worktree,
  isRemoving,
  onClose,
  onRemove,
}: RemoveWorktreeModalProps) {
  const { t } = useTranslation();
  const [deleteBranch, setDeleteBranch] = useState(true);
  const [force, setForce] = useState(false);

  useEffect(() => {
    if (worktree) {
      setDeleteBranch(true);
      setForce(false);
    }
  }, [worktree]);

  const handleRemove = async () => {
    if (!worktree) {
      return;
    }

    const success = await onRemove(worktree.path, { force, deleteBranch });
    if (success) {
      onClose();
    }
  };

  if (!worktree) {
    return null;
  }

  const isDirty = worktree.changedFileCount > 0;

  return (
    <UnifiedDialog open onOpenChange={(open) => { if (!open) onClose(); }}><UnifiedDialogContent wrapperClassName="z-50" className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        aria-labelledby="remove-worktree-title">
        <div className="p-6">
          <div className="mb-4 flex items-center">
            <div className="mr-3 rounded-full bg-destructive/10 p-2 dark:bg-destructive/30">
              <Trash2 className="h-4 w-4 text-destructive dark:text-destructive" />
            </div>
            <h3 id="remove-worktree-title" className="text-lg font-semibold text-foreground">
              {t('git:remove.title')}
            </h3>
          </div>

          <p className="mb-3 text-sm text-muted-foreground">
            {t('git:remove.description', { branch: worktree.branch ?? t('git:remove.detachedHead') })}
          </p>

          {isDirty && (
            <p className="mb-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning dark:text-warning">
              {t('git:remove.uncommittedWarning', { count: worktree.changedFileCount })}
            </p>
          )}

          {worktree.branch && (
            <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-foreground/80">
              <UnifiedCheckbox

                checked={deleteBranch}
                onChange={(event) => setDeleteBranch(event.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              {t('git:remove.alsoDeleteBranch')} <span className="font-mono">{worktree.branch}</span>
            </label>
          )}

          {isDirty && (
            <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-foreground/80">
              <UnifiedCheckbox

                checked={force}
                onChange={(event) => setForce(event.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              {t('git:remove.discardChanges')}
            </label>
          )}

          <div className="mt-4 flex justify-end space-x-3">
            <Button variant="ghost" size="compact"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {t('git:confirm.cancel')}
            </Button>
            <Button variant="ghost" size="compact"
              onClick={() => void handleRemove()}
              disabled={isRemoving || (isDirty && !force)}
              className="flex items-center space-x-2 rounded-lg bg-destructive px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-destructive disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRemoving ? (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  <span>{t('git:remove.removing')}</span>
                </>
              ) : (
                <>
                  <Trash2 className="h-3 w-3" />
                  <span>{t('git:remove.remove')}</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </UnifiedDialogContent></UnifiedDialog>
  );
}
