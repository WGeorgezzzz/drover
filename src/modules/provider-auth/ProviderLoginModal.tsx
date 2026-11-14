import { Dialog as UnifiedDialog, DialogContent as UnifiedDialogContent } from '@/shared/ui/Dialog';
import { Button } from '@/shared/ui/Button';
import { useTranslation } from 'react-i18next';
import { X } from '@/shared/icons';

import { StandaloneShell } from '@/modules/standalone-shell';
import { IS_PLATFORM } from '@/shared/utils';
import type { LLMProvider } from '@/shared/types';
import { api } from '@/shared/api';
const apiCallOpenGemini=()=>api.geminiDesktop.open();

/**
 * For empty shell instances where no project is provided,
 * we use a default project object to ensure the shell can still function.
 * This prevents errors related to missing project data.
 *
 * `projectId` is set to a well-known sentinel ('default') because the empty
 * shell doesn't correspond to any real project row in the database; any API
 * call that routes through this placeholder must tolerate a missing match.
 */
const DEFAULT_PROJECT_FOR_EMPTY_SHELL = {
  projectId: 'default',
  displayName: 'default',
  fullPath: IS_PLATFORM ? '/workspace' : '',
  path: IS_PLATFORM ? '/workspace' : '',
};

type ProviderLoginModalProps = {
  isOpen: boolean;
  onClose: () => void;
  provider?: LLMProvider;
  onComplete?: (exitCode: number) => void;
  customCommand?: string;
  isAuthenticated?: boolean;
};

const getProviderCommand = ({
  provider,
  customCommand,
  isAuthenticated: _isAuthenticated,
}: {
  provider: LLMProvider;
  customCommand?: string;
  isAuthenticated: boolean;
}) => {
  if (customCommand) {
    return customCommand;
  }

  if (provider === 'claude') {
    return 'claude --dangerously-skip-permissions /login';
  }

  if (provider === 'cursor') {
    return 'cursor-agent login';
  }

  if (provider === 'codex') {
    return IS_PLATFORM ? 'codex login --device-auth' : 'codex login';
  }

  if (provider === 'opencode') {
    return 'opencode auth login';
  }

  return 'claude --dangerously-skip-permissions /login';
};

const getProviderTitle = (provider: LLMProvider) => {
  if (provider === 'claude') return 'Claude CLI Login';
  if (provider === 'cursor') return 'Cursor CLI Login';
  if (provider === 'codex') return 'Codex CLI Login';
  if (provider === 'opencode') return 'OpenCode CLI Login';
  return 'Claude CLI Login';
};

/** Used by the onboarding and settings modules to run a provider's CLI login command in an embedded shell. */
export default function ProviderLoginModal({
  isOpen,
  onClose,
  provider = 'claude',
  onComplete,
  customCommand,
  isAuthenticated = false,
}: ProviderLoginModalProps) {
  const { t } = useTranslation();
  if (!isOpen) {
    return null;
  }

  if (provider === 'gemini') return <UnifiedDialog open onOpenChange={(open) => { if (!open) { onClose(); } }}><UnifiedDialogContent wrapperClassName="z-50"  className="max-w-md rounded-xl bg-background p-5"><h2 className="text-lg font-semibold">Gemini / Antigravity</h2><p className="my-3 text-sm text-muted-foreground">使用本机 Gemini 登录。当前服务商可能限制地区，原生历史以只读摘要导入；完整会话请在桌面版查看。</p><Button variant="ghost" size="compact" className="min-h-10 rounded border px-3" onClick={()=>void apiCallOpenGemini()}>在 Gemini 桌面版中打开</Button><Button variant="ghost" size="compact" className="ml-3 min-h-10 px-3" onClick={onClose}>关闭</Button></UnifiedDialogContent></UnifiedDialog>;
  if (provider === 'deepseek-harness') return (
    <UnifiedDialog open onOpenChange={(open) => { if (!open) onClose(); }}><UnifiedDialogContent wrapperClassName="z-[9999]" aria-label="DeepSeek Harness" className="m-4 w-full max-w-md rounded-lg bg-background p-6 shadow-xl">
        <h2 className="mb-3 text-lg font-semibold">DeepSeek Harness</h2>
        <p className="text-sm text-muted-foreground">使用本机已配置的 Harness 模型和凭证。完成本地配置后，刷新连接状态。</p>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="ghost" size="compact" onClick={onClose}>关闭</Button>
          <Button variant="ghost" size="compact" className="rounded bg-primary px-3 py-2 text-primary-foreground" onClick={() => { onComplete?.(0); onClose(); }}>刷新</Button>
        </div>
      </UnifiedDialogContent></UnifiedDialog>
  );

  if (provider === 'workbuddy') {
    return (
      <UnifiedDialog open onOpenChange={(open) => { if (!open) onClose(); }}><UnifiedDialogContent wrapperClassName="z-[9999]" aria-label="WorkBuddy" className="m-4 w-full max-w-md rounded-lg bg-background p-6 shadow-xl">
          <h3 className="mb-3 text-lg font-semibold">WorkBuddy</h3>
          <p className="text-sm text-muted-foreground">{t('common:workbuddy.localLogin', { defaultValue: 'Open WorkBuddy on this Windows computer and sign in. Then refresh to reuse that local login in Drover. This connection currently supports conversations only.' })}</p>
          <div className="mt-5 flex justify-end gap-3">
            <Button variant="ghost" size="compact" onClick={onClose}>{t('common:buttons.close', { defaultValue: 'Close' })}</Button>
            <Button variant="ghost" size="compact" className="rounded bg-primary px-3 py-2 text-primary-foreground" onClick={() => { onComplete?.(0); onClose(); }}>{t('common:buttons.refresh', { defaultValue: 'Refresh' })}</Button>
          </div>
        </UnifiedDialogContent></UnifiedDialog>
    );
  }

  const command = getProviderCommand({ provider, customCommand, isAuthenticated });
  const title = getProviderTitle(provider);

  const handleComplete = (exitCode: number) => {
    onComplete?.(exitCode);
    // Keep the modal open so users can read terminal output before closing.
  };

  return (
    <UnifiedDialog open onOpenChange={(open) => { if (!open) { onClose(); } }}>
      <UnifiedDialogContent wrapperClassName="z-[9999]"  className="flex h-3/4 w-full max-w-4xl flex-col rounded-lg bg-card shadow-xl dark:bg-background max-md:m-0 max-md:h-full max-md:max-w-none max-md:rounded-none md:m-4 md:h-3/4 md:max-w-4xl md:rounded-lg">
        <div className="flex items-center justify-between border-b border-border p-4 dark:border-border">
          <h3 className="text-lg font-semibold text-foreground dark:text-primary-foreground">{title}</h3>
          <Button variant="ghost" size="compact"
            onClick={onClose}
            className="text-muted-foreground transition-colors hover:text-muted-foreground dark:hover:text-muted-foreground"
            aria-label={t('common:misc.closeLoginModal')}
          >
            <X className="h-6 w-6" />
          </Button>
        </div>

        <div className="flex-1 overflow-hidden">
          <StandaloneShell project={DEFAULT_PROJECT_FOR_EMPTY_SHELL} command={command} onComplete={handleComplete} minimal={true} />
        </div>
      </UnifiedDialogContent>
    </UnifiedDialog>
  );
}
