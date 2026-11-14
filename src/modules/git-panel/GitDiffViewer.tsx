import { Button } from '@/shared/ui/Button';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePaletteOps } from '@/modules/command-palette';
import { useSelectedProvider } from '@/shared/hooks/useSelectedProvider';

type GitDiffViewerProps = {
  diff: string | null;
  isMobile: boolean;
  wrapText: boolean;
  filePath?: string;
};

const PREVIEW_CHARACTER_LIMIT = 200_000;
const PREVIEW_LINE_LIMIT = 1_500;

type DiffPreview = {
  lines: string[];
  isCharacterTruncated: boolean;
  isLineTruncated: boolean;
};

function buildDiffPreview(diff: string): DiffPreview {
  const isCharacterTruncated = diff.length > PREVIEW_CHARACTER_LIMIT;
  const previewText = isCharacterTruncated ? diff.slice(0, PREVIEW_CHARACTER_LIMIT) : diff;
  const previewLines = previewText.split('\n');
  const isLineTruncated = previewLines.length > PREVIEW_LINE_LIMIT;

  return {
    lines: isLineTruncated ? previewLines.slice(0, PREVIEW_LINE_LIMIT) : previewLines,
    isCharacterTruncated,
    isLineTruncated,
  };
}

/** Rendered by the git panel's changes, compare and history views to display one file's diff. */
export default function GitDiffViewer({ diff, isMobile, wrapText, filePath }: GitDiffViewerProps) {
  const { t } = useTranslation('chat');
  const provider = useSelectedProvider();
  const { insertComposerText } = usePaletteOps();
  // Holds only the currently edited line comment; saving appends it to the persistent chat draft.
  const [comment, setComment] = useState<{line:number; side:string; code:string; text:string; revision:string | null} | null>(null);
  // Render a bounded preview to keep huge commit diffs from freezing the UI thread.
  const preview = useMemo(() => buildDiffPreview(diff || ''), [diff]);
  const isPreviewTruncated = preview.isCharacterTruncated || preview.isLineTruncated;
  const anchors = useMemo(() => {
    let oldLine = 0, newLine = 0, inHunk = false;
    return preview.lines.map(line => {
      const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (hunk) { oldLine=Number(hunk[1]);newLine=Number(hunk[2]);inHunk=true;return null; }
      if (!inHunk || line.startsWith('\\') || !/^[ +\-]/.test(line)) return null;
      if (line.startsWith('-')) return {line:oldLine++,side:'original',text:line.slice(1)};
      if (line.startsWith('+')) return {line:newLine++,side:'updated',text:line.slice(1)};
      oldLine++;
      return {line:newLine++,side:'updated',text:line.slice(1)};
    });
  }, [preview.lines]);

  if (!diff) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        No diff available
      </div>
    );
  }

  const renderDiffLine = (line: string, index: number) => {
    const isAddition = line.startsWith('+') && !line.startsWith('+++');
    const isDeletion = line.startsWith('-') && !line.startsWith('---');
    const isHeader = line.startsWith('@@');

    return (
      <div
        key={index}
        className={`px-3 py-0.5 font-mono text-xs ${isMobile && wrapText ? 'whitespace-pre-wrap break-all' : 'overflow-x-auto whitespace-pre'
          } ${isAddition ? 'bg-success/10 text-success dark:bg-success/50 dark:text-success' :
            isDeletion ? 'bg-destructive/10 text-destructive dark:bg-destructive/50 dark:text-destructive' :
              isHeader ? 'bg-primary/5 text-primary' :
                'text-muted-foreground/70'
          }`}
      >
        {filePath && provider === 'claude' && anchors[index] ? (
          <Button variant="ghost" size="compact" type="button" className="block w-full text-left hover:underline" disabled={Boolean(comment)}
            aria-label={t('desktop.commentLine', {defaultValue:'Comment on {{file}} line {{line}} ({{side}})',file:filePath,line:anchors[index].line,side:anchors[index].side})}
            onClick={() => setComment({line:anchors[index]!.line,side:anchors[index]!.side,code:anchors[index]!.text,text:'',revision:diff})}>{line}</Button>
        ) : line}
      </div>
    );
  };

  return (
    <div className="diff-viewer">
      {isPreviewTruncated && (
        <div className="mb-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          Large diff preview: rendering is limited to keep the tab responsive.
        </div>
      )}
      {preview.lines.map((line, index) => renderDiffLine(line, index))}
      {provider === 'claude' && comment && filePath && (
        <div className="space-y-2 border-t border-border bg-background p-3" role="group" aria-label={t('desktop.reviewComment','Review comment')}>
          <p className="text-xs text-muted-foreground">{filePath}:{comment.line} ({comment.side})</p>
          {comment.revision !== diff && <p className="text-xs text-warning" role="status">{t('desktop.diffChanged','The diff changed. Copy your comment, cancel, and select the current line again.')}</p>}
          <textarea autoFocus rows={3} className="w-full rounded border border-border bg-background p-2 text-sm"
            aria-label={t('desktop.reviewComment','Review comment')} value={comment.text}
            onChange={event => setComment({...comment,text:event.target.value})} />
          <div className="flex gap-2">
            <Button variant="ghost" size="compact" type="button" className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50" disabled={!comment.text.trim() || comment.revision !== diff} onClick={() => {
              insertComposerText(`Review feedback for ${filePath}:${comment.line} (${comment.side} side of the displayed diff):\nCode: ${comment.code}\n${comment.text.trim()}\n`);
              setComment(null);
            }}>{t('desktop.addReviewToDraft','Add to Claude draft')}</Button>
            <Button variant="ghost" size="compact" type="button" className="rounded px-3 py-1.5 text-xs hover:bg-muted" onClick={() => setComment(null)}>{t('desktop.cancelComment','Cancel')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
