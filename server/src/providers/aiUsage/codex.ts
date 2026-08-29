import { readFile, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { spawn as spawnPty } from 'node-pty';
import { aiUsageToolSchema, type AiUsageToolData, type UsageHistoryPoint } from '@nohm/shared';
import type { Provider } from '../../scheduler.js';
import type { UsageHistoryStore } from '../../usageHistory.js';
import {
  asIso,
  ensurePtySpawnHelper,
  jsonlFiles,
  limit,
  limitStatus,
  MONTH_ABBREVIATIONS,
  ptyProbeEnv,
  recordHistorySafely,
  resolveProbeExecutable,
  stripTerminalControls,
  type UsageSnapshot,
} from './shared.js';

const codexLimitSchema = z.object({
  used_percent: z.number(),
  window_minutes: z.number(),
  resets_at: z.number(),
});

const codexEventSchema = z.object({
  timestamp: z.string(),
  type: z.literal('event_msg'),
  payload: z.object({
    rate_limits: z
      .object({
        primary: codexLimitSchema.nullish(),
        secondary: codexLimitSchema.nullish(),
      })
      .nullish(),
  }),
});

/** 5h = 300 minutes, weekly = 10080 minutes; classify with slack rather than exact-matching. */
function windowBucket(windowMinutes: number): CodexLimitBucket | undefined {
  if (windowMinutes > 0 && windowMinutes <= 600) return 'fiveHour';
  if (windowMinutes >= 5000 && windowMinutes <= 20000) return 'weekly';
  return undefined;
}

type CodexLimitBucket = 'fiveHour' | 'weekly';
type TimestampedCodexLimit = { timestamp: string; entry: z.infer<typeof codexLimitSchema> };

interface CodexLimits {
  fiveHour?: TimestampedCodexLimit;
  weekly?: TimestampedCodexLimit;
  latestReport?: { timestamp: string; buckets: CodexLimitBucket[] };
}

function recordLatestLimit(
  limits: CodexLimits,
  timestamp: string,
  entry: z.infer<typeof codexLimitSchema>,
): CodexLimitBucket | undefined {
  const bucket = windowBucket(entry.window_minutes);
  if (bucket === 'fiveHour' && (!limits.fiveHour || timestamp > limits.fiveHour.timestamp)) {
    limits.fiveHour = { timestamp, entry };
  }
  if (bucket === 'weekly' && (!limits.weekly || timestamp > limits.weekly.timestamp)) {
    limits.weekly = { timestamp, entry };
  }
  return bucket;
}

function readCodexLimits(lines: string[], limits: CodexLimits): void {
  for (const line of lines) {
    try {
      const event = codexEventSchema.parse(JSON.parse(line));
      const rateLimits = event.payload.rate_limits;
      if (!rateLimits) continue;
      const entries = [rateLimits.primary, rateLimits.secondary];
      const buckets = entries.flatMap((entry) => {
        if (!entry) return [];
        const bucket = recordLatestLimit(limits, event.timestamp, entry);
        return bucket ? [bucket] : [];
      });
      if (!limits.latestReport || event.timestamp > limits.latestReport.timestamp) {
        limits.latestReport = { timestamp: event.timestamp, buckets };
      }
    } catch {
      // Session streams also contain unrelated messages; ignore malformed/irrelevant lines.
    }
  }
}

/**
 * Codex appends the live account limits to its local session event stream. Read only the newest
 * few logs: limits are account-wide and a current session always writes into the latest files.
 *
 * Which window rides in `primary` vs `secondary` isn't fixed, so classify entries by
 * `window_minutes` rather than trusting the slot. The latest rate-limit event is authoritative:
 * if it omits a window, the dashboard reports that window as temporarily unlimited instead of
 * showing a stale cap from an older session event.
 */
function codexSessionsDir(): string {
  return path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'sessions');
}

async function codexSnapshot(): Promise<UsageSnapshot> {
  const sessionsDir = codexSessionsDir();
  try {
    const files = (await jsonlFiles(sessionsDir)).sort((a, b) => a.localeCompare(b)).slice(-12);
    const latest: CodexLimits = {};

    for (const file of files) {
      const lines = (await readFile(file, 'utf8')).trim().split('\n');
      readCodexLimits(lines, latest);
    }

    const hasQuotaReport = Boolean(latest.latestReport);
    const fiveHour = latest.latestReport?.buckets.includes('fiveHour')
      ? latest.fiveHour && limit(latest.fiveHour.entry.used_percent, latest.fiveHour.entry.resets_at)
      : undefined;
    const weekly = latest.latestReport?.buckets.includes('weekly')
      ? latest.weekly && limit(latest.weekly.entry.used_percent, latest.weekly.entry.resets_at)
      : undefined;
    const asOf = latest.latestReport && asIso(latest.latestReport.timestamp);
    return {
      available: hasQuotaReport,
      fiveHour,
      weekly,
      fiveHourStatus: limitStatus(Boolean(fiveHour), hasQuotaReport),
      weeklyStatus: limitStatus(Boolean(weekly), hasQuotaReport),
      asOf,
    };
  } catch {
    return { available: false, fiveHourStatus: 'unknown', weeklyStatus: 'unknown' };
  }
}

/** A local read stops being trustworthy either when its own window has rolled past `resetsAt`, or
 * simply when it's old: Codex can grant an early, out-of-cycle "usage limit reset" (see the CLI's
 * own "Run /usage to use one" prompt) that has no relationship to the cached `resetsAt` at all —
 * the only local signal for that is a new session write, so a read that's gone a while without one
 * can no longer be trusted either. Bucket-agnostic so it applies to both the weekly window and
 * (should Codex's `/status` ever report it) the 5-hour one. */
const CODEX_LOCAL_READ_MAX_AGE_MS = 2 * 60 * 60_000;

export function isCodexLimitStale(
  window: UsageSnapshot['weekly'] | undefined,
  asOf: string | undefined,
  now = Date.now(),
  maxAgeMs = CODEX_LOCAL_READ_MAX_AGE_MS,
): boolean {
  if (!window || !asOf) return true;
  if (Date.parse(window.resetsAt) <= now) return true;
  return now - Date.parse(asOf) > maxAgeMs;
}

/** Matches the value portion of a "<label> limit: [bar] N% left (resets HH:MM on D Mon)"
 * `/status` row. The label and optional bar are separated structurally before this bounded parse. */
const CODEX_LIMIT_VALUE_REGEX =
  /^(\d{1,3})%\s*left\s*\(resets\s*(\d{1,2}):(\d{2})\s*on\s*(\d{1,2})\s*([a-z]{3})\)/i;

function classifyCodexLimitLabel(label: string): CodexLimitBucket | undefined {
  const normalized = label.toLowerCase();
  if (normalized.includes('week')) return 'weekly';
  if (normalized.includes('5h') || normalized.includes('hour') || normalized.includes('session')) return 'fiveHour';
  return undefined;
}

function parseCodexLimitLine(line: string): { label: string; match: RegExpExecArray } | undefined {
  const markerIndex = line.toLowerCase().indexOf('limit:');
  if (markerIndex === -1) return undefined;

  let value = line.slice(markerIndex + 'limit:'.length).trimStart();
  if (value.startsWith('[')) {
    const barEnd = value.indexOf(']');
    if (barEnd === -1) return undefined;
    value = value.slice(barEnd + 1).trimStart();
  }
  const match = CODEX_LIMIT_VALUE_REGEX.exec(value);
  return match ? { label: line.slice(0, markerIndex), match } : undefined;
}

/** `/status` reports resets in 24-hour local time with no year, e.g. "11:49 on 25 Jul". */
function parseCodexResetAt(hour: string, minute: string, day: string, monthAbbr: string, now = new Date()): string | undefined {
  const monthIndex = MONTH_ABBREVIATIONS.indexOf(monthAbbr.toLowerCase());
  if (monthIndex === -1) return undefined;
  const candidate = new Date(now.getFullYear(), monthIndex, Number(day), Number(hour), Number(minute));
  if (candidate.getTime() < now.getTime() - 24 * 60 * 60_000) candidate.setFullYear(candidate.getFullYear() + 1);
  return Number.isNaN(candidate.getTime()) ? undefined : candidate.toISOString();
}

/** Parse Codex CLI's interactive `/status` panel — each row as "N% left" rather than Claude's "N%
 * used". The panel redraws in place while MCP servers are still booting, so an earlier partial
 * render can sit in the captured stream alongside the final one; iterating matches in order and
 * overwriting per bucket naturally keeps only the last render of each row. */
export function parseCodexStatusScreen(
  screen: string,
  now = new Date(),
): Pick<UsageSnapshot, 'fiveHour' | 'weekly' | 'fiveHourStatus' | 'weeklyStatus' | 'asOf'> {
  const text = stripTerminalControls(screen);
  const windows: Partial<Record<CodexLimitBucket, ReturnType<typeof limit>>> = {};
  let sawAnyLimitLine = false;
  for (const line of text.split('\n')) {
    const parsed = parseCodexLimitLine(line);
    if (!parsed) continue;
    const bucket = classifyCodexLimitLabel(parsed.label);
    if (!bucket) continue;
    sawAnyLimitLine = true;
    const resetsAt = parseCodexResetAt(parsed.match[2], parsed.match[3], parsed.match[4], parsed.match[5], now);
    if (resetsAt) windows[bucket] = limit(100 - Number(parsed.match[1]), resetsAt);
  }
  const asOf = windows.fiveHour || windows.weekly ? now.toISOString() : undefined;
  return {
    fiveHour: windows.fiveHour,
    weekly: windows.weekly,
    fiveHourStatus: limitStatus(Boolean(windows.fiveHour), sawAnyLimitLine),
    weeklyStatus: limitStatus(Boolean(windows.weekly), sawAnyLimitLine),
    asOf,
  };
}

/** Deletes whatever rollout file(s) the interactive probe's own `codex` process just wrote,
 * comparing against the sessions dir listing captured right before it was spawned. The probe
 * exists purely to read the `/status` panel — its transcript has no lasting value — but a `codex`
 * process is a real Codex session as far as anything else watching this directory is concerned
 * (e.g. Batabiboing's "coding with Codex" activity signal reads the same directory's newest
 * mtime), so leaving the file behind falsely reports Codex activity every time this fallback runs. */
async function cleanupProbeSession(sessionsDir: string, filesBeforeSpawn: Set<string>): Promise<void> {
  let filesAfterSpawn: string[];
  try {
    filesAfterSpawn = await jsonlFiles(sessionsDir);
  } catch {
    return;
  }
  await Promise.all(
    filesAfterSpawn
      .filter((file) => !filesBeforeSpawn.has(file))
      .map((file) => unlink(file).catch(() => undefined)),
  );
}

/** How long the terminal must go without new output before another `/status` is worth sending —
 * long enough that a quiet stretch reads as "idle at the prompt" rather than "mid-redraw", so a
 * nudge never lands on top of one still being processed and get echoed back as garbled input
 * (observed as literal chat text like "status/status" once concatenated). */
const NUDGE_QUIET_MS = 4_000;

/**
 * Fallback for when the local session log has nothing newer than the cached weekly reset: launch
 * a short-lived interactive `codex` session and read its `/status` panel directly, the same
 * PTY-probe approach used for Claude's `/usage`. Codex boots its configured MCP servers before
 * accepting input (can take 10s+), so nudge `/status` repeatedly rather than guess a fixed delay —
 * but only once the terminal has gone quiet for a beat, not on a blind timer, since sending it
 * while Codex is still mid-boot/redraw means the next nudge can land on an unfinished input line.
 * Slow, so it's a fallback for the fast local read, never a replacement for it.
 */
export async function codexInteractiveStatusSnapshot(): Promise<
  Pick<UsageSnapshot, 'fiveHour' | 'weekly' | 'fiveHourStatus' | 'weeklyStatus' | 'asOf'>
> {
  const sessionsDir = codexSessionsDir();
  const filesBeforeSpawn = new Set(await jsonlFiles(sessionsDir).catch(() => []));
  try {
    await ensurePtySpawnHelper();
    const executable = await resolveProbeExecutable('codex');
    const output = await new Promise<string>((resolve) => {
      const pty = spawnPty(executable, [], {
        name: 'xterm-256color',
        cols: 160,
        rows: 48,
        cwd: process.cwd(),
        env: ptyProbeEnv(process.env),
        // See the Claude probe: on Windows this avoids node-pty's
        // AttachConsole cleanup helper for short-lived CLI sessions.
        useConptyDll: process.platform === 'win32',
      });
      let terminal = '';
      let settled = false;
      let exited = false;
      let settleTimer: NodeJS.Timeout | undefined;
      let lastDataAt = Date.now();
      let lastNudgeAt = 0;
      const finish = (result?: string) => {
        if (settled) return;
        settled = true;
        clearInterval(nudgeStatus);
        clearTimeout(timeout);
        clearTimeout(settleTimer);
        // Killing a PTY whose process already exited is worse than a no-op on Windows: conpty's
        // kill forks a helper that calls AttachConsole on the dead pid, which throws
        // "AttachConsole failed" straight to stderr and leaves the conpty handle open for the
        // helper's full 5s timeout.
        if (!exited) {
          try {
            pty.kill();
          } catch {
            // The process may already have exited after rendering the status panel.
          }
        }
        resolve(result ?? terminal);
      };
      const nudgeStatus = setInterval(() => {
        const now = Date.now();
        if (now - lastDataAt < NUDGE_QUIET_MS || now - lastNudgeAt < NUDGE_QUIET_MS) return;
        lastNudgeAt = now;
        pty.write('/status\r');
      }, 500);
      // Resolve with whatever the panel painted rather than rejecting. Parsing an incomplete capture
      // yields the same "unknown" the error path did when nothing rendered, but keeps a panel that
      // landed just before the CLI gave up — and a discarded read here costs a full fallback cooldown
      // of staleness, since the local session log has nothing newer to fall back to.
      const timeout = setTimeout(() => finish(), 50_000);
      pty.onData((chunk) => {
        terminal += chunk;
        lastDataAt = Date.now();
        if (/Weekly\s*limit\s*:/i.test(terminal)) {
          clearTimeout(settleTimer);
          settleTimer = setTimeout(() => finish(terminal), 750);
        }
      });
      pty.onExit(() => {
        exited = true;
        if (!settled) finish();
      });
    });
    return parseCodexStatusScreen(output);
  } catch {
    return { fiveHourStatus: 'unknown', weeklyStatus: 'unknown' };
  } finally {
    await cleanupProbeSession(sessionsDir, filesBeforeSpawn);
  }
}

/** How often a stale-by-clock reading may retry the slow interactive `/status` fallback. */
const CODEX_STATUS_FALLBACK_COOLDOWN_MS = 5 * 60_000;

type CodexFallback = Pick<UsageSnapshot, 'fiveHour' | 'weekly' | 'fiveHourStatus' | 'weeklyStatus' | 'asOf'>;

/** Overwrite one stale window (`bucket`) in `snapshot` with the fallback's reading, if the fallback
 * itself isn't also stale. Applied separately per window since Codex's `/status` panel today only
 * ever reports the weekly one — the 5-hour bucket stays untouched (and local-only) until it does. */
function applyCodexFallbackWindow(
  bucket: 'fiveHour' | 'weekly',
  snapshot: UsageSnapshot,
  fallback: CodexFallback,
): void {
  const statusKey = bucket === 'fiveHour' ? 'fiveHourStatus' : 'weeklyStatus';
  if (!isCodexLimitStale(snapshot[bucket], snapshot.asOf)) return;
  if (isCodexLimitStale(fallback[bucket], fallback.asOf)) return;
  snapshot[bucket] = fallback[bucket];
  snapshot[statusKey] = fallback[statusKey];
  snapshot.asOf = fallback.asOf ?? snapshot.asOf;
  snapshot.available = true;
}

/** Codex just re-reads local session files, so its cadence is configurable — see config.json. That
 * read is only ever as fresh as the last real Codex CLI turn, though — see isCodexLimitStale for
 * why a quiet local log doesn't just mean "no change." Only once a window is judged stale do we
 * fall back to the slow interactive `/status` probe, throttled so a quiet stretch doesn't spawn it
 * every tick; a successful live read is itself remembered and reused until it goes stale in turn. */
export function createCodexUsageProvider(
  refreshMs: number,
  history: UsageHistoryStore,
): Provider<AiUsageToolData> {
  let fallback: CodexFallback = { fiveHourStatus: 'unknown', weeklyStatus: 'unknown' };
  let lastFallbackAttemptAt = 0;
  const rememberedHistory: { points: UsageHistoryPoint[] } = { points: [] };

  return {
    id: 'ai-usage-codex',
    schema: aiUsageToolSchema,
    refreshMs,
    timeoutMs: 60_000,
    isConfigured: () => true,
    fetch: async (_signal, force) => {
      const snapshot = await codexSnapshot();
      const needsFallback = (['fiveHour', 'weekly'] as const).some(
        (bucket) => isCodexLimitStale(snapshot[bucket], snapshot.asOf) && isCodexLimitStale(fallback[bucket], fallback.asOf),
      );
      if (needsFallback && (force || Date.now() - lastFallbackAttemptAt > CODEX_STATUS_FALLBACK_COOLDOWN_MS)) {
        lastFallbackAttemptAt = Date.now();
        const status = await codexInteractiveStatusSnapshot();
        if (status.fiveHour || status.weekly) fallback = status;
      }
      applyCodexFallbackWindow('fiveHour', snapshot, fallback);
      applyCodexFallbackWindow('weekly', snapshot, fallback);
      return { ...snapshot, history: recordHistorySafely(history, 'ai-usage-codex', snapshot, rememberedHistory) };
    },
  };
}
