import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { DeferredSessionRows } from '@/modules/sidebar/DeferredSessionRows';

afterEach(()=>{cleanup();vi.unstubAllGlobals();});

test('offscreen rows render on approach and stay mounted during later interactions',()=>{
  let notify!:(entries:{isIntersecting:boolean}[])=>void;
  const disconnect=vi.fn();
  vi.stubGlobal('IntersectionObserver',class {constructor(callback:typeof notify){notify=callback;}observe(){}disconnect=disconnect;});
  const rows=vi.fn(()=> <button>Session</button>);
  const view=render(<DeferredSessionRows count={25}>{rows}</DeferredSessionRows>);
  expect(rows).not.toHaveBeenCalled();
  expect((view.container.firstChild as HTMLElement).style.minHeight).toBe('1000px');
  act(()=>notify([{isIntersecting:true}]));
  expect(view.getByRole('button',{name:'Session'})).toBeTruthy();
  expect(disconnect).toHaveBeenCalled();
  act(()=>notify([{isIntersecting:false}]));
  expect(view.getByRole('button',{name:'Session'})).toBeTruthy();
});

test('the selected or renamed session remains reachable outside the viewport',()=>{
  vi.stubGlobal('IntersectionObserver',class {observe(){}disconnect(){}});
  const view=render(<DeferredSessionRows count={1} forceVisible>{()=> <button>Selected session</button>}</DeferredSessionRows>);
  expect(view.getByRole('button',{name:'Selected session'})).toBeTruthy();
});

test('environments without intersection observation retain complete navigation',()=>{
  vi.stubGlobal('IntersectionObserver',undefined);
  const view=render(<DeferredSessionRows count={1}>{()=> <button>Session</button>}</DeferredSessionRows>);
  expect(view.getByRole('button',{name:'Session'})).toBeTruthy();
});
