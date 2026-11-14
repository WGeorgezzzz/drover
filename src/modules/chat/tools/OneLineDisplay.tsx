import { Check as UnifiedCheck, Copy as UnifiedCopy, ChevronDown as UnifiedChevronDown } from '@/shared/icons';
import { Button } from '@/shared/ui/Button';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { copyTextToClipboard } from '@/shared/utils';
import { BashCommandDisplay } from '@/modules/chat/tools/BashCommandDisplay';
import { ToolStatusBadge } from '@/modules/chat/tools/ToolStatusBadge';
import type { ToolStatus } from '@/shared/types';

type ActionType = 'copy' | 'open-file' | 'jump-to-results' | 'none';

type OneLineDisplayProps = {
  toolName: string;
  icon?: string;
  label?: string;
  value: string;
  secondary?: string;
  action?: ActionType;
  onAction?: () => void;
  style?: string;
  wrapText?: boolean;
  colorScheme?: {
    primary?: string;
    secondary?: string;
    background?: string;
    border?: string;
    icon?: string;
  };
  resultId?: string;
  toolResult?: any;
  toolId?: string;
  status?: ToolStatus;
};

/**
 * Unified one-line display for simple tool inputs and results
 * Used by: Bash, Read, Grep/Glob (minimized), TodoRead, etc.
 *
 * Rendered by chat's ToolRenderer for tools configured as single-line.
 */
export const OneLineDisplay: React.FC<OneLineDisplayProps> = ({
  toolName,
  icon,
  label,
  value,
  secondary,
  action = 'none',
  onAction,
  style,
  wrapText = false,
  colorScheme = {
    primary: 'text-foreground',
    secondary: 'text-muted-foreground',
    background: '',
    border: 'border-border',
    icon: 'text-muted-foreground',
  },
  toolResult,
  toolId,
  status,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const isTerminal = style === 'terminal';

  const handleAction = async () => {
    if (action === 'copy' && value) {
      const didCopy = await copyTextToClipboard(value);
      if (!didCopy) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else if (onAction) {
      onAction();
    }
  };

  const renderCopyButton = () => (
    <Button variant="ghost" size="compact"
      onClick={handleAction}
      className="ml-1 flex-shrink-0 text-muted-foreground/40 opacity-0 transition-all hover:text-muted-foreground group-hover:opacity-100"
      title={t('chat:misc.copyToClipboard')}
      aria-label={t('chat:misc.copyToClipboard')}
    >
      {copied ? (
        <UnifiedCheck className="h-3 w-3 text-success" />
      ) : (
        <UnifiedCopy className="h-3 w-3" />
      )}
    </Button>
  );

  // Legacy terminal-configured tools share the compact, theme-aware shell row.
  if (isTerminal) {
    return <BashCommandDisplay command={value} description={secondary}
      output={typeof toolResult?.content === 'string' ? toolResult.content : undefined}
      isError={Boolean(toolResult?.isError)} status={status} defaultOpen={false} />;
  }

  // File open style
  if (action === 'open-file') {
    const displayName = value.split('/').pop() || value;
    return (
      <div className={`group flex items-center gap-1.5 border-l-2 ${colorScheme.border} my-0.5 py-0.5 pl-3`}>
        <span className="flex-shrink-0 text-xs text-muted-foreground">{label || toolName}</span>
        <span className="text-[10px] text-muted-foreground/40">/</span>
        <Button variant="ghost" size="compact"
          onClick={handleAction}
          className="truncate font-mono text-xs text-primary transition-colors hover:text-primary/80 hover:underline"
          title={value}
        >
          {displayName}
        </Button>
        {status && <ToolStatusBadge status={status} className="ml-auto" />}
      </div>
    );
  }

  // Search / jump-to-results style
  if (action === 'jump-to-results') {
    return (
      <div className={`group flex items-center gap-1.5 border-l-2 ${colorScheme.border} my-0.5 py-0.5 pl-3`}>
        <span className="flex-shrink-0 text-xs text-muted-foreground">{label || toolName}</span>
        <span className="text-[10px] text-muted-foreground/40">/</span>
        <span className={`min-w-0 flex-1 truncate font-mono text-xs ${colorScheme.primary}`}>
          {value}
        </span>
        {secondary && (
          <span className="flex-shrink-0 text-[11px] italic text-muted-foreground/60">
            {secondary}
          </span>
        )}
        {status && <ToolStatusBadge status={status} />}
        {toolResult && (
          <a
            href={`#tool-result-${toolId}`}
            className="flex flex-shrink-0 items-center gap-0.5 text-[11px] text-primary transition-colors hover:text-primary/80"
          >
            <UnifiedChevronDown className="h-3 w-3" />
          </a>
        )}
      </div>
    );
  }

  // Default one-line style
  return (
    <div className={`group flex items-center gap-1.5 ${colorScheme.background || ''} border-l-2 ${colorScheme.border} my-0.5 py-0.5 pl-3`}>
      {icon && icon !== 'terminal' && (
        <span className={`${colorScheme.icon} flex-shrink-0 text-xs`}>{icon}</span>
      )}
      {!icon && (label || toolName) && (
        <span className="flex-shrink-0 text-xs text-muted-foreground">{label || toolName}</span>
      )}
      {(icon || label || toolName) && (
        <span className="text-[10px] text-muted-foreground/40">/</span>
      )}
      <span className={`font-mono text-xs ${wrapText ? 'whitespace-pre-wrap break-all' : 'truncate'} min-w-0 flex-1 ${colorScheme.primary}`}>
        {value}
      </span>
      {secondary && (
        <span className={`text-[11px] ${colorScheme.secondary} flex-shrink-0 italic`}>
          {secondary}
        </span>
      )}
      {status && <ToolStatusBadge status={status} />}
      {action === 'copy' && renderCopyButton()}
    </div>
  );
};
