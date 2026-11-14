import { Switch } from '@/shared/ui/Switch';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/context/ThemeContext';

type DarkModeToggleProps = {
  checked?: boolean;
  onToggle?: (nextValue: boolean) => void;
  ariaLabel?: string;
};

/** Used by the quick-settings-panel module for a one-tap light/dark switch; settings offers the full light/dark/system choice instead. */
export function DarkModeToggle({
  checked,
  onToggle,
  ariaLabel,
}: DarkModeToggleProps) {
  const { isDarkMode, toggleDarkMode } = useTheme();
  const { t } = useTranslation('common');
  const isControlled = typeof checked === 'boolean' && typeof onToggle === 'function';
  const isEnabled = isControlled ? checked : isDarkMode;

  const handleToggle = () => {
    if (isControlled && onToggle) {
      onToggle(!isEnabled);
      return;
    }

    toggleDarkMode();
  };

  return <Switch checked={isEnabled} onCheckedChange={handleToggle} aria-label={ariaLabel || t('common.darkMode')} />;
}
