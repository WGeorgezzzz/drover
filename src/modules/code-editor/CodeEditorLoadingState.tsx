import { DialogSurface } from '@/shared/ui/Dialog';
import { getEditorLoadingStyles } from '@/modules/code-editor/utils/editorStyles';

type CodeEditorLoadingStateProps = {
  isDarkMode: boolean;
  isSidebar: boolean;
  loadingText: string;
};

/** Rendered by CodeEditor inside the code-editor module while a file's contents are still being fetched. */
export default function CodeEditorLoadingState({
  isDarkMode,
  isSidebar,
  loadingText,
}: CodeEditorLoadingStateProps) {
  return (
    <>
      <style>{getEditorLoadingStyles(isDarkMode)}</style>
      {isSidebar ? (
        <div className="flex h-full w-full items-center justify-center bg-background">
          <div className="flex items-center gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary" />
            <span className="text-foreground dark:text-primary-foreground">{loadingText}</span>
          </div>
        </div>
      ) : (
        <DialogSurface className="fixed inset-0 z-[9999] md:flex md:items-center md:justify-center "  >
          <div className="code-editor-loading flex h-full w-full items-center justify-center p-8 md:h-auto md:w-auto md:rounded-lg">
            <div className="flex items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary" />
              <span className="text-foreground dark:text-primary-foreground">{loadingText}</span>
            </div>
          </div>
        </DialogSurface>
      )}
    </>
  );
}
