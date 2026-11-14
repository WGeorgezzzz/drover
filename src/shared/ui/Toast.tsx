import type { ReactNode } from 'react';
import { X } from '@/shared/icons';
import { Button } from '@/shared/ui/Button';

/** The notifications module renders dismissible announcements through this shared surface. */
export function Toast({ children, onOpen, onClose, closeLabel }: { children: ReactNode; onOpen: () => void; onClose: () => void; closeLabel: string }) {
  return <div role="status" className="flex w-full items-start gap-2 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg"><Button variant="ghost" className="h-auto min-h-10 flex-1 whitespace-normal text-left" onClick={onOpen}>{children}</Button><Button variant="ghost" size="icon-sm" aria-label={closeLabel} onClick={onClose}><X /></Button></div>;
}
