import { access, chmod, constants, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import type { AiUsageToolData, UsageHistoryPoint } from '@nohm/shared';
import { isUsageReset, type UsageHistoryStore } from '../../usageHistory.js';

const require = createRequire(import.meta.url);

/** What the snapshot readers produce; the provider fetch adds the store-managed `history`. */
export type UsageSnapshot = Omit<AiUsageToolData, 'history'>;
type LimitStatus = AiUsageToolData['fiveHourStatus'];

export function limit(usedPercent: number, resetsAt: number | string) {
  const reset =
    typeof resetsAt === 'number' ? new Date(resetsAt * 1_000) : new Date(resetsAt);
  if (!Number.isFinite(usedPercent) || Number.isNaN(reset.getTime())) return undefined;
  return {
    usedPercent: Math.max(0, Math.min(100, usedPercent)),
    resetsAt: reset.toISOString(),
  };
}

export function limitStatus(hasLimit: boolean, hasQuotaReport: boolean): LimitStatus {
  if (hasLimit) return 'limited';
  return hasQuotaReport ? 'unlimited' : 'unknown';
}

export async function jsonlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return jsonlFiles(entryPath);
      return entry.isFile() && entry.name.endsWith('.jsonl') ? [entryPath] : [];
    }),
  );
  return nested.flat();
}

export function asIso(timestamp: string): string | undefined {
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export const MONTH_ABBREVIATIONS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export const WS = String.raw`\s*`;
const ESC = '\u001B';
const BEL = '\u0007';
const OSC_SEQUENCE = new RegExp(String.raw`${ESC}\][^${BEL}]*(?:${BEL}|${ESC}\\)`, 'g'); // OSC title/hyperlink sequences.
const CSI_SEQUENCE = new RegExp(String.raw`${ESC}\[[0-?]*[ -/]*[@-~]`, 'g'); // CSI cursor/style sequences.

export function stripTerminalControls(value: string): string {
  return value.replace(OSC_SEQUENCE, '').replace(CSI_SEQUENCE, '').replaceAll('\r', '');
}

/** node-pty's macOS prebuilt helper can lose its executable bit in npm installations that suppress
 * lifecycle scripts. Restoring it is local, idempotent, and required to open a PTY — both the
 * Claude and Codex interactive probes need it before spawning. */
export async function ensurePtySpawnHelper(): Promise<void> {
  if (process.platform !== 'darwin') return;
  const packageRoot = path.resolve(path.dirname(require.resolve('node-pty')), '..');
  await chmod(path.join(packageRoot, 'prebuilds', `darwin-${process.arch}`, 'spawn-helper'), 0o755).catch(() => undefined);
}

function localBinExecutable(name: string): string {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  return path.join(os.homedir(), '.local/bin', exe);
}

/** Windows extensions conpty can spawn from a bare file path. A `.cmd`/`.bat` shim is deliberately
 * not accepted: it only runs through `cmd.exe`, which node-pty would have to be handed instead. */
const WINDOWS_EXECUTABLE_EXTENSIONS = ['.exe', '.com'];

/**
 * The interactive AI-usage probes shell out to a CLI, and node-pty on Windows does no PATH or
 * PATHEXT resolution — it needs the full path to a directly-spawnable file, or the spawn fails with
 * "File not found", which the probes swallow, leaving the widget stuck on remembered data.
 *
 * `~/.local/bin` is where Claude Code's own installer lands, so it stays the first place to look,
 * but assuming every CLI follows that convention is what left Codex's `/status` fallback dead on
 * Windows: its installer puts `codex.exe` under `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin` and only
 * adds *that* to PATH, so the probe spawned a path that has never existed and failed instantly —
 * indistinguishable, from the widget's side, from "no newer data", for as long as the local session
 * log stayed quiet. So search PATH as well before giving up.
 */
export async function resolveProbeExecutable(name: string): Promise<string> {
  const searchPath = [
    path.join(os.homedir(), '.local/bin'),
    ...(process.env.PATH ?? process.env.Path ?? '').split(path.delimiter),
  ];
  const extensions = process.platform === 'win32' ? WINDOWS_EXECUTABLE_EXTENSIONS : [''];
  for (const directory of searchPath) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = path.join(directory, `${name}${extension}`);
      const executable = await access(candidate, constants.X_OK).then(() => true, () => false);
      if (executable) return candidate;
    }
  }
  // Nothing found — hand back the conventional location so the caller fails the same way it always
  // has (a spawn error the probe already handles) rather than on an empty path.
  return localBinExecutable(name);
}

/** Prepend `~/.local/bin` to the child's PATH using the OS path delimiter, and normalize away the
 * Windows `Path`/`PATH` casing split (spreading `process.env` keeps its OS casing, so reading `.PATH`
 * on Windows — where the key is `Path` — silently drops the real PATH). Sets TERM for the PTY too. */
export function ptyProbeEnv(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const localBin = path.join(os.homedir(), '.local/bin');
  const basePath = baseEnv.PATH ?? baseEnv.Path ?? '';
  const env: NodeJS.ProcessEnv = { ...baseEnv, TERM: 'xterm-256color' };
  delete env.Path;
  env.PATH = `${localBin}${path.delimiter}${basePath}`;
  return env;
}

/** A slow or hung DB write must never block returning an already-successful live read (see the
 * Postgres connectivity issues that froze both AI usage widgets for days). The Claude probe alone
 * can already take up to 35s inside a 40s provider timeout, leaving almost no room for a DB round
 * trip on top — Postgres retries on a dead connection can run well past whatever margin is left.
 * So this never sits in the fetch's critical path at all: it kicks the write off in the background
 * and returns the last known series immediately, updating it for the *next* fetch once the write
 * settles. That removes DB latency from the provider timeout equation entirely, rather than just
 * bounding it. */
export function recordHistorySafely(
  historyStore: UsageHistoryStore,
  toolId: string,
  snapshot: UsageSnapshot,
  remembered: { points: UsageHistoryPoint[] },
): UsageHistoryPoint[] {
  const latest = remembered.points.at(-1);
  const asOf = snapshot.asOf ? Date.parse(snapshot.asOf) : undefined;
  // Persisting remains off the provider's critical path, but an observed reset must be visible to
  // this very response (and its command-center refresh), not only after the next polling cycle.
  const resetObserved = Boolean(latest && Number.isFinite(asOf) && asOf! > Date.parse(latest.at)) && (
    isUsageReset(latest?.fiveHourUsedPercent, snapshot.fiveHour?.usedPercent)
    || isUsageReset(latest?.weeklyUsedPercent, snapshot.weekly?.usedPercent)
  );
  if (resetObserved && snapshot.asOf) {
    remembered.points = [...remembered.points, {
      at: snapshot.asOf,
      fiveHourUsedPercent: snapshot.fiveHour?.usedPercent,
      fiveHourResetsAt: snapshot.fiveHour?.resetsAt,
      weeklyUsedPercent: snapshot.weekly?.usedPercent,
      weeklyResetsAt: snapshot.weekly?.resetsAt,
      modelWeeklyUsedPercent: snapshot.modelWeekly?.usedPercent,
    }];
  }
  void historyStore
    .record(toolId, snapshot)
    .then((points) => {
      remembered.points = points;
    })
    .catch(() => {
      // Keep serving the last known-good series; a history-write failure isn't a live-data failure.
    });
  return remembered.points;
}
