import { Check as UnifiedCheck, Copy as UnifiedCopy, ChevronDown as UnifiedChevronDown } from '@/shared/icons';
import { Button } from '@/shared/ui/Button';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { copyTextToClipboard } from '@/shared/utils';
import { useViewportMenuAnchor } from '@/shared/hooks/useViewportMenuAnchor';

const COPY_SUCCESS_TIMEOUT_MS = 2000;

type CopyFormat = 'text' | 'markdown';

type CopyFormatOption = {
  format: CopyFormat;
  label: string;
};

// Converts markdown into readable plain text for "Copy as text".
const convertMarkdownToPlainText = (markdown: string): string => {
  let plainText = markdown.replace(/\r\n/g, '\n');
  const codeBlocks: string[] = [];
  plainText = plainText.replace(/```[\w-]*\n([\s\S]*?)```/g, (_match, code: string) => {
    const placeholder = `@@CODEBLOCK${codeBlocks.length}@@`;
    codeBlocks.push(code.replace(/\n$/, ''));
    return placeholder;
  });
  plainText = plainText.replace(/`([^`]+)`/g, '$1');
  plainText = plainText.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1');
  plainText = plainText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  plainText = plainText.replace(/^>\s?/gm, '');
  plainText = plainText.replace(/^#{1,6}\s+/gm, '');
  plainText = plainText.replace(/^[-*+]\s+/gm, '');
  plainText = plainText.replace(/^\d+\.\s+/gm, '');
  plainText = plainText.replace(/(\*\*|__)(.*?)\1/g, '$2');
  plainText = plainText.replace(/(\*|_)(.*?)\1/g, '$2');
  plainText = plainText.replace(/~~(.*?)~~/g, '$1');
  plainText = plainText.replace(/<\/?[^>]+(>|$)/g, '');
  plainText = plainText.replace(/\n{3,}/g, '\n\n');
  plainText = plainText.replace(/@@CODEBLOCK(\d+)@@/g, (_match, index: string) => codeBlocks[Number(index)] ?? '');
  return plainText.trim();
};

/**
 * Rendered by chat's MessageComponent to copy a turn to the clipboard, with a
 * markdown/plain-text format picker on assistant turns.
 */
const MessageCopyControl = ({
  content,
  messageType,
}: {
  content: string;
  messageType: 'user' | 'assistant';
}) => {
  const { t } = useTranslation('chat');
  const canSelectCopyFormat = messageType === 'assistant';
  const defaultFormat: CopyFormat = canSelectCopyFormat ? 'markdown' : 'text';
  const [selectedFormat, setSelectedFormat] = useState<CopyFormat>(defaultFormat);
  const [copied, setCopied] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const closeDropdown = useCallback(() => setIsDropdownOpen(false), []);
  const { triggerRef, menuRef, anchor, updateAnchor } = useViewportMenuAnchor(isDropdownOpen, closeDropdown, 200, 'below', 'left');
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The dropdown is rendered in a portal so it escapes the chat message's
  // `contain: paint` box (which would otherwise clip it). Anchor it to the
  // trigger, flipping above when there isn't room below.
  const openDropdown = () => {
    updateAnchor();
    setIsDropdownOpen(true);
  };

  const copyFormatOptions: CopyFormatOption[] = useMemo(
    () => [
      {
        format: 'markdown',
        label: t('copyMessage.copyAsMarkdown', { defaultValue: 'Copy as markdown' }),
      },
      {
        format: 'text',
        label: t('copyMessage.copyAsText', { defaultValue: 'Copy as text' }),
      },
    ],
    [t]
  );

  const selectedFormatTag = selectedFormat === 'markdown'
    ? t('copyMessage.markdownShort', { defaultValue: 'MD' })
    : t('copyMessage.textShort', { defaultValue: 'TXT' });

  const copyPayload = useMemo(() => {
    if (selectedFormat === 'markdown') {
      return content;
    }
    return convertMarkdownToPlainText(content);
  }, [content, selectedFormat]);

  useEffect(() => {
    setSelectedFormat(defaultFormat);
    setIsDropdownOpen(false);
  }, [defaultFormat]);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current) {
        clearTimeout(copyFeedbackTimerRef.current);
      }
    };
  }, []);

  const handleCopyClick = async () => {
    if (!copyPayload.trim()) return;
    const didCopy = await copyTextToClipboard(copyPayload);
    if (!didCopy) return;

    setCopied(true);
    if (copyFeedbackTimerRef.current) {
      clearTimeout(copyFeedbackTimerRef.current);
    }
    copyFeedbackTimerRef.current = setTimeout(() => {
      setCopied(false);
    }, COPY_SUCCESS_TIMEOUT_MS);
  };

  const handleFormatChange = (format: CopyFormat) => {
    setSelectedFormat(format);
    setIsDropdownOpen(false);
  };

  const toneClass = messageType === 'user'
    ? 'text-muted-foreground hover:text-foreground'
    : 'text-muted-foreground hover:text-muted-foreground dark:text-muted-foreground dark:hover:text-muted-foreground';
  const copyTitle = copied ? t('copyMessage.copied') : t('copyMessage.copy');
  const rootClassName = canSelectCopyFormat
    ? 'relative flex min-w-0 flex-1 items-center gap-0.5 sm:min-w-max sm:flex-none sm:w-auto'
    : 'relative flex items-center gap-0.5';

  return (
    <div className={rootClassName}>
      <Button variant="ghost" size="compact"
        type="button"
        onClick={handleCopyClick}
        title={copyTitle}
        aria-label={copyTitle}
        className={`inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors ${toneClass}`}
      >
        {copied ? (
          <UnifiedCheck className="h-3.5 w-3.5" />
        ) : (
          <UnifiedCopy className="h-3.5 w-3.5" />
        )}
        <span className="text-[10px] font-semibold uppercase tracking-wide">{selectedFormatTag}</span>
      </Button>

      {canSelectCopyFormat && (
        <>
          <Button variant="ghost" size="compact"
            ref={triggerRef}
            type="button"
            onClick={() => (isDropdownOpen ? setIsDropdownOpen(false) : openDropdown())}
            className={`rounded px-1 py-0.5 transition-colors ${toneClass}`}
            aria-label={t('copyMessage.selectFormat', { defaultValue: 'Select copy format' })}
            title={t('copyMessage.selectFormat', { defaultValue: 'Select copy format' })}
          >
            <UnifiedChevronDown className={`h-3 w-3 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </Button>

          {isDropdownOpen && anchor && createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={t('copyMessage.selectFormat')}
              style={{ ...anchor, width: anchor.maxWidth }}
              className="fixed z-[1000] min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain rounded-md border border-border bg-popover p-1 shadow-lg"
            >
              {copyFormatOptions.map((option) => {
                const isSelected = option.format === selectedFormat;
                return (
                  <Button variant="ghost" size="compact"
                    key={option.format}
                    type="button"
                    onClick={() => handleFormatChange(option.format)}
                    className={`block w-full rounded px-2 py-1.5 text-left transition-colors ${isSelected
                      ? 'bg-accent text-foreground'
                      : 'text-foreground hover:bg-accent'
                      }`}
                  >
                    <span className="block text-xs font-medium">{option.label}</span>
                  </Button>
                );
              })}
            </div>,
            document.body,
          )}
        </>
      )}
    </div>
  );
};

export default MessageCopyControl;
