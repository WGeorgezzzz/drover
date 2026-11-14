import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/shared/utils';

/** Shared boolean control for settings, quick settings and feature panels. */
export const Switch = forwardRef<HTMLButtonElement, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & { checked: boolean; onCheckedChange: (value: boolean) => void }>(
  ({ checked, onCheckedChange, className, ...props }, ref) => <button {...props} ref={ref} type="button" role="switch" aria-checked={checked} onClick={() => onCheckedChange(!checked)} className={cn('relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50', checked ? 'bg-primary' : 'bg-muted', className)}><span className={cn('pointer-events-none h-4 w-4 rounded-full bg-background shadow-sm transition-transform', checked ? 'translate-x-5' : 'translate-x-1')} /></button>,
);
Switch.displayName = 'Switch';
