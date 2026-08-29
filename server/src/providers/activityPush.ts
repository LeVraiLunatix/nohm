import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { activityPushSchema, clashRoyaleSchema, type ActivityPushData, type ClashRoyaleData } from '@nohm/shared';
import type { Provider } from '../scheduler.js';
import { jsonlFiles } from './aiUsage/index.js';
import { readValorantLive } from './valorantPresence.js';
import { readMinecraftLive } from './minecraftPresence.js';
import { readRocketLeagueLive } from './rocketLeaguePresence.js';
import type { ClashOfClansCounters, ClashOfClansMilestoneBaseline, ClashOfClansStateStore } from '../clashOfClansState.js';
import {
  currentClashOfClansLeagueWar,
  currentClashOfClansWar,
  fetchClashOfClansPlayer,
  fetchLatestClashOfClansRaidSeason,
  type ClashOfClansAuth,
  type RawClashOfClansPlayer,
} from './clashOfClansApi.js';

export type { ClashOfClansAuth } from './clashOfClansApi.js';

const execFileAsync = promisify(execFile);
const CLAUDE_ACTIVITY_WINDOW_MS = 10 * 60_000;

/** `pgrep -f` matches against the full command line, so this also catches the launcher when it's
 * backgrounded under Login Items rather than run interactively. */
async function isProcessRunning(pattern: string): Promise<boolean> {
  try {
    await execFileAsync('pgrep', ['-f', pattern]);
    return true;
  } catch {
    // pgrep exits 1 when nothing matches — indistinguishable here from "not installed", which is
    // the correct behavior either way (nothing to report).
    return false;
  }
}

async function newestMtime(directory: string): Promise<Date | undefined> {
  try {
    const files = await jsonlFiles(directory);
    const mtimes = await Promise.all(files.map(async (file) => (await stat(file)).mtime));
    return mtimes.sort((a, b) => b.getTime() - a.getTime())[0];
  } catch {
    return undefined;
  }
}

/** Claude continues appending housekeeping records (for example `away_summary`) after a person
 * stops interacting with a session. File mtime therefore represents Claude's bookkeeping, not
 * coding activity. Only a real user turn should refresh the public activity signal. */
async function newestClaudeUserPromptAt(directory: string): Promise<Date | undefined> {
  try {
    const files = await jsonlFiles(directory);
    const recentFiles = (await Promise.all(files.map(async (file) => {
      const info = await stat(file);
      return Date.now() - info.mtimeMs <= CLAUDE_ACTIVITY_WINDOW_MS ? file : undefined;
    }))).filter((file): file is string => file !== undefined);
    const timestamps = await Promise.all(recentFiles.map(async (file) => {
      const entries = (await readFile(file, 'utf8')).split('\n');
      let newest: Date | undefined;
      for (const line of entries) {
        try {
          const entry = JSON.parse(line) as { type?: unknown; timestamp?: unknown };
          if (entry.type !== 'user' || typeof entry.timestamp !== 'string') continue;
          const at = new Date(entry.timestamp);
          if (!Number.isNaN(at.getTime()) && (!newest || at > newest)) newest = at;
        } catch {
          // A live transcript can have one incomplete final line.
        }
      }
      return newest;
    }));
    return timestamps.filter((at): at is Date => at !== undefined).sort((a, b) => b.getTime() - a.getTime())[0];
  } catch {
    return undefined;
  }
}

async function claudeLastActiveAt(): Promise<string | null> {
  const dir = path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'), 'projects');
  const userPromptAt = await newestClaudeUserPromptAt(dir);
  return userPromptAt?.toISOString() ?? null;
}

async function codexLastActiveAt(): Promise<string | null> {
  const dir = path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'sessions');
  const mtime = await newestMtime(dir);
  return mtime?.toISOString() ?? null;
}

export interface PushedClashRoyaleActivity {
  result: 'win' | 'loss' | 'draw';
  crownsFor: number;
  crownsAgainst: number;
  timestamp: string;
}

/** The dashboard scheduler has already fetched and validated this data using the configured
 * Supercell key. Batabiboing receives only the display-safe latest battle summary. */
export function latestClashRoyaleActivity(data: Pick<ClashRoyaleData, 'recentBattles'> | undefined): PushedClashRoyaleActivity | null {
  const battle = data?.recentBattles[0];
  return battle
    ? {
        result: battle.result,
        crownsFor: battle.crownsFor,
        crownsAgainst: battle.crownsAgainst,
        timestamp: battle.battleTime,
      }
    : null;
}

export interface PushedClashOfClansAttack {
  stars: number;
  destructionPercentage: number;
  defenderTownHall?: number;
  timestamp: string;
}

/** Finds the player's most recent war attack — the last entry in their `attacks` array, since
 * Supercell doesn't timestamp individual attacks, only orders them — paired with a stable identity
 * (`defenderTag:order`) the caller uses to detect whether this is the same attack already pushed.
 * Falls back to the current Clan War League round when classic war reports `notInWar`. Returns null
 * for every "nothing to report" case (no clan, no war, no attacks yet) and only throws for a
 * genuine request failure. */
export async function latestClashOfClansAttack(
  signal: AbortSignal,
  apiKey: string,
  player: Pick<RawClashOfClansPlayer, 'tag' | 'clan'>,
): Promise<{ attack: PushedClashOfClansAttack; key: string } | null> {
  if (!player.clan?.tag) return null;
  const clanTag = player.clan.tag;

  let war = await currentClashOfClansWar(signal, apiKey, clanTag);
  if (war?.state === 'notInWar') war = await currentClashOfClansLeagueWar(signal, apiKey, clanTag);

  const member = war?.clan.members.find((candidate) => candidate.tag === player.tag);
  const attack = member?.attacks?.at(-1);
  if (!attack) return null;

  const defenderTownHall = war?.opponent.members.find((candidate) => candidate.tag === attack.defenderTag)?.townhallLevel;
  return {
    attack: {
      stars: attack.stars,
      destructionPercentage: attack.destructionPercentage,
      defenderTownHall,
      // CoC's war API never timestamps individual attacks — this is "when the poller noticed it",
      // not when the attack happened. Same limitation as Clash Royale's battleTime reliance, just
      // one step further removed from the source.
      timestamp: new Date().toISOString(),
    },
    key: `${attack.defenderTag}:${attack.order}`,
  };
}

export interface PushedClashOfClansRaidAttack {
  stars: number;
  destructionPercentage: number;
  defenderClanName: string;
  districtName: string;
  timestamp: string;
}

/** Capital Raid attacks carry no order or timestamp field at all (war at least has `order`). A
 * same-attacker, same-district attack sequence in a live response showed destruction climbing
 * towards the *end* of its `attacks` array (20% -> 47% -> 100%) — only sensible read newest-first —
 * so this treats `attacks[0]` as most recent, and assumes (unverified beyond that one sample) the
 * same newest-first convention holds for `attackLog`/`districts` ordering too. Worth re-checking
 * against a real raid weekend if a pushed "last raid attack" ever looks stale. */
export async function latestClashOfClansRaidAttack(
  signal: AbortSignal,
  apiKey: string,
  player: Pick<RawClashOfClansPlayer, 'tag' | 'clan'>,
): Promise<{ attack: PushedClashOfClansRaidAttack; key: string } | null> {
  if (!player.clan?.tag) return null;
  const season = await fetchLatestClashOfClansRaidSeason(signal, apiKey, player.clan.tag);
  if (!season) return null;

  for (const entry of season.attackLog) {
    for (const district of entry.districts) {
      const attack = district.attacks?.find((candidate) => candidate.attacker.tag === player.tag);
      if (!attack) continue;
      return {
        attack: {
          stars: attack.stars,
          destructionPercentage: attack.destructionPercent,
          defenderClanName: entry.defender.name,
          districtName: district.name,
          timestamp: new Date().toISOString(),
        },
        key: `${entry.defender.tag}:${district.id}:${attack.destructionPercent}:${attack.stars}`,
      };
    }
  }
  return null;
}

function extractClashOfClansCounters(player: RawClashOfClansPlayer): ClashOfClansCounters {
  return {
    donations: player.donations,
    clanCapitalContributions: player.clanCapitalContributions,
    attackWins: player.attackWins,
    warStars: player.warStars,
  };
}

export interface PushedClashOfClansCounterActivity {
  type: 'warStars' | 'attackWins' | 'clanCapitalContributions' | 'donations';
  delta: number;
  timestamp: string;
}

/** Priority when several counters tick up in the same 60s poll — a war attack is already covered
 * in more detail by `latestClashOfClansAttack`, so it ranks first here mainly so a tie doesn't lose
 * it to a less interesting counter; then a multiplayer win, then capital gold, then troop
 * donations, from most to least noteworthy. */
const COUNTER_ACTIVITY_PRIORITY: (keyof ClashOfClansCounters)[] = ['warStars', 'attackWins', 'clanCapitalContributions', 'donations'];

/** `donations`/`attackWins` reset each season and `clanCapitalContributions`/`warStars` never do,
 * but the same rule handles both: only an *increase* is activity. A drop is a season reset, not
 * evidence of nothing happening — trophies aren't in this set at all, since they move from being
 * defended against while offline just as easily as from a player's own attacks.
 *
 * `sinceKnownAt` (the previous successful fetch's time, not "now") is used as the event's
 * timestamp: the counter could have ticked up anywhere in the gap between that fetch and this one,
 * and normally that gap is ~60s so it makes no visible difference — but after real downtime (the
 * machine asleep/off for an hour) stamping "now" would claim something that may have happened an
 * hour ago just happened, which is exactly backwards from what a "last active" timestamp should do. */
function detectClashOfClansCounterActivity(
  previous: ClashOfClansCounters,
  current: ClashOfClansCounters,
  sinceKnownAt: string,
): PushedClashOfClansCounterActivity | undefined {
  const type = COUNTER_ACTIVITY_PRIORITY.find((key) => current[key] > previous[key]);
  return type ? { type, delta: current[type] - previous[type], timestamp: sinceKnownAt } : undefined;
}

export interface PushedClashOfClansMilestone {
  type: 'townHallLevel' | 'builderHallLevel' | 'bestTrophies' | 'bestBuilderBaseTrophies' | 'leagueTier' | 'builderBaseLeague';
  value: number | string;
  timestamp: string;
}

function extractClashOfClansMilestoneBaseline(player: RawClashOfClansPlayer): ClashOfClansMilestoneBaseline {
  return {
    townHallLevel: player.townHallLevel,
    builderHallLevel: player.builderHallLevel,
    bestTrophies: player.bestTrophies,
    bestBuilderBaseTrophies: player.bestBuilderBaseTrophies,
    leagueTierName: player.leagueTier?.name,
    builderBaseLeagueName: player.builderBaseLeague?.name,
  };
}

export function detectClashOfClansMilestones(
  previous: ClashOfClansMilestoneBaseline,
  current: ClashOfClansMilestoneBaseline,
): PushedClashOfClansMilestone[] {
  const timestamp = new Date().toISOString();
  const milestones: PushedClashOfClansMilestone[] = [];
  if (current.townHallLevel > previous.townHallLevel) milestones.push({ type: 'townHallLevel', value: current.townHallLevel, timestamp });
  if (current.builderHallLevel !== undefined && current.builderHallLevel > (previous.builderHallLevel ?? 0)) {
    milestones.push({ type: 'builderHallLevel', value: current.builderHallLevel, timestamp });
  }
  if (current.bestTrophies > previous.bestTrophies) milestones.push({ type: 'bestTrophies', value: current.bestTrophies, timestamp });
  if (current.bestBuilderBaseTrophies !== undefined && current.bestBuilderBaseTrophies > (previous.bestBuilderBaseTrophies ?? 0)) {
    milestones.push({ type: 'bestBuilderBaseTrophies', value: current.bestBuilderBaseTrophies, timestamp });
  }
  if (current.leagueTierName !== undefined && previous.leagueTierName !== undefined && current.leagueTierName !== previous.leagueTierName) {
    milestones.push({ type: 'leagueTier', value: current.leagueTierName, timestamp });
  }
  if (
    current.builderBaseLeagueName !== undefined
    && previous.builderBaseLeagueName !== undefined
    && current.builderBaseLeagueName !== previous.builderBaseLeagueName
  ) {
    milestones.push({ type: 'builderBaseLeague', value: current.builderBaseLeagueName, timestamp });
  }
  return milestones;
}

interface ClashOfClansActivitySnapshot {
  attack: PushedClashOfClansAttack | null;
  attackKey: string | undefined;
  raidAttack: PushedClashOfClansRaidAttack | null;
  raidKey: string | undefined;
  milestones: PushedClashOfClansMilestone[];
  newMilestoneBaseline: ClashOfClansMilestoneBaseline;
  counters: ClashOfClansCounters;
  counterActivity: PushedClashOfClansCounterActivity | undefined;
  activeAt: string | undefined;
}

/** Everything the provider's `fetch` needs from Clash of Clans, in one lookup — pulled out so a
 * hiccup here (auth or network) can be caught in one place without inflating the
 * cognitive complexity of the tick that also handles Epic/Claude/Codex/Clash Royale. Returns null
 * on any failure; the caller then just keeps whatever state it already had. */
async function fetchClashOfClansActivity(
  signal: AbortSignal,
  clashOfClans: ClashOfClansAuth,
  previous: {
    counters: ClashOfClansCounters | undefined;
    milestoneBaseline: ClashOfClansMilestoneBaseline | undefined;
    attackKey: string | undefined;
    raidKey: string | undefined;
    lastCheckedAt: string | null;
  },
): Promise<ClashOfClansActivitySnapshot | null> {
  try {
    const player = await fetchClashOfClansPlayer(signal, clashOfClans.apiKey, clashOfClans.playerTag);

    // Cheap, single-fetch signals first, so a later failure (war/raid lookups) never loses them.
    const counters = extractClashOfClansCounters(player);
    // No prior successful fetch to bound the gap against (first run ever) — "now" is the best
    // available answer, same as before this fix.
    const counterActivity = previous.counters
      ? detectClashOfClansCounterActivity(previous.counters, counters, previous.lastCheckedAt ?? new Date().toISOString())
      : undefined;
    const activeAt = counterActivity?.timestamp;

    // No baseline yet means this is the first tick ever — seed silently rather than reporting
    // every existing TH level/league/trophy record as a fresh "milestone" on startup.
    const newMilestoneBaseline = extractClashOfClansMilestoneBaseline(player);
    const milestones = previous.milestoneBaseline
      ? detectClashOfClansMilestones(previous.milestoneBaseline, newMilestoneBaseline)
      : [];

    const [attack, raidAttack] = await Promise.all([
      latestClashOfClansAttack(signal, clashOfClans.apiKey, player),
      latestClashOfClansRaidAttack(signal, clashOfClans.apiKey, player),
    ]);

    return {
      attack: attack && attack.key !== previous.attackKey ? attack.attack : null,
      attackKey: attack && attack.key !== previous.attackKey ? attack.key : undefined,
      raidAttack: raidAttack && raidAttack.key !== previous.raidKey ? raidAttack.attack : null,
      raidKey: raidAttack && raidAttack.key !== previous.raidKey ? raidAttack.key : undefined,
      milestones,
      newMilestoneBaseline,
      counters,
      counterActivity,
      activeAt,
    };
  } catch (err) {
    // A Clash of Clans hiccup (auth or network) should never block the other signals
    // this provider pushes every minute.
    console.warn(`[activity-push] Clash of Clans lookup failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    return null;
  }
}

export function createActivityPushProvider(
  push: { url: string; secret: string } | undefined,
  getClashRoyaleData: () => unknown = () => undefined,
  clashOfClans?: ClashOfClansAuth,
  clashOfClansState?: ClashOfClansStateStore,
): Provider<ActivityPushData> {
  // The attack/raid keys and milestone baseline are only committed after a push actually succeeds
  // (see below), so a failed POST doesn't cause the next event to be silently skipped as "already
  // sent". The counters and activity timestamp are persisted status, not one-shot events — every
  // tick resends whatever's current, so they're safe to update immediately.
  let lastPushedClashOfClansAttackKey: string | undefined;
  let lastPushedClashOfClansRaidKey: string | undefined;
  let clashOfClansMilestoneBaseline: ClashOfClansMilestoneBaseline | undefined;
  let clashOfClansCounters: ClashOfClansCounters | undefined;
  let clashOfClansLastActiveAt: string | null = null;
  /** When `clashOfClansCounters` was last confirmed accurate — the honest lower bound for the next
   * counter-activity event's timestamp (see detectClashOfClansCounterActivity). */
  let clashOfClansLastCheckedAt: string | null = null;

  // Without this, a process restart resets all of the above to undefined, which makes the very
  // next tick treat whatever war attack/raid attack is already on record as brand new — re-stamping
  // it with the current time and re-pushing it to Batabiboing, which then displays the same stale
  // event with a timestamp that looks fresh. Loaded once, lazily, before the first fetch.
  let stateLoaded: Promise<void> | undefined;
  function ensureClashOfClansStateLoaded(): Promise<void> {
    if (!clashOfClansState) return Promise.resolve();
    stateLoaded ??= clashOfClansState
      .get()
      .then((state) => {
        if (!state) return;
        lastPushedClashOfClansAttackKey = state.attackKey;
        lastPushedClashOfClansRaidKey = state.raidKey;
        clashOfClansMilestoneBaseline = state.milestoneBaseline;
        clashOfClansCounters = state.counters;
        clashOfClansLastActiveAt = state.lastActiveAt;
        clashOfClansLastCheckedAt = state.lastCheckedAt ?? null;
      })
      .catch((err) => {
        // A DB hiccup here must not block the Claude/Codex/Epic signals this provider pushes
        // every minute — leave stateLoaded unset so the next tick retries once the DB recovers.
        console.warn(`[activity-push] Could not load Clash of Clans state: ${err instanceof Error ? err.message : 'unknown error'}`);
        stateLoaded = undefined;
      });
    return stateLoaded;
  }

  /** Commits a successfully-pushed attack/raid/milestone into the closure state that the next
   * tick's dedup check reads — pulled out of `fetch` to keep its cognitive complexity down. */
  function commitClashOfClansActivity(cocActivity: ClashOfClansActivitySnapshot | null): void {
    if (!cocActivity) return;
    if (cocActivity.attackKey) lastPushedClashOfClansAttackKey = cocActivity.attackKey;
    if (cocActivity.raidKey) lastPushedClashOfClansRaidKey = cocActivity.raidKey;
    clashOfClansMilestoneBaseline = cocActivity.newMilestoneBaseline;
  }

  async function persistClashOfClansState(): Promise<void> {
    if (!clashOfClansState || !clashOfClans) return;
    try {
      await clashOfClansState.set({
        attackKey: lastPushedClashOfClansAttackKey,
        raidKey: lastPushedClashOfClansRaidKey,
        milestoneBaseline: clashOfClansMilestoneBaseline,
        counters: clashOfClansCounters,
        lastActiveAt: clashOfClansLastActiveAt,
        lastCheckedAt: clashOfClansLastCheckedAt,
      });
    } catch (err) {
      console.warn(`[activity-push] Could not persist Clash of Clans state: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  return {
    id: 'activity-push',
    schema: activityPushSchema,
    refreshMs: 60_000,
    timeoutMs: 10_000,
    isConfigured: () => push !== undefined,
    async fetch(signal) {
      if (!push) throw new Error('activity push is not configured');
      if (clashOfClans) await ensureClashOfClansStateLoaded();
      const [epicRunning, claudeActiveAt, codexActiveAt, valorantLive, minecraftLive, rocketLeagueLive] = await Promise.all([
        isProcessRunning('Epic Games Launcher'),
        claudeLastActiveAt(),
        codexLastActiveAt(),
        readValorantLive(signal),
        readMinecraftLive(),
        readRocketLeagueLive(),
      ]);
      const clashRoyale = clashRoyaleSchema.safeParse(getClashRoyaleData());

      const cocActivity = clashOfClans
        ? await fetchClashOfClansActivity(signal, clashOfClans, {
            counters: clashOfClansCounters,
            milestoneBaseline: clashOfClansMilestoneBaseline,
            attackKey: lastPushedClashOfClansAttackKey,
            raidKey: lastPushedClashOfClansRaidKey,
            lastCheckedAt: clashOfClansLastCheckedAt,
          })
        : null;
      if (cocActivity) {
        clashOfClansCounters = cocActivity.counters;
        if (cocActivity.activeAt) clashOfClansLastActiveAt = cocActivity.activeAt;
        clashOfClansLastCheckedAt = new Date().toISOString();
      }

      const res = await fetch(push.url, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${push.secret}`,
        },
        body: JSON.stringify({
          machine: os.hostname(),
          epicRunning,
          claudeActiveAt,
          codexActiveAt,
          clashRoyale: latestClashRoyaleActivity(clashRoyale.success ? clashRoyale.data : undefined),
          clashOfClans: cocActivity?.attack ?? null,
          clashOfClansRaidAttack: cocActivity?.raidAttack ?? null,
          clashOfClansCounterActivity: cocActivity?.counterActivity ?? null,
          clashOfClansLastActiveAt,
          clashOfClansMilestones: cocActivity?.milestones ?? [],
          valorantLive,
          minecraftLive,
          rocketLeagueLive,
        }),
      });
      if (!res.ok) throw new Error(`activity push failed: HTTP ${res.status}`);
      commitClashOfClansActivity(cocActivity);
      await persistClashOfClansState();

      return { lastPushedAt: new Date().toISOString(), lastPushOk: true, valorantLive, minecraftLive, rocketLeagueLive };
    },
  };
}
