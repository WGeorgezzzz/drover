import type { ProviderModelsDefinition } from '@/shared/types.js';

import { inspectGeminiDesktop } from './gemini-desktop.js';
import { startAntigravity, stopAntigravity } from './antigravity-process.js';
import { antigravityModelStatus } from './antigravity-model-status.js';

/** GeminiProvider reads account-visible CLI models, keeping desktop-only installations compatible. */
export async function readGeminiModels(cli?: string | null): Promise<ProviderModelsDefinition> {
  if (cli) {
    const run = startAntigravity(cli, ['models']);
    const timer = setTimeout(() => { void stopAntigravity(run.child).catch(() => {}); }, 30000);
    try {
      const stdout = await run.result;
      const options = stdout.split(/\r?\n/).flatMap(line => {
        const match = line.match(/^([\w.-]+)\t(.+)$/);
        return match ? [{ value: match[1], label: match[2].trim(),
          description: `Antigravity 通道 · ${antigravityModelStatus(match[1]).statusLabel} · 剩余额度未提供` }] : [];
      });
      if (!options.length) throw new Error('Antigravity returned no available models. Sign in with agy first.');
      return { CUSTOM_MODELS_SUPPORTED: false, OPTIONS: options, DEFAULT: options[0].value };
    } finally { clearTimeout(timer); }
  }
  try {
    const info = await inspectGeminiDesktop();
    return { CUSTOM_MODELS_SUPPORTED: false, OPTIONS: [{ value: info.model, label: info.model, description: '使用已登录 Gemini 桌面版；执行会切换桌面窗口' }], DEFAULT: info.model };
  } catch { return { CUSTOM_MODELS_SUPPORTED: false, OPTIONS: [], DEFAULT: '' }; }
}
