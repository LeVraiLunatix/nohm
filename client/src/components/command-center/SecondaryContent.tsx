import type { ReactNode } from 'react';
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
import type { AiUsageByTool } from './useCommandCenterData';
import { AiUsageSecondary, AiUsageTrend } from './secondary/ai';
import { CalendarAgendaSecondary } from './secondary/calendar';
import { ClashOfClansMomentSecondary } from './secondary/clashOfClans';
import {
  ClashRoyaleArenaLeagueSecondary,
  ClashRoyaleBestTrophiesSecondary,
  ClashRoyaleSessionSecondary,
  ClashRoyaleWinStreakSecondary,
} from './secondary/clashRoyale';
import { AiToolMark, FallbackSecondary } from './secondary/fallback';
import {
  GithubContributionsSecondary,
  GithubOpenPrList,
  GithubOpenPrsSecondary,
  GithubReviewList,
  GithubReviewsSecondary,
  PrMeta,
} from './secondary/github';
import { GmailThreadList, GmailThreadsSecondary } from './secondary/gmail';
import { HealthRingsSecondary } from './secondary/health';
import { RobloxNowPlayingSecondary } from './secondary/roblox';
import { QualityGatePill, SonarQualityGateSecondary, SonarRatingBadges } from './secondary/sonar';
import { SonarWordmark } from '../SonarWordmark';
import {
  SpotifyAlbumSecondary,
  SpotifyArtistSecondary,
  SpotifyNowPlayingSecondary,
  SpotifyTrackSecondary,
} from './secondary/spotify';
import { SteamAchievementSecondary, SteamNowPlayingSecondary } from './secondary/steam';
import { RocketLeagueNowPlayingSecondary } from './secondary/rocketLeague';
import { MinecraftNowPlayingSecondary } from './secondary/minecraft';
import { ValorantRankProgress } from './ValorantRankProgress';
import { WeatherHourlyRows, WeatherSignalSecondary } from './secondary/weather';

/**
 * Picks the secondary-card body for a slot. Every branch falls back to `FallbackSecondary` when its
 * own source can't render — a slot is ranked from server-side data that the client may not have
 * fetched yet (or at all), so "the card is seated but its data isn't here" is a normal state.
 */
export function SecondaryContent(props: Readonly<{
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
}>): ReactNode {
  const { slot, calendar, spotify, spotifyFetchedAt, health, github, gmail, weather, steam, roblox, aiUsage, hoveredDay, onHover } = props;
  switch (slot.render.type) {
    case 'calendar-agenda': return CalendarAgendaSecondary({ slot, calendar }) ?? <FallbackSecondary slot={slot} />;
    case 'spotify-now-playing': return SpotifyNowPlayingSecondary({ spotify, spotifyFetchedAt }) ?? <FallbackSecondary slot={slot} />;
    case 'spotify-track': return SpotifyTrackSecondary({ slot, spotify }) ?? <FallbackSecondary slot={slot} />;
    case 'spotify-artist': return SpotifyArtistSecondary({ slot, spotify }) ?? <FallbackSecondary slot={slot} />;
    case 'spotify-album': return SpotifyAlbumSecondary({ slot, spotify }) ?? <FallbackSecondary slot={slot} />;
    case 'health-rings': return HealthRingsSecondary({ slot, health }) ?? <FallbackSecondary slot={slot} />;
    case 'github-contributions': return GithubContributionsSecondary({ slot, github, hoveredDay, onHover }) ?? <FallbackSecondary slot={slot} />;
    case 'github-reviews': return GithubReviewsSecondary({ slot, github }) ?? <FallbackSecondary slot={slot} />;
    case 'github-open-prs': return GithubOpenPrsSecondary({ slot, github }) ?? <FallbackSecondary slot={slot} />;
    case 'sonar-quality-gate': return SonarQualityGateSecondary({ slot }) ?? <FallbackSecondary slot={slot} />;
    case 'gmail-threads': return GmailThreadsSecondary({ slot, gmail }) ?? <FallbackSecondary slot={slot} />;
    case 'weather-signal': return WeatherSignalSecondary({ slot, weather }) ?? <FallbackSecondary slot={slot} />;
    case 'ai-usage-tool': return AiUsageSecondary({ slot, aiUsage }) ?? <FallbackSecondary slot={slot} />;
    case 'steam-now-playing': return SteamNowPlayingSecondary({ slot, steam }) ?? <FallbackSecondary slot={slot} />;
    case 'steam-achievement': return SteamAchievementSecondary({ slot, steam }) ?? <FallbackSecondary slot={slot} />;
    case 'rocket-league-slot': return RocketLeagueNowPlayingSecondary({ slot }) ?? <FallbackSecondary slot={slot} />;
    case 'minecraft-slot': return MinecraftNowPlayingSecondary({ slot }) ?? <FallbackSecondary slot={slot} />;
    case 'roblox-now-playing': return <RobloxNowPlayingSecondary slot={slot} roblox={roblox} />;
    case 'clash-royale-moment': return ClashRoyaleWinStreakSecondary({ slot }) ?? ClashRoyaleSessionSecondary({ slot }) ?? ClashRoyaleBestTrophiesSecondary({ slot }) ?? ClashRoyaleArenaLeagueSecondary({ slot }) ?? <FallbackSecondary slot={slot} />;
    case 'clash-of-clans-moment': return ClashOfClansMomentSecondary({ slot }) ?? <FallbackSecondary slot={slot} />;
    case 'valorant-slot': return ValorantSlotSecondary({ slot });
    default: return <FallbackSecondary slot={slot} />;
  }
}

/** Map art belongs to the panel backdrop. Only a real agent/rank image earns a compact media row;
 * live-state cards stay single-column so a short status never inherits an artificial narrow text
 * column and wraps unpredictably. */
function ValorantSlotSecondary({ slot }: Readonly<{ slot: CommandCenterSlot }>): ReactNode {
  if (slot.render.type !== 'valorant-slot') return undefined;
  const hasIcon = Boolean(slot.render.iconUrl);
  const rank = slot.render.rank;
  return <div className={`command-secondary-valorant${hasIcon ? ' command-secondary-valorant--with-icon' : ''} mt-4`}>
    {slot.render.iconUrl && <img src={slot.render.iconUrl} alt="" aria-hidden className="command-secondary-valorant-icon" />}
    <div className="min-w-0">
      <p className="command-hero-title truncate text-sm font-semibold text-ink">{slot.title}</p>
      {rank ? <ValorantRankProgress rr={rank.rr} lastChange={rank.lastChange} /> : slot.detail && <p className="mt-1 truncate text-sm text-ink-muted">{slot.detail}</p>}
    </div>
  </div>;
}

export function heroExtraFor(
  hero: CommandCenterData['hero'],
  github: GitHubData | undefined,
  gmail: GmailData | undefined,
  aiUsage: AiUsageByTool,
  weather: WeatherData | undefined,
  hoveredDay: { date: string; count: number } | null,
  onHover: (day: { date: string; count: number } | null) => void,
): ReactNode {
  const { render } = hero;
  if (render.type === 'github-contributions') return GithubContributionsSecondary({ slot: hero, github, hoveredDay, onHover });
  if (render.type === 'github-reviews' || render.type === 'github-open-prs') {
    const prs = github?.pullRequests.filter((pr) => (render.type === 'github-reviews' ? pr.role === 'review-requested' : pr.role === 'author' && !pr.draft)) ?? [];
    const [first] = prs;
    const overflow = render.type === 'github-reviews' ? GithubReviewList({ github, skip: 1 }) : GithubOpenPrList({ github, skip: 1 });
    return <>{first && <div className="mt-2"><PrMeta pr={first} /></div>}{overflow}</>;
  }
  if (render.type === 'gmail-threads') return GmailThreadList({ threadIds: render.threadIds, gmail });
  if (render.type === 'clash-royale-moment' && render.kind === 'best-trophies') return ClashRoyaleBestTrophiesSecondary({ slot: hero });
  if (render.type === 'weather-signal' && render.kind === 'severe' && weather) {
    return <div className="mt-4"><WeatherHourlyRows weather={weather} /></div>;
  }
  if (render.type === 'sonar-quality-gate') {
    const [first, ...rest] = render.projects;
    return <div className="mt-4">
      <QualityGatePill status={render.status} />
      <div className="mt-4"><SonarRatingBadges project={first} /></div>
      {rest.length > 0 && <div className="command-agenda-list mt-4">
        {rest.map((project) => <div key={project.key} className="command-agenda-item"><SonarWordmark className="command-agenda-lead mr-2.5 inline-block h-[1.05rem] w-auto shrink-0 align-baseline" /><span>{project.name}</span></div>)}
      </div>}
    </div>;
  }
  if (render.type !== 'ai-usage-tool') return null;

  const trend = AiUsageTrend({ render, aiUsage });
  if (!trend) return null;
  return <div className="mt-4 flex max-w-sm items-center gap-3">
    <div className="flex shrink-0 flex-col items-center gap-2">
      {render.toolIds.map((toolId) => <AiToolMark key={toolId} accent={toolId} className="h-8 w-8" />)}
    </div>
    <div className="min-w-0 flex-1">{trend}</div>
  </div>;
}

function heroLead(content: ReactNode): ReactNode {
  return content ? <div className="command-hero-lead">{content}</div> : undefined;
}

/** Full-fidelity hero header for render types whose secondary body already carries everything a
 * plain title/detail block would (artwork, progress bars, stat rows) — reusing that exact
 * component means the hero card can't end up thinner than secondary for the same slot. Returns
 * undefined for every other type, so HeroPanel falls back to its generic kicker/title/detail
 * block (and, for calendar events, the location/description rendering that block owns). */
export function heroLeadFor(
  hero: CommandCenterData['hero'],
  { spotify, spotifyFetchedAt, steam, roblox }: Readonly<{
    spotify: SpotifyData | undefined;
    spotifyFetchedAt: string | undefined;
    steam: SteamData | undefined;
    roblox: RobloxData | undefined;
  }>,
): ReactNode {
  const { render } = hero;
  if (render.type === 'spotify-now-playing') return heroLead(SpotifyNowPlayingSecondary({ spotify, spotifyFetchedAt }));
  if (render.type === 'spotify-track') return heroLead(SpotifyTrackSecondary({ slot: hero, spotify }));
  if (render.type === 'spotify-artist') return heroLead(SpotifyArtistSecondary({ slot: hero, spotify }));
  if (render.type === 'spotify-album') return heroLead(SpotifyAlbumSecondary({ slot: hero, spotify }));
  if (render.type === 'steam-now-playing') return heroLead(SteamNowPlayingSecondary({ slot: hero, steam }));
  if (render.type === 'steam-achievement') return heroLead(SteamAchievementSecondary({ slot: hero, steam }));
  if (render.type === 'rocket-league-slot') return heroLead(RocketLeagueNowPlayingSecondary({ slot: hero }));
  if (render.type === 'minecraft-slot') return heroLead(MinecraftNowPlayingSecondary({ slot: hero }));
  if (render.type === 'valorant-slot') return heroLead(ValorantSlotSecondary({ slot: hero }));
  if (render.type === 'roblox-now-playing') return heroLead(RobloxNowPlayingSecondary({ slot: hero, roblox }));
  if (render.type === 'clash-royale-moment' && (render.kind === 'win-streak' || render.kind === 'session')) {
    return heroLead(ClashRoyaleWinStreakSecondary({ slot: hero }) ?? ClashRoyaleSessionSecondary({ slot: hero }));
  }
  if (render.type === 'clash-of-clans-moment') return heroLead(ClashOfClansMomentSecondary({ slot: hero }));
  return undefined;
}
