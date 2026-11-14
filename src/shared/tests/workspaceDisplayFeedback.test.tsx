import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { Tooltip } from '@/shared/ui/Tooltip';
import { useWorkspaceLayoutPreference } from '@/shared/hooks/useWorkspaceLayoutPreference';

afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.removeItem('claude-workspace-split'); });

test('opening a disclosure removes its tooltip even while the trigger remains focused', () => {
  vi.useFakeTimers();
  const view = render(<Tooltip content="Display options" delay={0}><button>Display</button></Tooltip>);
  fireEvent.focus(screen.getByRole('button'));
  act(() => vi.advanceTimersByTime(20));
  expect(screen.getByRole('tooltip')).toBeTruthy();
  view.rerender(<Tooltip content="Display options" delay={0} disabled><button>Display</button></Tooltip>);
  expect(screen.queryByRole('tooltip')).toBeNull();
});

test('a tooltip at the right viewport edge stays inside the viewport and Escape dismisses it', () => {
  vi.useFakeTimers();
  const view = render(<Tooltip content="Right edge" delay={0}><button>Display</button></Tooltip>);
  const trigger = view.container.firstElementChild as HTMLElement;
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({ left: 1010, right: 1034, top: 40, bottom: 64, width: 24, height: 24, x: 1010, y: 40, toJSON: () => ({}) });
  fireEvent.mouseEnter(trigger);
  act(() => vi.advanceTimersByTime(50));
  expect(Number.parseFloat(screen.getByRole('tooltip').style.left)).toBeLessThanOrEqual(window.innerWidth - 8);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('tooltip')).toBeNull();
});

test('settings and workspace consumers stay in sync and preserve the existing preference on remount', () => {
  const first = renderHook(useWorkspaceLayoutPreference);
  const second = renderHook(useWorkspaceLayoutPreference);
  act(() => first.result.current[1](false));
  expect(second.result.current[0]).toBe(false);
  second.unmount();
  const remounted = renderHook(useWorkspaceLayoutPreference);
  expect(remounted.result.current[0]).toBe(false);
  act(() => remounted.result.current[1](true));
  expect(first.result.current[0]).toBe(true);
});
