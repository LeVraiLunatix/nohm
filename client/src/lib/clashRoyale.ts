import { pathOfLegendsDisplayLeagueNumber, pathOfLegendsLeagueName } from '@nohm/shared';

/** The game's own app icon — hotlinked the same way as the Steam mark (Wikimedia Commons) and the
 * nav pill's Clash Royale icon (see sections/registry.tsx), which this re-exports for reuse. */
export const CLASH_ROYALE_APP_ICON_URL = 'https://media.ffycdn.net/eu/supercell/nxaaEWAgbRGADkoAETG8.png';

/** Small trophy mark shown beside a win-streak/session card's crown-score chips — community-hosted
 * (clashroyale.wiki) and noticeably lower-resolution than the other hotlinked art above, but there's
 * no better public source for a plain trophy glyph on brand for the game. */
export const CLASH_ROYALE_TROPHY_ICON_URL = 'https://clashroyale.wiki/wp-content/uploads/2016/03/trophy.png';

/** Battle-mode emblems used by the homepage history. The hammer is the game's normal Trophy Road
 * marker; the mode-specific shields are only used when Supercell identifies that game as 2v2 or
 * Clan Wars. */
export const CLASH_ROYALE_BATTLE_ART = {
  trophyRoad: 'https://media.ffycdn.net/eu/supercell/jRQrei1MNcyVLey6oS3p.png?width=512',
  twoVTwo: 'https://static.wikia.nocookie.net/clashroyale/images/1/11/Shield_2v2.png/revision/latest?cb=20170615223652',
  clanWar: 'https://static.wikia.nocookie.net/clashroyale/images/9/9f/War_Shield.png/revision/latest?cb=20180425130200',
} as const;

/**
 * Trophy-road arena key art, keyed by the exact `arenaName` string the Clash Royale API reports
 * (e.g. `player.arena.name`). Sourced from the Clash Royale Fandom wiki's Trophy Road table
 * (clashroyale.fandom.com/wiki/Arenas), covering all 32 current arenas — fan content per
 * Supercell's Fan Content Policy (supercell.com/en/fan-content-policy), hotlinked from Fandom's own
 * asset CDN rather than vendored (same sourcing as the league badges below).
 *
 * The CR API doesn't expose a stable numeric arena id in the player payload worth keying off, and
 * Supercell adds new arenas to the trophy road periodically — an arena reached that isn't in this
 * map just renders without a backdrop (see clashRoyaleArenaArt below) rather than breaking. To add
 * one later: find its Fandom page, resolve the image via the wiki's `File:` page, and add an entry
 * here keyed by the arena's exact in-game name.
 */
const ARENA_ART: Record<string, string> = {
  'Goblin Stadium': 'https://static.wikia.nocookie.net/clashroyale/images/3/39/Goblin_Stadium.png/revision/latest?cb=20170505222252',
  'Bone Pit': 'https://static.wikia.nocookie.net/clashroyale/images/2/2d/Bone_Pit.png/revision/latest?cb=20170505222215',
  'Barbarian Bowl': 'https://static.wikia.nocookie.net/clashroyale/images/9/94/Barbarian_Bowl.png/revision/latest?cb=20170505222203',
  'Spell Valley': 'https://static.wikia.nocookie.net/clashroyale/images/e/ef/Spell_Valley.png/revision/latest?cb=20170505222416',
  "Builder's Workshop": 'https://static.wikia.nocookie.net/clashroyale/images/3/32/Builder%27s_Workshop.png/revision/latest?cb=20170505222229',
  "P.E.K.K.A.'s Playhouse": 'https://static.wikia.nocookie.net/clashroyale/images/9/91/P.E.K.K.A.%27s_Playhouse.png/revision/latest?cb=20170505222350',
  'Royal Arena': 'https://static.wikia.nocookie.net/clashroyale/images/3/32/Royal_Arena.png/revision/latest?cb=20170505222406',
  'Frozen Peak': 'https://static.wikia.nocookie.net/clashroyale/images/0/01/Frozen_Peak.png/revision/latest?cb=20170505222242',
  'Jungle Arena': 'https://static.wikia.nocookie.net/clashroyale/images/f/fc/Jungle_Arena.png/revision/latest?cb=20170505222325',
  'Hog Mountain': 'https://static.wikia.nocookie.net/clashroyale/images/4/45/Hog_Mountain.png/revision/latest?cb=20170505222311',
  'Electro Valley': 'https://static.wikia.nocookie.net/clashroyale/images/3/31/Electro_Valley.png/revision/latest?cb=20171211181158',
  'Spooky Town': 'https://static.wikia.nocookie.net/clashroyale/images/3/3a/Spooky_Town.png/revision/latest?cb=20190129051740',
  "Rascal's Hideout": 'https://static.wikia.nocookie.net/clashroyale/images/c/c3/Rascal%27s_Hideout.png/revision/latest?cb=20210606230038',
  'Serenity Peak': 'https://static.wikia.nocookie.net/clashroyale/images/1/14/Serenity_Peak.png/revision/latest?cb=20210606230634',
  "Miner's Mine": 'https://static.wikia.nocookie.net/clashroyale/images/9/97/Miner%27s_Mine.png/revision/latest?cb=20220404080733',
  "Executioner's Kitchen": 'https://static.wikia.nocookie.net/clashroyale/images/c/c2/Executioner%27s_Kitchen.png/revision/latest?cb=20221026160351',
  'Royal Crypt': 'https://static.wikia.nocookie.net/clashroyale/images/5/55/Royal_Crypt.png/revision/latest?cb=20221026160217',
  'Silent Sanctuary': 'https://static.wikia.nocookie.net/clashroyale/images/7/7e/Silent_Sanctuary.png/revision/latest?cb=20221026161050',
  'Dragon Spa': 'https://static.wikia.nocookie.net/clashroyale/images/5/58/Dragon_Spa.png/revision/latest?cb=20221026160613',
  'Boot Camp': 'https://static.wikia.nocookie.net/clashroyale/images/9/98/Boot_Camp.png/revision/latest?cb=20230710212823',
  'Clash Fest': 'https://static.wikia.nocookie.net/clashroyale/images/d/d6/Clash_Fest.png/revision/latest?cb=20230704064411',
  'PANCAKES!': 'https://static.wikia.nocookie.net/clashroyale/images/7/7c/PANCAKES%21.png/revision/latest?cb=20220704141850',
  'Valkalla': 'https://static.wikia.nocookie.net/clashroyale/images/b/be/Valkalla_Arena.png/revision/latest?cb=20240310101041',
  'Legendary Arena': 'https://static.wikia.nocookie.net/clashroyale/images/e/ed/Legendary_Arena.png/revision/latest?cb=20170505222335',
  'Lumberlove Cabin': 'https://static.wikia.nocookie.net/clashroyale/images/6/66/Lumberlove_Cabin_Arena.png/revision/latest?cb=20250305121148',
  'Royal Road': 'https://static.wikia.nocookie.net/clashroyale/images/5/59/Royal_Road_Arena.png/revision/latest?cb=20250409105051',
  'Musketeer Street': 'https://static.wikia.nocookie.net/clashroyale/images/7/75/Musketeer_Street_Arena.png/revision/latest?cb=20251103095404',
  'Summit of Heroes': 'https://static.wikia.nocookie.net/clashroyale/images/d/dc/Summit_of_Heroes_Arena.png/revision/latest?cb=20251204022851',
  'Magic Academy': 'https://static.wikia.nocookie.net/clashroyale/images/a/a1/Magic_Academy_Arena.png/revision/latest?cb=20240506161625',
  'Ultimate Clash Pit': 'https://static.wikia.nocookie.net/clashroyale/images/7/71/Ultimate_Clash_Arena.png/revision/latest?cb=20240905102933',
  "Little Prince's Tavern": 'https://static.wikia.nocookie.net/clashroyale/images/9/9e/Little_Prince%27s_Tavern_Arena.png/revision/latest?cb=20231130142021',
  'Spirit Square': 'https://static.wikia.nocookie.net/clashroyale/images/a/af/Spirit_Square_Arena.png/revision/latest?cb=20250829072619',
};

/** Normalizes curly apostrophes to straight ones — the API and the wiki don't always agree on which one they use. */
function normalizeApostrophes(value: string): string {
  return value.replace(/[‘’]/g, "'");
}

export function clashRoyaleArenaArt(arenaName: string): string | undefined {
  return ARENA_ART[normalizeApostrophes(arenaName)];
}

/**
 * Path of Legends league badges, keyed by `leagueNumber` (1–10, matching the API and the
 * PATH_OF_LEGENDS_LEAGUES names in widgets/ClashRoyaleWidgets.tsx — there is no League 0).
 * Hotlinked from the Clash Royale Fandom wiki's Ranked/League Statistics table
 * (clashroyale.fandom.com/wiki/Ranked), same sourcing as the arena art above.
 *
 * Previously vendored from github.com/RoyaleAPI/cr-api-assets, but that repo's league0.png and
 * league10.png turned out to be byte-identical (a bug in their own asset set, not a download
 * error here) — switched to Fandom, which has ten genuinely distinct files.
 */
const LEAGUE_ART: Record<number, string> = {
  1: 'https://static.wikia.nocookie.net/clashroyale/images/c/c3/League1.png/revision/latest?cb=20170317224347',
  2: 'https://static.wikia.nocookie.net/clashroyale/images/3/3a/League2.png/revision/latest?cb=20170317224350',
  3: 'https://static.wikia.nocookie.net/clashroyale/images/c/cc/League3.png/revision/latest?cb=20170317224352',
  4: 'https://static.wikia.nocookie.net/clashroyale/images/8/8d/League4.png/revision/latest?cb=20170317224354',
  5: 'https://static.wikia.nocookie.net/clashroyale/images/3/36/League5.png/revision/latest?cb=20170317224356',
  6: 'https://static.wikia.nocookie.net/clashroyale/images/1/12/League6.png/revision/latest?cb=20170317224358',
  7: 'https://static.wikia.nocookie.net/clashroyale/images/3/36/League7.png/revision/latest?cb=20190416022336',
  8: 'https://static.wikia.nocookie.net/clashroyale/images/b/b2/League8.png/revision/latest?cb=20170317224400',
  9: 'https://static.wikia.nocookie.net/clashroyale/images/1/16/League9.png/revision/latest?cb=20170317224402',
  10: 'https://static.wikia.nocookie.net/clashroyale/images/b/be/League10.png/revision/latest?cb=20170317224404',
};

export function clashRoyaleLeagueArt(leagueNumber: number): string | undefined {
  return LEAGUE_ART[leagueNumber];
}

const MERGE_TACTICS_LEAGUE_ART: Record<string, string> = {
  bronze1: 'https://static.wikia.nocookie.net/clashroyale/images/4/4c/Bronze1MT.png',
  bronze2: 'https://static.wikia.nocookie.net/clashroyale/images/9/9b/Bronze2MT.png',
  bronze3: 'https://static.wikia.nocookie.net/clashroyale/images/e/eb/Bronze3MT.png/revision/latest?cb=20250928160552',
  silver1: 'https://static.wikia.nocookie.net/clashroyale/images/1/11/Silver1MT.png',
  silver2: 'https://static.wikia.nocookie.net/clashroyale/images/0/03/Silver2MT.png',
  silver3: 'https://static.wikia.nocookie.net/clashroyale/images/f/f6/Silver3MT.png',
  gold1: 'https://static.wikia.nocookie.net/clashroyale/images/1/17/Gold1MT.png',
  gold2: 'https://static.wikia.nocookie.net/clashroyale/images/a/ad/Gold2MT.png',
  gold3: 'https://static.wikia.nocookie.net/clashroyale/images/6/63/Gold3MT.png',
  diamond1: 'https://static.wikia.nocookie.net/clashroyale/images/9/90/Diamond1MT.png',
  diamond2: 'https://static.wikia.nocookie.net/clashroyale/images/c/c6/Diamond2MT.png',
  diamond3: 'https://static.wikia.nocookie.net/clashroyale/images/e/ec/Diamond3MT.png',
  master1: 'https://static.wikia.nocookie.net/clashroyale/images/3/37/Master1MT.png',
  master2: 'https://static.wikia.nocookie.net/clashroyale/images/b/ba/Master2MT.png',
  master3: 'https://static.wikia.nocookie.net/clashroyale/images/8/83/Master3MT.png',
  champion1: 'https://static.wikia.nocookie.net/clashroyale/images/5/5d/Champion1MT.png',
  champion2: 'https://static.wikia.nocookie.net/clashroyale/images/5/5c/Champion2MT.png',
  champion3: 'https://static.wikia.nocookie.net/clashroyale/images/0/04/Champion3MT.png',
  ultimate1: 'https://static.wikia.nocookie.net/clashroyale/images/b/bd/Ultimate1MT.png',
  ultimate2: 'https://static.wikia.nocookie.net/clashroyale/images/7/71/Ultimate2MT.png',
  ultimate3: 'https://static.wikia.nocookie.net/clashroyale/images/e/ee/Ultimate3MT.png',
};

function compactRankName(value: string): string {
  const rankWithDigits = value.trim().replace(/\b(III|II|I)$/i, (roman) => ({ i: '1', ii: '2', iii: '3' })[roman.toLowerCase()]!);
  return rankWithDigits.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
}

export function clashRoyaleBattleIcon(
  battle: { type: string; modeName?: string; arenaName?: string; pathOfLegendsLeagueNumber?: number },
): { src: string; label: string; isAppIcon?: boolean } {
  const mode = `${battle.type} ${battle.modeName ?? ''}`
    .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replaceAll(/[_-]/g, ' ');

  if (/\b(?:2\s*v\s*2|2v2|two\s*(?:v|versus)\s*two)\b/.test(mode)) {
    return { src: CLASH_ROYALE_BATTLE_ART.twoVTwo, label: '2v2' };
  }
  if (mode.includes('river race') || mode.includes('clan war')) {
    return { src: CLASH_ROYALE_BATTLE_ART.clanWar, label: 'Clan Wars' };
  }
  if (mode.includes('merge tactics')) {
    const leagueArt = battle.arenaName ? MERGE_TACTICS_LEAGUE_ART[compactRankName(battle.arenaName)] : undefined;
    return { src: leagueArt ?? CLASH_ROYALE_BATTLE_ART.trophyRoad, label: battle.arenaName ?? 'Merge Tactics' };
  }
  if (mode.includes('path of legend')) {
    // The API reports the league this specific battle was played at (unlike `arenaName`, which is
    // always the player's Trophy Road arena, e.g. "Legendary Arena", regardless of PoL league) —
    // so this is exact, not a guess or a stand-in for the player's current league.
    if (battle.pathOfLegendsLeagueNumber !== undefined) {
      const displayLeagueNumber = pathOfLegendsDisplayLeagueNumber(battle.pathOfLegendsLeagueNumber);
      const leagueArt = clashRoyaleLeagueArt(displayLeagueNumber);
      if (leagueArt) return { src: leagueArt, label: pathOfLegendsLeagueName(battle.pathOfLegendsLeagueNumber) };
    }
    // Falls back to the app icon rather than the Trophy Road hammer: Path of Legends is a distinct
    // ranked mode, so stamping an unresolved game with the ladder's own icon would misrepresent it
    // as a Trophy Road battle instead of just an "unknown league" Path of Legends one. It's a solid
    // app-icon tile rather than transparent emblem art, so callers need `isAppIcon` to render it
    // with `object-fit: cover` (like the nav pill/kicker badge) instead of the shield-art treatment.
    return { src: CLASH_ROYALE_APP_ICON_URL, label: 'Path of Legends', isAppIcon: true };
  }
  return { src: CLASH_ROYALE_BATTLE_ART.trophyRoad, label: battle.arenaName ?? 'Trophy Road' };
}

/**
 * Wiki card art for the demo's fixed 8-card deck plus its tower troop, resolved with the same
 * MD5-sharded Fandom filename scheme as `clashRoyaleWikiCardImageUrl` in
 * server/src/providers/clashRoyale.ts (verified against the live wiki CDN, not re-derived from the
 * live Clash Royale API, which the offline demo has no account to call).
 */
const CARD_ART: Record<string, string> = {
  Knight: 'https://static.wikia.nocookie.net/clashroyale/images/5/54/KnightCard.png',
  Musketeer: 'https://static.wikia.nocookie.net/clashroyale/images/e/ee/MusketeerCard.png',
  'Baby Dragon': 'https://static.wikia.nocookie.net/clashroyale/images/3/35/BabyDragonCard.png',
  'Mini P.E.K.K.A': 'https://static.wikia.nocookie.net/clashroyale/images/7/7b/MiniPEKKACard.png',
  Fireball: 'https://static.wikia.nocookie.net/clashroyale/images/f/f4/FireballCard.png',
  Zap: 'https://static.wikia.nocookie.net/clashroyale/images/5/52/ZapCard.png',
  Tesla: 'https://static.wikia.nocookie.net/clashroyale/images/2/27/TeslaCard.png',
  'Hog Rider': 'https://static.wikia.nocookie.net/clashroyale/images/3/30/HogRiderCard.png',
  Cannoneer: 'https://static.wikia.nocookie.net/clashroyale/images/a/a2/CannoneerCard.png',
};

export function clashRoyaleCardArt(name: string): string | undefined {
  return CARD_ART[name];
}

/** A fixed, real clan badge asset (RoyaleAPI's public badge manifest/CDN — same source the server
 * provider resolves from the player's actual `clan.badgeId`) — the demo has no real clan to look
 * one up for, so this just picks one badge rather than leaving the crest blank. */
export const CLASH_ROYALE_DEMO_CLAN_BADGE_URL = 'https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/badges/Flame_01.png';
