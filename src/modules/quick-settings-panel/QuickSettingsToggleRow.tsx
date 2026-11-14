import SettingsRow from '@/shared/ui/SettingsRow';
import { memo } from 'react';
import type { LucideIcon } from '@/shared/icons';

import { Switch } from '@/shared/ui/Switch';


type QuickSettingsToggleRowProps = {
  label: string;
  icon: LucideIcon;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

/** Rendered by QuickSettingsContent as one labelled checkbox row for a boolean preference. */
function QuickSettingsToggleRow({
  label,

  checked,
  onCheckedChange,
}: QuickSettingsToggleRowProps) {
  return (
    <SettingsRow label={label} className="px-0 py-2">

      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={label}
      />
    </SettingsRow>
  );
}

export default memo(QuickSettingsToggleRow);
