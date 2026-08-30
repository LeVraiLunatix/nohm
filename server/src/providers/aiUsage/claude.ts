import { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { spawn as spawnPty } from 'node-pty';
import { aiUsageToolSchema, type AiUsageToolData, type UsageHistoryPoint } from '@nohm/shared';
import type { Provider } from '../../scheduler.js';
import type { UsageHistoryStore } from '../../usageHistory.js';
import {
  ensurePtySpawnHelper,
  jsonlFiles,
  limit,
  MONTH_ABBREVIATIONS,
  ptyProbeEnv,
  resolveProbeExecutable,
  recordHistorySafely,
  stripTerminalControls,
  WS,
  type UsageSnapshot,
} from './shared.js';

const claudeTranscriptEntrySchema = z.object({
  type: z.literal('assistant'),
  timestamp: z.string(),
  message: z.object({
    usage: z.object({
      input_tokens: z.number(),
      output_tokens: z.number().optional(),
      cache_creation_input_tokens: z.number().optional(),
      cache_read_input_tokens: z.number().optional(),
    }),
  }),
});

const FIVE_HOUR_MS = 5 * 60 * 60_000;
const WEEKLY_MS = 7 * 24 * 60 * 60_000;

/**
 * Claude Code writes every turn's token usage into local session transcripts
 * (`~/.claude/projects/**\/*.jsonl`) as it works — reading those locally gives a genuinely live,
 * zero-network total of tokens actually used in the same rolling 5-hour/weekly windows the
 * account-wide quota below tracks, without an extra rate-limited network call. Only files modified
 * within the weekly window are read at all: an untouched file's newest entry can't be newer than
 * its own mtime, so anything older is guaranteed out of range.
 */
async function claudeTokenTotals(): Promise<{ fiveHour: number; weekly: number }> {
  const projectsDir = path.join(
    process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'),
    'projects',
  );
  const now = Date.now();
  let fiveHour = 0;
  let weekly = 0;
  try {
    const files = await jsonlFiles(projectsDir);
    const recentFiles = (
      await Promise.all(files.map(async (file) => ({ file, mtime: (await stat(file)).mtimeMs })))
    ).filter(({ mtime }) => now - mtime < WEEKLY_MS);

    await Promise.all(
      recentFiles.map(async ({ file }) => {
        const lines = (await readFile(file, 'utf8')).trim().split('\n');
        for (const line of lines) {
          let entry;
          try {
            entry = claudeTranscriptEntrySchema.parse(JSON.parse(line));
          } catch {
            continue; // Transcripts also contain non-assistant / tool entries; skip anything else.
          }
          const at = Date.parse(entry.timestamp);
          const age = now - at;
          if (!Number.isFinite(at) || age > WEEKLY_MS) continue;
          const { usage } = entry.message;
          const tokens =
            usage.input_tokens +
            (usage.output_tokens ?? 0) +
            (usage.cache_creation_input_tokens ?? 0) +
            (usage.cache_read_input_tokens ?? 0);
          weekly += tokens;
          if (age <= FIVE_HOUR_MS) fiveHour += tokens;
        }
      }),
    );
  } catch {
    // No local transcripts available; totals stay at zero.
  }
  return { fiveHour, weekly };
}

export type ClaudeQuota = Pick<UsageSnapshot, 'fiveHour' | 'weekly' | 'modelWeekly' | 'fiveHourStatus' | 'weeklyStatus' | 'asOf'>;

/**
 * Recent Claude Code versions can return only run statistics from `claude -p "/usage"` when
 * an account is at its cap. That is not an authoritative zero-quota report, so retain the last
 * report that did include quota data. An explicit no-limits report has `asOf` and still replaces it.
 *
 * The retained report only holds while its own windows haven't reset yet: once a window's
 * `resetsAt` has passed, that percentage is provably wrong (the real window has moved on), not
 * merely stale, so it's dropped rather than kept forever — without this a single missed live read
 * (the interactive probe times out, transcripts are empty) could pin the widget to an old reading
 * indefinitely, since nothing else ever re-validates it.
 */
export function retainKnownClaudeQuota(live: ClaudeQuota, previous?: ClaudeQuota, now = Date.now()): ClaudeQuota {
  if (!previous) return live;
  const stillCurrent = <T extends { resetsAt: string }>(window: T | undefined) =>
    window && Date.parse(window.resetsAt) > now ? window : undefined;

  // Backfill per window, not per report: a live read can genuinely capture one window (e.g. the
  // 5-hour block) while missing another (e.g. weekly didn't render in time), and that partial read
  // still stamps `asOf`. Gating backfill on "the whole report has no asOf" would let a real 5-hour
  // reading silently blow away a still-valid weekly one merely because weekly didn't parse this tick.
  const retainedFiveHour = live.fiveHourStatus === 'unknown' ? stillCurrent(previous.fiveHour) : undefined;
  const retainedWeekly = live.weeklyStatus === 'unknown' ? stillCurrent(previous.weekly) : undefined;
  const retainedModelWeekly = live.weeklyStatus === 'unknown' ? stillCurrent(previous.modelWeekly) : undefined;
  if (!retainedFiveHour && !retainedWeekly && !retainedModelWeekly) return live;

  return {
    fiveHour: retainedFiveHour ?? live.fiveHour,
    weekly: retainedWeekly ?? live.weekly,
    modelWeekly: retainedModelWeekly ?? live.modelWeekly,
    fiveHourStatus: retainedFiveHour ? previous.fiveHourStatus : live.fiveHourStatus,
    weeklyStatus: retainedWeekly ? previous.weeklyStatus : live.weeklyStatus,
    asOf: live.asOf ?? previous.asOf,
  };
}

/**
 * The interactive Usage screen reports reset times in the machine's own local time with no year,
 * e.g. "Jul 13 at 1:59am". Both windows reset within days, so resolving against the current year
 * and rolling forward if that lands in the past handles the Dec→Jan edge case correctly.
 */
function parseDatedResetAt(monthAbbr: string, day: string, hour: string, minute: string | undefined, meridiem: string, now = new Date()): string | undefined {
  const monthIndex = MONTH_ABBREVIATIONS.indexOf(monthAbbr.toLowerCase());
  if (monthIndex === -1) return undefined;
  let hour24 = Number(hour) % 12;
  if (meridiem.toLowerCase() === 'pm') hour24 += 12;
  const candidate = new Date(now.getFullYear(), monthIndex, Number(day), hour24, minute ? Number(minute) : 0);
  if (candidate.getTime() < now.getTime() - 24 * 60 * 60_000) candidate.setFullYear(candidate.getFullYear() + 1);
  return Number.isNaN(candidate.getTime()) ? undefined : candidate.toISOString();
}

/** The five-hour screen says only "Resets 5:20pm", so infer today or tomorrow locally. */
function parseTimeOnlyResetAt(hour: string, minute: string | undefined, meridiem: string, now = new Date()): string | undefined {
  let hour24 = Number(hour) % 12;
  if (meridiem.toLowerCase() === 'pm') hour24 += 12;
  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour24, minute ? Number(minute) : 0);
  if (candidate.getTime() < now.getTime()) candidate.setDate(candidate.getDate() + 1);
  return Number.isNaN(candidate.getTime()) ? undefined : candidate.toISOString();
}

const CURRENT_WEEK = String.raw`Current${WS}week${WS}\(`;
const ALL_MODELS_CLOSE = String.raw`all${WS}models${WS}\)`;

/**
 * When Anthropic's usage endpoint itself is rate-limited, the Usage screen still renders the last
 * numbers it had under a "Showing last-known usage as of 50m ago (rate limited — try again in a
 * moment)" banner. Those numbers are real but old; without this, `asOf` would be stamped "now" on
 * every poll and the widget would look perfectly fresh while quietly serving an hours-stale reading.
 */
const STALE_USAGE_BANNER = new RegExp(String.raw`last-known${WS}usage${WS}as${WS}of${WS}(\d+)${WS}(m|h|d)${WS}ago`, 'i');

function staleBannerAgeMs(amount: string, unit: string): number {
  const msPerUnit: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Number(amount) * (msPerUnit[unit.toLowerCase()] ?? 60_000);
}

function parseUsageWindow(section: string, now: Date) {
  const used = /(\d{1,3}(?:\.\d{1,2})?)%\s*used/i.exec(section);
  // The weekly window's reset renders either as "Resets Aug 16 at 12am" (older) or "Resets Aug 16,
  // 12am" (current) — accept the separator as "at", a comma, or nothing so the newer comma format
  // still parses. Without a reset the whole window is dropped, which stalls the interactive probe's
  // "both windows parsed" finish check until it times out and discards an otherwise-complete screen.
  // The separator is one `[\s,]*` run around an optional literal "at" rather than two `\s*` runs
  // straddling it — the latter can split a space run two ways, which backtracks super-linearly.
  const datedReset = /Resets[\s,]*([a-z]{3})[\s,]*(\d{1,2})[\s,]*(?:at[\s,]*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(section);
  const timeOnlyReset = /Resets\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(section);
  if (!used || (!datedReset && !timeOnlyReset)) return undefined;
  const resetsAt = datedReset
    ? parseDatedResetAt(datedReset[1], datedReset[2], datedReset[3], datedReset[4], datedReset[5], now)
    : parseTimeOnlyResetAt(timeOnlyReset![1], timeOnlyReset![2], timeOnlyReset![3], now);
  return resetsAt ? limit(Number(used[1]), resetsAt) : undefined;
}

/**
 * The interactive Usage screen renders in place, redrawing the same header lines with updated
 * numbers as data comes in (e.g. an approximate figure first, then a corrected one once local
 * sessions finish scanning). The captured PTY stream is append-only, so every render is still
 * sitting in the buffer, oldest first — yield them newest-first so a caller can prefer the most
 * recent numbers (a non-global `.exec` would otherwise latch onto superseded ones) while still
 * having the earlier renders to fall back on when the newest is incomplete.
 */
function screenRenders(text: string): string[] {
  const headerRegex = new RegExp(`Current${WS}session`, 'gi');
  const indices: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = headerRegex.exec(text))) {
    indices.push(match.index);
  }
  return indices.length === 0 ? [text] : indices.toReversed().map((index) => text.slice(index));
}

type UsageWindows = Pick<ClaudeQuota, 'fiveHour' | 'weekly' | 'modelWeekly'>;

/** Extract whichever quota windows one render of the screen carries. */
function parseUsageWindows(text: string, now: Date): UsageWindows {
  // Terminal cursor updates can erase visual spaces from the captured stream, so accept both
  // the readable UI labels and their compact `Currentsession` / `Currentweek(allmodels)` form.
  const sessionMatch = new RegExp(String.raw`Current${WS}session([\s\S]*?)(?=${CURRENT_WEEK}${WS}${ALL_MODELS_CLOSE}|$)`, 'i').exec(text);
  const weeklyMatch = new RegExp(String.raw`${CURRENT_WEEK}${WS}${ALL_MODELS_CLOSE}([\s\S]*)`, 'i').exec(text);
  const modelMatch = new RegExp(
    String.raw`${CURRENT_WEEK}${WS}(?!${ALL_MODELS_CLOSE})([^)]+)\)([\s\S]*?)(?=${CURRENT_WEEK}|What's${WS}contributing|$)`,
    'i',
  ).exec(text);
  const modelLimit = modelMatch ? parseUsageWindow(modelMatch[2], now) : undefined;
  return {
    fiveHour: parseUsageWindow(sessionMatch?.[1] ?? '', now),
    weekly: parseUsageWindow(weeklyMatch?.[1] ?? '', now),
    modelWeekly: modelLimit && modelMatch ? { ...modelLimit, model: modelMatch[1].trim() } : undefined,
  };
}

/**
 * `/usage` is an interactive Claude Code command. Print mode (`claude -p '/usage'`) treats it as
 * prompt text and returns run statistics rather than quota data, so launch a short, isolated
 * pseudo-terminal session. It sends only `/usage`, never a model prompt.
 */
/** Parse Claude Code's current multiline interactive Usage screen. */
export function parseClaudeUsageScreen(screen: string, now = new Date()): ClaudeQuota {
  const text = stripTerminalControls(screen);
  // Take each window from the newest render that actually produced it, rather than anchoring the
  // whole parse to the last render alone. That anchoring loses a complete report whenever the final
  // redraw is garbled — routine on Windows conpty, where cursor-positioning updates drop characters
  // mid-line ("Current week (all models)" arriving as "wek (all models)", "42% used Resets Aug 16"
  // as "42Aug16"). The mangled text reads as a missing weekly window, which stalls the interactive
  // probe's "both windows parsed" finish check until it times out — 35s of waiting that ends by
  // discarding a perfectly good render sitting a few hundred bytes earlier in the same buffer, and
  // falling back to a transcript report that can be days old.
  const windows: UsageWindows = {};
  for (const render of screenRenders(text)) {
    const parsed = parseUsageWindows(render, now);
    windows.fiveHour ??= parsed.fiveHour;
    windows.weekly ??= parsed.weekly;
    windows.modelWeekly ??= parsed.modelWeekly;
    if (windows.fiveHour && windows.weekly && windows.modelWeekly) break;
  }
  const hasQuotaReport = Boolean(windows.fiveHour || windows.weekly || windows.modelWeekly);
  const staleBanner = STALE_USAGE_BANNER.exec(text);
  const staleAgeMs = staleBanner ? staleBannerAgeMs(staleBanner[1], staleBanner[2]) : 0;
  const asOf = hasQuotaReport ? new Date(now.getTime() - staleAgeMs).toISOString() : undefined;
  return {
    fiveHour: windows.fiveHour,
    weekly: windows.weekly,
    modelWeekly: windows.modelWeekly,
    // Status is per-window, not per-report: whether *that window's own header* rendered at all,
    // not whether some other window (e.g. session) happened to parse. Otherwise a 5-hour reading
    // that lands fine would mark a weekly window that simply failed to capture this tick as an
    // explicit "unlimited" instead of "unknown" — see retainKnownClaudeQuota, which relies on this
    // distinction to know when it's safe to backfill from the last known-good weekly reading.
    // A header without its percentage and reset time is a partial terminal redraw, not proof that
    // Claude removed a limit. Reporting it as unlimited replaces a valid cached quota with a
    // misleading green label; retain the known reading until a complete screen arrives instead.
    fiveHourStatus: windows.fiveHour ? 'limited' : 'unknown',
    weeklyStatus: windows.weekly ? 'limited' : 'unknown',
    asOf,
  };
}

export async function claudeInteractiveUsageSnapshot(): Promise<ClaudeQuota> {
  try {
    // Drop ANTHROPIC_API_KEY so the probe reads subscription usage, not API billing (which has no
    // 5-hour/weekly windows). Keep CLAUDE_CODE_OAUTH_TOKEN: for users authed with `claude
    // setup-token` it's the only credential, and stripping it left `/usage` reporting "Not logged in".
    const { ANTHROPIC_API_KEY, ...cleanEnv } = process.env;
    await ensurePtySpawnHelper();
    const executable = await resolveProbeExecutable('claude');
    const output = await new Promise<string>((resolve) => {
      const pty = spawnPty(executable, [], {
        name: 'xterm-256color',
        cols: 160,
        rows: 48,
        cwd: process.cwd(),
        env: ptyProbeEnv(cleanEnv),
        // node-pty's default Windows ConPTY path forks a helper that tries to
        // AttachConsole to an already-exited CLI process during cleanup. Its
        // bundled ConPTY implementation avoids that helper and its noisy error.
        useConptyDll: process.platform === 'win32',
      });
      let terminal = '';
      let settled = false;
      let exited = false;
      let typed = false;
      let submitted = false;
      let settleTimer: NodeJS.Timeout | undefined;
      const finish = (result?: string) => {
        if (settled) return;
        settled = true;
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
            // The process may already have exited after rendering the Usage screen.
          }
        }
        resolve(result ?? terminal);
      };
      // Resolve with whatever was captured rather than rejecting: a screen that rendered the 5-hour
      // window but never the weekly one still carries a real reading, and retainKnownClaudeQuota
      // backfills the rest from the last known-good report. Rejecting discarded both and left the
      // provider on a transcript report that can be days old — a timeout is a partial read, not
      // proof that nothing was read.
      const timeout = setTimeout(() => finish(), 35_000);
      // The CLI's own render pace (boot, the slash-command autocomplete, and the Usage screen
      // itself) varies with system load on a machine that's also running everything else this
      // dashboard polls — a fixed delay before typing or before Enter loses the race under load
      // (confirmed live: sometimes Enter fired before typing was registered, leaving the session
      // stuck on the autocomplete dropdown; sometimes the typed text never landed at all within
      // 35s). Acting only once the terminal has gone genuinely quiet — and verifying each step
      // actually landed before advancing, retrying if not — adapts to however slow this run
      // happens to be instead of guessing a fixed number that's sometimes wrong.
      const advance = () => {
        const text = stripTerminalControls(terminal);
        if (!typed) {
          typed = true;
          pty.write('/usage');
          return;
        }
        if (!submitted) {
          if (!text.includes('/usage')) {
            // Previous write may not have landed yet — retry rather than assume it's lost. Ctrl+U
            // clears any partial line first, so a slow-but-not-lost echo can't leave "/usage/usage".
            pty.write('\x15/usage');
            return;
          }
          submitted = true;
          pty.write('\r');
          return;
        }
        // Re-arm on every chunk, not just ones that parse cleanly. The Usage screen redraws in
        // place as data streams in, and a redraw's header line can land in an earlier chunk than
        // its percentage line; checking only on successful parses left a stale timer free to fire
        // mid-redraw, capturing a header with no digits yet — which the parser reads as an
        // explicit "no limit" instead of "still rendering" (see parseClaudeUsageScreen/limitStatus).
        const quota = parseClaudeUsageScreen(terminal);
        if (quota.fiveHour && quota.weekly) finish(terminal);
      };
      pty.onData((chunk) => {
        terminal += chunk;
        clearTimeout(settleTimer);
        settleTimer = setTimeout(advance, 500);
      });
      pty.onExit(() => {
        exited = true;
        // Claude can close immediately after the final screen paint. Use the bytes already
        // delivered rather than discarding a complete report solely because the PTY closed first.
        if (!settled) finish(terminal);
      });
    });
    return parseClaudeUsageScreen(output);
  } catch {
    return { fiveHourStatus: 'unknown', weeklyStatus: 'unknown' };
  }
}

function usageReportsIn(value: unknown, reports: string[]): void {
  if (typeof value === 'string') {
    if (/Current\s*session/i.test(value) && /Current\s*week\s*\(\s*all\s*models\s*\)/i.test(value)) reports.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => usageReportsIn(entry, reports));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((entry) => usageReportsIn(entry, reports));
  }
}

/** The interactive CLI persists its rendered Usage report in session transcripts. This is a
 * fallback for a transient PTY failure, not a substitute for the live interactive probe. */
async function claudeTranscriptUsageSnapshot(): Promise<ClaudeQuota> {
  try {
    const projectsDir = path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'), 'projects');
    const files = await jsonlFiles(projectsDir);
    let latest: { at: Date; report: string } | undefined;
    await Promise.all(files.map(async (file) => {
      const fileInfo = await stat(file);
      if (Date.now() - fileInfo.mtimeMs > WEEKLY_MS) return;
      for (const line of (await readFile(file, 'utf8')).split('\n')) {
        try {
          const entry = JSON.parse(line) as { timestamp?: string };
          if (!entry.timestamp) continue;
          const at = new Date(entry.timestamp);
          if (Number.isNaN(at.getTime())) continue;
          const reports: string[] = [];
          usageReportsIn(entry, reports);
          for (const report of reports) {
            if (!latest || at > latest.at) latest = { at, report };
          }
        } catch {
          // A concurrently-written transcript can have one incomplete final line.
        }
      }
    }));
    return latest ? parseClaudeUsageScreen(latest.report, latest.at) : { fiveHourStatus: 'unknown', weeklyStatus: 'unknown' };
  } catch {
    return { fiveHourStatus: 'unknown', weeklyStatus: 'unknown' };
  }
}

export function claudeNextRefreshMs(data: UsageSnapshot | undefined, refreshMs: number, now = Date.now()): number {
  const cappedResets = [data?.fiveHour, data?.weekly]
    .filter((window): window is NonNullable<typeof window> => Boolean(window && window.usedPercent >= 100))
    .map((window) => Date.parse(window.resetsAt) - now)
    .filter((delay) => Number.isFinite(delay) && delay > 0);
  return cappedResets.length > 0 ? Math.max(...cappedResets) + 5_000 : refreshMs;
}

export function createClaudeUsageProvider(refreshMs: number, history: UsageHistoryStore): Provider<AiUsageToolData> {
  let rememberedQuota: ClaudeQuota | undefined;
  let loadedRememberedQuota = false;
  const rememberedHistory: { points: UsageHistoryPoint[] } = { points: [] };

  const loadRememberedQuota = async (): Promise<ClaudeQuota | undefined> => {
    if (loadedRememberedQuota) return rememberedQuota;
    loadedRememberedQuota = true;
    try {
      const snapshot = await history.getSnapshot('ai-usage-claude');
      if (snapshot?.asOf && (snapshot.fiveHour || snapshot.weekly || snapshot.modelWeekly)) {
        rememberedQuota = {
          fiveHour: snapshot.fiveHour,
          weekly: snapshot.weekly,
          modelWeekly: snapshot.modelWeekly,
          fiveHourStatus: snapshot.fiveHourStatus ?? (snapshot.fiveHour ? 'limited' : 'unknown'),
          weeklyStatus: snapshot.weeklyStatus ?? (snapshot.weekly ? 'limited' : 'unknown'),
          asOf: snapshot.asOf,
        };
      }
    } catch {
      // A history lookup must not turn a usable token-total snapshot into a provider failure.
    }
    return rememberedQuota;
  };

  return {
    id: 'ai-usage-claude',
    schema: aiUsageToolSchema,
    refreshMs,
    timeoutMs: 40_000,
    isConfigured: () => true,
    fetch: async () => {
      const [tokenTotals, liveQuota, transcriptQuota] = await Promise.all([
        claudeTokenTotals(), claudeInteractiveUsageSnapshot(), claudeTranscriptUsageSnapshot(),
      ]);
      const observedQuota = liveQuota.asOf ? liveQuota : transcriptQuota;
      // Always make the last-known-good baseline available for backfill — in-memory if we have it,
      // otherwise the shared Postgres snapshot. The old code only loaded the snapshot when the
      // observation had *no* `asOf`, so a partial-but-timestamped read (e.g. a transcript that carries
      // the 5-hour window but not weekly — common on Windows where the live probe under-renders) would
      // skip the baseline entirely and leave the missing window blank forever after a fresh start.
      const previousQuota = rememberedQuota ?? await loadRememberedQuota();
      const quota = retainKnownClaudeQuota(observedQuota, previousQuota);
      // Remember the *merged* quota, not the raw observation: a live read that captured one window
      // but not the other (common when the Usage screen is scraped mid-render, especially on Windows
      // conpty) still stamps `asOf`. Storing the raw partial here would drop the still-valid other
      // window from the baseline, so the next equally-partial read has nothing to backfill from and
      // that window vanishes for good. Persisting the merged result keeps each window alive until it
      // is either refreshed or genuinely past its reset (retainKnownClaudeQuota already gates on that).
      if (observedQuota.asOf) rememberedQuota = quota;
      const snapshot: UsageSnapshot = {
        available: Boolean(quota.asOf || tokenTotals.fiveHour || tokenTotals.weekly),
        fiveHour: quota.fiveHour,
        weekly: quota.weekly,
        modelWeekly: quota.modelWeekly,
        fiveHourStatus: quota.fiveHourStatus,
        weeklyStatus: quota.weeklyStatus,
        tokens: tokenTotals,
        asOf: quota.asOf ?? new Date().toISOString(),
      };
      return { ...snapshot, history: recordHistorySafely(history, 'ai-usage-claude', snapshot, rememberedHistory) };
    },
    nextRefreshMs: (data) => claudeNextRefreshMs(data, refreshMs),
  };
}
