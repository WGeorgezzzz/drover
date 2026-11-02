import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** ProjectOrganization defers offscreen session chunks while retaining mounted rows and their interaction state. */
export function DeferredSessionRows({ count, forceVisible = false, children }: { count: number; forceVisible?: boolean; children: () => ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  // Once shown, keep rows mounted so scrolling cannot discard a menu, rename, or drag in progress.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (visible || forceVisible || !root.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '300px 0px' });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [visible, forceVisible]);
  const show = visible || forceVisible;
  return <div ref={root} data-deferred-sessions style={show ? undefined : { minHeight: count * 40 }}>{show ? children() : null}</div>;
}
