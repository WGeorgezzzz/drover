import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { createClaudeLaunchEnvironment } from '@/shared/index.js';

type RemoteClaudeWindow = { label: string; percent: number; resetsAt: string | null };

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// /usage is answered by the CLI itself: no model turn runs, and only the prompt crosses the adapter.
const USAGE_ARGS = ['-p', '/usage', '--output-format', 'json', '--no-session-persistence', '--max-turns', '1'];

function zonedTimeToUtc(wallClock: number, zone: string): number | null {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
  } catch { return null; }
  const offsetAt = (utc: number) => {
    const part = Object.fromEntries(format.formatToParts(utc).map(item => [item.type, item.value]));
    return Date.UTC(Number(part.year), Number(part.month) - 1, Number(part.day), Number(part.hour), Number(part.minute)) - utc;
  };
  // A second pass lands on the right side of a daylight-saving change.
  return wallClock - offsetAt(wallClock - offsetAt(wallClock));
}

/** The report omits the year, e.g. "Nov 9, 11:30am (Europe/Berlin)"; an unreadable time stays unknown instead of guessed. */
function parseReset(text: string | undefined, now: number): string | null {
  const match = /^([a-z]{3})\s+(\d{1,2}),\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\(([^)]+)\)$/i.exec(text?.trim() ?? '');
  if (!match) return null;
  const month = MONTHS.indexOf(match[1].toLowerCase());
  if (month < 0) return null;
  const hour = (Number(match[3]) % 12) + (match[5].toLowerCase() === 'pm' ? 12 : 0);
  const toUtc = (year: number) => zonedTimeToUtc(Date.UTC(year, month, Number(match[2]), hour, Number(match[4] ?? 0)), match[6]);
  const year = new Date(now).getUTCFullYear();
  const reset = toUtc(year);
  if (reset === null) return null;
  // Resets are in the future, so a date well behind now belongs to next year.
  return new Date(reset < now - 86400000 ? toUtc(year + 1)! : reset).toISOString();
}

function readReport(stdout: string): string | null {
  let report: string | null = null;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim().startsWith('{')) continue;
    try {
      const row = JSON.parse(line) as { type?: unknown; is_error?: unknown; result?: unknown };
      if (row.type === 'result') report = row.is_error !== true && typeof row.result === 'string' ? row.result : null;
    } catch { /* The adapter can interleave non-protocol lines. */ }
  }
  return report;
}

/** Quota service turns the adapter's /usage output into windows; returns null unless both overall windows are present. */
export function parseRemoteClaudeUsage(stdout: string, now: number): RemoteClaudeWindow[] | null {
  const windows: RemoteClaudeWindow[] = [];
  for (const line of (readReport(stdout) ?? '').split(/\r?\n/)) {
    const match = /^Current (session|week)(?: \(([^)]+)\))?:\s*(\d+(?:\.\d+)?)% used(?:\s*·\s*resets\s+(.+))?$/.exec(line.trim());
    if (!match) continue;
    const label = match[1] === 'session' ? '5h' : !match[2] || match[2] === 'all models' ? '7 天' : match[2];
    windows.push({ label, percent: Number(match[3]), resetsAt: parseReset(match[4], now) });
  }
  return windows.some(item => item.label === '5h') && windows.some(item => item.label === '7 天') ? windows : null;
}

/** Quota service runs this on the owner's remote adapter, so the OAuth token and lane seat stay on the remote host. */
export async function runRemoteClaudeUsage(): Promise<string> {
  const adapter = process.env.CLAUDE_REMOTE_CLI_PATH?.trim();
  if (!adapter || !path.isAbsolute(adapter)) throw new Error('Remote Claude adapter is not configured');
  const script = /\.[cm]?js$/i.test(adapter);
  const running = promisify(execFile)(script ? process.execPath : adapter, script ? [adapter, ...USAGE_ARGS] : USAGE_ARGS, {
    cwd: os.homedir(), timeout: 60000, maxBuffer: 256 * 1024, windowsHide: true,
    env: createClaudeLaunchEnvironment(process.env, adapter),
  });
  // Print mode must not wait on an open stdin pipe.
  running.child.stdin?.end();
  return (await running).stdout;
}
