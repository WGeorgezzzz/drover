import { Menu as UnifiedMenu } from '@/shared/icons';
import { Button } from '@/shared/ui/Button';
import { useTranslation } from 'react-i18next';
import { useMobileMenuHandlers } from '@/modules/project-workspace/hooks/useMobileMenuHandlers';

type MobileMenuButtonProps = {
  onMenuClick: () => void;
  compact?: boolean;
};

/** Rendered by WorkspaceHeader and WorkspaceStateView to open the sidebar drawer on mobile. */
export default function MobileMenuButton({ onMenuClick, compact = false }: MobileMenuButtonProps) {
  const { t } = useTranslation();
  const { handleMobileMenuClick, handleMobileMenuTouchEnd } = useMobileMenuHandlers(onMenuClick);

  const buttonClasses = compact
    ? 'p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent/60 pwa-menu-button'
    : 'p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent/60 touch-manipulation active:scale-95 pwa-menu-button flex-shrink-0';

  return (
    <Button variant="ghost" size="compact"
      onClick={handleMobileMenuClick}
      onTouchEnd={handleMobileMenuTouchEnd}
      className={buttonClasses}
      aria-label={t('misc.openMenu')}
    >
      <UnifiedMenu className="h-5 w-5" />
    </Button>
  );
}
