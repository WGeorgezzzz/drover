import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '@/shared/utils';

/** Shared checkboxes preserve selection semantics and native form submission. */
export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input {...props} ref={ref} type="checkbox" className={cn('h-4 w-4 shrink-0 rounded border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', className)} />,
);
Checkbox.displayName = 'Checkbox';
