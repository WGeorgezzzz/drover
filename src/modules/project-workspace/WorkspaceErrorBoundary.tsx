import { CircleX as UnifiedCircleX } from '@/shared/icons';
import { Button } from '@/shared/ui/Button';
import { useCallback, useState, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ErrorBoundary as ReactErrorBoundary,
  type FallbackProps,
} from 'react-error-boundary';

type ErrorFallbackProps = FallbackProps & {
  showDetails: boolean;
  componentStack: string | null;
};

type WorkspaceErrorBoundaryProps = {
  children: ReactNode;
  showDetails?: boolean;
  onRetry?: () => void;
  resetKeys?: unknown[];
};

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}

function ErrorFallback({
  error,
  resetErrorBoundary,
  showDetails,
  componentStack,
}: ErrorFallbackProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="max-w-md rounded-lg border border-destructive bg-destructive/10 p-6">
        <div className="mb-4 flex items-center">
          <div className="flex-shrink-0">
            <UnifiedCircleX className="h-5 w-5 text-destructive" />
          </div>
          <h3 className="ml-3 text-sm font-medium text-destructive">{t('misc.errorTitle')}</h3>
        </div>
        <div className="text-sm text-destructive">
          <p className="mb-2">{t('misc.errorDescription')}</p>
          {showDetails && (
            <details className="mt-4">
              <summary className="cursor-pointer font-mono text-xs">{t('misc.errorDetails')}</summary>
              <pre className="mt-2 max-h-40 overflow-auto rounded bg-destructive/10 p-2 text-xs">
                {formatError(error)}
                {componentStack}
              </pre>
            </details>
          )}
        </div>
        <div className="mt-4">
          <Button variant="ghost" size="compact"
            onClick={resetErrorBoundary}
            className="rounded bg-destructive px-4 py-2 text-sm text-primary-foreground hover:bg-destructive focus:outline-none focus:ring-2 focus:ring-destructive"
          >
            Try Again
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Wraps the chat view in WorkspaceMain so a render error there cannot take down the whole workspace. */
function WorkspaceErrorBoundary({
  children,
  showDetails = false,
  onRetry = undefined,
  resetKeys = undefined,
}: WorkspaceErrorBoundaryProps) {
  const [componentStack, setComponentStack] = useState<string | null>(null);

  const handleError = useCallback((error: Error, errorInfo: ErrorInfo) => {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    // Keep component stack for optional debug rendering in fallback UI.
    setComponentStack(errorInfo?.componentStack ?? null);
  }, []);

  const handleReset = useCallback(() => {
    setComponentStack(null);
    onRetry?.();
  }, [onRetry]);

  const renderFallback = useCallback(
    ({ error, resetErrorBoundary }: FallbackProps) => (
      <ErrorFallback
        error={error}
        resetErrorBoundary={resetErrorBoundary}
        showDetails={showDetails}
        componentStack={componentStack}
      />
    ),
    [showDetails, componentStack]
  );

  return (
    <ReactErrorBoundary
      fallbackRender={renderFallback}
      onError={handleError}
      onReset={handleReset}
      resetKeys={resetKeys}
    >
      {children}
    </ReactErrorBoundary>
  );
}

export default WorkspaceErrorBoundary;
