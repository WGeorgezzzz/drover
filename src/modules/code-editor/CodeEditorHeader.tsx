import { Check as UnifiedCheck } from '@/shared/icons';
import { Button } from '@/shared/ui/Button';
import LocalFileActions from '@/shared/ui/LocalFileActions';
import { useEffect, useRef, useState } from 'react';
import { Check, Code2, Copy, Download, Eye, Maximize2, Minimize2, Save, Settings as SettingsIcon, X } from '@/shared/icons';

import { copyLocalPath } from '@/shared/localPath';
import type { CodeEditorFile } from '@/shared/types';

type CodeEditorHeaderProps = {
  file: CodeEditorFile;
  isSidebar: boolean;
  isFullscreen: boolean;
  isMarkdownFile: boolean;
  isHtmlPreviewFile: boolean;
  markdownPreview: boolean;
  saving: boolean;
  saveSuccess: boolean;
  hasUnsavedChanges: boolean;
  onToggleMarkdownPreview: () => void;
  onOpenHtmlPreview: () => void;
  onOpenSettings: () => void;
  onDownload: () => void;
  onSave: () => void;
  onToggleFullscreen: () => void;
  onClose: () => void;
  labels: {
    showingChanges: string;
    copyPath: string;
    pathCopied: string;
    editMarkdown: string;
    previewMarkdown: string;
    previewHtml: string;
    settings: string;
    download: string;
    save: string;
    saving: string;
    saved: string;
    fullscreen: string;
    exitFullscreen: string;
    close: string;
    unsavedChanges: string;
  };
};

/** Rendered by CodeEditor inside the code-editor module to show the open file's path and the save, preview, download and window controls. */
export default function CodeEditorHeader({
  file,
  isSidebar,
  isFullscreen,
  isMarkdownFile,
  isHtmlPreviewFile,
  markdownPreview,
  saving,
  saveSuccess,
  hasUnsavedChanges,
  onToggleMarkdownPreview,
  onOpenHtmlPreview,
  onOpenSettings,
  onDownload,
  onSave,
  onToggleFullscreen,
  onClose,
  labels,
}: CodeEditorHeaderProps) {
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const copyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTitle = saveSuccess ? labels.saved : saving ? labels.saving : labels.save;
  const pathCopied = copiedPath === file.path;

  useEffect(() => () => {
    if (copyResetTimeoutRef.current) {
      clearTimeout(copyResetTimeoutRef.current);
    }
  }, []);

  const handleCopyPath = async () => {
    try { await copyLocalPath(file.path); } catch { return; }

    setCopiedPath(file.path);
    if (copyResetTimeoutRef.current) {
      clearTimeout(copyResetTimeoutRef.current);
    }
    copyResetTimeoutRef.current = setTimeout(() => setCopiedPath(null), 2000);
  };

  return (
    <div className="flex min-w-0 flex-shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1.5">
      {/* File info - can shrink */}
      <div className="flex min-w-0 flex-1 shrink items-center gap-2">
        <div className="min-w-0 shrink">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-medium text-foreground dark:text-primary-foreground">{file.name}</h3>
            {hasUnsavedChanges && (
              <span
                role="img"
                aria-label={labels.unsavedChanges}
                title={labels.unsavedChanges}
                className="h-2 w-2 shrink-0 rounded-full bg-warning"
              />
            )}
            {file.diffInfo && (
              <span className="shrink-0 whitespace-nowrap rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary dark:bg-primary dark:text-primary">
                {labels.showingChanges}
              </span>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-1">
            <p className="truncate text-xs text-muted-foreground dark:text-muted-foreground" title={file.path}>{file.path}</p>
            <Button variant="ghost" size="compact"
              type="button"
              onClick={handleCopyPath}
              className={`flex shrink-0 items-center justify-center rounded p-0.5 transition-colors ${
                pathCopied
                  ? 'text-success dark:text-success'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground dark:text-muted-foreground dark:hover:bg-background dark:hover:text-foreground'
              }`}
              title={pathCopied ? labels.pathCopied : labels.copyPath}
              aria-label={pathCopied ? labels.pathCopied : labels.copyPath}
            >
              {pathCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      </div>

      <span className="hidden sm:contents"><LocalFileActions path={file.path} /></span>
      {/* Buttons - don't shrink, always visible */}
      <div className="flex shrink-0 items-center gap-0.5">
        {isMarkdownFile && (
          <Button variant="ghost" size="compact"
            type="button"
            onClick={onToggleMarkdownPreview}
            className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${
              markdownPreview
                ? 'bg-primary/10 text-primary dark:bg-primary/30 dark:text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground dark:text-muted-foreground dark:hover:bg-background dark:hover:text-primary-foreground'
            }`}
            title={markdownPreview ? labels.editMarkdown : labels.previewMarkdown}
          >
            {markdownPreview ? <Code2 className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        )}

        {isHtmlPreviewFile && (
          <Button variant="ghost" size="compact"
            type="button"
            onClick={onOpenHtmlPreview}
            className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground dark:text-muted-foreground dark:hover:bg-background dark:hover:text-primary-foreground"
            title={labels.previewHtml}
          >
            {markdownPreview ? <Code2 className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        )}

        <Button variant="ghost" size="compact"
          type="button"
          onClick={onOpenSettings}
          className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground dark:text-muted-foreground dark:hover:bg-background dark:hover:text-primary-foreground"
          title={labels.settings}
        >
          <SettingsIcon className="h-4 w-4" />
        </Button>

        <Button variant="ghost" size="compact"
          type="button"
          onClick={onDownload}
          className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground dark:text-muted-foreground dark:hover:bg-background dark:hover:text-primary-foreground"
          aria-label={labels.download}
          title={labels.download}
        >
          <Download className="h-4 w-4" />
        </Button>

        <Button variant="ghost" size="compact"
          type="button"
          onClick={onSave}
          disabled={saving}
          className={`flex items-center justify-center rounded-md p-1.5 transition-colors disabled:opacity-50 ${
            saveSuccess
              ? 'bg-success/10 text-success dark:bg-success/30 dark:text-success'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground dark:text-muted-foreground dark:hover:bg-background dark:hover:text-primary-foreground'
          }`}
          title={saveTitle}
        >
          {saveSuccess ? (
            <UnifiedCheck className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
        </Button>

        {!isSidebar && (
          <Button variant="ghost" size="compact"
            type="button"
            onClick={onToggleFullscreen}
            className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground dark:text-muted-foreground dark:hover:bg-background dark:hover:text-primary-foreground"
            title={isFullscreen ? labels.exitFullscreen : labels.fullscreen}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        )}

        <Button variant="ghost" size="compact"
          type="button"
          onClick={onClose}
          className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground dark:text-muted-foreground dark:hover:bg-background dark:hover:text-primary-foreground"
          title={labels.close}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
