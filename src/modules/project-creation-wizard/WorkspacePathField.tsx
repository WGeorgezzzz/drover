import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen } from '@/shared/icons';

import { Button, Input } from '@/shared/ui';
import { browseFilesystemFolders } from '@/modules/project-creation-wizard/utils/workspaceApi';
import { getSuggestionRootPath } from '@/modules/project-creation-wizard/utils/pathUtils';
import type { FolderSuggestion } from '@/shared/types';
import FolderBrowserModal from '@/modules/project-creation-wizard/FolderBrowserModal';

type WorkspacePathFieldProps = {
  value: string;
  disabled?: boolean;
  onChange: (path: string) => void;
  onAdvanceToConfirm: () => void;
};

/** Rendered by StepConfiguration to enter the workspace path with folder autocompletion and a browse button. */
export default function WorkspacePathField({
  value,
  disabled = false,
  onChange,
  onAdvanceToConfirm,
}: WorkspacePathFieldProps) {
  const { t } = useTranslation();
  const [pathSuggestions, setPathSuggestions] = useState<FolderSuggestion[]>([]);
  const [showPathDropdown, setShowPathDropdown] = useState(false);
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);

  useEffect(() => {
    if (value.trim().length <= 2) {
      setPathSuggestions([]);
      setShowPathDropdown(false);
      return;
    }

    // Debounce path lookup to avoid firing a request for every keystroke.
    const timerId = window.setTimeout(async () => {
      try {
        const directoryPath = getSuggestionRootPath(value);
        const result = await browseFilesystemFolders(directoryPath);
        const normalizedInput = value.toLowerCase();

        const matchingSuggestions = result.suggestions
          .filter((suggestion) => {
            const normalizedSuggestion = suggestion.path.toLowerCase();
            return (
              normalizedSuggestion.startsWith(normalizedInput) &&
              normalizedSuggestion !== normalizedInput
            );
          })
          .slice(0, 5);

        setPathSuggestions(matchingSuggestions);
        setShowPathDropdown(matchingSuggestions.length > 0);
      } catch (error) {
        console.error('Failed to load path suggestions:', error);
      }
    }, 200);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [value]);

  const handleSuggestionSelect = useCallback(
    (suggestion: FolderSuggestion) => {
      onChange(suggestion.path);
      setShowPathDropdown(false);
    },
    [onChange],
  );

  const handleFolderSelected = useCallback(
    (selectedPath: string, advanceToConfirm: boolean) => {
      onChange(selectedPath);
      setShowFolderBrowser(false);
      if (advanceToConfirm) {
        onAdvanceToConfirm();
      }
    },
    [onAdvanceToConfirm, onChange],
  );

  return (
    <>
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <Input
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="/path/to/project/workspace"
            className="w-full"
            disabled={disabled}
          />

          {showPathDropdown && pathSuggestions.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg dark:border-border dark:bg-background">
              {pathSuggestions.map((suggestion) => (
                <Button variant="ghost" size="compact"
                  key={suggestion.path}
                  onClick={() => handleSuggestionSelect(suggestion)}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-muted dark:hover:bg-muted"
                >
                  <div className="font-medium text-foreground dark:text-primary-foreground">{suggestion.name}</div>
                  <div className="text-xs text-muted-foreground dark:text-muted-foreground">{suggestion.path}</div>
                </Button>
              ))}
            </div>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => setShowFolderBrowser(true)}
          className="px-3"
          title={t('common:misc.browseFolders')}
          disabled={disabled}
        >
          <FolderOpen className="h-4 w-4" />
        </Button>
      </div>

      <FolderBrowserModal
        isOpen={showFolderBrowser}
        autoAdvanceOnSelect={false}
        onClose={() => setShowFolderBrowser(false)}
        onFolderSelected={handleFolderSelected}
      />
    </>
  );
}
