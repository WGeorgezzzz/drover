import { Switch } from '@/shared/ui/Switch';

/** Settings tabs adapt the common switch without a second implementation. */
export default function SettingsToggle({ checked, onChange, ariaLabel, disabled }: { checked: boolean; onChange: (value: boolean) => void; ariaLabel: string; disabled?: boolean }) {
  return <Switch checked={checked} onCheckedChange={onChange} aria-label={ariaLabel} disabled={disabled} />;
}
