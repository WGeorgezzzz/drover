import { Button as UnifiedButton } from '@/shared/ui/Button';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { api } from '@/shared/api';

/** Checks the running shell, whose main process can predate a frontend deployment. */
export function DesktopUpdateBanner() {
  const { t } = useTranslation('common');
  const [updated, setUpdated] = useState(false);
  const [restart, setRestart] = useState(false);
  const bridge = (window as unknown as {cloudcliDesktopNotifications?: {getCapabilities?: () => Promise<{updated:boolean;restart:boolean}>;restart?: () => Promise<void>}}).cloudcliDesktopNotifications;
  useEffect(() => {
    if (!bridge) return;
    const check = async () => {
      const caps = await bridge.getCapabilities?.().catch(() => undefined);
      setUpdated(!caps || caps.updated); setRestart(Boolean(caps?.restart));
    };
    const show = () => setUpdated(true);
    void check(); const timer = setInterval(() => void check(), 30000);
    window.addEventListener('nexagent-desktop-update', show);
    return () => { clearInterval(timer); window.removeEventListener('nexagent-desktop-update', show); };
  }, [bridge]);
  if (!updated) return null;
  return <div role="status" className="fixed inset-x-0 top-0 z-[100] flex min-h-10 flex-wrap items-center justify-center gap-3 bg-warning/10 px-3 text-sm text-warning dark:bg-warning dark:text-warning">{t('desktop.updated')}<UnifiedButton variant="ghost" size="compact" className="min-h-10 underline" onClick={()=>{void (restart?bridge?.restart?.():api.system.restartDesktop());}}>{t('desktop.restart')}</UnifiedButton></div>;
}
