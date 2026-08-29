// One-off import: merges Riot's official "download your data" Valorant match-history export
// (game_id/mode/outcome/timestamps and duration, but no map, agent, or combat stats) into the archive
// ValorantHistoryStore already builds from HenrikDev's paginated stored-match API. The export is
// Riot-authoritative and goes back to account creation, so it fills win/loss/count gaps that
// HenrikDev's slow, rate-limited backfill hasn't reached yet — but it can never supply the fields
// it doesn't have, so imported matches carry agentName: '' as a sentinel (see agentSummaries in
// client/src/widgets/ValorantWidgets.tsx, which excludes it from agent-pool ranking so thousands of
// stats-free rows don't swamp the real per-agent breakdown).
//
// Merge order always keeps HenrikDev's richer data on conflict (mergeMatches's second argument
// wins); the export only ever fills gaps, never overwrites real stats.
//
// actShort is back-filled from Riot's public season calendar for Episode 1 - Episode 9
// (2020-06-01 through 2025-01-08, from valorant-api.com/v1/seasons) plus V25/V26 (2025-01-07
// onward, dates from Riot's own patch-notes season table). Riot's post-Episode-9 versioning
// renamed episodes to yearly "V25"/"V26" labels with six acts each; this script maps them to
// "e10"/"e11" on the strength of the worked example already in shared/src/schemas/valorant.ts
// ("e.g. e10a2"), which implies HenrikDev kept incrementing the episode number sequentially
// rather than adopting Riot's new naming. Anything after the last dated act below (no published
// end date yet) is left untagged rather than guessed.
//
// Defaults to a dry run that only prints a summary. Pass --apply to actually write, after which
// the previous cache row is dumped to a local JSON file first so the import is trivially reversible.
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { valorantMatchSchema, type ValorantMatch } from '@nohm/shared';
import { createDatabase } from '../src/db/client.js';
import { ValorantHistoryStore } from '../src/valorantHistory.js';
import { mergeMatches } from '../src/providers/valorant.js';

const MATCH_HISTORY_CACHE_VERSION = 3;

interface RiotExportRow {
  game_id: string;
  game_mode: string;
  game_type: string;
  game_outcome: string;
  game_start_time_utc: string;
  game_end_time_utc: string;
  realm_id: string;
}

/** Episode/act boundaries pulled from https://valorant-api.com/v1/seasons (type
 * EAresSeasonType::Act), covering only the range where the asset path directly encodes
 * "EpisodeN_ActM" and therefore maps unambiguously to HenrikDev's "e{N}a{M}" short code. */
const ACT_CALENDAR: { short: string; start: string; end: string }[] = [
  { short: 'e1a1', start: '2020-06-01T07:00:00Z', end: '2020-08-04T00:00:00Z' },
  { short: 'e1a2', start: '2020-08-04T00:00:00Z', end: '2020-10-13T00:00:00Z' },
  { short: 'e1a3', start: '2020-10-13T00:00:00Z', end: '2021-01-12T00:00:00Z' },
  { short: 'e2a1', start: '2021-01-12T00:00:00Z', end: '2021-03-02T00:00:00Z' },
  { short: 'e2a2', start: '2021-03-02T00:00:00Z', end: '2021-04-27T00:00:00Z' },
  { short: 'e2a3', start: '2021-04-27T00:00:00Z', end: '2021-06-22T00:00:00Z' },
  { short: 'e3a1', start: '2021-06-22T00:00:00Z', end: '2021-09-08T00:00:00Z' },
  { short: 'e3a2', start: '2021-09-08T00:00:00Z', end: '2021-11-02T00:00:00Z' },
  { short: 'e3a3', start: '2021-11-02T00:00:00Z', end: '2022-01-11T00:00:00Z' },
  { short: 'e4a1', start: '2022-01-11T00:00:00Z', end: '2022-03-01T00:00:00Z' },
  { short: 'e4a2', start: '2022-03-01T00:00:00Z', end: '2022-04-26T00:00:00Z' },
  { short: 'e4a3', start: '2022-04-26T00:00:00Z', end: '2022-06-21T00:00:00Z' },
  { short: 'e5a1', start: '2022-06-21T00:00:00Z', end: '2022-08-23T00:00:00Z' },
  { short: 'e5a2', start: '2022-08-23T00:00:00Z', end: '2022-10-18T00:00:00Z' },
  { short: 'e5a3', start: '2022-10-18T00:00:00Z', end: '2023-01-10T00:00:00Z' },
  { short: 'e6a1', start: '2023-01-10T00:00:00Z', end: '2023-03-07T00:00:00Z' },
  { short: 'e6a2', start: '2023-03-07T00:00:00Z', end: '2023-04-25T00:00:00Z' },
  { short: 'e6a3', start: '2023-04-25T00:00:00Z', end: '2023-06-27T00:00:00Z' },
  { short: 'e7a1', start: '2023-06-27T00:00:00Z', end: '2023-08-29T00:00:00Z' },
  { short: 'e7a2', start: '2023-08-29T00:00:00Z', end: '2023-10-31T00:00:00Z' },
  { short: 'e7a3', start: '2023-10-31T00:00:00Z', end: '2024-01-09T00:00:00Z' },
  { short: 'e8a1', start: '2024-01-09T00:00:00Z', end: '2024-03-05T00:00:00Z' },
  { short: 'e8a2', start: '2024-03-05T00:00:00Z', end: '2024-04-30T00:00:00Z' },
  { short: 'e8a3', start: '2024-04-30T00:00:00Z', end: '2024-06-26T00:00:00Z' },
  { short: 'e9a1', start: '2024-06-26T00:00:00Z', end: '2024-08-28T00:00:00Z' },
  { short: 'e9a2', start: '2024-08-28T00:00:00Z', end: '2024-10-23T00:00:00Z' },
  { short: 'e9a3', start: '2024-10-23T00:00:00Z', end: '2025-01-08T00:00:00Z' },
  // V25/V26 — dates from Riot's published season table, mapped to e10/e11 (see file header).
  { short: 'e10a1', start: '2025-01-07T00:00:00Z', end: '2025-03-05T00:00:00Z' },
  { short: 'e10a2', start: '2025-03-05T00:00:00Z', end: '2025-04-30T00:00:00Z' },
  { short: 'e10a3', start: '2025-04-30T00:00:00Z', end: '2025-06-25T00:00:00Z' },
  { short: 'e10a4', start: '2025-06-25T00:00:00Z', end: '2025-08-20T00:00:00Z' },
  { short: 'e10a5', start: '2025-08-20T00:00:00Z', end: '2025-10-15T00:00:00Z' },
  { short: 'e10a6', start: '2025-10-15T00:00:00Z', end: '2026-01-07T00:00:00Z' },
  { short: 'e11a1', start: '2026-01-07T00:00:00Z', end: '2026-03-18T00:00:00Z' },
  { short: 'e11a2', start: '2026-03-18T00:00:00Z', end: '2026-04-29T00:00:00Z' },
  { short: 'e11a3', start: '2026-04-29T00:00:00Z', end: '2026-06-22T00:00:00Z' },
];

function actShortFor(startedAt: string): string | undefined {
  const t = Date.parse(startedAt);
  return ACT_CALENDAR.find((act) => t >= Date.parse(act.start) && t < Date.parse(act.end))?.short;
}

/** Riot's raw queue-id strings only get mapped to HenrikDev's real display name where the match
 * dates or HenrikDev's own mode identifiers corroborate it. Skirmish2V2/Newmap get a cosmetic
 * space only, not merged into a named mode, since that would assert an equivalence the available
 * evidence does not fully support. */
export function mapMode(gameType: string, gameMode: string): string {
  switch (gameType) {
    case 'Ranked': return 'Competitive';
    case 'Unrated': return 'Unrated';
    case 'Deathmatch': return 'Deathmatch';
    case 'Spike Rush': return 'Spike Rush';
    case 'Swiftplay': return 'Swiftplay';
    case 'Ggteam': return 'Escalation';
    case 'Hurm': return 'Team Deathmatch';
    // HenrikDev's own API changelog records its `snowball` filter being renamed to
    // `snowballfight`; Riot launched the mode in December 2020 and rotated it again from May 2021.
    case 'Snowball': return 'Snowball Fight';
    // Riot's February 2026 patch notes name the live mode All Random One Site; its internal name
    // was VALARAM, and the export's lone match falls inside that release window.
    case 'Valaram': return 'All Random One Site';
    // "onefa" ~ "one [agent] for all" — Replication puts every player on the same agent. Matches
    // run 2021-05-21 through 2022-11-02, lining up with Replication's real shelving (~v6.01, Nov
    // 2022); not Riot-confirmed, but etymology + the end date corroborate each other.
    case 'Onefa': return 'Replication';
    case 'Skirmishascension2V2': return 'Skirmish: Ascension 2v2';
    case 'Skirmishascension1V1': return 'Skirmish: Ascension 1v1';
    case 'Skirmish2V2': return 'Skirmish 2v2';
    case 'Newmap': return 'New Map';
    case 'Not Applicable':
      switch (gameMode) {
        case 'Custom Game': return 'Custom Game';
        case 'ShootingRange': return 'Range';
        case 'ReplayNewPlayerExperience':
        case 'New Player Experience': return 'Tutorial';
        default: return gameMode || 'Unknown';
      }
    default: return gameType || gameMode || 'Unknown';
  }
}

export function toSparseMatch(row: RiotExportRow): ValorantMatch {
  const startedAt = `${row.game_start_time_utc.replace(' ', 'T')}Z`;
  const endedAt = `${row.game_end_time_utc.replace(' ', 'T')}Z`;
  const durationSeconds = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000));
  let result: 'win' | 'loss' | 'draw' = 'draw';
  if (row.game_outcome === 'Win') result = 'win';
  else if (row.game_outcome === 'Loss') result = 'loss';
  return valorantMatchSchema.parse({
    matchId: row.game_id,
    map: '',
    mode: mapMode(row.game_type, row.game_mode),
    startedAt,
    durationSeconds,
    result,
    agentName: '',
    score: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    headshots: 0,
    bodyshots: 0,
    legshots: 0,
    damageDealt: 0,
    damageReceived: 0,
    actShort: actShortFor(startedAt),
    isMatchMvp: false,
    isTeamMvp: false,
  });
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Set DATABASE_URL in server/.env first.');

  const apply = process.argv.includes('--apply');
  const fileArg = process.argv.find((arg, i) => i >= 2 && !arg.startsWith('--'));
  if (!fileArg) throw new Error('Usage: tsx scripts/backfillValorantHistory.ts <path-to-valorant_match_history_uc.json> [--apply]');

  const filePath = resolve(fileArg!);
  const rows = JSON.parse(readFileSync(filePath, 'utf8')) as RiotExportRow[];
  console.log(`Parsed ${rows.length} matches from ${filePath}`);

  const sparseMatches = rows.map(toSparseMatch);
  const withAct = sparseMatches.filter((m) => m.actShort).length;
  console.log(`  actShort resolved for ${withAct}/${sparseMatches.length}`);

  const database = createDatabase(databaseUrl!);
  const historyStore = new ValorantHistoryStore(database);
  const existing = await historyStore.get();
  console.log(`Existing archive: ${existing?.matches.length ?? 0} matches, totalMatchesAvailable=${existing?.totalMatchesAvailable ?? 0}`);

  // mergeMatches always lets its second argument win on a matchId collision, so a prior run of
  // this script (identifiable by the agentName: '' sentinel) must not be passed through as
  // "existing" data — otherwise a later fix to toSparseMatch/mapMode can never overwrite what an
  // earlier run already wrote, since that stale output would always outrank the freshly recomputed
  // version. Only genuine HenrikDev-sourced rows get that protection.
  const realExisting = (existing?.matches ?? []).filter((m) => m.agentName !== '');
  const merged = mergeMatches(sparseMatches, realExisting);
  const added = merged.length - (existing?.matches.length ?? 0);
  const totalMatchesAvailable = Math.max(existing?.totalMatchesAvailable ?? 0, rows.length, merged.length);
  console.log(`Merged archive: ${merged.length} matches (+${added} new), totalMatchesAvailable=${totalMatchesAvailable}`);

  if (!apply) {
    console.log('\nDry run only — pass --apply to write this to the database.');
    await database.client.end({ timeout: 5 });
    return;
  }

  if (existing) {
    const backupPath = resolve(import.meta.dirname, `../.valorant-history-backup-${Date.now()}.json`);
    writeFileSync(backupPath, JSON.stringify(existing, null, 2));
    console.log(`Backed up previous cache to ${backupPath}`);
  }

  await historyStore.set({
    matches: merged,
    totalMatchesAvailable,
    nextPage: existing?.nextPage ?? 1,
    sourceVersion: existing?.sourceVersion ?? MATCH_HISTORY_CACHE_VERSION,
  });
  await database.client.end({ timeout: 5 });
  console.log('\nWrote merged archive to the database.');
  console.log('If the dashboard server is currently running, it will pick this up on its next scheduled Valorant refresh.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (err) {
    console.error('✗ Backfill failed:', (err as Error).message);
    process.exitCode = 1;
  }
}
