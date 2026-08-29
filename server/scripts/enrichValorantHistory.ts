// Resumable private-history enrichment. Riot's official data export supplies complete match IDs
// but no map, agent, scoreline, or combat stats. HenrikDev's match-by-ID endpoint can recover a
// full payload for some of those IDs. This script fills only sparse imported rows, checkpoints
// successful matches into the existing DB cache, and remembers confirmed 404s in server/.tokens
// so interrupted runs do not waste the account's API allowance by starting over.
//
// Private IDs and raw responses stay in ignored local state. Console output is aggregate only.
import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { ValorantMatch } from '@nohm/shared';
import { createDatabase } from '../src/db/client.js';
import { mapMatch, mergeMatches } from '../src/providers/valorant.js';
import { ValorantHistoryStore, type ValorantHistoryCache } from '../src/valorantHistory.js';

const API_BASE = 'https://api.henrikdev.xyz';
const DEFAULT_DELAY_MS = 3_200;
const CHECKPOINT_EVERY = 10;
const stateSchema = z.object({
  unavailableMatchIds: z.array(z.string()).default([]),
  updatedAt: z.string().optional(),
});

interface HenrikResponse<T> {
  status?: number;
  data?: T;
}

function numericArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  const parsed = raw === undefined ? fallback : Number(raw);
  if ((raw !== undefined && !Number.isFinite(parsed)) || parsed < 0) throw new Error(`--${name} must be a non-negative number`);
  return parsed;
}

export function stratifiedSamples<T extends { startedAt: string }>(matches: T[], perYear: number): T[] {
  if (perYear <= 0) return matches;
  const byYear = new Map<number, T[]>();
  for (const match of matches) {
    const year = new Date(match.startedAt).getUTCFullYear();
    const group = byYear.get(year) ?? [];
    group.push(match);
    byYear.set(year, group);
  }
  return [...byYear.entries()]
    .sort(([yearA], [yearB]) => yearB - yearA)
    .flatMap(([, group]) => {
      const count = Math.min(perYear, group.length);
      if (count === 1) return [group[Math.floor(group.length / 2)]!];
      return Array.from({ length: count }, (_, index) => group[Math.round(index * (group.length - 1) / (count - 1))]!);
    });
}

function readState(path: string): z.infer<typeof stateSchema> {
  try {
    return stateSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { unavailableMatchIds: [] };
    throw error;
  }
}

function writeState(path: string, unavailableMatchIds: Set<string>): void {
  writeFileSync(path, JSON.stringify({
    unavailableMatchIds: [...unavailableMatchIds],
    updatedAt: new Date().toISOString(),
  }, null, 2));
}

function checkpoint(
  historyStore: ValorantHistoryStore,
  history: ValorantHistoryCache,
): Promise<ValorantHistoryCache> {
  return historyStore.set({
    matches: history.matches,
    totalMatchesAvailable: history.totalMatchesAvailable,
    nextPage: history.nextPage,
    sourceVersion: history.sourceVersion,
  });
}

async function pause(ms: number): Promise<void> {
  await new Promise((resolvePause) => setTimeout(resolvePause, ms));
}

interface EnrichOptions {
  databaseUrl: string;
  apiKey: string;
  name: string;
  tag: string;
  region: string;
  delayMs: number;
  maxRequests: number;
  samplePerYear: number;
}

function parseOptions(argv: string[], env: NodeJS.ProcessEnv): EnrichOptions {
  if (!argv.includes('--apply')) {
    throw new Error('Pass --apply to confirm private match-ID requests and DB checkpoints.');
  }

  const databaseUrl = env.DATABASE_URL;
  const apiKey = env.HENRIKDEV_API_KEY;
  const riotId = env.RIOT_ID;
  if (!databaseUrl || !apiKey || !riotId) {
    throw new Error('DATABASE_URL, HENRIKDEV_API_KEY, and RIOT_ID must be configured.');
  }

  const separator = riotId.lastIndexOf('#');
  if (separator < 1 || separator === riotId.length - 1) throw new Error('RIOT_ID must be in Name#Tag form.');

  return {
    databaseUrl,
    apiKey,
    name: riotId.slice(0, separator),
    tag: riotId.slice(separator + 1),
    region: env.RIOT_REGION || 'eu',
    delayMs: numericArg('delay-ms', DEFAULT_DELAY_MS),
    maxRequests: numericArg('max', Number.POSITIVE_INFINITY),
    samplePerYear: numericArg('sample-per-year', 0),
  };
}

async function resolvePuuid(name: string, tag: string, apiKey: string): Promise<string> {
  const response = await fetch(`${API_BASE}/valorant/v2/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`, {
    headers: { Authorization: apiKey, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`HenrikDev account lookup failed with HTTP ${response.status}`);
  const body = await response.json() as HenrikResponse<{ puuid: string }>;
  const puuid = body.data?.puuid;
  if (!puuid) throw new Error('HenrikDev account lookup returned no PUUID.');
  return puuid;
}

function requestMatch(region: string, matchId: string, apiKey: string): Promise<Response> {
  return fetch(`${API_BASE}/valorant/v4/match/${region}/${encodeURIComponent(matchId)}`, {
    headers: { Authorization: apiKey, Accept: 'application/json' },
  });
}

async function fetchMatchWithRetry(region: string, matchId: string, apiKey: string): Promise<Response> {
  const response = await requestMatch(region, matchId, apiKey);
  if (response.status !== 429) return response;
  const retryAfterSeconds = Number(response.headers.get('retry-after') ?? 60);
  await pause((Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 60) * 1000);
  return requestMatch(region, matchId, apiKey);
}

type MatchOutcome = { kind: 'notFound' } | { kind: 'resolved'; match: ValorantMatch } | { kind: 'error' };

async function classifyMatchResponse(response: Response, puuid: string): Promise<MatchOutcome> {
  if (response.status === 404) return { kind: 'notFound' };
  if (!response.ok) return { kind: 'error' };
  const body = await response.json() as HenrikResponse<Parameters<typeof mapMatch>[0]>;
  const mapped = body.data && mapMatch(body.data, puuid);
  return mapped ? { kind: 'resolved', match: mapped } : { kind: 'error' };
}

interface EnrichState {
  history: ValorantHistoryCache;
  unavailableMatchIds: Set<string>;
  counts: { attempted: number; resolved: number; notFound: number; errors: number };
  resolvedSinceCheckpoint: number;
  lastRequestAt: number;
}

async function processCandidate(
  candidate: ValorantMatch,
  options: EnrichOptions,
  puuid: string,
  state: EnrichState,
): Promise<void> {
  const waitMs = Math.max(0, options.delayMs - (Date.now() - state.lastRequestAt));
  if (waitMs > 0) await pause(waitMs);
  state.lastRequestAt = Date.now();

  const response = await fetchMatchWithRetry(options.region, candidate.matchId, options.apiKey);
  state.lastRequestAt = Date.now();
  state.counts.attempted += 1;

  const outcome = await classifyMatchResponse(response, puuid);
  if (outcome.kind === 'notFound') {
    state.unavailableMatchIds.add(candidate.matchId);
    state.counts.notFound += 1;
  } else if (outcome.kind === 'resolved') {
    state.history = { ...state.history, matches: mergeMatches(state.history.matches, [outcome.match]) };
    state.counts.resolved += 1;
    state.resolvedSinceCheckpoint += 1;
  } else {
    state.counts.errors += 1;
  }
}

async function maybeCheckpoint(historyStore: ValorantHistoryStore, state: EnrichState, statePath: string): Promise<void> {
  if (state.counts.attempted % CHECKPOINT_EVERY !== 0) return;
  if (state.resolvedSinceCheckpoint > 0) {
    state.history = await checkpoint(historyStore, state.history);
    state.resolvedSinceCheckpoint = 0;
  }
  writeState(statePath, state.unavailableMatchIds);
  console.log(JSON.stringify({ event: 'progress', ...state.counts }));
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv, process.env);

  const privateDir = resolve(import.meta.dirname, '../.tokens');
  const statePath = resolve(privateDir, 'valorant-match-enrichment.json');
  mkdirSync(privateDir, { recursive: true });
  const persisted = readState(statePath);
  const unavailableMatchIds = new Set(process.argv.includes('--retry-not-found') ? [] : persisted.unavailableMatchIds);

  const database = createDatabase(options.databaseUrl);
  const historyStore = new ValorantHistoryStore(database);
  const initialHistory = await historyStore.get();
  if (!initialHistory) throw new Error('No stored Valorant history exists. Run the Riot export backfill first.');

  const sparseCandidates = initialHistory.matches
    .filter((match) => match.agentName === '' && !unavailableMatchIds.has(match.matchId));
  const candidates = stratifiedSamples(sparseCandidates, options.samplePerYear).slice(0, options.maxRequests);
  const backupPath = resolve(privateDir, `valorant-enrichment-backup-${Date.now()}.json`);
  writeFileSync(backupPath, JSON.stringify(initialHistory));

  const puuid = await resolvePuuid(options.name, options.tag, options.apiKey);

  const state: EnrichState = {
    history: initialHistory,
    unavailableMatchIds,
    counts: { attempted: 0, resolved: 0, notFound: 0, errors: 0 },
    resolvedSinceCheckpoint: 0,
    lastRequestAt: 0,
  };

  console.log(JSON.stringify({
    event: 'start',
    archiveMatches: initialHistory.matches.length,
    candidates: candidates.length,
    previouslyUnavailable: unavailableMatchIds.size,
    delayMs: options.delayMs,
    samplePerYear: options.samplePerYear,
  }));

  for (const candidate of candidates) {
    await processCandidate(candidate, options, puuid, state);
    await maybeCheckpoint(historyStore, state, statePath);
  }

  if (state.resolvedSinceCheckpoint > 0) state.history = await checkpoint(historyStore, state.history);
  writeState(statePath, state.unavailableMatchIds);
  await database.client.end({ timeout: 5 });
  console.log(JSON.stringify({
    event: 'complete',
    ...state.counts,
    richMatches: state.history.matches.filter((match) => match.agentName !== '').length,
    sparseMatches: state.history.matches.filter((match) => match.agentName === '').length,
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    console.error('Valorant enrichment failed:', (error as Error).message);
    process.exitCode = 1;
  }
}
