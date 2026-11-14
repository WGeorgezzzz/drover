import { Input as UnifiedInput } from '@/shared/ui/Input';
import { Pencil as UnifiedPencil, Check as UnifiedCheck } from '@/shared/icons';
import { Button } from '@/shared/ui/Button';
import { useRef } from 'react';
import type { ReactNode } from 'react';
import {
  Download,
  Eye,
  FileText,
  Maximize2,
  Minimize2,
  Moon,
  Save,
  Sparkles,
  Sun,
  X,
} from '@/shared/icons';

import { cn } from '@/shared/utils';

type PrdEditorHeaderProps = {
  fileName: string;
  onFileNameChange: (nextFileName: string) => void;
  isNewFile: boolean;
  previewMode: boolean;
  onTogglePreview: () => void;
  wordWrap: boolean;
  onToggleWordWrap: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onDownload: () => void;
  onOpenGenerateTasks: () => void;
  canGenerateTasks: boolean;
  onSave: () => void;
  saving: boolean;
  saveSuccess: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onClose: () => void;
};

type HeaderIconButtonProps = {
  title: string;
  onClick: () => void;
  icon: ReactNode;
  active?: boolean;
};

function HeaderIconButton({ title, onClick, icon, active = false }: HeaderIconButtonProps) {
  return (
    <Button variant="ghost" size="compact"
      onClick={onClick}
      title={title}
      className={cn(
        'p-2 rounded-md min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center transition-colors',
        active
          ? 'text-primary dark:text-primary bg-primary/10 dark:bg-primary/50'
          : 'text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-primary-foreground hover:bg-muted dark:hover:bg-background',
      )}
    >
      {icon}
    </Button>
  );
}

/** Rendered by PrdEditorWorkspace inside the prd-editor module to hold the PRD filename field and the editor toolbar actions. */
export default function PrdEditorHeader({
  fileName,
  onFileNameChange,
  isNewFile,
  previewMode,
  onTogglePreview,
  wordWrap,
  onToggleWordWrap,
  isDarkMode,
  onToggleTheme,
  onDownload,
  onOpenGenerateTasks,
  canGenerateTasks,
  onSave,
  saving,
  saveSuccess,
  isFullscreen,
  onToggleFullscreen,
  onClose,
}: PrdEditorHeaderProps) {
  const fileNameInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="flex min-w-0 flex-shrink-0 items-center justify-between border-b border-border p-4 dark:border-border">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-primary">
          <FileText className="h-4 w-4 text-primary-foreground" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <div className="flex min-w-0 flex-1 items-center rounded-md border border-border bg-muted px-3 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary dark:border-border dark:bg-muted dark:focus-within:border-primary dark:focus-within:ring-primary">
                <UnifiedInput
                  ref={fileNameInputRef}
                  type="text"
                  value={fileName}
                  onChange={(event) => onFileNameChange(event.target.value)}
                  className="min-w-0 flex-1 border-none bg-transparent text-base font-medium text-foreground placeholder-muted-foreground outline-none dark:text-primary-foreground dark:placeholder-muted-foreground sm:text-sm"
                  placeholder="Enter PRD filename"
                  maxLength={100}
                />
                <span className="ml-1 whitespace-nowrap text-sm text-muted-foreground dark:text-muted-foreground sm:text-xs">
                  .txt
                </span>
              </div>

              <Button variant="ghost" size="compact"
                onClick={() => fileNameInputRef.current?.focus()}
                className="p-1 text-muted-foreground transition-colors hover:text-primary dark:hover:text-primary"
                title="Focus filename input"
              >
                <UnifiedPencil className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-shrink-0 items-center gap-2">
              <span className="whitespace-nowrap rounded bg-primary/10 px-2 py-1 text-xs text-primary dark:bg-primary dark:text-primary">
                PRD
              </span>
              {isNewFile && (
                <span className="whitespace-nowrap rounded bg-success/10 px-2 py-1 text-xs text-success dark:bg-success dark:text-success">
                  New
                </span>
              )}
            </div>
          </div>

          <p className="mt-1 truncate text-xs text-muted-foreground dark:text-muted-foreground sm:text-sm">
            Product Requirements Document
          </p>
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-1 md:gap-2">
        <HeaderIconButton
          title={previewMode ? 'Switch to edit mode' : 'Preview markdown'}
          onClick={onTogglePreview}
          icon={<Eye className="h-5 w-5 md:h-4 md:w-4" />}
          active={previewMode}
        />

        <HeaderIconButton
          title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
          onClick={onToggleWordWrap}
          icon={<span className="font-mono text-sm font-bold md:text-xs">WRAP</span>}
          active={wordWrap}
        />

        <HeaderIconButton
          title="Toggle theme"
          onClick={onToggleTheme}
          icon={
            isDarkMode ? (
              <Sun className="h-5 w-5 md:h-4 md:w-4" />
            ) : (
              <Moon className="h-5 w-5 md:h-4 md:w-4" />
            )
          }
        />

        <HeaderIconButton
          title="Download PRD"
          onClick={onDownload}
          icon={<Download className="h-5 w-5 md:h-4 md:w-4" />}
        />

        <Button variant="ghost" size="compact"
          onClick={onOpenGenerateTasks}
          disabled={!canGenerateTasks}
          className={cn(
            'px-3 py-2 rounded-md disabled:opacity-50 flex items-center gap-2 transition-colors text-sm font-medium text-primary-foreground min-h-[44px] md:min-h-0',
            'bg-primary hover:bg-primary',
          )}
          title="Generate tasks from PRD content"
        >
          <Sparkles className="h-4 w-4" />
          <span className="hidden md:inline">Generate Tasks</span>
        </Button>

        <Button variant="ghost" size="compact"
          onClick={onSave}
          disabled={saving}
          className={cn(
            'px-3 py-2 text-primary-foreground rounded-md disabled:opacity-50 flex items-center gap-2 transition-colors min-h-[44px] md:min-h-0',
            saveSuccess ? 'bg-success hover:bg-success' : 'bg-primary hover:bg-primary',
          )}
        >
          {saveSuccess ? (
            <>
              <UnifiedCheck className="h-5 w-5 md:h-4 md:w-4" />
              <span className="hidden sm:inline">Saved!</span>
            </>
          ) : (
            <>
              <Save className="h-5 w-5 md:h-4 md:w-4" />
              <span className="hidden sm:inline">{saving ? 'Saving...' : 'Save PRD'}</span>
            </>
          )}
        </Button>

        <Button variant="ghost" size="compact"
          onClick={onToggleFullscreen}
          className="hidden items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground dark:text-muted-foreground dark:hover:bg-background dark:hover:text-primary-foreground md:flex"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>

        <HeaderIconButton
          title="Close"
          onClick={onClose}
          icon={<X className="h-6 w-6 md:h-4 md:w-4" />}
        />
      </div>
    </div>
  );
}
