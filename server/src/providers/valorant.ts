import { valorantSchema, type ValorantData, type ValorantMatch } from '@nohm/shared';
import type { Provider } from '../scheduler.js';
import type { ValorantHistoryStore } from '../valorantHistory.js';

const HD_API_BASE = 'https://api.henrikdev.xyz';
const RECENT_MATCHES_COUNT = 10;
const STORED_HISTORY_PAGE_SIZE = 100;
/** 3 normal calls + at most 13 stored-match and 13 MMR archive pages uses at most 29 requests of a 30-RPM key. */
const MAX_STORED_HISTORY_PAGES_PER_SYNC = 13;
const STORED_HISTORY_REFRESH_MS = 24 * 60 * 60_000;
const MATCH_HISTORY_CACHE_VERSION = 3;
/** The standard rank scheme UUID all current episodes share (Ascendant onward) — tier ids 0-27
 * are stable against it, so the icon URL can be built directly without an extra reference call. */
const COMPETITIVE_TIERS_UUID = '03621f52-342b-cf4e-4f86-9350a49c6d04';

export interface ValorantAuth {
  apiKey: string;
  name: string;
  tag: string;
  region: string;
}

interface RawAccount {
  puuid: string;
  region: string;
  account_level: number;
  name: string;
  tag: string;
  card: string;
}

interface RawTier {
  id: number;
  name: string;
}

interface RawMmr {
  current: {
    tier: RawTier;
    rr: number;
    last_change: number;
    leaderboard_placement: { rank: number } | null;
  };
  peak: {
    tier: RawTier;
    season?: { short: string };
  };
  seasonal: { season?: { short?: string }; wins: number; games: number }[];
}

interface RawMmrHistoryEntry {
  match_id: string;
  season?: { short?: string };
}

interface RawMatchPlayer {
  puuid: string;
  team_id: string;
  agent: { id: string; name: string };
  stats: {
    score: number;
    kills: number;
    deaths: number;
    assists: number;
    headshots: number;
    bodyshots: number;
    legshots: number;
    damage: { dealt: number; received: number };
  };
}

interface RawMatchTeam {
  team_id: string;
  won: boolean;
  rounds: { won: number; lost: number };
}

export interface RawMatch {
  metadata: {
    match_id: string;
    map: { name: string };
    queue: { name: string };
    started_at: string;
    game_length_in_ms?: number;
    season?: { short?: string };
  };
  teams: RawMatchTeam[];
  players: RawMatchPlayer[];
}

/** HenrikDev retains a separate, paginated archive of matches it has already indexed. It has a
 * simpler per-player shape than the live v4 response, but reports the archive total and can
 * extend farther back than the live match list. */
interface RawStoredMatch {
  meta: {
    id: string;
    map: { name: string };
    mode: string;
    started_at: string;
    season?: { short?: string };
  };
  stats: {
    team: string;
    character: { id?: string; name: string };
    score?: number;
    kills?: number;
    deaths?: number;
    assists?: number;
    shots?: { head?: number; body?: number; leg?: number };
    damage?: { dealt?: number; received?: number };
  };
  teams: { red: number; blue: number };
}

function tierIconUrl(tierId: number): string | undefined {
  return tierId > 0 ? `https://media.valorant-api.com/competitivetiers/${COMPETITIVE_TIERS_UUID}/${tierId}/smallicon.png` : undefined;
}

function agentIconUrl(agentId: string): string {
  return `https://media.valorant-api.com/agents/${agentId}/displayicon.png`;
}

function cardIconUrl(cardId: string): string {
  return `https://media.valorant-api.com/playercards/${cardId}/wideart.png`;
}

function cardBannerUrl(cardId: string): string {
  return `https://media.valorant-api.com/playercards/${cardId}/largeart.png`;
}

/** Auth failures never include the response body — HenrikDev's 401/403 text has echoed the
 * request path (which encodes the Riot ID) in the past, personal enough to keep out of logs. */
async function hdRequest<T>(signal: AbortSignal, apiKey: string, path: string, label: string): Promise<T> {
  const res = await fetch(`${HD_API_BASE}${path}`, {
    signal,
    headers: { Authorization: apiKey, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Valorant ${label} failed: HTTP ${res.status}`);
  const body = (await res.json()) as { data: T };
  return body.data;
}

interface HenrikPagedResponse<T> {
  data: T;
  results?: { total?: number };
  rateLimitRemaining?: number;
}

function rateLimitRemaining(headers: Headers): number | undefined {
  const legacyValue = headers.get('x-ratelimit-remaining');
  const legacy = legacyValue === null ? Number.NaN : Number(legacyValue);
  if (Number.isFinite(legacy)) return legacy;
  const draft = /(?:^|;)\s*r=(\d+)/.exec(headers.get('ratelimit') ?? '');
  return draft ? Number(draft[1]) : undefined;
}

async function hdPagedRequest<T>(signal: AbortSignal, apiKey: string, path: string, label: string): Promise<HenrikPagedResponse<T>> {
  const res = await fetch(`${HD_API_BASE}${path}`, {
    signal,
    headers: { Authorization: apiKey, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Valorant ${label} failed: HTTP ${res.status}`);
  return { ...(await res.json()) as HenrikPagedResponse<T>, rateLimitRemaining: rateLimitRemaining(res.headers) };
}

function appendQuery(path: string, params: Record<string, string | number>): string {
  const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]));
  return `${path}?${query.toString()}`;
}

/** Backfill a small sequential slice of the stored archive. The cursor is persisted, so a large
 * career fills in over subsequent daily syncs instead of spending the whole API minute at once. */
async function fetchStoredPages<T>(
  signal: AbortSignal,
  apiKey: string,
  path: string,
  label: string,
  startPage: number,
): Promise<{ data: T[]; total: number; nextPage: number; rateLimitRemaining?: number }> {
  const first = await hdPagedRequest<T[]>(signal, apiKey, appendQuery(path, { size: STORED_HISTORY_PAGE_SIZE, page: startPage }), label);
  const data = [...first.data];
  const total = Math.max(first.results?.total ?? data.length, data.length);
  const pageCount = Math.max(Math.ceil(total / STORED_HISTORY_PAGE_SIZE), 1);
  const lastPage = Math.min(startPage + MAX_STORED_HISTORY_PAGES_PER_SYNC - 1, pageCount);
  let lastFetchedPage = startPage;
  let remaining = first.rateLimitRemaining;
  for (let page = startPage + 1; page <= lastPage && (remaining === undefined || remaining > 3); page += 1) {
    const next = await hdPagedRequest<T[]>(signal, apiKey, appendQuery(path, { size: STORED_HISTORY_PAGE_SIZE, page }), label);
    data.push(...next.data);
    lastFetchedPage = page;
    remaining = next.rateLimitRemaining;
  }
  return { data, total, nextPage: lastFetchedPage >= pageCount ? 1 : lastFetchedPage + 1, rateLimitRemaining: remaining };
}

export function mapMatch(match: RawMatch, puuid: string): ValorantMatch | undefined {
  const me = match.players.find((player) => player.puuid === puuid);
  if (!me) return undefined;
  const myTeam = match.teams.find((team) => team.team_id === me.team_id);
  let result: ValorantMatch['result'] = 'draw';
  if (myTeam !== undefined) result = myTeam.won ? 'win' : 'loss';
  const teammateScores = match.players.filter((player) => player.team_id === me.team_id).map((player) => player.stats.score);
  const allScores = match.players.map((player) => player.stats.score);
  return {
    matchId: match.metadata.match_id,
    map: match.metadata.map.name,
    mode: match.metadata.queue?.name ?? 'Unknown',
    startedAt: match.metadata.started_at,
    ...(match.metadata.game_length_in_ms === undefined
      ? {}
      : { durationSeconds: Math.round(match.metadata.game_length_in_ms / 1000) }),
    result,
    roundsWon: myTeam?.rounds.won,
    roundsLost: myTeam?.rounds.lost,
    agentName: me.agent.name,
    agentIconUrl: agentIconUrl(me.agent.id),
    score: me.stats.score,
    kills: me.stats.kills,
    deaths: me.stats.deaths,
    assists: me.stats.assists,
    headshots: me.stats.headshots,
    bodyshots: me.stats.bodyshots,
    legshots: me.stats.legshots,
    damageDealt: me.stats.damage.dealt,
    damageReceived: me.stats.damage.received,
    actShort: match.metadata.season?.short,
    isMatchMvp: me.stats.score === Math.max(...allScores),
    isTeamMvp: me.stats.score === Math.max(...teammateScores),
  };
}

function mapStoredMatch(match: RawStoredMatch): ValorantMatch {
  const team = match.stats.team.toLowerCase();
  const myRounds = team === 'red' ? match.teams.red : match.teams.blue;
  const opponentRounds = team === 'red' ? match.teams.blue : match.teams.red;
  let result: ValorantMatch['result'] = 'draw';
  if (myRounds !== opponentRounds) result = myRounds > opponentRounds ? 'win' : 'loss';
  return {
    matchId: match.meta.id,
    map: match.meta.map.name,
    mode: match.meta.mode,
    startedAt: match.meta.started_at,
    result,
    roundsWon: myRounds,
    roundsLost: opponentRounds,
    agentName: match.stats.character.name,
    agentIconUrl: match.stats.character.id ? agentIconUrl(match.stats.character.id) : undefined,
    // Older HenrikDev archive rows can omit combat breakdowns. Retain the match instead of
    // invalidating the whole provider response; unavailable values are represented as zero.
    score: match.stats.score ?? 0,
    kills: match.stats.kills ?? 0,
    deaths: match.stats.deaths ?? 0,
    assists: match.stats.assists ?? 0,
    headshots: match.stats.shots?.head ?? 0,
    bodyshots: match.stats.shots?.body ?? 0,
    legshots: match.stats.shots?.leg ?? 0,
    damageDealt: match.stats.damage?.dealt ?? 0,
    damageReceived: match.stats.damage?.received ?? 0,
    actShort: match.meta.season?.short,
    // The stored-match response only contains this player's statistics, so MVP status cannot
    // be derived without a separate match-detail request for every archived match.
    isMatchMvp: false,
    isTeamMvp: false,
  };
}

export function mergeMatches(...groups: ValorantMatch[][]): ValorantMatch[] {
  const byId = new Map<string, ValorantMatch>();
  for (const match of groups.flat()) {
    const existing = byId.get(match.matchId);
    byId.set(match.matchId, existing ? { ...existing, ...match, actShort: match.actShort ?? existing.actShort } : match);
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

function attachMmrActs(matches: ValorantMatch[], history: RawMmrHistoryEntry[]): ValorantMatch[] {
  const acts = new Map(history.map((entry) => [entry.match_id, entry.season?.short]));
  return matches.map((match) => ({ ...match, actShort: match.actShort ?? acts.get(match.matchId) }));
}

function isHistoryFresh(history: { fetchedAt: string; sourceVersion: number; nextPage?: number }): boolean {
  /* An unfinished archive should advance with the provider's normal ten-minute refresh rather
   * than idling for a day. Once a short page resets the cursor to one, a daily rescan is enough. */
  return history.sourceVersion === MATCH_HISTORY_CACHE_VERSION
    && (history.nextPage ?? 1) === 1
    && Date.now() - Date.parse(history.fetchedAt) < STORED_HISTORY_REFRESH_MS;
}

export function createValorantProvider(auth: ValorantAuth | undefined, historyStore?: ValorantHistoryStore): Provider<ValorantData> {
  return {
    id: 'valorant',
    schema: valorantSchema,
    refreshMs: 10 * 60_000,
    timeoutMs: 20_000,
    isConfigured: () => auth !== undefined,
    loadCached: () => historyStore?.getSnapshot() ?? Promise.resolve(undefined),
    async fetch(signal) {
      if (!auth) throw new Error('valorant is not configured');
      const { apiKey, name, tag, region } = auth;

      const account = await hdRequest<RawAccount>(signal, apiKey, `/valorant/v2/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`, 'GetAccount');
      const [mmr, matches, cachedHistory] = await Promise.all([
        hdRequest<RawMmr>(
          signal,
          apiKey,
          `/valorant/v3/mmr/${region}/pc/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
          'GetMmr',
        ),
        hdRequest<RawMatch[]>(
          signal,
          apiKey,
          `/valorant/v4/matches/${region}/pc/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?size=${RECENT_MATCHES_COUNT}`,
          'GetMatches',
        ),
        historyStore?.get(),
      ]);

      const currentSeason = mmr.seasonal.at(-1);
      const currentActShort = currentSeason?.season?.short;
      const recentMatches = matches.map((match) => mapMatch(match, account.puuid)).filter((match): match is ValorantMatch => match !== undefined);
      let storedHistory = cachedHistory;

      if (!storedHistory || !isHistoryFresh(storedHistory)) {
        try {
          const startPage = storedHistory?.nextPage ?? 1;
          const storedMatches = await fetchStoredPages<RawStoredMatch>(
            signal,
            apiKey,
            `/valorant/v1/stored-matches/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
            'GetStoredMatches',
            startPage,
          );
          let storedMmrHistory: RawMmrHistoryEntry[] = [];
          if (storedMatches.rateLimitRemaining === undefined || storedMatches.rateLimitRemaining > 3) {
            try {
              storedMmrHistory = (await fetchStoredPages<RawMmrHistoryEntry>(
                signal,
                apiKey,
                `/valorant/v2/stored-mmr-history/${region}/pc/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
                'GetStoredMmrHistory',
                startPage,
              )).data;
            } catch {
              // Archive match data is still useful when HenrikDev has no stored MMR rows yet.
            }
          }
          const archivedMatches = attachMmrActs(
            storedMatches.data.map(mapStoredMatch),
            storedMmrHistory,
          );
          const mergedMatches = mergeMatches(storedHistory?.matches ?? [], archivedMatches);
          storedHistory = await historyStore?.set({
            matches: mergedMatches,
            totalMatchesAvailable: Math.max(storedMatches.total, mergedMatches.length),
            nextPage: storedMatches.nextPage,
            sourceVersion: MATCH_HISTORY_CACHE_VERSION,
          }) ?? {
            matches: mergedMatches,
            totalMatchesAvailable: Math.max(storedMatches.total, mergedMatches.length),
            fetchedAt: new Date().toISOString(),
            nextPage: storedMatches.nextPage,
            sourceVersion: MATCH_HISTORY_CACHE_VERSION,
          };
        } catch {
          // The normal ten-match view remains useful when the optional archive is temporarily
          // unavailable; preserve the previous archive instead of failing the whole widget.
        }
      }

      let historyMatches = mergeMatches(storedHistory?.matches ?? [], recentMatches);
      const storedById = new Map((storedHistory?.matches ?? []).map((match) => [match.matchId, match]));
      const hasUnpersistedRecentDetails = recentMatches.some((match) => {
        const stored = storedById.get(match.matchId);
        return !stored || stored.agentName === '';
      });
      if (historyStore && storedHistory && hasUnpersistedRecentDetails) {
        storedHistory = await historyStore.set({
          matches: historyMatches,
          totalMatchesAvailable: Math.max(storedHistory.totalMatchesAvailable, historyMatches.length),
          nextPage: storedHistory.nextPage,
          sourceVersion: storedHistory.sourceVersion,
        });
        historyMatches = storedHistory.matches;
      }
      const data: ValorantData = {
        profile: {
          name: account.name,
          tag: account.tag,
          region: account.region,
          accountLevel: account.account_level,
          cardIconUrl: account.card ? cardIconUrl(account.card) : undefined,
          cardBannerUrl: account.card ? cardBannerUrl(account.card) : undefined,
        },
        rank: {
          tierId: mmr.current.tier.id,
          tierName: mmr.current.tier.name,
          tierIconUrl: tierIconUrl(mmr.current.tier.id),
          rr: mmr.current.rr,
          lastChange: mmr.current.last_change,
          leaderboardRank: mmr.current.leaderboard_placement?.rank,
        },
        peak: {
          tierName: mmr.peak.tier.name,
          tierIconUrl: tierIconUrl(mmr.peak.tier.id),
          seasonShort: mmr.peak.season?.short,
        },
        currentSeason: currentSeason ? { wins: currentSeason.wins, games: currentSeason.games } : undefined,
        recentMatches,
        history: {
          matches: historyMatches,
          totalMatchesAvailable: Math.max(storedHistory?.totalMatchesAvailable ?? 0, historyMatches.length),
          fetchedAt: storedHistory?.fetchedAt ?? new Date().toISOString(),
          currentActShort,
        },
      };

      const parsed = valorantSchema.parse(data);
      // Best-effort: a dropped snapshot write must not blank data that HenrikDev already gave us.
      await historyStore?.setSnapshot(parsed).catch(() => undefined);
      return parsed;
    },
  };
}
