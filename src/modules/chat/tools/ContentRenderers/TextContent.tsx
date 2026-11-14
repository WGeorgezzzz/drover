import React from 'react';

type TextContentProps = {
  content: string;
  format?: 'plain' | 'json' | 'code';
  className?: string;
};

/**
 * Renders plain text, JSON, or code content
 * Used by: Raw parameters, generic text results, JSON responses
 *
 * Rendered by chat's ToolRenderer as the default content of a tool result.
 */
export const TextContent: React.FC<TextContentProps> = ({
  content,
  format = 'plain',
  className = ''
}) => {
  if (format === 'json') {
    let formattedJson = content;
    try {
      const parsed = JSON.parse(content);
      formattedJson = JSON.stringify(parsed, null, 2);
    } catch (e) {
      // If parsing fails, use original content
      console.warn('Failed to parse JSON content:', e);
    }

    return (
      <pre className={`mt-1 max-h-60 overflow-auto rounded border border-border/50 bg-muted/40 p-2.5 font-mono text-xs text-muted-foreground ${className}`}>
        {formattedJson}
      </pre>
    );
  }

  if (format === 'code') {
    return (
      <pre className={`mt-1 overflow-hidden whitespace-pre-wrap break-words rounded border border-border/50 bg-muted p-2 font-mono text-xs text-foreground dark:border-border/50 dark:bg-background/50 dark:text-muted-foreground ${className}`}>
        {content}
      </pre>
    );
  }

  // Plain text
  return (
    <div className={`mt-1 whitespace-pre-wrap text-sm text-foreground dark:text-muted-foreground ${className}`}>
      {content}
    </div>
  );
};
