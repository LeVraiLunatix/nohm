import type { ReactNode } from 'react';
import type { CommandCenterSlot } from '@nohm/shared';
import { pathOfLegendsDisplayLeagueNumber } from '@nohm/shared';
import { CLASH_ROYALE_TROPHY_ICON_URL, clashRoyaleArenaArt, clashRoyaleBattleIcon, clashRoyaleLeagueArt } from '../../../lib/clashRoyale';
import { ClashCrownScore, TrimmedBattleModeIcon } from '../../../widgets/ClashRoyaleWidgets';

/** Crown-score chips for a run of battles — shared by the win-streak and session cards below,
 * which differ only in their badge column and which battles they pass in. */
function ClashCrownRow({ battles }: Readonly<{ battles: { crownsFor: number; crownsAgainst: number; battleTime: string; result?: 'win' | 'loss' | 'draw' }[] }>): ReactNode {
  const shown = battles.slice(-5);
  const hiddenCount = battles.length - shown.length;
  return (
    <ol className="command-clash-streak-crowns" aria-label="Crown score for each battle">
      {hiddenCount > 0 && <li className="command-clash-streak-crowns-overflow">+{hiddenCount}</li>}
      {shown.map((battle, index) => (
        <li key={`${battle.battleTime}-${index}`} data-result={battle.result}>
          <div className="clash-battle-score" aria-label={`${battle.crownsFor} to ${battle.crownsAgainst} crowns`}>
            <ClashCrownScore crownsFor={battle.crownsFor} crownsAgainst={battle.crownsAgainst} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** This only reaches the secondary carousel for a long streak (>10, see clashRoyaleWinStreakCandidate)
 * — short ones are tile-only now, so this card can afford to be a little more celebratory. The badge
 * shows the mode of the streak's most recent win (trophy road / 2v2 / clan wars / merge tactics /
 * Path of Legends league) via the same lookup the recent-battles pulse uses, rather than a generic
 * glyph. Each streak win gets the same crown-score chip as the battle log (`ClashCrownScore`) — a
 * single non-wrapping row, capped at the most recent 5 with a "+N" chip for the rest, so a long
 * streak never overflows the carousel's fixed content height. */
export function ClashRoyaleWinStreakSecondary({ slot }: Readonly<{ slot: CommandCenterSlot }>): ReactNode {
  if (slot.render.type !== 'clash-royale-moment' || slot.render.kind !== 'win-streak') return null;
  const { streakCrowns, streakBattleMode } = slot.render;
  if (!streakCrowns?.length) return null;
  const icon = streakBattleMode ? clashRoyaleBattleIcon(streakBattleMode) : undefined;
  return <div className="command-secondary-clash-streak mt-4">
    <div className="command-clash-streak-badge" aria-hidden>
      {icon && <TrimmedBattleModeIcon src={icon.src} isAppIcon={icon.isAppIcon} />}
    </div>
    <div className="min-w-0 flex-1">
      <p className="command-hero-title text-sm font-semibold text-ink">{slot.title}</p>
      <ClashCrownRow battles={streakCrowns} />
      <p className="mt-2 text-[11px] text-ink-faint">{slot.detail}</p>
    </div>
  </div>;
}

/** A session has no single battle mode to badge (it's whatever mix of games happened in the
 * window), so unlike the win-streak card above it skips the badge column entirely and leans on
 * the trophy mark in the crowns row for its Clash Royale identity. */
export function ClashRoyaleSessionSecondary({ slot }: Readonly<{ slot: CommandCenterSlot }>): ReactNode {
  if (slot.render.type !== 'clash-royale-moment' || slot.render.kind !== 'session') return null;
  const { sessionCrowns } = slot.render;
  if (!sessionCrowns?.length) return null;
  return <div className="command-secondary-clash-streak mt-4">
    <div className="min-w-0 flex-1">
      <p className="command-hero-title text-sm font-semibold text-ink">{slot.title}</p>
      <ClashCrownRow battles={sessionCrowns} />
      <p className="mt-2 text-[11px] text-ink-faint">{slot.detail}</p>
    </div>
  </div>;
}

/** Small icon-plus-number stat row for a new personal best — same treatment as Clash of Clans'
 * star/capital-gold stats (see secondary/clashOfClans.tsx), just for a trophy count instead. */
export function ClashRoyaleBestTrophiesSecondary({ slot }: Readonly<{ slot: CommandCenterSlot }>): ReactNode {
  if (slot.render.type !== 'clash-royale-moment' || slot.render.kind !== 'best-trophies') return null;
  const { bestTrophies } = slot.render;
  if (bestTrophies === undefined) return null;
  return <p className="command-clash-of-clans-stat mt-4" aria-label={`${bestTrophies.toLocaleString()} trophies`}>
    <span><img src={CLASH_ROYALE_TROPHY_ICON_URL} alt="" aria-hidden />{bestTrophies.toLocaleString()}</span>
  </p>;
}

/** The key art for a new arena or league promotion, rendered as a regular left-aligned thumbnail —
 * same layout as the Spotify/Roblox secondary cards — instead of the right-anchored, faded backdrop
 * treatment those two moments used to get from the panel's own `art` prop (still used for the hero,
 * see `secondaryArt` in DailyCommandCenter.tsx). */
export function ClashRoyaleArenaLeagueSecondary({ slot }: Readonly<{ slot: CommandCenterSlot }>): ReactNode {
  if (slot.render.type !== 'clash-royale-moment' || (slot.render.kind !== 'arena' && slot.render.kind !== 'league')) return null;
  const { render } = slot;
  let art: string | undefined;
  if (render.kind === 'arena' && render.arenaName) {
    art = clashRoyaleArenaArt(render.arenaName);
  } else if (render.kind === 'league' && render.leagueNumber !== undefined) {
    art = clashRoyaleLeagueArt(pathOfLegendsDisplayLeagueNumber(render.leagueNumber));
  }
  return <div className="command-secondary-spotify mt-4">
    {art && <img src={art} alt="" aria-hidden className="command-clash-royale-art-badge" />}
    <div className="min-w-0"><p className="command-hero-title text-sm font-semibold text-ink">{slot.title}</p><p className="mt-0.5 text-sm text-ink-muted">{slot.detail}</p></div>
  </div>;
}
