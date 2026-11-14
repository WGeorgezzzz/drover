import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Dialog, DialogContent } from '@/shared/ui/Dialog';
import { ActionMenu } from '@/shared/ui/ActionMenu';

afterEach(cleanup);
it('keeps nested dialogs and their portaled menus above the owning settings overlay', () => {
  render(<Dialog open><DialogContent aria-label="Settings" wrapperClassName="z-[9999]">
    <Dialog open><DialogContent aria-label="Child"><ActionMenu label="Actions" items={[{ key: 'add', label: 'Add', onSelect: () => {} }]} /></DialogContent></Dialog>
  </DialogContent></Dialog>);
  const parent = screen.getByRole('dialog', { name: 'Settings' }).parentElement!;
  const child = screen.getByRole('dialog', { name: 'Child' }).parentElement!;
  expect(Number(child.style.zIndex)).toBeGreaterThan(Number(parent.style.zIndex));
  fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
  expect(Number(screen.getByRole('menu').style.zIndex)).toBeGreaterThan(Number(child.style.zIndex));
});
