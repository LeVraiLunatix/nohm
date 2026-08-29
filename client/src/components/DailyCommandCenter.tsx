import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type {
  CalendarData,
  CommandCenterData,
  CommandCenterSlot,
  GitHubData,
  GmailData,
  HealthData,
  RobloxData,
  SpotifyData,
  SteamData,
  WeatherData,
} from '@nohm/shared';
import { deg, glyph, HUMIDITY_COLOR, PRECIP_COLOR, UV_COLOR, weatherLocation, WIND_COLOR } from '../lib/weather';
import { mapsCoordinatesHref, mapsSearchHref } from '../lib/maps';
import { latestActivityDay } from '../lib/health';
import { rampColor } from '../lib/contributions';
import { formatEventDate } from '../lib/time';
import { pathOfLegendsDisplayLeagueNumber } from '@nohm/shared';
import { CLASH_ROYALE_APP_ICON_URL, CLASH_ROYALE_TROPHY_ICON_URL, clashRoyaleArenaArt, clashRoyaleLeagueArt } from '../lib/clashRoyale';
import {
  CLASH_OF_CLANS_APP_ICON_URL,
  CLASH_OF_CLANS_CAPITAL_GOLD_ICON_URL,
  CLASH_OF_CLANS_RAID_WEEKEND_ICON_URL,
  CLASH_OF_CLANS_WAR_ICON_URL,
} from '../lib/clashOfClans';
import { publicAsset } from '../lib/publicAsset';
import { spotifyArtFor } from '../widgets/SpotifyWidget';
import { accentStyle, SECTIONS, SectionIcon } from '../sections/registry';
import { sectionHref } from '../router';
import { ActivityRings, CompactActivityRings } from './ActivityRings';
import { GitHubMark } from './GitHubMark';
import { SteamMark } from './SteamMark';
import { CalendarMark } from './CalendarMark';
import { useI18n } from '../i18n/I18nProvider';
import { MailMark } from './MailMark';
import { NewsMark } from './NewsMark';
import { MessageMark } from './MessageMark';
import { heroExtraFor, heroLeadFor, SecondaryContent } from './command-center/SecondaryContent';
import { ValorantRankProgress } from './command-center/ValorantRankProgress';
import { AiToolMark } from './command-center/secondary/fallback';
import { QualityGatePill } from './command-center/secondary/sonar';
import { SonarWordmark } from './SonarWordmark';
import { useRobloxArtPalette } from './command-center/useRobloxArtPalette';
import { useCommandCenterData, type AiUsageByTool } from './command-center/useCommandCenterData';
import '../sections/spotify/spotify.css';
import { useVisibleSections } from '../sections/settings/preferences';

const SECONDARY_CAROUSEL_INTERVAL_MS = 7_000;
const SOON_MS = 6 * 60 * 60_000;

function formatEventDay(event: CalendarData['events'][number]): string {
  const today = new Date().toLocaleDateString('en-CA');
  if (event.date === today) return event.allDay ? 'Today' : event.startLabel;
  const day = formatEventDate(event.date, 'long', 'long');
  return event.allDay ? day : `${day} · ${event.startLabel}`;
}

function startsIn(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60_000));
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `in ${hours} h ${rest} min` : `in ${hours} h`;
}

/** Calendar timing is intentionally computed in the browser so it keeps counting down between polls. */
function eventTiming(event: CalendarData['events'][number], now: number): string {
  const start = Date.parse(event.start);
  if (start <= now && now < Date.parse(event.end)) {
    return event.allDay ? 'Today · all day' : `Now · until ${event.endLabel}`;
  }
  if (!event.allDay && start - now < SOON_MS) return `${startsIn(start - now)} · ${event.startLabel}`;
  return formatEventDay(event);
}

export function toneFor(slot: CommandCenterSlot): 'personal' | 'github' | 'ai' | 'health' | 'spotify' | 'weather' | 'steam' | 'roblox' | 'clash-royale' | 'clash-of-clans' | 'valorant' | 'minecraft' | 'rocket-league' | 'claude' | 'codex' {
  if (slot.accent) return slot.accent;
  if (slot.source === 'github') return 'github';
  if (slot.source === 'ai-usage') return 'ai';
  if (slot.source === 'health') return 'health';
  if (slot.source === 'spotify') return 'spotify';
  if (slot.source === 'weather') return 'weather';
  if (slot.source === 'steam') return 'steam';
  if (slot.source === 'roblox') return 'roblox';
  if (slot.source === 'clash-royale') return 'clash-royale';
  if (slot.source === 'clash-of-clans') return 'clash-of-clans';
  if (slot.source === 'valorant') return 'valorant';
  if (slot.source === 'minecraft') return 'minecraft';
  if (slot.source === 'rocket-league') return 'rocket-league';
  return 'personal';
}

const WEATHER_KIND_GLYPH: Record<Extract<CommandCenterSlot['render'], { type: 'weather-signal' }>['kind'], string> = {
  severe: '⛈️', hot: '🌡️', cold: '🥶', rain: '🌧️', wind: '💨', uv: '☀️', sunset: '🌇', moon: '🌕',
};

/** Recolors the hero panel's accent per weather signal kind instead of one flat weather orange for
 * all eight — reuses the same per-quantity colors the weather section's own gauges/sparkline use
 * (wind/UV/rain), so "cold" reading blue and "hot" reading orange isn't a color invented just for
 * this card. */
const WEATHER_KIND_COLOR: Record<Extract<CommandCenterSlot['render'], { type: 'weather-signal' }>['kind'], string> = {
  severe: 'light-dark(#c0392b, #f87171)',
  hot: 'light-dark(#c2410c, #fb923c)',
  cold: 'light-dark(#1d4ed8, #7dd3fc)',
  rain: PRECIP_COLOR,
  wind: WIND_COLOR,
  uv: UV_COLOR,
  sunset: 'light-dark(#c2477c, #fda4af)',
  moon: HUMIDITY_COLOR,
};

/** Recolors a hero/secondary panel per weather signal kind — see WEATHER_KIND_COLOR above. Shared
 * so the secondary carousel picks up the same per-kind colors the hero panel and tiles already use,
 * instead of falling back to the flat `--color-accent-weather` every weather kind used to share. */
export function weatherPanelStyle(slot: CommandCenterSlot): CSSProperties | undefined {
  return slot.render.type === 'weather-signal' ? ({ '--panel-accent': WEATHER_KIND_COLOR[slot.render.kind] } as CSSProperties) : undefined;
}

function secondarySlotsFor(commandCenter: CommandCenterData | undefined): CommandCenterSlot[] {
  if (!commandCenter) return [];
  return Array.isArray(commandCenter.secondary)
    ? commandCenter.secondary
    : [commandCenter.secondary as unknown as CommandCenterSlot];
}

export function CommandPanel({
  href,
  label,
  className,
  children,
  fullCardLink = false,
  style,
  art,
}: Readonly<{
  href: string;
  label: string;
  className: string;
  children: ReactNode;
  fullCardLink?: boolean;
  style?: CSSProperties;
  /** Backdrop key art (arena/league renders) — painted first so it sits behind all other children. */
  art?: string;
}>) {
  return (
    <div className={`${className} cursor-pointer${fullCardLink ? ' command-panel--full-link' : ''}`} style={style}>
      {art && <img src={art} alt="" aria-hidden className="command-panel-art" />}
      <a href={href} aria-label={label} className="command-panel-stretched-link" />
      {children}
    </div>
  );
}

/** The backdrop art behind hero/secondary Clash Royale cards — only 'arena' and 'league' moments
 * have real art (see lib/clashRoyale.ts); the rest render as plain panels. */
export function slotArt(slot: CommandCenterSlot): string | undefined {
  if (slot.render.type === 'valorant-slot') return slot.render.artUrl;
  if (slot.render.type !== 'clash-royale-moment') return undefined;
  if (slot.render.kind === 'arena' && slot.render.arenaName) return clashRoyaleArenaArt(slot.render.arenaName);
  if (slot.render.kind === 'league' && slot.render.leagueNumber !== undefined) {
    return clashRoyaleLeagueArt(pathOfLegendsDisplayLeagueNumber(slot.render.leagueNumber));
  }
  return undefined;
}

/** Same art as `slotArt`, but suppressed for the secondary carousel's arena/league moments — those
 * render their own left-aligned artwork instead (see ClashRoyaleArenaLeagueSecondary), so painting
 * the same image again as a faded backdrop would just duplicate it. Hero keeps the backdrop
 * treatment via `slotArt` directly. */
export function secondaryArt(slot: CommandCenterSlot): string | undefined {
  if (slot.render.type === 'clash-royale-moment' && (slot.render.kind === 'arena' || slot.render.kind === 'league')) return undefined;
  return slotArt(slot);
}

/** A small service-icon badge next to the kicker on hero/secondary cards, so a card reads
 * unambiguously even before its own art/thumbnail loads (or, for arena/league, when there's no art
 * mapped for that name yet). */
function KickerBadge({ slot }: Readonly<{ slot: CommandCenterSlot }>) {
  if (slot.render.type === 'clash-royale-moment') {
    return <img src={CLASH_ROYALE_APP_ICON_URL} alt="" aria-hidden className="command-kicker-badge" />;
  }
  if (slot.render.type === 'clash-of-clans-moment') {
    return <img src={CLASH_OF_CLANS_APP_ICON_URL} alt="" aria-hidden className="command-kicker-badge" />;
  }
  if (slot.render.type === 'spotify-now-playing' || slot.render.type === 'spotify-track' || slot.render.type === 'spotify-artist' || slot.render.type === 'spotify-album') {
    return <img src={publicAsset('spotify/icon.svg')} alt="" aria-hidden className="command-kicker-badge" />;
  }
  if (slot.render.type === 'steam-now-playing' || slot.render.type === 'steam-achievement') {
    return <SteamMark className="command-kicker-badge" />;
  }
  if (slot.render.type === 'roblox-now-playing') {
    return <img src={publicAsset('roblox/icon.svg')} alt="" aria-hidden className="command-kicker-badge" />;
  }
  if (slot.render.type === 'valorant-slot') {
    if (slot.render.badge === 'riot') {
      return <span className="command-kicker-badge command-kicker-badge--riot" aria-hidden><img src={publicAsset('riot/mark.png')} alt="" /></span>;
    }
    return <ValorantMark className="command-kicker-badge" />;
  }
  if (slot.render.type === 'rocket-league-slot') return <img src={publicAsset('rocket-league/icon.png')} alt="" aria-hidden className="command-kicker-badge command-kicker-badge--rocket-league" />;
  if (slot.render.type === 'minecraft-slot') {
    return <img src={publicAsset('minecraft/mark.png')} alt="" aria-hidden className="command-kicker-badge" />;
  }
  if (slot.render.type === 'github-contributions' || slot.render.type === 'github-reviews' || slot.render.type === 'github-open-prs') {
    return <GitHubMark className="command-kicker-badge text-(--color-github-mark)" />;
  }
  if (slot.render.type === 'weather-signal') {
    return <span className="command-kicker-badge command-kicker-badge--glyph" aria-hidden>{WEATHER_KIND_GLYPH[slot.render.kind]}</span>;
  }
  return null;
}

/** The supplied Valorant asset is black on transparent; paint its exact silhouette in Riot red so
 * it stays legible on the command center's near-black game surfaces. */
function ValorantMark({ className }: Readonly<{ className: string }>) {
  const markUrl = publicAsset('valorant/mark.png');
  return (
    <span
      aria-hidden
      className={`command-valorant-mark ${className}`}
      style={{
        backgroundColor: 'var(--color-accent-valorant)',
        maskImage: `url(${markUrl})`,
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        maskSize: 'contain',
        WebkitMaskImage: `url(${markUrl})`,
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        WebkitMaskSize: 'contain',
      }}
    />
  );
}

/** The hero/secondary kicker line's content — normally the badge plus plain `slot.kicker` text,
 * but SonarCloud's own wordmark reads better than repeating its name as text, so that source
 * swaps in the logo (the wordmark's arc doubles as the badge) ahead of the "Quality Gate" text
 * the kicker string carries. The sr-only span keeps "SonarCloud" in the accessible name, since
 * the wordmark image itself is decorative (aria-hidden). */
function KickerLabel({ slot }: Readonly<{ slot: CommandCenterSlot }>) {
  if (slot.render.type === 'sonar-quality-gate') {
    return <><span className="sr-only">SonarCloud</span><SonarWordmark className="command-kicker-wordmark" /> Quality Gate</>;
  }
  return <><KickerBadge slot={slot} />{slot.kicker}</>;
}

/** Which badge illustrates a Clash of Clans moment card — war and raid weekend get their own
 * in-game icon (war preparation reuses the war icon, since it's the same event just before it's
 * actionable); league uses the player's own current league-tier art straight from Supercell's API
 * rather than a static local asset, since there are far too many numbered tiers to vendor. */
function clashOfClansMomentIcon(render: Extract<CommandCenterSlot['render'], { type: 'clash-of-clans-moment' }>): string {
  if (render.kind === 'league') return render.leagueIconUrl ?? CLASH_OF_CLANS_APP_ICON_URL;
  return render.kind === 'raid-weekend' ? CLASH_OF_CLANS_RAID_WEEKEND_ICON_URL : CLASH_OF_CLANS_WAR_ICON_URL;
}

/** Splits a merged "both tools reset together" ai-usage-tool tile into one tile per tool. The
 * server intentionally merges Claude+Codex into a single candidate (the ranker only ever seats one
 * ai-usage slot on the whole board, so merging is how the second tool's reset avoids being silently
 * dropped) — but on tiles specifically we'd rather show each tool its own card than squeeze both
 * into one. Secondary/hero keep the merged card as-is; this only runs on the tile rail. Recomputes
 * title/detail from the live envelope rather than reusing the merged slot's combined strings, since
 * those describe both tools at once. */
export function aiUsageTiles(slot: CommandCenterSlot, aiUsage: AiUsageByTool): CommandCenterSlot[] {
  if (slot.render.type !== 'ai-usage-tool' || slot.render.toolIds.length < 2) return [slot];
  const { metric } = slot.render;
  const metricLabel = metric === 'fiveHour' ? '5-hour' : 'weekly';
  return slot.render.toolIds.map((toolId) => {
    const data = aiUsage[toolId];
    const label = toolId === 'claude' ? 'Claude' : 'Codex';
    const window = metric === 'fiveHour' ? data?.fiveHour : data?.weekly;
    return {
      ...slot,
      id: `${slot.id}:${toolId}`,
      accent: toolId,
      title: `${label} usage just reset`,
      detail: window ? `${Math.round(window.usedPercent)}% of the ${metricLabel} limit` : slot.detail,
      render: { type: 'ai-usage-tool' as const, toolIds: [toolId], metric },
    };
  });
}

/** The square Steam icon for a tile — the game's library icon for now-playing, the achievement's
 * own icon for achievements — never the wide capsule header used in secondary/hero. */
function steamIconFor(
  render: Extract<CommandCenterSlot['render'], { type: 'steam-now-playing' | 'steam-achievement' }>,
  steam: SteamData | undefined,
): string | undefined {
  if (render.type === 'steam-now-playing') {
    const game = steam?.currentGame?.appId === render.appId
      ? steam.currentGame
      : steam?.recentlyPlayed.find((g) => g.appId === render.appId);
    return game?.iconUrl;
  }
  const achievements = steam?.achievements?.appId === render.appId ? steam.achievements : undefined;
  return achievements?.recentUnlocks.find((a) => a.apiName === render.apiName)?.iconUrl;
}

function signalMark(
  slot: CommandCenterSlot,
  health: HealthData | undefined,
  roblox: RobloxData | undefined,
  spotify: SpotifyData | undefined,
  steam: SteamData | undefined,
): ReactNode {
  const activityDay = health ? latestActivityDay(health) : undefined;
  if (slot.render.type === 'spotify-now-playing' || slot.render.type === 'spotify-track' || slot.render.type === 'spotify-artist' || slot.render.type === 'spotify-album') {
    const artUrl = spotifyArtFor(slot.render, spotify);
    return <img src={artUrl ?? publicAsset('spotify/icon.svg')} alt="" aria-hidden className="command-spotify-tile-icon" />;
  }
  if (slot.render.type === 'steam-now-playing' || slot.render.type === 'steam-achievement') {
    const iconUrl = steamIconFor(slot.render, steam);
    if (iconUrl) return <img src={iconUrl} alt="" aria-hidden className="command-steam-tile-icon" />;
    return <span className="command-steam-tile-mark" aria-hidden><SteamMark className="h-4 w-4" /></span>;
  }
  if (slot.render.type === 'clash-royale-moment') {
    return <img src={slotArt(slot) ?? CLASH_ROYALE_APP_ICON_URL} alt="" aria-hidden className="command-clash-royale-tile-icon" />;
  }
  if (slot.render.type === 'clash-of-clans-moment') {
    return <img src={clashOfClansMomentIcon(slot.render)} alt="" aria-hidden className="command-clash-of-clans-tile-icon" />;
  }
  return fallbackSignalMark(slot, health, activityDay, roblox);
}

function fallbackSignalMark(
  slot: CommandCenterSlot,
  health: HealthData | undefined,
  activityDay: ReturnType<typeof latestActivityDay> | undefined,
  roblox: RobloxData | undefined,
): ReactNode {
  return healthSignalMark(slot, health, activityDay)
    ?? aiSignalMark(slot)
    ?? serviceSignalMark(slot)
    ?? gameSignalMark(slot, roblox)
    ?? <span className="command-signal-dot" aria-hidden />;
}

function healthSignalMark(
  slot: CommandCenterSlot,
  health: HealthData | undefined,
  activityDay: ReturnType<typeof latestActivityDay> | undefined,
): ReactNode | undefined {
  if (slot.render.type === 'health-rings' && health && activityDay) {
    return <CompactActivityRings
      activeEnergyKcal={activityDay.activeEnergyKcal ?? 0}
      exerciseMinutes={activityDay.exerciseMinutes ?? 0}
      standHours={activityDay.standHours ?? 0}
      goals={health.goals}
    />;
  }
  return undefined;
}

function aiSignalMark(slot: CommandCenterSlot): ReactNode | undefined {
  if (slot.accent) return <AiToolMark accent={slot.accent} className="h-4 w-4 shrink-0" />;
  if (slot.render.type === 'ai-usage-tool' && slot.render.toolIds.length > 1) {
    return <span className="flex shrink-0 flex-col items-center gap-0.5">
      {slot.render.toolIds.map((toolId) => <AiToolMark key={toolId} accent={toolId} className="h-4 w-4" />)}
    </span>;
  }
  return undefined;
}

function serviceSignalMark(slot: CommandCenterSlot): ReactNode | undefined {
  if (slot.kind === 'github') {
    return <GitHubMark className="h-[1.1rem] w-[1.1rem] shrink-0 text-(--color-github-mark)" />;
  }
  if (slot.kind === 'sonar') {
    return <img src={publicAsset('sonarqube/icon.svg')} alt="" aria-hidden className="command-sonar-tile-icon" />;
  }
  if (slot.kind === 'gmail') {
    return <MailMark className="h-[1.1rem] w-[1.1rem] shrink-0 text-(--color-accent-personal)" />;
  }
  if (slot.kind === 'calendar') {
    return <CalendarMark className="h-[1.1rem] w-[1.1rem] shrink-0 text-(--color-accent-personal)" />;
  }
  if (slot.kind === 'news') {
    return <NewsMark className="h-[1.1rem] w-[1.1rem] shrink-0 text-(--color-accent-personal)" />;
  }
  if (slot.kind === 'imessage') {
    return <MessageMark className="h-[1.1rem] w-[1.1rem] shrink-0 text-(--color-accent-personal)" />;
  }
  return undefined;
}

function gameSignalMark(slot: CommandCenterSlot, roblox: RobloxData | undefined): ReactNode | undefined {
  if (slot.render.type === 'weather-signal') {
    return <span className="text-base leading-none" aria-hidden>{WEATHER_KIND_GLYPH[slot.render.kind]}</span>;
  }
  if (slot.render.type === 'roblox-now-playing') {
    const iconUrl = roblox?.presence?.iconUrl;
    if (iconUrl) return <img src={iconUrl} alt="" className="command-roblox-tile-icon" />;
    return <span className="command-roblox-tile-mark" aria-hidden><img src={publicAsset('roblox/icon.svg')} alt="" /></span>;
  }
  if (slot.render.type === 'valorant-slot') {
    if (slot.render.iconUrl) return <img src={slot.render.iconUrl} alt="" aria-hidden className="command-game-tile-icon" />;
    if (slot.render.badge === 'riot') {
      return <span className="command-game-tile-icon command-game-tile-icon--riot" aria-hidden><img src={publicAsset('riot/mark.png')} alt="" /></span>;
    }
    return <ValorantMark className="command-game-tile-icon" />;
  }
  if (slot.render.type === 'minecraft-slot') {
    return <img src={publicAsset('minecraft/mark.png')} alt="" aria-hidden className="command-game-tile-icon" />;
  }
  if (slot.render.type === 'rocket-league-slot') {
    return <img src={publicAsset('rocket-league/icon.png')} alt="" aria-hidden className="command-game-tile-icon command-game-tile-icon--rocket-league" />;
  }
  return undefined;
}

function signalKickerFor(slot: CommandCenterSlot, isSonarGate: boolean): string {
  if (slot.source === 'roblox') return 'Roblox · Playing now';
  if (slot.source === 'clash-royale') return `Clash Royale · ${slot.kicker}`;
  if (slot.source === 'clash-of-clans') return `Clash of Clans · ${slot.kicker}`;
  return isSonarGate ? 'SonarCloud Quality Gate' : slot.kicker;
}

function signalDetailFor(
  slot: CommandCenterSlot,
  contributionDays: GitHubData['contributions']['days'] | undefined,
  maxContributions: number,
): ReactNode {
  if (contributionDays?.length) {
    return <div className="command-contribution-squares" aria-label="Contributions over the last seven days">
      {contributionDays.map((day) => <span key={day.date} aria-hidden style={{ backgroundColor: rampColor(day.count, maxContributions) }} />)}
    </div>;
  }
  if (slot.render.type === 'sonar-quality-gate') return <div className="mt-1"><QualityGatePill status={slot.render.status} /></div>;
  if (slot.render.type === 'valorant-slot' && slot.render.rank) {
    const { rr, lastChange } = slot.render.rank;
    return <ValorantRankProgress rr={rr} lastChange={lastChange} className="command-valorant-rank-progress--tile" />;
  }
  if ((slot.render.type === 'minecraft-slot' || slot.render.type === 'rocket-league-slot') && slot.render.activity) {
    return <>
      <p className="command-game-activity mt-0.5 truncate text-[11px] font-medium">{slot.render.activity}</p>
      <p className="mt-0.5 truncate text-[11px] text-ink-muted">{slot.detail}</p>
    </>;
  }
  if (slot.render.type === 'clash-royale-moment' && slot.render.kind === 'best-trophies' && slot.render.bestTrophies !== undefined) {
    return <span className="command-icon-stat-tile mt-1" aria-hidden>
      <img src={CLASH_ROYALE_TROPHY_ICON_URL} alt="" />
      {slot.render.bestTrophies.toLocaleString()}
    </span>;
  }
  // Tile is narrow and unlabeled — only ever show this player's own loot here, never the clan
  // total, so a bare number can't be misread as personal (secondary/hero show both, clearly
  // labeled, in ClashOfClansMomentSecondary).
  if (slot.render.type === 'clash-of-clans-moment' && slot.render.kind === 'raid-weekend' && slot.render.personalLoot !== undefined) {
    return <span className="command-icon-stat-tile mt-1" aria-label={`${slot.render.personalLoot.toLocaleString()} capital gold looted by you`}>
      <img src={CLASH_OF_CLANS_CAPITAL_GOLD_ICON_URL} alt="" aria-hidden />
      {slot.render.personalLoot.toLocaleString()}
    </span>;
  }
  if (slot.render.type === 'clash-of-clans-moment' && slot.render.kind === 'league' && slot.render.trophies !== undefined) {
    return <span className="command-icon-stat-tile mt-1" aria-label={`${slot.render.trophies.toLocaleString()} trophies`}>
      <img src={CLASH_ROYALE_TROPHY_ICON_URL} alt="" aria-hidden />
      {slot.render.trophies.toLocaleString()}
    </span>;
  }
  return <p className="mt-0.5 truncate text-[11px] text-ink-muted">{slot.detail}</p>;
}

function shouldHideHeroDetail(hero: CommandCenterData['hero'], extra: ReactNode): boolean {
  if (!extra) return false;
  if (hero.render.type === 'gmail-threads' || hero.render.type === 'sonar-quality-gate') return true;
  return hero.render.type === 'clash-royale-moment' && hero.render.kind === 'best-trophies';
}

export function Signal({ slot, github, health, roblox, spotify, steam }: Readonly<{ slot: CommandCenterSlot; github: GitHubData | undefined; health: HealthData | undefined; roblox: RobloxData | undefined; spotify: SpotifyData | undefined; steam: SteamData | undefined }>) {
  const contributionDays = slot.render.type === 'github-contributions'
    ? github?.contributions.days.slice(-7)
    : undefined;
  const maxContributions = Math.max(...(github?.contributions.days.map((day) => day.count) ?? []), 1);
  const isSonarGate = slot.render.type === 'sonar-quality-gate';
  const signalKicker = signalKickerFor(slot, isSonarGate);
  const signalTitle = isSonarGate && slot.render.type === 'sonar-quality-gate' ? slot.render.projects[0].name : slot.title;
  const weatherAccentStyle = slot.render.type === 'weather-signal'
    ? ({ '--signal-color': WEATHER_KIND_COLOR[slot.render.kind] } as CSSProperties)
    : undefined;
  return (
    <a href={slot.href} className={`command-signal command-signal--${toneFor(slot)}`} style={weatherAccentStyle}>
      {signalMark(slot, health, roblox, spotify, steam)}
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{signalKicker}</p>
        <p className="mt-1 truncate text-sm font-semibold text-ink">{signalTitle}</p>
        {signalDetailFor(slot, contributionDays, maxContributions)}
        {slot.meter !== undefined && (
          <span className={`command-meter${slot.meter <= 15 ? ' command-meter--low' : ''}`}>
            <span style={{ width: `${Math.min(100, Math.max(0, slot.meter))}%` }} />
          </span>
        )}
      </div>
      <span className="command-signal-arrow" aria-hidden>↗</span>
    </a>
  );
}

const secondarySlideVariants = {
  enter: (direction: 1 | -1) => ({ x: `${direction * 100}%` }),
  center: { x: '0%' },
  exit: (direction: 1 | -1) => ({ x: `${direction * -100}%` }),
};

function SecondaryCarousel({
  items,
  activeIndex,
  onActiveChange,
  renderItem,
}: Readonly<{
  items: CommandCenterSlot[];
  activeIndex: number;
  onActiveChange: (index: number) => void;
  renderItem: (slot: CommandCenterSlot) => ReactNode;
}>) {
  const [paused, setPaused] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const hasMultipleItems = items.length > 1;
  const visibleIndex = Math.min(activeIndex, items.length - 1);

  useEffect(() => {
    onActiveChange(0);
  }, [items.map((item) => item.id).join('|'), onActiveChange]);

  useEffect(() => {
    if (!hasMultipleItems || paused) return undefined;
    const timer = window.setInterval(() => {
      setDirection(1);
      onActiveChange((activeIndex + 1) % items.length);
    }, SECONDARY_CAROUSEL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [activeIndex, hasMultipleItems, items.length, onActiveChange, paused]);

  if (!items.length) return null;
  // Single item still needs the .command-secondary-carousel wrapper — it's what defines the
  // --secondary-carousel-media-size/-content-height custom properties several secondary bodies
  // size off (e.g. the Roblox icon), not just the slide/dots machinery skipped below.
  if (!hasMultipleItems) return <div className="command-secondary-carousel">{renderItem(items[0]!)}</div>;

  const goTo = (index: number) => {
    const target = (index + items.length) % items.length;
    const forwardDistance = (target - visibleIndex + items.length) % items.length;
    setDirection(forwardDistance <= items.length - forwardDistance ? 1 : -1);
    onActiveChange(target);
  };

  const pause = () => setPaused(true);
  const resume = () => setPaused(false);

  return (
    <MotionConfig reducedMotion="never">
      <section
        className="command-secondary-carousel"
        aria-roledescription="carousel"
        aria-label="Upcoming items"
        onMouseEnter={pause}
        onMouseLeave={resume}
        onFocusCapture={pause}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) resume();
        }}
      >
        <div className="command-secondary-carousel-viewport">
          <AnimatePresence initial={false} custom={direction}>
            <motion.div
              key={items[visibleIndex]!.id}
              className="command-secondary-carousel-slide"
              custom={direction}
              variants={secondarySlideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.45, ease: [0.65, 0, 0.35, 1] }}
            >
              {renderItem(items[visibleIndex]!)}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="command-secondary-carousel-timeline">
          <div className="command-secondary-carousel-dots" aria-label="Choose a secondary signal">
            {items.map((item, index) => <button
              key={item.id}
              type="button"
              className={index === visibleIndex ? 'is-active' : undefined}
              aria-label={`Show ${item.kicker}: ${item.title}`}
              aria-current={index === visibleIndex ? 'true' : undefined}
              onClick={() => goTo(index)}
            />)}
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}

/** Icon-only so the pill row stays a fixed width as sections are added — labels made it grow
    unbounded. Clash Royale and Valorant remain available in the overview grid, but are
    intentionally omitted from this compact dashboard-level navigation. */
function CommandNav() {
  const { t } = useI18n();
  const visibleSectionIds = useVisibleSections();
  return (
    <nav className="command-nav" aria-label={t('overview.sections')}>
      {SECTIONS.filter((section) => visibleSectionIds.includes(section.id) && section.id !== 'clash-royale' && section.id !== 'valorant').map((section) => (
        <a key={section.id} href={sectionHref(section.id)} aria-label={t(section.titleKey)} title={t(section.titleKey)} style={accentStyle(section)}>
          <SectionIcon id={section.id} monochrome />
        </a>
      ))}
    </nav>
  );
}

function CommandCenterSkeleton() {
  const { t } = useI18n();
  return (
    <section className="command-center glass" aria-labelledby="command-center-title">
      <div className="command-center-head">
        <div><p className="command-eyebrow">{t('overview.commandEyebrow')}</p><h2 id="command-center-title" className="command-title">{t('overview.commandTitle')}</h2></div>
        <CommandNav />
      </div>
      <div className="command-layout animate-pulse">
        <div className="command-primary space-y-3">
          <div className="h-3 w-24 rounded bg-track" />
          <div className="h-6 w-2/3 rounded bg-track" />
          <div className="h-4 w-1/3 rounded bg-track" />
          <div className="mt-4 h-10 w-full rounded bg-track" />
        </div>
        <div className="command-signals space-y-3">
          <div className="h-16 rounded bg-track" />
          <div className="h-16 rounded bg-track" />
          <div className="h-16 rounded bg-track" />
        </div>
      </div>
      <div className="command-agenda animate-pulse space-y-2">
        <div className="h-3 w-20 rounded bg-track" />
        <div className="h-4 w-1/2 rounded bg-track" />
      </div>
    </section>
  );
}

export function HeroPanel({
  hero,
  event,
  lead,
  kicker,
  extra,
  activity,
  weather,
}: Readonly<{
  hero: CommandCenterData['hero'];
  event: CalendarData['events'][number] | undefined;
  /** Full-fidelity replacement for the generic title/detail block below, for render types whose
   * secondary body already has everything a plain title/detail block would (see `heroLeadFor`). */
  lead: ReactNode;
  kicker: string;
  extra: ReactNode;
  activity: HealthData | undefined;
  weather: WeatherData | undefined;
}>) {
  const { t } = useI18n();
  const today = weather?.days[0];
  return (
    <CommandPanel
      href={hero.href}
      label={t('overview.openService', { name: event?.title ?? hero.title })}
      className={`command-primary command-panel--${toneFor(hero)}`}
      art={slotArt(hero)}
      style={weatherPanelStyle(hero)}
    >
      <p className="command-label"><KickerLabel slot={hero} /></p>
      {lead ?? (
        <div className="mt-5 flex items-start gap-4">
          <div className="min-w-0">
            {kicker !== hero.kicker && <p className="command-event-time">{kicker}</p>}
            <p className="command-event-title">{event?.title ?? hero.title}</p>
            {event ? (
              <div className="mt-2 space-y-1.5 text-sm text-ink-muted">
                {event.location && (
                  <p className="flex items-center gap-1.5">
                    <a href={mapsSearchHref(event.location)} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1.5 transition hover:text-ink">
                      <span aria-hidden>📍</span>
                      <span className="truncate">{event.location}</span>
                    </a>
                  </p>
                )}
                {event.description && (
                  <p className="line-clamp-2 border-l border-card-border pl-2.5 text-ink-faint">{event.description}</p>
                )}
                {!event.location && !event.description && <p>{hero.detail}</p>}
              </div>
            ) : !shouldHideHeroDetail(hero, extra) && <p className="mt-2 line-clamp-2 text-sm text-ink-muted">{hero.detail}</p>}
          </div>
        </div>
      )}
      {extra}
      {activity?.today && (
        <div className="mt-4">
          <ActivityRings
            activeEnergyKcal={activity.today.activeEnergyKcal ?? 0}
            exerciseMinutes={activity.today.exerciseMinutes ?? 0}
            standHours={activity.today.standHours ?? 0}
            goals={activity.goals}
          />
        </div>
      )}
      <div className="command-weather-row">
        <div className="command-weather-target">
          <a href={sectionHref('weather')} className="command-weather-summary" aria-label={t('overview.openService', { name: t('section.weather.title') })}>
            <span className="text-2xl" aria-hidden>{weather ? glyph(weather.current.symbol) : '·'}</span>
            <div className="min-w-0"><p className="text-lg font-semibold tabular-nums">{weather ? deg(weather.current.temperature) : t('overview.syncing')}</p><p className="truncate text-[11px] text-ink-muted">{today ? `${deg(today.minTemperature)}–${deg(today.maxTemperature)} · ${t('overview.rain', { amount: today.precipitationMm.toFixed(1) })}` : t('overview.weatherLoading')}</p></div>
            {weather?.hours.slice(0, 4).map((hour) => <div key={hour.time} className="command-forecast"><span>{hour.hourLabel}</span><strong>{deg(hour.temperature)}</strong></div>)}
          </a>
          {weather && <a href={mapsCoordinatesHref(weather.location)} target="_blank" rel="noreferrer" className="command-weather-location"><span aria-hidden>📍</span>{weatherLocation(weather.location)}</a>}
        </div>
      </div>
    </CommandPanel>
  );
}

/** Derives the `HeroPanel` props that depend on the hero's own render type from the raw envelope
 * data — factored out so the gallery can build a `HeroPanel` for an arbitrary slot the same way
 * the real command center builds one for `commandCenter.hero`. */
export function heroPropsFor(
  hero: CommandCenterData['hero'],
  { calendar, spotify, spotifyFetchedAt, health, github, gmail, aiUsage, weather, steam, roblox, hoveredDay, onHover }: Readonly<{
    calendar: CalendarData | undefined;
    spotify: SpotifyData | undefined;
    spotifyFetchedAt: string | undefined;
    health: HealthData | undefined;
    github: GitHubData | undefined;
    gmail: GmailData | undefined;
    aiUsage: AiUsageByTool;
    weather: WeatherData | undefined;
    steam: SteamData | undefined;
    roblox: RobloxData | undefined;
    hoveredDay: { date: string; count: number } | null;
    onHover: (day: { date: string; count: number } | null) => void;
  }>,
): Readonly<{
  event: CalendarData['events'][number] | undefined;
  lead: ReactNode;
  kicker: string;
  extra: ReactNode;
  activity: HealthData | undefined;
}> {
  const heroRender = hero.render;
  const event = heroRender.type === 'calendar-event'
    ? calendar?.events.find((candidate) => candidate.id === heroRender.eventId)
    : undefined;
  const activity = heroRender.type === 'health-rings' && health?.today ? health : undefined;
  const kicker = event ? eventTiming(event, Date.now()) : hero.kicker;
  // Full-fidelity bodies (artwork, progress bars, stat rows) for signals a plain title/detail
  // block would undersell — reused directly from the secondary carousel's own components.
  const lead = heroLeadFor(hero, { spotify, spotifyFetchedAt, steam, roblox });
  // Extra content appended below the generic title/detail block. The GitHub list skips the first
  // PR because the hero title already names it.
  const extra = heroExtraFor(hero, github, gmail, aiUsage, weather, hoveredDay, onHover);
  return { event, lead, kicker, extra, activity };
}

/** The secondary card's per-slot body — a kicker heading (skipped for Roblox, which already shows
 * its own game name) plus the render-specific content. Shared between the real carousel and the
 * gallery, which renders every slot on its own instead of cycling through one at a time. */
export function SecondaryCardBody(props: Readonly<{
  slot: CommandCenterSlot;
  calendar: CalendarData | undefined;
  spotify: SpotifyData | undefined;
  spotifyFetchedAt: string | undefined;
  health: HealthData | undefined;
  github: GitHubData | undefined;
  gmail: GmailData | undefined;
  weather: WeatherData | undefined;
  steam: SteamData | undefined;
  roblox: RobloxData | undefined;
  aiUsage: AiUsageByTool;
  hoveredDay: { date: string; count: number } | null;
  onHover: (day: { date: string; count: number } | null) => void;
}>) {
  const { t } = useI18n();
  const { slot } = props;
  return <>
    {slot.render.type !== 'roblox-now-playing' && <div className="command-agenda-heading"><p className="command-label"><KickerLabel slot={slot} /></p><span className="command-agenda-link" aria-hidden>{t('overview.openSection')} <span>↗</span></span></div>}
    <SecondaryContent {...props} />
  </>;
}

export function DailyCommandCenter() {
  const { t } = useI18n();
  const { commandCenter, calendar, weather, github, health, gmail, aiUsage, spotify, spotifyFetchedAt, steam, roblox } = useCommandCenterData();
  const [hoveredDay, setHoveredDay] = useState<{ date: string; count: number } | null>(null);
  const [activeSecondaryIndex, setActiveSecondaryIndex] = useState(0);
  // A running server may be refreshed separately from the Vite client during local development.
  // Keep the overview usable while the server still returns the pre-carousel single-slot payload.
  const secondarySlots = secondarySlotsFor(commandCenter);
  const activeSecondary = secondarySlots[Math.min(activeSecondaryIndex, secondarySlots.length - 1)];
  const isRobloxSecondary = activeSecondary?.render.type === 'roblox-now-playing';
  const robloxArtPalette = useRobloxArtPalette(isRobloxSecondary && roblox?.presence?.status === 'in-game' ? roblox.presence.iconUrl : undefined);
  const robloxArtStyle = robloxArtPalette ? {
    '--roblox-art-primary': robloxArtPalette[0].join(' '),
    '--roblox-art-secondary': robloxArtPalette[1].join(' '),
  } as CSSProperties : undefined;
  const secondaryPanelStyle = robloxArtStyle ?? (activeSecondary ? weatherPanelStyle(activeSecondary) : undefined);

  if (!commandCenter) return <CommandCenterSkeleton />;

  const ranked = commandCenter;
  const heroProps = heroPropsFor(ranked.hero, {
    calendar, spotify, spotifyFetchedAt, health, github, gmail, aiUsage, weather, steam, roblox,
    hoveredDay, onHover: setHoveredDay,
  });

  return (
    <section className="command-center glass" aria-labelledby="command-center-title">
      <div className="command-center-head">
        <div><p className="command-eyebrow">{t('overview.commandEyebrow')}</p><h2 id="command-center-title" className="command-title">{t('overview.commandTitle')}</h2></div>
        <CommandNav />
      </div>
      <div className="command-layout">
        <HeroPanel hero={ranked.hero} {...heroProps} weather={weather} />
        <div className="command-signals">{ranked.tiles.flatMap((slot) => aiUsageTiles(slot, aiUsage)).map((slot) => <Signal key={slot.id} slot={slot} github={github} health={health} roblox={roblox} spotify={spotify} steam={steam} />)}</div>
      </div>
      {activeSecondary && <CommandPanel
        href={activeSecondary.href}
        label={t('overview.openService', { name: activeSecondary.title })}
        className={`command-agenda command-panel--${toneFor(activeSecondary)}${isRobloxSecondary ? ' command-agenda--roblox' : ''}`}
        fullCardLink
        style={secondaryPanelStyle}
        art={secondaryArt(activeSecondary)}
      >
        <SecondaryCarousel
          items={secondarySlots}
          activeIndex={activeSecondaryIndex}
          onActiveChange={setActiveSecondaryIndex}
          renderItem={(slot) => <SecondaryCardBody slot={slot} calendar={calendar} spotify={spotify} spotifyFetchedAt={spotifyFetchedAt} health={health} github={github} gmail={gmail} weather={weather} steam={steam} roblox={roblox} aiUsage={aiUsage} hoveredDay={hoveredDay} onHover={setHoveredDay} />}
        />
      </CommandPanel>}
    </section>
  );
}
