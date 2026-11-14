import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/shared/utils';

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

type TooltipProps = {
  children: ReactNode;
  content?: ReactNode;
  position?: TooltipPosition;
  className?: string;
  delay?: number;
  disabled?: boolean;
};

/** Used by the project-workspace, sidebar and task-master modules and by the shared PromptInput primitive. */
export function Tooltip({
  children,
  content,
  position = 'top',
  className = '',
  delay = 350,
  disabled = false,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  // Store the timer id without forcing re-renders while hovering.
  const timeoutRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties | null>(null);

  const updateTooltipPosition = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const spacing = 8;
    const tooltip = tooltipRef.current;
    const viewport = window.visualViewport;
    const minX = (viewport?.offsetLeft ?? 0) + spacing;
    const minY = (viewport?.offsetTop ?? 0) + spacing;
    const maxX = minX + (viewport?.width ?? window.innerWidth) - spacing * 2;
    const maxY = minY + (viewport?.height ?? window.innerHeight) - spacing * 2;
    const width = Math.min(tooltip?.offsetWidth ?? 0, maxX - minX);
    const height = tooltip?.offsetHeight ?? 0;
    let x = rect.left + (rect.width - width) / 2;
    let y = position === 'bottom' ? rect.bottom + spacing : rect.top - height - spacing;
    if (position === 'left' || position === 'right') {
      x = position === 'left' ? rect.left - width - spacing : rect.right + spacing;
      y = rect.top + (rect.height - height) / 2;
    }
    if (y < minY) y = rect.bottom + spacing;
    if (y + height > maxY) y = rect.top - height - spacing;
    setTooltipStyle({ position: 'fixed', zIndex: 10050, left: Math.max(minX, Math.min(x, maxX - width)), top: Math.max(minY, Math.min(y, maxY - height)), maxWidth: maxX - minX });
  }, [position]);

  const clearTooltipTimer = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const handleMouseEnter = () => {
    if (disabled) return;
    clearTooltipTimer();
    timeoutRef.current = window.setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    clearTooltipTimer();
    setIsVisible(false);
  };

  const handleTouchStart = () => {
    if (disabled) return;
    clearTooltipTimer();
    longPressTriggeredRef.current = false;
    timeoutRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setIsVisible(true);
    }, delay);
  };

  const handleTouchEnd = () => {
    clearTooltipTimer();
    if (longPressTriggeredRef.current) {
      return;
    }
    setIsVisible(false);
  };

  useEffect(() => {
    if (disabled) { clearTooltipTimer(); setIsVisible(false); }
  }, [disabled]);

  useEffect(() => {
    // Avoid delayed updates after unmount.
    return () => {
      clearTooltipTimer();
    };
  }, []);

  useEffect(() => {
    if (!isVisible || typeof document === 'undefined') {
      return;
    }

    const handlePointerDown = () => {
      setIsVisible(false);
      longPressTriggeredRef.current = false;
    };

    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsVisible(false); };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => { document.removeEventListener('pointerdown', handlePointerDown, true); document.removeEventListener('keydown', handleKeyDown); };
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) {
      setTooltipStyle(null);
      return;
    }

    const rafId = window.requestAnimationFrame(updateTooltipPosition);
    const handleViewportChange = () => updateTooltipPosition();

    window.visualViewport?.addEventListener('resize', handleViewportChange);
    window.visualViewport?.addEventListener('scroll', handleViewportChange);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('scroll', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [isVisible, updateTooltipPosition]);

  if (!content) {
    return <>{children}</>;
  }

  return (
    <div
      ref={containerRef}
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
      onPointerDown={handleMouseLeave}
    >
      {children}
      {isVisible && !disabled && typeof document !== 'undefined' && createPortal(
        <div
          role="tooltip"
          ref={tooltipRef}
          style={tooltipStyle || { position: 'fixed', top: '-9999px', left: '-9999px', opacity: 0 }}
          className={cn(
            'px-2 py-1 text-xs font-medium text-popover-foreground bg-popover border border-border rounded shadow-lg whitespace-normal break-words pointer-events-none',
            'animate-in fade-in-0 zoom-in-95 duration-200',
            className
          )}
        >
          {content}
        </div>,
        document.body
      )}
    </div>
  );
}
