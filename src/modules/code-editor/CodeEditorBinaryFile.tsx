import { DialogSurface } from '@/shared/ui/Dialog';
import { File as UnifiedFile, X as UnifiedX, Minimize2 as UnifiedMinimize2, Maximize2 as UnifiedMaximize2 } from '@/shared/icons';
import { Button } from '@/shared/ui/Button';
import DownloadButton from '@/shared/ui/DownloadButton';
import FileMetadata from '@/modules/code-editor/FileMetadata';
import LocalFileActions from '@/shared/ui/LocalFileActions';
import type { CodeEditorFile } from '@/shared/types';

type CodeEditorBinaryFileProps = {
  file: CodeEditorFile;
  projectId?: string;
  isSidebar: boolean;
  isFullscreen: boolean;
  onClose: () => void;
  onToggleFullscreen: () => void;
  title: string;
  message: string;
};

/** Rendered by CodeEditor inside the code-editor module when the opened file is binary and cannot be edited as text. */
export default function CodeEditorBinaryFile({
  file,
  projectId,
  isSidebar,
  isFullscreen,
  onClose,
  onToggleFullscreen,
  title,
  message,
}: CodeEditorBinaryFileProps) {
  const binaryContent = (
    <div className="flex h-full w-full flex-col items-center justify-center bg-background p-8 text-muted-foreground">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <UnifiedFile className="h-8 w-8 text-muted-foreground" />
        </div>
        <FileMetadata path={file.path} projectId={projectId ?? file.projectId} /><LocalFileActions path={file.path} compact={false} />
        <div>
          <h3 className="mb-2 text-lg font-medium text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        <Button variant="ghost" size="compact"
          onClick={onClose}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Close
        </Button>
      </div>
    </div>
  );

  if (isSidebar) {
    return (
      <div className="flex h-full w-full flex-col bg-background">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-3 py-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h3 className="truncate text-sm font-medium text-foreground dark:text-primary-foreground">{file.name}</h3>
          </div>
          <DownloadButton projectId={projectId ?? file.projectId} path={file.path} /><Button variant="ghost" size="compact"
            type="button"
            onClick={onClose}
            className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground dark:text-muted-foreground dark:hover:bg-background dark:hover:text-primary-foreground"
            title="Close"
          >
            <UnifiedX className="h-4 w-4" />
          </Button>
        </div>
        {binaryContent}
      </div>
    );
  }

  const containerClassName = isFullscreen
    ? 'fixed inset-0 z-[9999] bg-background flex flex-col'
    : 'fixed inset-0 z-[9999] md:bg-overlay/50 md:flex md:items-center md:justify-center md:p-4';

  const innerClassName = isFullscreen
    ? 'bg-background flex flex-col w-full h-full'
    : 'bg-background shadow-2xl flex flex-col w-full h-full md:rounded-lg md:shadow-2xl md:w-full md:max-w-2xl md:h-auto md:max-h-[60vh]';

  return (
    <DialogSurface className={containerClassName}  onClose={() => { onClose(); }}>
      <div className={innerClassName}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-3 py-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h3 className="truncate text-sm font-medium text-foreground dark:text-primary-foreground">{file.name}</h3>
          </div>
          <div className="flex shrink-0 items-center gap-0.5"><DownloadButton projectId={projectId ?? file.projectId} path={file.path} />
            <Button variant="ghost" size="compact"
              type="button"
              onClick={onToggleFullscreen}
              className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground dark:text-muted-foreground dark:hover:bg-background dark:hover:text-primary-foreground"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <UnifiedMinimize2 className="h-4 w-4" />
              ) : (
                <UnifiedMaximize2 className="h-4 w-4" />
              )}
            </Button>
            <Button variant="ghost" size="compact"
              type="button"
              onClick={onClose}
              className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground dark:text-muted-foreground dark:hover:bg-background dark:hover:text-primary-foreground"
              title="Close"
            >
              <UnifiedX className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {binaryContent}
      </div>
    </DialogSurface>
  );
}
