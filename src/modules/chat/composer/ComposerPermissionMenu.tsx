import { Button } from '@/shared/ui/Button';
import { memo, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Bot,
  ClipboardList,
  Hand,
  ShieldQuestion,
  Smile,
  type LucideIcon,
} from '@/shared/icons';

import type { PermissionMode } from '@/shared/types';
import { useViewportMenuAnchor } from '@/shared/hooks/useViewportMenuAnchor';
import {
  ComposerMenuHeading,
  ComposerMenuItem,
  ComposerMenuSurface,
} from '@/modules/chat/composer/ComposerMenuPrimitives';

type ModeAppearance = {
  icon: LucideIcon;
  trigger: string;
  item: string;
};

/**
 * Presentation only. Which modes exist for a provider comes from the backend
 * capability matrix, so an unknown mode still renders through UNKNOWN_MODE.
 */
const MODE_APPEARANCE: Record<PermissionMode, ModeAppearance> = {
  default: {
    icon: Hand,
    trigger: 'border-border/60 bg-muted/50 text-muted-foreground hover:bg-muted',
    item: 'text-foreground',
  },
  dontAsk: {
    icon: ShieldQuestion,
    trigger: 'border-border/60 bg-muted/50 text-muted-foreground hover:bg-muted',
    item: 'text-foreground',
  },
  auto: {
    icon: Bot,
    trigger:
      'border-primary/60 bg-primary/10 text-primary hover:bg-primary/10 dark:border-primary/40 dark:bg-primary/15 dark:text-primary dark:hover:bg-primary/25',
    item: 'text-primary dark:text-primary',
  },
  acceptEdits: {
    icon: Smile,
    trigger:
      'border-success/60 bg-success/10 text-success hover:bg-success/10 dark:border-success/40 dark:bg-success/15 dark:text-success dark:hover:bg-success/25',
    item: 'text-success dark:text-success',
  },
  bypassPermissions: {
    icon: AlertTriangle,
    trigger:
      'border-warning/60 bg-warning/10 text-warning hover:bg-warning/10 dark:border-warning/40 dark:bg-warning/15 dark:text-warning dark:hover:bg-warning/25',
    item: 'text-warning dark:text-warning',
  },
  plan: {
    icon: ClipboardList,
    trigger: 'border-primary/20 bg-primary/5 text-primary hover:bg-primary/10',
    item: 'text-primary',
  },
};

const UNKNOWN_MODE: ModeAppearance = {
  icon: ShieldQuestion,
  trigger: 'border-border/60 bg-muted/50 text-muted-foreground hover:bg-muted',
  item: 'text-foreground',
};

const getAppearance = (mode: PermissionMode | string): ModeAppearance =>
  MODE_APPEARANCE[mode as PermissionMode] ?? UNKNOWN_MODE;

type ComposerPermissionMenuProps = {
  permissionMode: PermissionMode;
  /** Modes the active provider supports, in the order the backend reports them. */
  permissionModes: PermissionMode[];
  permissionModeNamespace?: string;
  onSelectPermissionMode: (mode: PermissionMode) => void;
  providerLabel: string;
};

/**
 * Rendered by chat's ChatComposer as the popover for choosing the permission
 * mode the active provider runs the next turn under.
 */
function ComposerPermissionMenu({
  permissionMode,
  permissionModes,
  permissionModeNamespace,
  onSelectPermissionMode,
  providerLabel,
}: ComposerPermissionMenuProps) {
  const { t } = useTranslation('chat');
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);
  const { triggerRef, menuRef, anchor, updateAnchor } = useViewportMenuAnchor(isOpen, close, 22 * 16);

  if (permissionModes.length === 0) {
    return null;
  }

  const activeAppearance = getAppearance(permissionMode);
  const isClaude = providerLabel === 'Claude';
  const modeNamespace = permissionModeNamespace || (isClaude ? 'claudeModes' : 'codex');
  const ActiveIcon = activeAppearance.icon;
  const heading = t('composer.permissionHeading', {
    provider: providerLabel,
    defaultValue: 'How should {{provider}} actions be approved?',
  });

  return (
    <>
      <Button variant="ghost" size="compact"
        ref={triggerRef}
        type="button"
        onClick={() => {
          updateAnchor();
          setIsOpen((current) => !current);
        }}
        className={`flex h-8 max-w-40 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs transition-colors ${activeAppearance.trigger}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={heading}
        title={isClaude ? t('input.claudeChangeMode', 'Change permissions (Shift+Tab)') : t('input.clickToChangeMode')}
      >
        <ActiveIcon className="h-4 w-4" />
        <span className="max-w-28 truncate">{permissionMode==='bypassPermissions'?t('composer.noConfirmation'):t(`${modeNamespace}.modes.${permissionMode}`, {defaultValue:permissionMode})}</span>
      </Button>

      {isOpen && anchor && createPortal(
        <ComposerMenuSurface anchor={anchor} menuRef={menuRef} ariaLabel={heading}>
          <ComposerMenuHeading>{heading}</ComposerMenuHeading>
          {permissionModes.map((mode) => {
            const appearance = getAppearance(mode);
            const ModeIcon = appearance.icon;
            return (
              <ComposerMenuItem
                key={mode}
                icon={<ModeIcon className="h-4 w-4" />}
                label={t(`${modeNamespace}.modes.${mode}`, { defaultValue: mode })}
                description={t(`${modeNamespace}.descriptions.${mode}`, { defaultValue: '' }) || undefined}
                isSelected={mode === permissionMode}
                onSelect={() => {
                  onSelectPermissionMode(mode);
                  setIsOpen(false);
                }}
                className={appearance.item}
              />
            );
          })}
        </ComposerMenuSurface>,
        document.body,
      )}
    </>
  );
}

/** Memoized: the composer re-renders on every keystroke and none of this menu's props change while typing. */
export default memo(ComposerPermissionMenu);
