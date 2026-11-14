import { Dialog as UnifiedDialog, DialogContent as UnifiedDialogContent } from '@/shared/ui/Dialog';
import { Button } from '@/shared/ui/Button';
import { AlertTriangle, Save } from '@/shared/icons';

type OverwriteConfirmModalProps = {
  isOpen: boolean;
  fileName: string;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Opened by PRDEditor inside the prd-editor module to confirm overwriting a PRD file that already exists. */
export default function OverwriteConfirmModal({
  isOpen,
  fileName,
  saving,
  onCancel,
  onConfirm,
}: OverwriteConfirmModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <UnifiedDialog open onOpenChange={(open) => { if (!open) { if (!saving) onCancel(); } }}>


      <UnifiedDialogContent wrapperClassName="z-[300]"  className=" w-full max-w-md rounded-lg border border-border bg-card shadow-xl dark:border-border dark:bg-background">
        <div className="p-6">
          <div className="mb-4 flex items-center">
            <div className="mr-3 rounded-full bg-warning/10 p-2 dark:bg-warning">
              <AlertTriangle className="h-5 w-5 text-warning dark:text-warning" />
            </div>
            <h3 className="text-lg font-semibold text-foreground dark:text-primary-foreground">File Already Exists</h3>
          </div>

          <p className="mb-6 text-sm text-muted-foreground dark:text-muted-foreground">
            A PRD named "{fileName}" already exists. Do you want to overwrite it?
          </p>

          <div className="flex justify-end gap-3">
            <Button variant="ghost" size="compact"
              onClick={onCancel}
              disabled={saving}
              className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted dark:border-border dark:bg-muted dark:text-muted-foreground dark:hover:bg-muted"
            >
              Cancel
            </Button>
            <Button variant="ghost" size="compact"
              onClick={onConfirm}
              disabled={saving}
              className="flex items-center gap-2 rounded-md bg-warning px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-warning disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? 'Saving...' : 'Overwrite'}</span>
            </Button>
          </div>
        </div>
      </UnifiedDialogContent>
    </UnifiedDialog>
  );
}
