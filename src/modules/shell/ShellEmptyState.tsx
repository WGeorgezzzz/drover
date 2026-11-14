import { Terminal as UnifiedTerminal } from '@/shared/icons';
type ShellEmptyStateProps = {
  title: string;
  description: string;
};

/** Rendered by Shell in place of the terminal when no project is selected. */
export default function ShellEmptyState({ title, description }: ShellEmptyStateProps) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center text-muted-foreground dark:text-muted-foreground">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted dark:bg-background">
          <UnifiedTerminal className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="mb-2 text-lg font-semibold">{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}
