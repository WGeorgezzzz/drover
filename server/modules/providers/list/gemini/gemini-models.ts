import type { ProviderModelOption, ProviderModelsDefinition } from '@/shared/types.js';

import { inspectGeminiDesktop } from './gemini-desktop.js';
import { startAntigravity, stopAntigravity } from './antigravity-process.js';
import { antigravityModelStatus } from './antigravity-model-status.js';

/** GeminiProvider groups native model/effort IDs for the composer's separate selectors. */
export function parseAntigravityModels(stdout: string): ProviderModelsDefinition {
  const groups = new Map<string, ProviderModelOption>();
  const levels = ['low', 'medium', 'high', 'xhigh'];
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^([\w.-]+)\t(.+)$/);
    if (!match) continue;
    const [, nativeId, nativeLabel] = match;
    const suffix = nativeId.match(/-(low|medium|high|xhigh)$/)?.[1];
    const level = suffix && new RegExp(` \\(${suffix}\\)$`, 'i').test(nativeLabel.trim()) ? suffix : undefined;
    const value = level ? nativeId.slice(0, -level.length - 1) : nativeId;
    let option = groups.get(value);
    if (!option) {
      option = { value, label: level ? nativeLabel.trim().replace(/ \([^()]+\)$/, '') : nativeLabel.trim(),
        description: 'Antigravity 通道 · 剩余额度未提供',
        ...(level ? { aliases: [], effort: { default: level, values: [] } } : {}) };
      groups.set(value, option);
    }
    if (level && !option.aliases!.includes(nativeId)) {
      option.aliases!.push(nativeId);
      option.effort!.values.push({ value: level, description: antigravityModelStatus(nativeId).statusLabel });
    }
  }
  const options = [...groups.values()];
  for (const option of options) option.effort?.values.sort((left, right) => levels.indexOf(left.value) - levels.indexOf(right.value));
  if (!options.length) throw new Error('Antigravity returned no available models. Sign in with agy first.');
  return { CUSTOM_MODELS_SUPPORTED: false, OPTIONS: options, DEFAULT: options[0].value };
}

/** The ACP runtime converts separate selections, including legacy IDs, to an advertised native ID. */
export function resolveAntigravityModel(catalog: ProviderModelsDefinition, model: string, effort?: string): string {
  const option = catalog.OPTIONS.find(entry => entry.value === model || entry.aliases?.includes(model));
  if (!option) throw new Error(`Antigravity model unavailable: ${model}`);
  const explicitEffort = effort && effort !== 'default' ? effort : undefined;
  if (!option.effort) {
    if (explicitEffort) throw new Error(`Antigravity model ${option.value} does not support reasoning effort`);
    return option.value;
  }
  const legacyEffort = option.aliases?.includes(model) ? model.slice(option.value.length + 1) : undefined;
  const level = explicitEffort || legacyEffort || option.effort.default;
  const nativeId = `${option.value}-${level}`;
  if (!option.effort.values.some(entry => entry.value === level) || !option.aliases?.includes(nativeId)) {
    throw new Error(`Unsupported Antigravity effort ${level} for ${option.value}`);
  }
  return nativeId;
}

/** GeminiProvider reads account-visible CLI models, keeping desktop-only installations compatible. */
export async function readGeminiModels(cli?: string | null): Promise<ProviderModelsDefinition> {
  if (cli) {
    const run = startAntigravity(cli, ['models']);
    const timer = setTimeout(() => { void stopAntigravity(run.child).catch(() => {}); }, 30000);
    try {
      const stdout = await run.result;
      return parseAntigravityModels(stdout);
    } finally { clearTimeout(timer); }
  }
  try {
    const info = await inspectGeminiDesktop();
    return { CUSTOM_MODELS_SUPPORTED: false, OPTIONS: [{ value: info.model, label: info.model, description: '使用已登录 Gemini 桌面版；执行会切换桌面窗口' }], DEFAULT: info.model };
  } catch { return { CUSTOM_MODELS_SUPPORTED: false, OPTIONS: [], DEFAULT: '' }; }
}
