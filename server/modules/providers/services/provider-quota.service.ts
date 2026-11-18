import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { AppError, getCloudCliHomeDir } from '@/shared/index.js';
import { resolveWorkBuddyInstallation } from '@/modules/providers/list/workbuddy/workbuddy-auth.provider.js';
import { geminiInstallation } from '../list/gemini/gemini.provider.js';
import { readGeminiModels } from '../list/gemini/gemini-models.js';
import { antigravityModelStatus } from '../list/gemini/antigravity-model-status.js';

let antigravityCatalog: { at: number; models: { value: string; label: string }[] } | undefined;
async function readAntigravityQuota() {
  const cli = geminiInstallation()?.cli;
  const note = 'Antigravity CLI 只提供模型目录，未提供精确剩余额度及重置时间。目录可见不代表当前可调用；各模型状态独立记录实际调用结果，不共用 Claude / Codex 额度。';
  if (!cli) return { provider: 'gemini', status: 'unavailable', windows: [], note: '未安装 Antigravity CLI。', models: [] };
  try {
    if (!antigravityCatalog || Date.now() - antigravityCatalog.at > 60000) {
      antigravityCatalog = { at: Date.now(), models: (await readGeminiModels(cli)).OPTIONS.flatMap(model =>
        model.aliases?.length ? model.aliases.map(value => ({ value, label: `${model.label} (${value.slice(model.value.length + 1)})` })) : [model]) };
    }
    return { provider: 'gemini', status: 'unsupported', windows: [], note,
      models: antigravityCatalog.models.map(model => ({ ...antigravityModelStatus(model.value), label: model.label })) };
  } catch {
    antigravityCatalog = undefined;
    return { provider: 'gemini', status: 'unavailable', windows: [], models: [], note: '模型目录读取失败，请检查 Antigravity 原生登录及网络；未将其判为额度耗尽。' };
  }
}

/** Model library reads host-owned quota snapshots; this never launches inference on a page refresh. */
export const providerQuotaService = {
  openLogin(provider: 'claude' | 'cursor') {
    const install = resolveWorkBuddyInstallation();
    if (!install) throw new AppError('本机 WorkBuddy 不可用。', { statusCode: 409 });
    const state = path.join(getCloudCliHomeDir(), 'provider-usage');
    mkdirSync(state, { recursive: true });
    if (existsSync(path.join(state, 'run.lock'))) throw new AppError('正在查询用量或已有登录窗口，请稍后重试。', { statusCode: 409 });
    const worker = path.resolve(path.dirname(install.launcher), '../usage-monitor/worker.cjs');
    const child = spawn(process.execPath, [worker, '--login', provider], { cwd: state, windowsHide: true,
      env: { ...process.env, CLAUDEX_USAGE_HOME: state }, stdio: 'ignore', detached: true });
    child.on('error', () => {}); child.unref();
    return { opening: true };
  },
  async read() {
    const antigravity = await readAntigravityQuota();
    try {
      const snapshot = JSON.parse(await readFile(path.join(getCloudCliHomeDir(), 'provider-usage', 'snapshot.json'), 'utf8'));
      if (snapshot.version !== 1 || !Array.isArray(snapshot.providers) || !Number.isFinite(Date.parse(snapshot.updatedAt))) throw new Error('Invalid quota snapshot');
      return { ...snapshot, providers: [...snapshot.providers.filter((row: { provider: string }) => row.provider !== 'gemini'), antigravity], stale: Date.now() - Date.parse(snapshot.updatedAt) > 45 * 60000 };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { updatedAt: null, stale: true, providers: [antigravity], intervalMinutes: 30, reporter: null };
      throw error;
    }
  },
};
