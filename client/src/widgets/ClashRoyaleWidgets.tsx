import { pathOfLegendsDisplayLeagueNumber, pathOfLegendsLeagueName, type ClashRoyaleBattle, type ClashRoyaleData } from '@nohm/shared';
import { useEffect, useState } from 'react';
import { relativeTime } from '../lib/time';
import { CLASH_ROYALE_BATTLE_ART, clashRoyaleBattleIcon, clashRoyaleLeagueArt } from '../lib/clashRoyale';

const BATTLE_RESULT_LABELS: Record<ClashRoyaleBattle['result'], string> = {
  win: 'Victory',
  loss: 'Defeat',
  draw: 'Draw',
};
const STREAK_RESULT_LABELS: Record<ClashRoyaleBattle['result'], string> = {
  win: 'W',
  loss: 'L',
  draw: 'D',
};
const CLASH_ART = {
  playerCrown: 'https://media.ffycdn.net/eu/supercell/m1xRh8chWGRUyA5BcuWA.png?width=64',
  opponentCrown: 'https://media.ffycdn.net/eu/supercell/QTQoZZ8e18aR8d3ZtvEK.png?width=64',
} as const;
const REGULAR_CARD_ART_WIDTH = 277;
const REGULAR_CARD_ART_HEIGHT = 330;
const EVOLUTION_CARD_ART_WIDTH = 302;
const EVOLUTION_CARD_ART_HEIGHT = 363;
const BATTLE_MODE_ICON_SIZE = 128;
type FramedCardArtType = 'regular' | 'evolution';
type DeckCardArtType = FramedCardArtType | 'hero';
const framedCardArtUrls = new Map<string, Promise<string>>();
const trimmedBattleModeIconUrls = new Map<string, Promise<string>>();

/** Wiki files have uneven padding. Most Evolution art has an outer glow that fades to a
 * near-invisible haze without ever reaching true alpha-zero before the canvas edge, so a
 * zero threshold crops nothing; a few files (e.g. Royal Hogs) have a hard-cut margin and get
 * cropped tight. Trimming at a mid alpha instead treats that haze as background for every file,
 * so all cards crop to the same visible extent and land at the same size in the shared frame. */
function framedCardArtUrl(url: string, artType: FramedCardArtType): Promise<string> {
  const cacheKey = `${artType}:${url}`;
  const cached = framedCardArtUrls.get(cacheKey);
  if (cached) return cached;

  const request = new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const source = document.createElement('canvas');
        source.width = image.naturalWidth;
        source.height = image.naturalHeight;
        const sourceContext = source.getContext('2d', { willReadFrequently: true });
        if (!sourceContext) throw new Error('Could not read wiki card art');
        sourceContext.drawImage(image, 0, 0);
        const pixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
        let left = source.width;
        let top = source.height;
        let right = -1;
        let bottom = -1;
        const alphaThreshold = 32;
        for (let y = 0; y < source.height; y += 1) {
          for (let x = 0; x < source.width; x += 1) {
            if (pixels[(y * source.width + x) * 4 + 3] <= alphaThreshold) continue;
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
          }
        }
        if (right < left || bottom < top) throw new Error('Wiki card art is fully transparent');

        const sourceWidth = right - left + 1;
        const sourceHeight = bottom - top + 1;
        const scale = Math.min(window.devicePixelRatio || 1, 2);
        const target = document.createElement('canvas');
        target.width = (artType === 'regular' ? REGULAR_CARD_ART_WIDTH : EVOLUTION_CARD_ART_WIDTH) * scale;
        target.height = (artType === 'regular' ? REGULAR_CARD_ART_HEIGHT : EVOLUTION_CARD_ART_HEIGHT) * scale;
        const targetContext = target.getContext('2d');
        if (!targetContext) throw new Error('Could not draw wiki card art');
        const sourceAspectRatio = sourceWidth / sourceHeight;
        const targetAspectRatio = target.width / target.height;
        const drawWidth = sourceAspectRatio <= targetAspectRatio ? target.height * sourceAspectRatio : target.width;
        const drawHeight = sourceAspectRatio > targetAspectRatio ? target.width / sourceAspectRatio : target.height;
        targetContext.drawImage(
          image,
          left,
          top,
          sourceWidth,
          sourceHeight,
          (target.width - drawWidth) / 2,
          (target.height - drawHeight) / 2,
          drawWidth,
          drawHeight,
        );
        resolve(target.toDataURL('image/png'));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error('Could not load wiki card art'));
    image.src = url;
  });
  framedCardArtUrls.set(cacheKey, request);
  return request;
}

function FramedClashRoyaleCardImage({ card, artType }: Readonly<{ card: ClashRoyaleData['currentDeck'][number]; artType: FramedCardArtType }>) {
  const [src, setSrc] = useState(card.iconUrl);

  useEffect(() => {
    let disposed = false;
    setSrc(card.iconUrl);
    if (!card.iconUrl) return () => { disposed = true; };
    framedCardArtUrl(card.iconUrl, artType)
      .then((framedUrl) => {
        if (!disposed) setSrc(framedUrl);
      })
      .catch(() => {
        // Keep the original source visible if it cannot be framed locally.
      });
    return () => { disposed = true; };
  }, [artType, card.iconUrl]);

  if (!src) return <span aria-hidden>{card.name.charAt(0)}</span>;
  return (
    <img
      src={src}
      alt={card.name}
      loading="lazy"
      decoding="async"
      onError={() => {
        if (card.fallbackIconUrl && src !== card.fallbackIconUrl) setSrc(card.fallbackIconUrl);
      }}
    />
  );
}

/** Battle-mode assets use inconsistent transparent canvas padding, including nearly invisible
 * antialiased halos. Trim that padding, then redraw the entire visible mark in a shared square
 * so no emblem is clipped. */
function trimmedBattleModeIconUrl(url: string): Promise<string> {
  const cached = trimmedBattleModeIconUrls.get(url);
  if (cached) return cached;

  const request = new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const source = document.createElement('canvas');
        source.width = image.naturalWidth;
        source.height = image.naturalHeight;
        const sourceContext = source.getContext('2d', { willReadFrequently: true });
        if (!sourceContext) throw new Error('Could not read battle-mode art');
        sourceContext.drawImage(image, 0, 0);
        const pixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
        let left = source.width;
        let top = source.height;
        let right = -1;
        let bottom = -1;
        const alphaThreshold = 32;
        for (let y = 0; y < source.height; y += 1) {
          for (let x = 0; x < source.width; x += 1) {
            if (pixels[(y * source.width + x) * 4 + 3] <= alphaThreshold) continue;
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
          }
        }
        if (right < left || bottom < top) throw new Error('Battle-mode art is fully transparent');

        const croppedWidth = right - left + 1;
        const croppedHeight = bottom - top + 1;
        const inset = Math.ceil(Math.max(croppedWidth, croppedHeight) * 0.04);
        const scale = Math.min(window.devicePixelRatio || 1, 2);
        const target = document.createElement('canvas');
        target.width = BATTLE_MODE_ICON_SIZE * scale;
        target.height = BATTLE_MODE_ICON_SIZE * scale;
        const targetContext = target.getContext('2d');
        if (!targetContext) throw new Error('Could not draw battle-mode art');
        const availableSize = target.width - inset * 2 * scale;
        const imageScale = Math.min(availableSize / croppedWidth, availableSize / croppedHeight);
        const drawWidth = croppedWidth * imageScale;
        const drawHeight = croppedHeight * imageScale;
        targetContext.drawImage(
          image,
          left,
          top,
          croppedWidth,
          croppedHeight,
          (target.width - drawWidth) / 2,
          (target.height - drawHeight) / 2,
          drawWidth,
          drawHeight,
        );
        resolve(target.toDataURL('image/png'));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error('Could not load battle-mode art'));
    image.src = url;
  });
  trimmedBattleModeIconUrls.set(url, request);
  return request;
}

/** `isAppIcon` skips the trim/crop pipeline below — that's tuned for transparent battle-mode
 * emblems, but the app icon is a solid tile meant to be cover-cropped (same as the nav pill and
 * command-center kicker badge), not letterboxed inside a contain frame. */
export function TrimmedBattleModeIcon({ src, isAppIcon = false }: Readonly<{ src: string; isAppIcon?: boolean }>) {
  const [trimmedSrc, setTrimmedSrc] = useState(src);

  useEffect(() => {
    if (isAppIcon) return;
    let disposed = false;
    setTrimmedSrc(src);
    trimmedBattleModeIconUrl(src)
      .then((framedSrc) => {
        if (!disposed) setTrimmedSrc(framedSrc);
      })
      .catch(() => {
        // Keep the original source visible if its host disallows canvas reads.
      });
    return () => { disposed = true; };
  }, [src, isAppIcon]);

  const className = isAppIcon ? 'clash-recent-games-mode-icon clash-recent-games-mode-icon--app' : 'clash-recent-games-mode-icon';
  return <img src={isAppIcon ? src : trimmedSrc} alt="" className={className} loading="lazy" decoding="async" />;
}
function ClashDeckCardArt({ card, artType }: Readonly<{ card: ClashRoyaleData['currentDeck'][number]; artType: DeckCardArtType }>) {
  if (artType !== 'hero') return <FramedClashRoyaleCardImage card={card} artType={artType} />;
  if (!card.iconUrl) return <span aria-hidden>{card.name.charAt(0)}</span>;
  return (
    <img
      src={card.iconUrl}
      alt={card.name}
      loading="lazy"
      decoding="async"
      onError={(event) => {
        if (card.fallbackIconUrl && event.currentTarget.src !== card.fallbackIconUrl) {
          event.currentTarget.src = card.fallbackIconUrl;
        }
      }}
    />
  );
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-GB');
}

/** Win/loss/draw tally only — battle trophyChange isn't safe to sum across battles: Path of
 * Legends swings share the same field but aren't fixed-size like ladder trophies, so a mixed-mode
 * sum reads as a plausible but meaningless "trophy gain". Individual battles still show their own
 * real trophyChange in the battle log, just never combined across battles of different types. */
function recentRecord(battles: ClashRoyaleBattle[]) {
  return battles.reduce((record, battle) => {
    if (battle.result === 'win') record.wins += 1;
    else if (battle.result === 'loss') record.losses += 1;
    else record.draws += 1;
    return record;
  }, { wins: 0, losses: 0, draws: 0 });
}

/** `battles` must be newest-first (as `recentBattles` already is) — the streak is a run of the
 * same result starting from the most recent game, same convention as the Valorant widget's
 * `currentStreak`. */
function currentStreak(battles: ClashRoyaleBattle[]): { result: ClashRoyaleBattle['result']; length: number } | undefined {
  const latest = battles[0];
  if (!latest) return undefined;
  let length = 0;
  for (const battle of battles) {
    if (battle.result !== latest.result) break;
    length += 1;
  }
  return { result: latest.result, length };
}

function streakModifier(result: ClashRoyaleBattle['result'] | undefined): string {
  if (result === 'win') return ' is-up';
  if (result === 'loss') return ' is-down';
  return '';
}

function formatBattleType(type: string): string {
  return type
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll(/[_-]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function deckCardArtType(card: ClashRoyaleData['currentDeck'][number]): DeckCardArtType {
  if (card.rarity === 'champion') return 'hero';
  return card.iconUrl?.endsWith('CardEvolution.png') ? 'evolution' : 'regular';
}

export function Crown({ filled }: Readonly<{ filled: boolean }>) {
  return (
    <svg viewBox="0 0 24 18" aria-hidden className="clash-crown">
      <path d="M2 15.5h20l-1.1-8.9-5.4 4.3L12 2.5 8.5 10.9 3.1 6.6 2 15.5Z" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M4 17h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function ClashCrownScore({ crownsFor, crownsAgainst, className = '' }: Readonly<{ crownsFor: number; crownsAgainst: number; className?: string }>) {
  const rootClassName = className ? `clash-crown-score ${className}` : 'clash-crown-score';
  return (
    <span className={rootClassName} aria-hidden>
      <span className="clash-crown-score-art-frame"><img src={CLASH_ART.playerCrown} alt="" width="64" height="48" className="clash-crown-score-art" /></span>
      <strong>{crownsFor}–{crownsAgainst}</strong>
      <span className="clash-crown-score-art-frame"><img src={CLASH_ART.opponentCrown} alt="" width="64" height="48" className="clash-crown-score-art" /></span>
    </span>
  );
}

function ClashBattleHeading({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <p className="clash-eyebrow clash-battle-heading">
      <span className="clash-battle-heading-art"><img src={CLASH_ROYALE_BATTLE_ART.trophyRoad} alt="" width="64" height="64" /></span>
      {children}
    </p>
  );
}

export function ClashRoyaleProfile({ data, compact = false }: Readonly<{ data: ClashRoyaleData; compact?: boolean }>) {
  const { profile } = data;
  const path = profile.pathOfLegends;
  const displayLeagueNumber = path ? pathOfLegendsDisplayLeagueNumber(path.leagueNumber) : undefined;
  const leagueName = path ? pathOfLegendsLeagueName(path.leagueNumber) : undefined;

  return (
    <section className={`clash-profile${compact ? ' clash-profile--compact' : ''}`}>
      <div className="clash-profile-main">
        <h2 className="clash-profile-name">{profile.name}</h2>
        <p className="clash-profile-tag">{profile.tag}</p>
        {profile.clanName && (
          <p className="clash-profile-clan">
            {profile.clanBadgeUrl && <img src={profile.clanBadgeUrl} alt="" aria-hidden width="18" height="18" decoding="async" />}
            {profile.clanName}{profile.clanScore !== undefined ? ` · ${formatNumber(profile.clanScore)}` : ''}
          </p>
        )}
      </div>
      <div className="clash-profile-panels">
        <div className="clash-trophy-panel">
          <p className="clash-trophy-label">Trophy road</p>
          <p className="clash-trophy-value">{formatNumber(profile.trophies)}</p>
        </div>
        {path && displayLeagueNumber && (
          <div className="clash-path-panel">
            <p className="clash-eyebrow">Path of Legends</p>
            <div className="clash-path-league">
              {clashRoyaleLeagueArt(displayLeagueNumber) && (
                <img src={clashRoyaleLeagueArt(displayLeagueNumber)} alt="" aria-hidden className="clash-path-league-badge" />
              )}
              <div className="min-w-0">
                <p className="clash-path-league-name">{leagueName}</p>
                {!compact && (path.trophies > 0 || (path.rank ?? 0) > 0) && (
                  <div className="clash-path-figures">
                    {path.trophies > 0 && <strong>{formatNumber(path.trophies)}</strong>}
                    {path.rank !== undefined && path.rank !== null && path.rank > 0 && <span>#{formatNumber(path.rank)}</span>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function ClashRoyaleDeck({ data, compact = false }: Readonly<{ data: ClashRoyaleData; compact?: boolean }>) {
  const deck: { card: ClashRoyaleData['currentDeck'][number]; artType: DeckCardArtType }[] = data.currentDeck.map((card) => ({
    card,
    artType: deckCardArtType(card),
  }));
  if (data.deckHero) deck.splice(Math.min(data.deckHeroIndex ?? deck.length, deck.length), 0, { card: data.deckHero, artType: 'hero' as const });
  if (deck.length === 0) return <p className="text-sm text-ink-faint">No current deck reported.</p>;
  return (
    <ul className={`clash-deck-grid${compact ? ' clash-deck-grid--compact' : ''}`}>
      {deck.map(({ card, artType }) => (
        <li key={card.id} className={`clash-card clash-card--${artType}${artType === 'regular' && card.rarity === 'legendary' ? ' clash-card--legendary' : ''}`}>
          <ClashDeckCardArt card={card} artType={artType} />
        </li>
      ))}
    </ul>
  );
}

export function ClashRoyaleBattlePulse({ data }: Readonly<{ data: ClashRoyaleData }>) {
  if (data.recentBattles.length === 0) return <p className="text-sm text-ink-faint">Play a battle to start a fresh activity readout.</p>;
  // The API supplies up to 25 battles, while this compact pulse explicitly represents fifteen.
  // Use one bounded list for both the result strip and its aggregate figures. `recentBattles` is
  // already newest-first, and the grid renders in that same order (top-left = latest game) so it
  // reads consistently with the battle log on the detail page.
  const battles = data.recentBattles.slice(0, 15);
  const record = recentRecord(battles);
  const battleCount = battles.length;
  const winRate = Math.round((record.wins / battleCount) * 100);
  const gamesLabel = `Last ${battleCount} ${battleCount === 1 ? 'game' : 'games'}`;
  const streak = currentStreak(battles);
  return (
    <section className="clash-recent-games">
      <header className="clash-recent-games-header">
        <div>
          <ClashBattleHeading>{gamesLabel}</ClashBattleHeading>
          <p className="clash-recent-games-record"><strong>{record.wins}</strong> wins <span>·</span> <strong>{record.losses}</strong> losses{record.draws > 0 && <><span>·</span> <strong>{record.draws}</strong> draws</>}</p>
        </div>
        <div className="clash-recent-games-trend">
          <p className="clash-recent-games-rate"><strong>{winRate}%</strong><span>win rate</span></p>
          {streak && streak.length > 1 && (
            <span className={`clash-streak-badge${streakModifier(streak.result)}`}>{streak.length}{STREAK_RESULT_LABELS[streak.result]} streak</span>
          )}
        </div>
      </header>
      <ol className="clash-recent-games-grid" aria-label={`Results of ${gamesLabel.toLowerCase()}, latest first`}>
        {battles.map((battle, index) => (
          <BattleModeTile key={`${battle.battleTime}-${index}`} battle={battle} index={index} battleCount={battleCount} />
        ))}
      </ol>
    </section>
  );
}

// No `fallbackPathLeagueNumber` here: Supercell's battle log doesn't reliably carry a historic
// league per battle, and the player's *current* league is very often a different one than the
// league these past games were actually played in — better to fall back to a generic icon than
// to stamp every unresolved Path of Legends game with a league it may never have been played at.
function BattleModeTile({ battle, index, battleCount }: Readonly<{ battle: ClashRoyaleBattle; index: number; battleCount: number }>) {
  const icon = clashRoyaleBattleIcon(battle);
  const isModeEmblem = icon.src !== CLASH_ROYALE_BATTLE_ART.trophyRoad;
  const isMergeTactics = `${battle.type} ${battle.modeName ?? ''}`.toLowerCase().includes('merge tactics');
  return (
    <li
      data-result={battle.result}
      aria-label={`Game ${index + 1} of ${battleCount}: ${BATTLE_RESULT_LABELS[battle.result]} in ${icon.label}, ${battle.crownsFor} to ${battle.crownsAgainst} crowns, ${relativeTime(battle.battleTime)}`}
    >
      <span className={`clash-recent-games-mode-icon-frame${isModeEmblem ? ' clash-recent-games-mode-icon-frame--emblem' : ''}${isMergeTactics ? ' clash-recent-games-mode-icon-frame--merge-tactics' : ''}`} aria-hidden>
        <TrimmedBattleModeIcon src={icon.src} isAppIcon={icon.isAppIcon} />
      </span>
    </li>
  );
}

export function ClashRoyaleBattleLog({ data }: Readonly<{ data: ClashRoyaleData }>) {
  const battles = data.recentBattles;
  if (battles.length === 0) return <p className="text-sm text-ink-faint">No recent battles.</p>;
  const record = recentRecord(battles);
  const winRate = Math.round((record.wins / battles.length) * 100);
  return (
    <div className="clash-battle-log-section">
      <header className="clash-recent-games-header">
        <div>
          <ClashBattleHeading>Last {battles.length} battles</ClashBattleHeading>
          <p className="clash-recent-games-record"><strong>{record.wins}</strong> wins <span>·</span> <strong>{record.losses}</strong> losses{record.draws > 0 && <><span>·</span> <strong>{record.draws}</strong> draws</>}</p>
        </div>
        <p className="clash-recent-games-rate"><strong>{winRate}%</strong><span>win rate</span></p>
      </header>
      <ol className="clash-battle-log">
        {battles.map((battle, index) => (
          <li key={`${battle.battleTime}-${index}`} className="clash-battle-row" data-result={battle.result}>
            <div className="clash-battle-score" aria-label={`${battle.crownsFor} to ${battle.crownsAgainst} crowns`}>
              <ClashCrownScore crownsFor={battle.crownsFor} crownsAgainst={battle.crownsAgainst} />
            </div>
            <div className="clash-battle-main">
              <div className="clash-battle-title-row">
                <p>{battle.opponentName ?? 'Unknown opponent'}</p>
                <time dateTime={battle.battleTime}>{relativeTime(battle.battleTime)}</time>
              </div>
              <div className="clash-battle-meta">
                <span>{formatBattleType(battle.type)}</span>
                <span>{BATTLE_RESULT_LABELS[battle.result]}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
