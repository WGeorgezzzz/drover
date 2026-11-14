import { Input as UnifiedInput } from '@/shared/ui/Input';
import { Dialog as UnifiedDialog, DialogContent as UnifiedDialogContent } from '@/shared/ui/Dialog';
import { Button } from '@/shared/ui/Button';
import { Plus, RefreshCw } from '@/shared/icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type NewBranchModalProps = {
  isOpen: boolean;
  currentBranch: string;
  isCreatingBranch: boolean;
  onClose: () => void;
  onCreateBranch: (branchName: string) => Promise<boolean>;
};

/** Rendered by GitPanelHeader and BranchesView to create a branch from the current one. */
export default function NewBranchModal({
  isOpen,
  currentBranch,
  isCreatingBranch,
  onClose,
  onCreateBranch,
}: NewBranchModalProps) {
  const { t } = useTranslation();
  const [newBranchName, setNewBranchName] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setNewBranchName('');
    }
  }, [isOpen]);

  const handleCreateBranch = async (): Promise<boolean> => {
    const branchName = newBranchName.trim();
    if (!branchName) {
      return false;
    }

    try {
      const success = await onCreateBranch(branchName);
      if (success) {
        setNewBranchName('');
        onClose();
      }
      return success;
    } catch (error) {
      console.error('Failed to create branch:', error);
      return false;
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <UnifiedDialog open onOpenChange={(open) => { if (!open) onClose(); }}><UnifiedDialogContent wrapperClassName="z-50" className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        aria-labelledby="new-branch-title">
        <div className="p-6">
          <h3 className="mb-4 text-lg font-semibold text-foreground">{t('git:newBranch.title')}</h3>

          <div className="mb-4">
            <label htmlFor="git-new-branch-name" className="mb-2 block text-sm font-medium text-foreground/80">
              {t('git:newBranch.nameLabel')}
            </label>
            <UnifiedInput
              id="git-new-branch-name"
              type="text"
              value={newBranchName}
              onChange={(event) => setNewBranchName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !isCreatingBranch) {
                  event.preventDefault();
                  event.stopPropagation();
                  void handleCreateBranch();
                  return;
                }

                if (event.key === 'Escape' && !isCreatingBranch) {
                  event.preventDefault();
                  event.stopPropagation();
                  onClose();
                }
              }}
              placeholder="feature/new-feature"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/20"
              autoFocus
            />
          </div>

          <p className="mb-4 text-sm text-muted-foreground">
            {t('git:newBranch.createdFrom', { branch: currentBranch })}
          </p>

          <div className="flex justify-end space-x-3">
            <Button variant="ghost" size="compact"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {t('git:confirm.cancel')}
            </Button>
            <Button variant="ghost" size="compact"
              onClick={() => void handleCreateBranch()}
              disabled={!newBranchName.trim() || isCreatingBranch}
              className="flex items-center space-x-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCreatingBranch ? (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  <span>{t('git:newBranch.creating')}</span>
                </>
              ) : (
                <>
                  <Plus className="h-3 w-3" />
                  <span>{t('git:newBranch.create')}</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </UnifiedDialogContent></UnifiedDialog>
  );
}
