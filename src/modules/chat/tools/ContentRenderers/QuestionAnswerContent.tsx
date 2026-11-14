import { Check as UnifiedCheck, ChevronDown as UnifiedChevronDown } from '@/shared/icons';
import { Button } from '@/shared/ui/Button';
import React, { useState } from 'react';

import type { Question } from '@/shared/types';

type QuestionAnswerContentProps = {
  questions: Question[];
  answers: Record<string, string>;
  className?: string;
};

/**
 * Rendered by chat's ToolRenderer to show an AskUserQuestion tool's questions
 * and the answers the user picked.
 */
// Exception to the stateless ContentRenderer pattern: multi-question navigation requires local state.
export const QuestionAnswerContent: React.FC<QuestionAnswerContentProps> = ({
  questions,
  answers,
  className = '',
}) => {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // Tool inputs are runtime data loaded from session transcripts and may be
  // malformed (e.g. `questions` arriving as a non-array). Guard with
  // Array.isArray so a single bad payload can't crash the whole chat view
  // with "e.map is not a function".
  if (!Array.isArray(questions) || questions.length === 0) {
    return null;
  }

  const hasAnyAnswer = Object.keys(answers || {}).length > 0;
  const total = questions.length;

  return (
    <div className={`space-y-2 ${className}`}>
      {questions.map((rawQuestion, idx) => {
        // Entries come from session transcripts and may be malformed; skip
        // anything that isn't a proper question object with a string prompt.
        if (!rawQuestion || typeof rawQuestion !== 'object' || typeof rawQuestion.question !== 'string') {
          return null;
        }
        const q = rawQuestion;
        const answer = answers?.[q.question];
        // `options` is typed as an array but comes from untrusted runtime data;
        // keep only valid entries so `.some`/`.map` below never throw.
        const options = Array.isArray(q.options)
          ? q.options.filter((opt) => opt && typeof opt === 'object' && typeof opt.label === 'string')
          : [];
        // Match one exact option before splitting a multi-select answer. A
        // single label may itself contain ", ".
        const answerLabels = typeof answer !== 'string'
          ? []
          : options.some((option) => option.label === answer)
            ? [answer]
            : answer.split(', ');
        const skipped = !answer;
        const isExpanded = expandedIdx === idx;

        return (
          <div
            key={idx}
            className="border-border overflow-hidden rounded-lg border bg-muted/50 dark:border-border/50 dark:bg-background/30"
          >
            <Button variant="ghost" size="compact"
              type="button"
              onClick={() => setExpandedIdx(isExpanded ? null : idx)}
              className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted dark:hover:bg-background/50"
            >
              <div className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full ${
                answerLabels.length > 0
                  ? 'bg-primary/10 dark:bg-primary/40'
                  : 'bg-muted dark:bg-background'
              }`}>
                {answerLabels.length > 0 ? (
                  <UnifiedCheck className="h-2.5 w-2.5 text-primary dark:text-primary" />
                ) : (
                  <div className="h-1.5 w-1.5 rounded-full bg-muted dark:bg-muted" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {q.header && (
                    <span className="inline-flex items-center rounded border border-primary/80 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary dark:border-primary/40 dark:bg-primary/30 dark:text-primary">
                      {q.header}
                    </span>
                  )}
                  {total > 1 && (
                    <span className="text-[10px] tabular-nums text-muted-foreground dark:text-muted-foreground">
                      {idx + 1}/{total}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs leading-snug text-muted-foreground dark:text-muted-foreground">
                  {q.question}
                </div>

                {!isExpanded && answerLabels.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {answerLabels.map((lbl) => {
                      const isCustom = !options.some(o => o.label === lbl);
                      return (
                        <span
                          key={lbl}
                          className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary dark:bg-primary/30 dark:text-primary"
                        >
                          {lbl}
                          {isCustom && (
                            <span className="text-[9px] font-normal text-primary dark:text-primary">(custom)</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}

                {!isExpanded && skipped && hasAnyAnswer && (
                  <span className="mt-1 inline-block text-[10px] italic text-muted-foreground dark:text-muted-foreground">
                    Skipped
                  </span>
                )}
              </div>

              <UnifiedChevronDown className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform duration-200 dark:text-muted-foreground ${
                  isExpanded ? 'rotate-180' : ''
                }`} />
            </Button>

            {isExpanded && (
              <div className="border-t border-border px-3 pb-2.5 pt-0.5 dark:border-border/40">
                <div className="ml-6.5 space-y-1">
                  {options.map((opt) => {
                    const wasSelected = answerLabels.includes(opt.label);
                    return (
                      <div
                        key={opt.label}
                        className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[12px] ${
                          wasSelected
                            ? 'border border-primary/60 bg-primary/10 dark:border-primary/40 dark:bg-primary/20'
                            : 'text-muted-foreground dark:text-muted-foreground'
                        }`}
                      >
                        <div className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${q.multiSelect ? 'rounded-[3px]' : 'rounded-full'} flex items-center justify-center border-[1.5px] ${
                          wasSelected
                            ? 'border-primary bg-primary dark:border-primary dark:bg-primary'
                            : 'border-border dark:border-border'
                        }`}>
                          {wasSelected && (
                            <UnifiedCheck className="h-2 w-2 text-primary-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className={wasSelected ? 'font-medium text-foreground dark:text-foreground' : ''}>
                            {opt.label}
                          </span>
                          {opt.description && (
                            <span className={`mt-0.5 block text-[11px] ${
                              wasSelected ? 'text-primary/70 dark:text-primary/70' : 'text-muted-foreground dark:text-muted-foreground'
                            }`}>
                              {opt.description}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {answerLabels.filter(lbl => !options.some(o => o.label === lbl)).map(lbl => (
                    <div
                      key={lbl}
                      className="flex items-start gap-2 rounded-lg border border-primary/60 bg-primary/10 px-2.5 py-1.5 text-[12px] dark:border-primary/40 dark:bg-primary/20"
                    >
                      <div className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${q.multiSelect ? 'rounded-[3px]' : 'rounded-full'} flex items-center justify-center border-[1.5px] border-primary bg-primary dark:border-primary dark:bg-primary`}>
                        <UnifiedCheck className="h-2 w-2 text-primary-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-foreground dark:text-foreground">{lbl}</span>
                        <span className="ml-1 text-[10px] text-primary dark:text-primary">(custom)</span>
                      </div>
                    </div>
                  ))}

                  {skipped && hasAnyAnswer && (
                    <div className="px-2.5 py-1 text-[11px] italic text-muted-foreground dark:text-muted-foreground">
                      No answer provided
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {!hasAnyAnswer && total === 1 && (
        <div className="text-[11px] italic text-muted-foreground dark:text-muted-foreground">
          Skipped
        </div>
      )}
    </div>
  );
};
