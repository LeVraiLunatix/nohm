import { clashOfClansSchema, type ClashOfClansData } from '@nohm/shared';
import type { Provider } from '../scheduler.js';
import { toIsoTimestamp } from './clashRoyale.js';
import {
  currentClashOfClansLeagueWar,
  currentClashOfClansWar,
  fetchClashOfClansPlayer,
  fetchLatestClashOfClansRaidSeason,
  type ClashOfClansAuth,
  type RawClashOfClansWar,
} from './clashOfClansApi.js';

/** Standard war has 5 attacks per member plus one bonus attack once the clan's Capital Hall is
 * high enough; unlike `attacksPerMember` on classic war, GetCapitalRaidSeasons doesn't report the
 * limit directly, only `attacks`/`attackLimit`/`bonusAttackLimit` per member — summed here. */
const RAID_WEEKEND_DEFAULT_ATTACK_LIMIT = 6;
const TOP_CONTRIBUTORS_LIMIT = 3;

function mapWar(raw: RawClashOfClansWar | null, playerTag: string): ClashOfClansData['war'] {
  if (raw?.state !== 'preparation' && raw?.state !== 'inWar') return null;
  const member = raw.clan.members.find((candidate) => candidate.tag === playerTag);
  return {
    state: raw.state,
    opponentName: raw.opponent.name,
    endTime: raw.endTime ? toIsoTimestamp(raw.endTime) : new Date().toISOString(),
    attacksUsed: member?.attacks?.length ?? 0,
    attacksTotal: raw.attacksPerMember ?? 2,
    clanStars: raw.clan.stars ?? 0,
    clanDestructionPercentage: raw.clan.destructionPercentage ?? 0,
    opponentStars: raw.opponent.stars ?? 0,
    opponentDestructionPercentage: raw.opponent.destructionPercentage ?? 0,
  };
}

async function fetchWar(signal: AbortSignal, apiKey: string, clanTag: string, playerTag: string): Promise<ClashOfClansData['war']> {
  let war = await currentClashOfClansWar(signal, apiKey, clanTag);
  if (war?.state === 'notInWar') war = await currentClashOfClansLeagueWar(signal, apiKey, clanTag);
  return mapWar(war, playerTag);
}

async function fetchRaidWeekend(signal: AbortSignal, apiKey: string, clanTag: string, playerTag: string): Promise<ClashOfClansData['raidWeekend']> {
  const season = await fetchLatestClashOfClansRaidSeason(signal, apiKey, clanTag);
  if (season?.state !== 'ongoing') return null;
  const member = season.members?.find((candidate) => candidate.tag === playerTag);
  const topContributors = [...(season.members ?? [])]
    .sort((a, b) => b.capitalResourcesLooted - a.capitalResourcesLooted)
    .slice(0, TOP_CONTRIBUTORS_LIMIT)
    .map((candidate) => ({ name: candidate.name, loot: candidate.capitalResourcesLooted, isYou: candidate.tag === playerTag }));
  return {
    state: 'ongoing',
    endTime: toIsoTimestamp(season.endTime),
    attacksUsed: member?.attacks ?? 0,
    attacksLimit: member ? member.attackLimit + member.bonusAttackLimit : RAID_WEEKEND_DEFAULT_ATTACK_LIMIT,
    capitalTotalLoot: season.capitalTotalLoot,
    personalLoot: member?.capitalResourcesLooted ?? 0,
    topContributors,
  };
}

export function createClashOfClansProvider(auth: ClashOfClansAuth | undefined): Provider<ClashOfClansData> {
  return {
    id: 'clash-of-clans',
    schema: clashOfClansSchema,
    refreshMs: 10 * 60_000,
    timeoutMs: 15_000,
    isConfigured: () => auth !== undefined,
    async fetch(signal) {
      if (!auth) throw new Error('clash-of-clans is not configured');
      const player = await fetchClashOfClansPlayer(signal, auth.apiKey, auth.playerTag);
      const clanTag = player.clan?.tag;
      const [war, raidWeekend] = clanTag
        ? await Promise.all([
            fetchWar(signal, auth.apiKey, clanTag, player.tag),
            fetchRaidWeekend(signal, auth.apiKey, clanTag, player.tag),
          ])
        : [null, null];

      const data: ClashOfClansData = {
        profile: {
          tag: player.tag,
          name: player.name,
          townHallLevel: player.townHallLevel,
          trophies: player.trophies,
          league: player.leagueTier
            ? { name: player.leagueTier.name, iconUrl: player.leagueTier.iconUrls?.large ?? player.leagueTier.iconUrls?.small }
            : undefined,
          clanTag: player.clan?.tag,
          clanName: player.clan?.name,
          clanBadgeUrl: player.clan?.badgeUrls?.medium ?? player.clan?.badgeUrls?.large ?? player.clan?.badgeUrls?.small,
        },
        war,
        raidWeekend,
      };
      return clashOfClansSchema.parse(data);
    },
  };
}
