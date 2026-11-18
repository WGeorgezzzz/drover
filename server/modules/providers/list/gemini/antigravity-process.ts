import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Used by the Antigravity runtime and model catalog without exposing a terminal window. */
export function startAntigravity(cli: string, args: string[], cwd = process.cwd(), pipe?: string) {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'drover-agy-'));
  const request = path.join(folder, 'request.json');
  const output = path.join(folder, 'stdout');
  const errors = path.join(folder, 'stderr');
  const status = path.join(folder, 'status.json');
  writeFileSync(request, JSON.stringify({ cli, args, cwd, output, errors, status, pipe }));
  const runner = path.resolve('scripts/antigravity/run.cjs');
  const child = process.platform === 'win32'
    ? spawn('conhost.exe', ['--headless', process.execPath, runner, request], { windowsHide: true, stdio: 'pipe' })
    : spawn(process.execPath, [runner, request], { stdio: 'ignore' });
  child.stdout?.resume();
  child.stderr?.resume();
  const result = new Promise<string>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => {
      try {
        const stdout = readFileSync(output, 'utf8');
        const stderr = readFileSync(errors, 'utf8');
        const nativeCode = JSON.parse(readFileSync(status, 'utf8')).code;
        if (code !== 0 || nativeCode !== 0) throw new Error(stderr.trim() || `Antigravity exited with code ${nativeCode ?? code}`);
        resolve(stdout);
      } catch (error) { reject(error); }
    });
  }).finally(() => {
    if (path.dirname(path.resolve(folder)) === path.resolve(os.tmpdir()) && path.basename(folder).startsWith('drover-agy-')) {
      rmSync(folder, { recursive: true, force: true });
    }
  });
  return { child, result };
}

/** Used by the Antigravity catalog and runtime to stop the owned process tree. */
export async function stopAntigravity(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform !== 'win32') { child.kill(); return; }
  await new Promise<void>((resolve, reject) => {
    const killer = spawn('conhost.exe', ['--headless', 'taskkill.exe', '/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'pipe' });
    killer.stdout?.resume();
    killer.stderr?.resume();
    killer.once('error', reject);
    killer.once('close', code => code === 0 || child.exitCode !== null ? resolve() : reject(new Error('Failed to stop Antigravity process tree')));
  });
}
