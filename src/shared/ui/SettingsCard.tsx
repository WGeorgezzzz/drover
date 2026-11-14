import type { ReactNode } from 'react';

import { cn } from '@/shared/utils';

type SettingsCardProps = {
  children: ReactNode;
  className?: string;
  divided?: boolean;
};

/** Shared by full and quick settings to keep preference layouts consistent. */
export default function SettingsCard({ children, className, divided }: SettingsCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card/50',
        divided && 'divide-y divide-border',
        className,
      )}
    >
      {children}
    </div>
  );
}
