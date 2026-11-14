import { Input as UnifiedInput } from '@/shared/ui/Input';
import { CircleHelp as UnifiedCircleHelp, Check as UnifiedCheck, ChevronLeft as UnifiedChevronLeft } from '@/shared/icons';
import { Button } from '@/shared/ui/Button';
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import type { PermissionPanelProps,Question } from '@/shared/types';

/** Stable fallback so the memoized handlers below are not invalidated on every
 *  render by a fresh `[]` literal when a request carries no questions. */
const NO_QUESTIONS: Question[] = [];

/**
 * Registered by chat's PermissionRequestsBanner as the permission panel for
 * AskUserQuestion requests, so the user answers the model's questions inline.
 */
export const AskUserQuestionPanel: React.FC<PermissionPanelProps> = ({
  request,
  onDecision,
}) => {
  const { t } = useTranslation();
  const input = request.input as { questions?: Question[] } | undefined;
  const questions: Question[] = input?.questions ?? NO_QUESTIONS;

  const [currentStep, setCurrentStep] = useState(0);
  const [selections, setSelections] = useState<Map<number, Set<string>>>(() => new Map());
  const [otherTexts, setOtherTexts] = useState<Map<number, string>>(() => new Map());
  const [otherActive, setOtherActive] = useState<Map<number, boolean>>(() => new Map());
  const [mounted, setMounted] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const otherInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  // Focus the container for keyboard events when step changes
  useEffect(() => {
    if (!otherActive.get(currentStep)) {
      containerRef.current?.focus();
    }
  }, [currentStep, otherActive]);

  useEffect(() => {
    if (otherActive.get(currentStep)) {
      otherInputRef.current?.focus();
    }
  }, [otherActive, currentStep]);

  const toggleOption = useCallback((qIdx: number, label: string, multiSelect: boolean) => {
    setSelections(prev => {
      const next = new Map(prev);
      const current = new Set(next.get(qIdx) || []);
      if (multiSelect) {
        if (current.has(label)) current.delete(label);
        else current.add(label);
      } else {
        current.clear();
        current.add(label);
        setOtherActive(p => { const n = new Map(p); n.set(qIdx, false); return n; });
      }
      next.set(qIdx, current);
      return next;
    });
  }, []);

  const toggleOther = useCallback((qIdx: number, multiSelect: boolean) => {
    setOtherActive(prev => {
      const next = new Map(prev);
      const wasActive = next.get(qIdx) || false;
      next.set(qIdx, !wasActive);
      if (!multiSelect && !wasActive) {
        setSelections(p => { const n = new Map(p); n.set(qIdx, new Set()); return n; });
      }
      return next;
    });
  }, []);

  const setOtherText = useCallback((qIdx: number, text: string) => {
    setOtherTexts(prev => { const next = new Map(prev); next.set(qIdx, text); return next; });
  }, []);

  const buildAnswers = useCallback(() => {
    const answers: Record<string, string> = {};
    questions.forEach((q, idx) => {
      const selected = Array.from(selections.get(idx) || []);
      const isOther = otherActive.get(idx) || false;
      const otherText = (otherTexts.get(idx) || '').trim();
      if (isOther && otherText) selected.push(otherText);
      if (selected.length > 0) answers[q.question] = selected.join(', ');
    });
    return answers;
  }, [questions, selections, otherActive, otherTexts]);

  const handleSubmit = useCallback(() => {
    onDecision(request.requestId, { allow: true, updatedInput: { ...input, answers: buildAnswers() } });
  }, [onDecision, request.requestId, input, buildAnswers]);

  const handleSkip = useCallback(() => {
    onDecision(request.requestId, { allow: true, updatedInput: { ...input, answers: {} } });
  }, [onDecision, request.requestId, input]);

  // Keyboard handler for number keys and navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Don't capture keys when typing in the "Other" input
    if (e.target instanceof HTMLInputElement) return;

    const q = questions[currentStep];
    if (!q) return;
    const multi = q.multiSelect || false;
    const optCount = q.options.length;

    // Number keys 1-9 for options
    const num = parseInt(e.key);
    if (!isNaN(num) && num >= 1 && num <= optCount) {
      e.preventDefault();
      toggleOption(currentStep, q.options[num - 1].label, multi);
      return;
    }

    // 0 for "Other"
    if (e.key === '0') {
      e.preventDefault();
      toggleOther(currentStep, multi);
      return;
    }

    // Enter to advance / submit
    if (e.key === 'Enter') {
      e.preventDefault();
      const isLast = currentStep === questions.length - 1;
      if (isLast) handleSubmit();
      else setCurrentStep(s => s + 1);
      return;
    }

    // Escape to skip
    if (e.key === 'Escape') {
      e.preventDefault();
      handleSkip();
      return;
    }
  }, [currentStep, questions, toggleOption, toggleOther, handleSubmit, handleSkip]);

  if (questions.length === 0) return null;

  const total = questions.length;
  const isSingle = total === 1;
  const q = questions[currentStep];
  const multi = q.multiSelect || false;
  const selected = selections.get(currentStep) || new Set<string>();
  const isOtherOn = otherActive.get(currentStep) || false;
  const isLast = currentStep === total - 1;
  const isFirst = currentStep === 0;
  const hasCurrentSelection = selected.size > 0 || (isOtherOn && (otherTexts.get(currentStep) || '').trim().length > 0);

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className={`w-full outline-none transition-all duration-500 ease-out ${
        mounted ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
      }`}
    >
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card shadow-lg dark:border-border/50 dark:bg-background/90 dark:shadow-2xl">
        {/* Accent line */}
        <div className="absolute left-0 right-0 top-0 h-[2px] bg-gradient-to-r from-blue-500 via-cyan-400 to-teal-400" />

        {/* Header + Question — compact */}
        <div className="px-4 pb-2 pt-3.5">
          <div className="mb-1.5 flex items-center gap-2.5">
            {/* Question icon */}
            <div className="relative flex-shrink-0">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/10 to-cyan-500/10 dark:from-blue-400/15 dark:to-cyan-400/15">
                <UnifiedCircleHelp className="h-3.5 w-3.5 text-primary dark:text-primary" />
              </div>
              <div className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-primary dark:bg-primary" />
            </div>

            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">
                Claude needs your input
              </span>
              {q.header && (
                <span className="inline-flex items-center rounded border border-primary bg-primary/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-primary dark:border-primary/50 dark:bg-primary/30 dark:text-primary">
                  {q.header}
                </span>
              )}
            </div>

            {/* Step counter */}
            {!isSingle && (
              <span className="flex-shrink-0 text-[10px] tabular-nums text-muted-foreground dark:text-muted-foreground">
                {currentStep + 1}/{total}
              </span>
            )}
          </div>

          {/* Progress dots (multi-question) */}
          {!isSingle && (
            <div className="mb-2 flex items-center gap-1">
              {questions.map((_, i) => (
                <Button variant="ghost" size="compact"
                  key={i}
                  type="button"
                  onClick={() => setCurrentStep(i)}
                  className={`h-[3px] rounded-full transition-all duration-300 ${
                    i === currentStep
                      ? 'w-5 bg-primary dark:bg-primary'
                      : i < currentStep
                        ? 'w-2.5 bg-primary dark:bg-primary'
                        : 'w-2.5 bg-muted dark:bg-muted'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Question text */}
          <p className="text-[14px] font-medium leading-snug text-foreground dark:text-foreground">
            {q.question}
          </p>
          {multi && (
            <span className="text-[10px] text-muted-foreground dark:text-muted-foreground">Select all that apply</span>
          )}
        </div>

        {/* Options — tight spacing */}
        <div className="scrollbar-thin max-h-48 overflow-y-auto px-4 pb-2" role={multi ? 'group' : 'radiogroup'} aria-label={q.question}>
          <div className="space-y-1">
            {q.options.map((opt, optIdx) => {
              const isSelected = selected.has(opt.label);
              return (
                <Button variant="ghost" size="compact"
                  key={opt.label}
                  type="button"
                  onClick={() => toggleOption(currentStep, opt.label, multi)}
                  className={`group flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all duration-150 ${
                    isSelected
                      ? 'border-primary bg-primary/10 ring-1 ring-primary/50 dark:border-primary dark:bg-primary/25 dark:ring-primary/30'
                      : 'border-border hover:border-border hover:bg-muted/60 dark:border-border/60 dark:hover:border-border dark:hover:bg-muted/40'
                  }`}
                >
                  {/* Keyboard hint */}
                  <kbd className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded font-mono text-[10px] transition-all duration-150 ${
                    isSelected
                      ? 'bg-primary font-semibold text-primary-foreground dark:bg-primary'
                      : 'border border-border bg-muted text-muted-foreground group-hover:border-border dark:border-border dark:bg-background dark:text-muted-foreground dark:group-hover:border-border'
                  }`}>
                    {optIdx + 1}
                  </kbd>

                  <div className="min-w-0 flex-1">
                    <div className={`text-[13px] leading-tight transition-colors duration-150 ${
                      isSelected
                        ? 'font-medium text-foreground dark:text-foreground'
                        : 'text-foreground dark:text-muted-foreground'
                    }`}>
                      {opt.label}
                    </div>
                    {opt.description && (
                      <div className={`text-[11px] leading-snug transition-colors duration-150 ${
                        isSelected
                          ? 'text-primary/70 dark:text-primary/70'
                          : 'text-muted-foreground dark:text-muted-foreground'
                      }`}>
                        {opt.description}
                      </div>
                    )}
                  </div>

                  {/* Selection check */}
                  {isSelected && (
                    <UnifiedCheck className="h-4 w-4 flex-shrink-0 text-primary dark:text-primary" />
                  )}
                </Button>
              );
            })}

            {/* "Other" option */}
            <Button variant="ghost" size="compact"
              type="button"
              onClick={() => toggleOther(currentStep, multi)}
              className={`group flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all duration-150 ${
                isOtherOn
                  ? 'border-primary bg-primary/10 ring-1 ring-primary/50 dark:border-primary dark:bg-primary/25 dark:ring-primary/30'
                  : 'border-dashed border-border hover:border-border hover:bg-muted/60 dark:border-border/60 dark:hover:border-border dark:hover:bg-muted/40'
              }`}
            >
              <kbd className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded font-mono text-[10px] transition-all duration-150 ${
                isOtherOn
                  ? 'bg-primary font-semibold text-primary-foreground dark:bg-primary'
                  : 'border border-border bg-muted text-muted-foreground group-hover:border-border dark:border-border dark:bg-background dark:text-muted-foreground dark:group-hover:border-border'
              }`}>
                0
              </kbd>
              <span className={`text-[13px] leading-tight transition-colors ${
                isOtherOn
                  ? 'font-medium text-foreground dark:text-foreground'
                  : 'text-muted-foreground dark:text-muted-foreground'
              }`}>
                Other...
              </span>
              {isOtherOn && (
                <UnifiedCheck className="ml-auto h-4 w-4 flex-shrink-0 text-primary dark:text-primary" />
              )}
            </Button>

            {/* Other text input — inline */}
            {isOtherOn && (
              <div className="pl-[30px] pr-0.5">
                <div className="relative">
                  <UnifiedInput
                    ref={otherInputRef}
                    type="text"
                    value={otherTexts.get(currentStep) || ''}
                    onChange={(e) => setOtherText(currentStep, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (isLast) handleSubmit();
                        else setCurrentStep(s => s + 1);
                      }
                      // Prevent container keydown from firing
                      e.stopPropagation();
                    }}
                    placeholder={t('chat:misc.typeAnswer')}
                    className="w-full rounded-lg border-0 bg-muted px-3 py-1.5 text-[13px] text-foreground outline-none ring-1 ring-border transition-shadow duration-200 placeholder:text-muted-foreground focus:ring-2 focus:ring-primary dark:bg-background/60 dark:text-foreground dark:ring-border dark:placeholder:text-muted-foreground dark:focus:ring-primary"
                  />
                  <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1 py-0.5 font-mono text-[9px] text-muted-foreground dark:border-border dark:bg-background dark:text-muted-foreground">
                    Enter
                  </kbd>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer — compact */}
        <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/50 px-4 py-2 dark:border-border/50 dark:bg-background/50">
          <Button variant="ghost" size="compact"
            type="button"
            onClick={handleSkip}
            className="text-[11px] text-muted-foreground transition-colors hover:text-muted-foreground dark:text-muted-foreground dark:hover:text-muted-foreground"
          >
            {isSingle ? t('chat:misc.skipOne') : t('chat:misc.skipAll')}
            <span className="ml-1 text-[9px] text-muted-foreground dark:text-muted-foreground">Esc</span>
          </Button>

          <div className="flex items-center gap-1.5">
            {!isSingle && !isFirst && (
              <Button variant="ghost" size="compact"
                type="button"
                onClick={() => setCurrentStep(s => s - 1)}
                className="inline-flex items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-all duration-150 hover:bg-muted dark:text-muted-foreground dark:hover:bg-muted/60"
              >
                <UnifiedChevronLeft className="h-3 w-3" />
                Back
              </Button>
            )}

            {isLast ? (
              <Button variant="ghost" size="compact"
                type="button"
                onClick={handleSubmit}
                disabled={!hasCurrentSelection && !Object.keys(buildAnswers()).length}
                className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-3.5 py-1.5 text-[11px] font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none dark:from-blue-500 dark:to-blue-600"
              >
                Submit
                <span className="ml-0.5 font-mono text-[9px] opacity-70">Enter</span>
              </Button>
            ) : (
              <Button variant="ghost" size="compact"
                type="button"
                onClick={() => setCurrentStep(s => s + 1)}
                className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-3.5 py-1.5 text-[11px] font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:shadow-md dark:from-blue-500 dark:to-blue-600"
              >
                Next
                <span className="ml-0.5 font-mono text-[9px] opacity-70">Enter</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
