import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from '@/shared/ui/Button';
import { ChevronUp, ChevronDown, Eye, EyeOff, ExternalLink, Minimize2, Maximize2, type LucideIcon } from '@/shared/icons';
import { getChunks } from '@codemirror/merge';
import { EditorView, showPanel } from '@codemirror/view';

import type { CodeEditorFile } from '@/shared/types';

type EditorToolbarLabels = {
  changes: string;
  previousChange: string;
  nextChange: string;
  hideDiff: string;
  showDiff: string;
  collapse: string;
  expand: string;
  openInModal: string;
};

type CreateEditorToolbarPanelParams = {
  file: CodeEditorFile;
  showDiff: boolean;
  isSidebar: boolean;
  isExpanded: boolean;
  onToggleDiff: () => void;
  onPopOut: (() => void) | null;
  onToggleExpand: (() => void) | null;
  labels: EditorToolbarLabels;
};

const renderButton = (className: string, title: string, Icon: LucideIcon, disabled = false) => renderToStaticMarkup(createElement(Button, { type: 'button', variant: 'ghost', size: 'icon-sm', className, title, 'aria-label': title, disabled }, createElement(Icon)));

const escapeHtml = (value: string): string => (
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
);

export const createEditorToolbarPanelExtension = ({
  file,
  showDiff,
  isSidebar,
  isExpanded,
  onToggleDiff,
  onPopOut,
  onToggleExpand,
  labels,
}: CreateEditorToolbarPanelParams) => {
  const hasToolbarButtons = Boolean(file.diffInfo || (isSidebar && onPopOut) || (isSidebar && onToggleExpand));
  if (!hasToolbarButtons) {
    return [];
  }

  const createPanel = (view: EditorView) => {
    const dom = document.createElement('div');
    dom.className = 'cm-editor-toolbar-panel';

    let currentIndex = 0;

    const updatePanel = () => {
      const hasDiff = Boolean(file.diffInfo && showDiff);
      const chunksData = hasDiff ? getChunks(view.state) : null;
      const chunks = chunksData?.chunks || [];
      const chunkCount = chunks.length;
      const maxChunkIndex = Math.max(0, chunkCount - 1);
      currentIndex = Math.max(0, Math.min(currentIndex, maxChunkIndex));
      const escapedLabels = {
        changes: escapeHtml(labels.changes),
        previousChange: escapeHtml(labels.previousChange),
        nextChange: escapeHtml(labels.nextChange),
        hideDiff: escapeHtml(labels.hideDiff),
        showDiff: escapeHtml(labels.showDiff),
        collapse: escapeHtml(labels.collapse),
        expand: escapeHtml(labels.expand),
      };


      let toolbarHtml = '<div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">';
      toolbarHtml += '<div style="display: flex; align-items: center; gap: 8px;">';

      if (hasDiff) {
        toolbarHtml += `
          <span style="font-weight: 500;">${chunkCount > 0 ? `${currentIndex + 1}/${chunkCount}` : '0'} ${escapedLabels.changes}</span>
          ${renderButton('cm-diff-nav-btn cm-diff-nav-prev', labels.previousChange, ChevronUp, chunkCount === 0)}
          ${renderButton('cm-diff-nav-btn cm-diff-nav-next', labels.nextChange, ChevronDown, chunkCount === 0)}
        `;
      }

      toolbarHtml += '</div>';
      toolbarHtml += '<div style="display: flex; align-items: center; gap: 4px;">';

      if (file.diffInfo) {
        toolbarHtml += `
          ${renderButton('cm-toolbar-btn cm-toggle-diff-btn', showDiff ? labels.hideDiff : labels.showDiff, showDiff ? EyeOff : Eye)}
        `;
      }

      if (isSidebar && onPopOut) {
        toolbarHtml += `
          ${renderButton('cm-toolbar-btn cm-popout-btn', labels.openInModal, ExternalLink)}
        `;
      }

      if (isSidebar && onToggleExpand) {
        toolbarHtml += `
          ${renderButton('cm-toolbar-btn cm-expand-btn', isExpanded ? labels.collapse : labels.expand, isExpanded ? Minimize2 : Maximize2)}
        `;
      }

      toolbarHtml += '</div>';
      toolbarHtml += '</div>';

      dom.innerHTML = toolbarHtml;

      if (hasDiff) {
        const previousButton = dom.querySelector<HTMLButtonElement>('.cm-diff-nav-prev');
        const nextButton = dom.querySelector<HTMLButtonElement>('.cm-diff-nav-next');

        previousButton?.addEventListener('click', () => {
          if (chunks.length === 0) {
            return;
          }

          currentIndex = currentIndex > 0 ? currentIndex - 1 : chunks.length - 1;
          const chunk = chunks[currentIndex];

          if (chunk) {
            view.dispatch({
              effects: EditorView.scrollIntoView(chunk.fromB, { y: 'center' }),
            });
          }

          updatePanel();
        });

        nextButton?.addEventListener('click', () => {
          if (chunks.length === 0) {
            return;
          }

          currentIndex = currentIndex < chunks.length - 1 ? currentIndex + 1 : 0;
          const chunk = chunks[currentIndex];

          if (chunk) {
            view.dispatch({
              effects: EditorView.scrollIntoView(chunk.fromB, { y: 'center' }),
            });
          }

          updatePanel();
        });
      }

      const toggleDiffButton = dom.querySelector<HTMLButtonElement>('.cm-toggle-diff-btn');
      toggleDiffButton?.addEventListener('click', onToggleDiff);

      const popOutButton = dom.querySelector<HTMLButtonElement>('.cm-popout-btn');
      popOutButton?.addEventListener('click', () => {
        onPopOut?.();
      });

      const expandButton = dom.querySelector<HTMLButtonElement>('.cm-expand-btn');
      expandButton?.addEventListener('click', () => {
        onToggleExpand?.();
      });
    };

    updatePanel();

    return {
      top: true,
      dom,
      update: updatePanel,
    };
  };

  return [showPanel.of(createPanel)];
};
