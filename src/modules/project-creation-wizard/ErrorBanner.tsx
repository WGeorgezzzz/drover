import { AlertCircle } from '@/shared/icons';

type ErrorBannerProps = {
  message: string;
};

/** Rendered by ProjectCreationWizard to surface the wizard's current error message. */
export default function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive bg-destructive/10 p-4 dark:border-destructive dark:bg-destructive/20">
      <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive dark:text-destructive" />
      <p className="text-sm text-destructive dark:text-destructive">{message}</p>
    </div>
  );
}
