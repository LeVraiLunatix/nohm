import { clashRoyaleSchema, type ClashRoyaleBattle, type ClashRoyaleCard, type ClashRoyaleData } from '@nohm/shared';
import { md5Hex } from '../md5.js';
import type { Provider } from '../scheduler.js';

const CR_API_BASE = 'https://proxy.royaleapi.dev/v1';
const CLAN_BADGE_MANIFEST_URL = 'https://raw.githubusercontent.com/RoyaleAPI/cr-api-data/master/docs/json/alliance_badges.json';
const CLAN_BADGE_ASSET_BASE_URL = 'https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/badges';
const CLASH_ROYALE_WIKI_ASSET_URL = 'https://static.wikia.nocookie.net/clashroyale/images';

interface ClanBadge {
  id: number;
  name: string;
}

let clanBadgeUrls: Promise<Map<number, string>> | undefined;

export interface ClashRoyaleAuth {
  apiKey: string;
  playerTag: string;
}

interface RawCard {
  id: number;
  name: string;
  level: number;
  maxLevel: number;
  evolutionLevel?: number;
  rarity?: string;
  iconUrls?: { medium?: string };
}

/** Entry from the static `/cards` reference endpoint — the per-player deck/battle payloads don't
 * carry rarity, so it's looked up by card id from this separate, non-personal reference list. */
interface RawCardReference {
  id: number;
  rarity: string;
}

interface RawPlayer {
  tag: string;
  name: string;
  expLevel: number;
  trophies: number;
  bestTrophies: number;
  wins: number;
  losses: number;
  threeCrownWins: number;
  battleCount: number;
  arena?: { name: string };
  clan?: { tag: string; name: string; clanScore?: number; badgeId?: number };
  currentDeck?: RawCard[];
  currentDeckSupportCards?: RawCard[];
  currentPathOfLegendSeasonResult?: { leagueNumber: number; trophies: number; rank?: number | null };
}

interface RawBattleTeamMember {
  tag?: string;
  crowns: number;
  name?: string;
  startingTrophies?: number;
  trophyChange?: number;
  cards?: RawCard[];
}

interface RawBattle {
  battleTime: string;
  type: string;
  gameMode?: { name?: string };
  arena?: { name?: string };
  team: RawBattleTeamMember[];
  opponent: RawBattleTeamMember[];
  /** Raw API league number for this specific battle — only present for `type === 'pathOfLegend'`.
   * Reflects the league this battle was actually played at, unlike `arena.name` (always the
   * player's Trophy Road arena, e.g. "Legendary Arena", regardless of Path of Legends league). */
  leagueNumber?: number;
}

/** Clash Royale tags are always upper-case and '#'-prefixed; the API rejects anything else. */
export function normalizeTag(tag: string): string {
  const trimmed = tag.trim().toUpperCase();
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

/** Supercell's battleTime is a compact, non-ISO timestamp (`20260721T120000.000Z`) that
 * `Date`/`new Date()` can't parse — insert the separators ISO 8601 requires. */
export function toIsoTimestamp(battleTime: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/.exec(battleTime);
  if (!match) return battleTime;
  const [, year, month, day, hour, minute, second, fraction] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${fraction ?? ''}Z`;
}

/** Never throws a message containing the URL — it carries the API key via the Authorization header,
 * but the path itself also encodes the player tag, personal enough to keep out of error text too. */
async function crRequest<T>(signal: AbortSignal, apiKey: string, path: string, label: string): Promise<T> {
  const res = await fetch(`${CR_API_BASE}${path}`, {
    signal,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.status === 403) throw new Error(`Clash Royale ${label} failed: HTTP 403`);
  if (!res.ok) throw new Error(`Clash Royale ${label} failed: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** The official player response gives a clan badgeId, but not a usable image URL. RoyaleAPI
 * maintains the corresponding public ID-to-name manifest and image assets; cache the mapping so
 * widget refreshes do not repeatedly fetch static game data. */
function getClanBadgeUrls(): Promise<Map<number, string>> {
  if (clanBadgeUrls !== undefined) return clanBadgeUrls;

  const badgeUrlsRequest = fetch(CLAN_BADGE_MANIFEST_URL)
    .then(async (res) => {
      if (!res.ok) throw new Error(`Clan badge manifest failed: HTTP ${res.status}`);
      const badges = await res.json() as ClanBadge[];
      return new Map(badges.map((badge) => [badge.id, `${CLAN_BADGE_ASSET_BASE_URL}/${badge.name}.png`]));
    })
    .catch(() => {
      // Badges are presentational. Leave the clan text intact if the static manifest is down.
      clanBadgeUrls = undefined;
      return new Map();
    });
  clanBadgeUrls = badgeUrlsRequest;
  return badgeUrlsRequest;
}

/** Wiki card files consistently use the card name without punctuation, followed by `Card`.
 * A card in an Evolution-capable deck slot with `evolutionLevel` uses its Evolution asset, which
 * follows the same convention with an `Evolution` suffix (for example,
 * `CannonCardEvolution.png`). Fandom's static CDN files live under the first one and two
 * characters of the MD5 filename hash, so we can construct the stable asset URL without a
 * Cloudflare-protected wiki page request or revision-specific URL. */
export function clashRoyaleWikiCardImageUrl(name: string, evolutionLevel?: number): string {
  const fileStem = name.replaceAll(/[^a-z0-9]/gi, '');
  const fileName = `${fileStem}Card${evolutionLevel !== undefined && evolutionLevel > 0 ? 'Evolution' : ''}.png`;
  const hash = md5Hex(fileName);
  return `${CLASH_ROYALE_WIKI_ASSET_URL}/${hash[0]}/${hash.slice(0, 2)}/${fileName}`;
}

/** The game's first special deck position is Evolution-only; its third can hold an Evolution or
 * Hero. All other cards may report an unlocked `evolutionLevel`, but must keep their normal art. */
export function isEvolutionDeckSlot(deckIndex: number): boolean {
  return deckIndex === 0 || deckIndex === 2;
}

export function mapCard(card: RawCard, rarityById: Map<number, string> = new Map(), showEvolutionArtwork = false): ClashRoyaleCard {
  return {
    id: card.id,
    name: card.name,
    level: card.level,
    maxLevel: card.maxLevel,
    evolutionLevel: card.evolutionLevel,
    iconUrl: clashRoyaleWikiCardImageUrl(card.name, showEvolutionArtwork ? card.evolutionLevel : undefined),
    fallbackIconUrl: card.iconUrls?.medium,
    rarity: (card.rarity ?? rarityById.get(card.id))?.toLowerCase(),
  };
}

/**
 * The player endpoint currently returns seven regular cards, omitting the active Hero/Champion
 * special slot. A battle whose seven regular cards exactly match the player deck lets us recover
 * that single missing card without confusing it with an older deck from a different mode.
 */
export function findDeckHero(playerTag: string, currentDeck: RawCard[], battles: RawBattle[]): { card: RawCard; index: number } | undefined {
  if (currentDeck.length !== 7) return undefined;
  const currentIds = new Set(currentDeck.map((card) => card.id));
  for (const battle of battles) {
    const member = battle.team.find((candidate) => candidate.tag === playerTag);
    const cards = member?.cards;
    if (cards?.length !== 8) continue;
    const missing = cards.filter((card) => !currentIds.has(card.id));
    if (missing.length === 1 && currentDeck.every((card) => cards.some((candidate) => candidate.id === card.id))) {
      return { card: missing[0], index: cards.findIndex((card) => card.id === missing[0].id) };
    }
  }
  return undefined;
}

/**
 * The player endpoint can return all eight cards in its own category order rather than the order
 * of the deck's visible slots. A recent battle with the same eight ids preserves the slot order,
 * so use it only when it is an exact match. Keep the player payload's card objects afterwards:
 * it carries the current evolution level even when the matched battle predates a level change.
 */
export function orderDeckFromMatchingBattle(playerTag: string, currentDeck: RawCard[], battles: RawBattle[]): RawCard[] | undefined {
  if (currentDeck.length !== 8) return undefined;
  const cardsById = new Map(currentDeck.map((card) => [card.id, card]));
  if (cardsById.size !== currentDeck.length) return undefined;

  for (const battle of battles) {
    const cards = battle.team.find((candidate) => candidate.tag === playerTag)?.cards;
    if (cards?.length !== currentDeck.length || new Set(cards.map((card) => card.id)).size !== cards.length) continue;
    if (cards.every((card) => cardsById.has(card.id))) return cards.map((card) => cardsById.get(card.id)!);
  }
  return undefined;
}

export function battleResult(team: RawBattleTeamMember[], opponent: RawBattleTeamMember[]): 'win' | 'loss' | 'draw' {
  const crownsFor = team.reduce((sum, m) => sum + m.crowns, 0);
  const crownsAgainst = opponent.reduce((sum, m) => sum + m.crowns, 0);
  if (crownsFor > crownsAgainst) return 'win';
  if (crownsFor < crownsAgainst) return 'loss';
  return 'draw';
}

export function mapBattle(battle: RawBattle): ClashRoyaleBattle {
  const [self] = battle.team;
  const [opponent] = battle.opponent;
  return {
    battleTime: toIsoTimestamp(battle.battleTime),
    type: battle.type,
    modeName: battle.gameMode?.name,
    arenaName: battle.arena?.name,
    result: battleResult(battle.team, battle.opponent),
    crownsFor: battle.team.reduce((sum, m) => sum + m.crowns, 0),
    crownsAgainst: battle.opponent.reduce((sum, m) => sum + m.crowns, 0),
    opponentName: opponent?.name,
    trophyChange: self?.trophyChange,
    pathOfLegendsLeagueNumber: battle.leagueNumber,
  };
}

export function createClashRoyaleProvider(auth: ClashRoyaleAuth | undefined): Provider<ClashRoyaleData> {
  return {
    id: 'clash-royale',
    schema: clashRoyaleSchema,
    refreshMs: 10 * 60_000,
    timeoutMs: 15_000,
    isConfigured: () => auth !== undefined,
    async fetch(signal) {
      if (!auth) throw new Error('clash-royale is not configured');
      const tag = normalizeTag(auth.playerTag);
      const encodedTag = encodeURIComponent(tag);

      const player = await crRequest<RawPlayer>(signal, auth.apiKey, `/players/${encodedTag}`, 'GetPlayer');
      const battleLog = await crRequest<RawBattle[]>(signal, auth.apiKey, `/players/${encodedTag}/battlelog`, 'GetBattleLog');
      // Rarity is decorative (drives the card frame color) and isn't in the per-player payload;
      // fall back to an empty map on failure rather than losing the whole widget over it.
      const cardReference = await crRequest<{ items: RawCardReference[] }>(signal, auth.apiKey, '/cards', 'GetCards').catch(
        () => ({ items: [] as RawCardReference[] }),
      );
      const rarityById = new Map(cardReference.items.map((card) => [card.id, card.rarity]));
      const clanBadgeUrl = player.clan?.badgeId === undefined ? undefined : (await getClanBadgeUrls()).get(player.clan.badgeId);

      const playerDeck = player.currentDeck ?? [];
      const deckHero = findDeckHero(player.tag, playerDeck, battleLog);
      const orderedDeck = orderDeckFromMatchingBattle(player.tag, playerDeck, battleLog) ?? playerDeck;
      const data: ClashRoyaleData = {
        profile: {
          tag: player.tag,
          name: player.name,
          expLevel: player.expLevel,
          trophies: player.trophies,
          bestTrophies: player.bestTrophies,
          wins: player.wins,
          losses: player.losses,
          threeCrownWins: player.threeCrownWins,
          battleCount: player.battleCount,
          arenaName: player.arena?.name ?? 'Unknown arena',
          clanName: player.clan?.name,
          clanTag: player.clan?.tag,
          clanScore: player.clan?.clanScore,
          clanBadgeUrl,
          pathOfLegends: player.currentPathOfLegendSeasonResult,
        },
        currentDeck: orderedDeck.map((card, index) => {
          // `currentDeck` omits the Hero, so account for its recovered battle position before
          // checking whether this card occupies an Evolution-capable slot in the full eight-card deck.
          const deckIndex = deckHero?.index !== undefined && index >= deckHero.index ? index + 1 : index;
          const hasUnlockedEvolution = (card.evolutionLevel ?? 0) > 0;
          return mapCard(card, rarityById, isEvolutionDeckSlot(deckIndex) && hasUnlockedEvolution);
        }),
        deckHero: deckHero ? mapCard(deckHero.card, rarityById) : undefined,
        deckHeroIndex: deckHero?.index,
        towerTroop: player.currentDeckSupportCards?.[0] ? mapCard(player.currentDeckSupportCards[0], rarityById) : undefined,
        // Supercell's battlelog endpoint already caps this at its own last-25 window; no local slice needed.
        recentBattles: battleLog.map(mapBattle),
      };

      return clashRoyaleSchema.parse(data);
    },
  };
}
