import {
  valorantMapArt,
  type CalendarData,
  type CommandCenterSlot,
  type GitHubData,
  type GmailData,
  type HealthData,
  type RobloxData,
  type SpotifyData,
  type SteamData,
  type WeatherData,
} from '@nohm/shared';
import type { AiUsageByTool } from '../../components/command-center/useCommandCenterData';
import { aiUsage } from './ai';
import { calendar } from './calendar';
import { github } from './github';
import { gmail } from './personal';
import { health } from './health';
import { roblox } from './roblox';
import { spotify, spotifyNowPlayingAt } from './spotify';
import { steam } from './steam';
import { weather } from './weather';

/**
 * Every render variant the command center's hero/tile/secondary slots support, one card each — a
 * dev-only companion to `commandCenter.ts`'s single hand-picked hero/secondary/tiles trio. Backed
 * by the same fixture builders as the public demo (real-looking ids so a secondary card that needs
 * to look up a matching PR/track/thread/achievement actually finds one instead of silently falling
 * back), but composed exhaustively rather than the one plausible "today" snapshot the demo shows.
 */
export type GalleryData = Readonly<{
  calendar: CalendarData;
  spotify: SpotifyData;
  spotifyFetchedAt: string;
  health: HealthData;
  github: GitHubData;
  gmail: GmailData;
  weather: WeatherData;
  steam: SteamData;
  roblox: RobloxData;
  aiUsage: AiUsageByTool;
}>;

export function buildGalleryData(now: Date): GalleryData {
  return {
    calendar: calendar(now),
    spotify: { ...spotify(now), nowPlaying: spotifyNowPlayingAt(now) },
    spotifyFetchedAt: now.toISOString(),
    health: health(now),
    github: github(now),
    gmail: gmail(now),
    weather: weather(now),
    steam: steam(now),
    roblox: roblox(now),
    aiUsage: aiUsage(now),
  };
}

export type GallerySlot = Readonly<{ label: string; slot: CommandCenterSlot }>;

function crownsBackTo(now: Date, count: number): { crownsFor: number; crownsAgainst: number; battleTime: string }[] {
  const scores: [number, number][] = [[2, 1], [3, 0], [1, 0], [3, 1], [2, 0]];
  return Array.from({ length: count }, (_unused, i) => {
    const [crownsFor, crownsAgainst] = scores[i % scores.length]!;
    return { crownsFor, crownsAgainst, battleTime: new Date(now.getTime() - (count - i) * 3_600_000).toISOString() };
  });
}

function sessionCrownsBackTo(now: Date, results: ('win' | 'loss')[]): { crownsFor: number; crownsAgainst: number; battleTime: string; result: 'win' | 'loss' }[] {
  const scores: Record<'win' | 'loss', [number, number]> = { win: [3, 1], loss: [1, 3] };
  return results.map((result, i) => {
    const [crownsFor, crownsAgainst] = scores[result];
    return { crownsFor, crownsAgainst, result, battleTime: new Date(now.getTime() - (results.length - i) * 3_600_000).toISOString() };
  });
}

function minecraftGallerySlot(id: string, label: string, activity: string): GallerySlot {
  return {
    label,
    slot: {
      id: `gallery:minecraft:${id}`, source: 'minecraft', kind: 'minecraft', kicker: 'Playing now',
      title: 'Minecraft', detail: 'for 45m', href: '#/', score: 60,
      render: { type: 'minecraft-slot', activity },
    },
  };
}

export function buildGallerySlots(data: GalleryData, now: Date): GallerySlot[] {
  const events = data.calendar.events;
  // calendar-agenda is only ever built from same-day events in production — its layout assumes a
  // short "10:00" time label, not a multi-day "Saturday 25 July · 10:00" one (see
  // secondary/calendar.tsx's formatEventDay), so picking arbitrary upcoming events overflows it.
  const today = now.toLocaleDateString('en-CA');
  const todaysEvents = events.filter((e) => e.date === today);
  const agendaEvents = todaysEvents.length ? todaysEvents : events.slice(0, 1);
  const track = data.spotify.topTracks.shortTerm[0]!;
  const album = data.spotify.allTime.albums[0]!;
  const unreadThreads = data.gmail.threads.filter((t) => t.unread).slice(0, 2);
  const threadIds = (unreadThreads.length ? unreadThreads : data.gmail.threads.slice(0, 2)).map((t) => t.id);
  const recentSteamGame = data.steam.recentlyPlayed[0]!;
  const achievement = data.steam.achievements!.recentUnlocks[0]!;

  const spotifyArtistTimeframe = (
    timeframe: 'short' | 'medium' | 'long' | 'allTime',
    artists: SpotifyData['topArtists']['shortTerm'] | SpotifyData['allTime']['artists'],
  ): GallerySlot => {
    const artist = artists[0]!;
    const timeframeLabel = timeframe === 'allTime' ? 'All time' : `Last ${timeframe} term`;
    return {
      label: `spotify-artist (${timeframe})`,
      slot: {
        id: `gallery:spotify-artist:${timeframe}`, source: 'spotify', kind: 'spotify',
        kicker: `Top artist · ${timeframeLabel}`,
        title: artist.name, detail: 'Your most-played artist for this stretch', href: '#/spotify', score: 50,
        render: { type: 'spotify-artist', artistId: artist.id ?? artist.name, timeframe },
      },
    };
  };

  const slots: GallerySlot[] = [
    {
      label: 'text',
      slot: {
        id: 'gallery:text', source: 'news', kind: 'news', kicker: 'News', title: 'A plain text signal',
        detail: 'No special render — the card falls back to kicker/title/detail from the slot itself.',
        href: '#/news', score: 50, render: { type: 'text' },
      },
    },
    {
      label: 'calendar-event',
      slot: {
        id: 'gallery:calendar-event', source: 'calendar', kind: 'calendar', kicker: 'Coming up',
        title: events[0]!.title, detail: events[0]!.description ?? events[0]!.location ?? '',
        href: '#/personal', score: 50, render: { type: 'calendar-event', eventId: events[0]!.id },
      },
    },
    {
      label: 'calendar-agenda',
      slot: {
        id: 'gallery:calendar-agenda', source: 'calendar', kind: 'calendar', kicker: 'Today',
        title: `${agendaEvents.length} event${agendaEvents.length === 1 ? '' : 's'} today`, detail: 'Your agenda for the day',
        href: '#/personal', score: 50, render: { type: 'calendar-agenda', eventIds: agendaEvents.map((e) => e.id) },
      },
    },
    {
      label: 'spotify-now-playing',
      slot: {
        id: 'gallery:spotify-now-playing', source: 'spotify', kind: 'spotify', kicker: 'Now playing',
        title: data.spotify.nowPlaying?.track ?? 'Nothing playing', detail: data.spotify.nowPlaying?.artist ?? '',
        href: '#/spotify', score: 50, render: { type: 'spotify-now-playing' },
      },
    },
    {
      label: 'spotify-track',
      slot: {
        id: 'gallery:spotify-track', source: 'spotify', kind: 'spotify', kicker: 'On repeat',
        title: track.track, detail: track.artist, href: '#/spotify', score: 50,
        render: { type: 'spotify-track', trackId: track.id ?? track.track },
      },
    },
    spotifyArtistTimeframe('short', data.spotify.topArtists.shortTerm),
    spotifyArtistTimeframe('medium', data.spotify.topArtists.mediumTerm),
    spotifyArtistTimeframe('long', data.spotify.topArtists.longTerm),
    spotifyArtistTimeframe('allTime', data.spotify.allTime.artists),
    {
      label: 'spotify-album',
      slot: {
        id: 'gallery:spotify-album', source: 'spotify', kind: 'spotify', kicker: 'Favorite album',
        title: album.name, detail: album.artist, href: '#/spotify', score: 50,
        render: { type: 'spotify-album', albumId: album.id ?? album.name },
      },
    },
    {
      label: 'health-rings',
      slot: {
        id: 'gallery:health-rings', source: 'health', kind: 'health', kicker: 'Today',
        title: `${data.health.today?.steps ?? 0} steps`, detail: 'On track for your goals',
        href: '#/health', score: 50, render: { type: 'health-rings' },
      },
    },
    {
      label: 'github-contributions',
      slot: {
        id: 'gallery:github-contributions', source: 'github', kind: 'github', kicker: 'Contributions',
        title: `${data.github.contributions.total} this year`, detail: 'Commits, PRs, and reviews',
        href: '#/github', score: 50, render: { type: 'github-contributions' },
      },
    },
    {
      label: 'github-reviews',
      slot: {
        id: 'gallery:github-reviews', source: 'github', kind: 'github', kicker: '1 review requested',
        title: data.github.pullRequests.find((pr) => pr.role === 'review-requested')?.title ?? 'Review requested',
        detail: 'nohm', href: '#/github', score: 50, render: { type: 'github-reviews' },
      },
    },
    {
      label: 'github-open-prs',
      slot: {
        id: 'gallery:github-open-prs', source: 'github', kind: 'github', kicker: '1 open pull request',
        title: data.github.pullRequests.find((pr) => pr.role === 'author' && !pr.draft)?.title ?? 'Open pull request',
        detail: 'nohm', href: '#/github', score: 50, render: { type: 'github-open-prs' },
      },
    },
    {
      label: 'sonar-quality-gate (passed)',
      slot: {
        id: 'gallery:sonar:passed', source: 'sonar', kind: 'sonar', kicker: 'SonarCloud Quality Gate',
        title: 'nohm', detail: 'SonarCloud', href: '#/github', score: 50,
        render: {
          type: 'sonar-quality-gate', status: 'passed',
          projects: [{ key: 'nohm', name: 'nohm', security: 'A', reliability: 'A', maintainability: 'A', vulnerabilitiesCount: 0, bugsCount: 0, codeSmellsCount: 12 }],
        },
      },
    },
    {
      label: 'sonar-quality-gate (failed)',
      slot: {
        id: 'gallery:sonar:failed', source: 'sonar', kind: 'sonar', kicker: 'SonarCloud Quality Gate',
        title: 'weekend-project', detail: 'SonarCloud', href: '#/github', score: 50,
        render: {
          type: 'sonar-quality-gate', status: 'failed',
          projects: [{ key: 'weekend-project', name: 'weekend-project', security: 'B', reliability: 'C', maintainability: 'A', vulnerabilitiesCount: 2, bugsCount: 5, codeSmellsCount: 8 }],
        },
      },
    },
    {
      label: 'gmail-threads',
      slot: {
        id: 'gallery:gmail-threads', source: 'gmail', kind: 'gmail', kicker: `${threadIds.length} unread`,
        title: 'Unread mail', detail: 'From the last couple of days', href: '#/personal', score: 50,
        render: { type: 'gmail-threads', threadIds },
      },
    },
    ...([
      ['severe', 'Severe weather', 'Storm warning tonight', 'Heavy rain and wind expected after 9pm.'],
      ['hot', 'Heat', 'Hot afternoon ahead', 'Peaks near 29° around 3pm — stay hydrated.'],
      ['cold', 'Cold snap', 'Well below freezing tonight', 'Down to -6° overnight — bundle up.'],
      ['rain', 'Rain', 'Rain moving in', '4mm expected between 2pm and 6pm.'],
      ['wind', 'Wind', 'Windy this afternoon', 'Gusts up to 38 km/h from the southwest.'],
      ['uv', 'UV index', 'High UV around midday', 'Peaks around UV 7 — wear sunscreen.'],
      ['sunset', 'Sunset', 'Golden hour tonight', 'Clear skies for a good sunset.'],
      ['moon', 'Moon', 'Full moon tonight', '96% illuminated.'],
    ] as const).map(([kind, kicker, title, detail]) => ({
      label: `weather-signal (${kind})`,
      slot: {
        id: `gallery:weather:${kind}`, source: 'weather', kind: 'weather', kicker, title, detail,
        href: '#/weather', score: 50, render: { type: 'weather-signal', kind },
      } satisfies CommandCenterSlot,
    })),
    ...((['claude', 'codex'] as const).flatMap((toolId) => (['fiveHour', 'weekly'] as const).map((metric) => {
      const tool = data.aiUsage[toolId]!;
      const usedPercent = metric === 'fiveHour' ? tool.fiveHour?.usedPercent : tool.weekly?.usedPercent;
      const windowLabel = metric === 'fiveHour' ? '5h window' : 'weekly window';
      return {
        label: `ai-usage-tool (${toolId}, ${metric})`,
        slot: {
          id: `gallery:ai-usage:${toolId}:${metric}`, source: 'ai-usage', kind: 'ai-usage',
          kicker: toolId === 'claude' ? 'Claude' : 'Codex', title: `${usedPercent ?? 0}% of ${windowLabel}`,
          detail: 'Resets soon', href: '#/ai', score: 50, accent: toolId, meter: usedPercent,
          render: { type: 'ai-usage-tool', toolIds: [toolId], metric },
        } satisfies CommandCenterSlot,
      };
    }))),
    ...((['fiveHour', 'weekly'] as const).map((metric) => ({
      label: `ai-usage-tool (claude+codex, ${metric})`,
      slot: {
        id: `gallery:ai-usage:both:${metric}`, source: 'ai-usage', kind: 'ai-usage', kicker: 'AI usage',
        title: `Claude & Codex · ${metric === 'fiveHour' ? '5h window' : 'weekly window'}`,
        detail: 'Both tools trending', href: '#/ai', score: 50,
        render: { type: 'ai-usage-tool', toolIds: ['claude', 'codex'], metric },
      } satisfies CommandCenterSlot,
    }))),
    {
      label: 'steam-now-playing',
      slot: {
        id: 'gallery:steam-now-playing', source: 'steam', kind: 'steam', kicker: 'Steam · Playing now',
        title: recentSteamGame.name, detail: 'Recently played', href: '#/steam', score: 50,
        render: { type: 'steam-now-playing', appId: recentSteamGame.appId },
      },
    },
    {
      label: 'steam-achievement',
      slot: {
        id: 'gallery:steam-achievement', source: 'steam', kind: 'steam', kicker: 'Achievement unlocked',
        title: achievement.displayName, detail: data.steam.achievements!.gameName, href: '#/steam', score: 50,
        render: { type: 'steam-achievement', appId: data.steam.achievements!.appId, apiName: achievement.apiName },
      },
    },
    {
      label: 'roblox-now-playing',
      slot: {
        id: 'gallery:roblox-now-playing', source: 'roblox', kind: 'roblox', kicker: 'Roblox · Playing now',
        title: data.roblox.presence?.gameName ?? 'Playing now', detail: 'In game', href: '#/roblox', score: 50,
        render: { type: 'roblox-now-playing' },
      },
    },
    {
      label: 'clash-royale-moment (arena)',
      slot: {
        id: 'gallery:clash-royale:arena', source: 'clash-royale', kind: 'clash-royale', kicker: 'New arena',
        title: 'Legendary Arena', detail: 'Promoted from Valkalla', href: '#/clash-royale', score: 50,
        render: { type: 'clash-royale-moment', kind: 'arena', arenaName: 'Legendary Arena' },
      },
    },
    {
      label: 'clash-royale-moment (league)',
      slot: {
        id: 'gallery:clash-royale:league', source: 'clash-royale', kind: 'clash-royale', kicker: 'Path of Legends',
        title: 'League 1', detail: 'Ranked league promotion', href: '#/clash-royale', score: 50,
        render: { type: 'clash-royale-moment', kind: 'league', leagueNumber: 1 },
      },
    },
    {
      label: 'clash-royale-moment (best-trophies)',
      slot: {
        id: 'gallery:clash-royale:best-trophies', source: 'clash-royale', kind: 'clash-royale', kicker: 'New best',
        title: 'Personal trophy record', detail: 'Your highest trophy count yet', href: '#/clash-royale', score: 50,
        render: { type: 'clash-royale-moment', kind: 'best-trophies', bestTrophies: 6214 },
      },
    },
    {
      label: 'clash-royale-moment (win-streak)',
      slot: {
        id: 'gallery:clash-royale:win-streak', source: 'clash-royale', kind: 'clash-royale', kicker: 'Win streak',
        title: '5 wins in a row', detail: 'Your longest streak this season', href: '#/clash-royale', score: 50,
        render: {
          type: 'clash-royale-moment', kind: 'win-streak',
          streakCrowns: crownsBackTo(now, 5),
          streakBattleMode: { type: 'PvP', modeName: 'Ladder' },
        },
      },
    },
    {
      label: 'clash-royale-moment (session)',
      slot: {
        id: 'gallery:clash-royale:session', source: 'clash-royale', kind: 'clash-royale', kicker: 'This session',
        title: '4 wins, 1 loss', detail: 'Since you started playing an hour ago', href: '#/clash-royale', score: 50,
        render: { type: 'clash-royale-moment', kind: 'session', sessionCrowns: sessionCrownsBackTo(now, ['win', 'win', 'loss', 'win', 'win']) },
      },
    },
    {
      label: 'clash-of-clans-moment (war-preparation)',
      slot: {
        id: 'gallery:clash-of-clans:war-preparation', source: 'clash-of-clans', kind: 'clash-of-clans',
        kicker: 'War preparation', title: 'War starts soon', detail: 'Preparation day vs Shadow Reapers',
        href: '#/clash-of-clans', score: 50,
        render: { type: 'clash-of-clans-moment', kind: 'war-preparation', opponentName: 'Shadow Reapers' },
      },
    },
    {
      label: 'clash-of-clans-moment (war)',
      slot: {
        id: 'gallery:clash-of-clans:war', source: 'clash-of-clans', kind: 'clash-of-clans', kicker: 'Clan war',
        title: 'War day vs Shadow Reapers', detail: 'Ends in 6 hours', href: '#/clash-of-clans', score: 50,
        render: { type: 'clash-of-clans-moment', kind: 'war', opponentName: 'Shadow Reapers', clanStars: 34, opponentStars: 28 },
      },
    },
    {
      label: 'clash-of-clans-moment (raid-weekend)',
      slot: {
        id: 'gallery:clash-of-clans:raid-weekend', source: 'clash-of-clans', kind: 'clash-of-clans',
        kicker: 'Raid weekend', title: 'Capital raids ongoing', detail: 'Ends Monday morning',
        href: '#/clash-of-clans', score: 50,
        render: {
          type: 'clash-of-clans-moment', kind: 'raid-weekend', capitalTotalLoot: 124_500, personalLoot: 8_200,
          clanName: 'DefenderDoobie',
          topContributors: [
            { name: 'Alex', loot: 32_400, isYou: false },
            { name: 'Sam', loot: 28_100, isYou: true },
            { name: 'Jordan', loot: 21_950, isYou: false },
          ],
        },
      },
    },
    {
      label: 'clash-of-clans-moment (league)',
      slot: {
        id: 'gallery:clash-of-clans:league', source: 'clash-of-clans', kind: 'clash-of-clans',
        kicker: 'Current league', title: 'Titan League 26', detail: '312 trophies',
        href: '#/clash-of-clans', score: 50,
        render: { type: 'clash-of-clans-moment', kind: 'league', leagueIconUrl: 'https://api-assets.clashofclans.com/leaguetiers/125/yIfqSgrhiYRcuMbAPCoeCj1FTmfylCLxnrAljEZc8K0.png', trophies: 312 },
      },
    },
    {
      label: 'valorant (live: in a match)',
      slot: {
        id: 'gallery:valorant:ingame', source: 'valorant', kind: 'valorant', kicker: 'Valorant · in match',
        title: 'Abyss · 9–7', detail: 'Competitive · 3-stack', href: '#/valorant', score: 74,
        render: { type: 'valorant-slot', badge: 'valorant', artUrl: valorantMapArt('Abyss') },
      },
    },
    {
      label: 'valorant (live: agent select)',
      slot: {
        id: 'gallery:valorant:pregame', source: 'valorant', kind: 'valorant', kicker: 'Valorant · agent select',
        title: 'Sunset', detail: 'Unrated · 2-stack', href: '#/valorant', score: 70,
        render: { type: 'valorant-slot', badge: 'valorant', artUrl: valorantMapArt('Sunset') },
      },
    },
    {
      label: 'valorant (live: menus)',
      slot: {
        id: 'gallery:valorant:menus', source: 'valorant', kind: 'valorant', kicker: 'Valorant',
        title: 'In menus', detail: 'Competitive', href: '#/valorant', score: 48,
        render: { type: 'valorant-slot', badge: 'valorant' },
      },
    },
    {
      label: 'valorant (live: on the Riot launcher)',
      slot: {
        id: 'gallery:valorant:riot', source: 'valorant', kind: 'valorant', kicker: 'Riot Launcher',
        title: 'Online', detail: '', href: '#/valorant', score: 30,
        render: { type: 'valorant-slot', badge: 'riot' },
      },
    },
    {
      label: 'valorant (last match)',
      slot: {
        id: 'gallery:valorant:last-match', source: 'valorant', kind: 'valorant', kicker: 'Last Valorant match',
        title: 'Victory on Abyss · 13–6', detail: 'Competitive · 28/11/5 · Jett',
        href: '#/valorant', score: 56, render: {
          type: 'valorant-slot', badge: 'valorant', artUrl: valorantMapArt('Abyss'),
          iconUrl: 'https://media.valorant-api.com/agents/add6443a-41bd-e414-f6ad-e58d267f4e95/displayicon.png',
        },
      },
    },
    {
      label: 'valorant (rank)',
      slot: {
        id: 'gallery:valorant:rank', source: 'valorant', kind: 'valorant', kicker: 'Valorant rank',
        title: 'Diamond 1', detail: '42 RR · +19 RR last game', href: '#/valorant', score: 24,
        render: {
          type: 'valorant-slot',
          badge: 'valorant',
          iconUrl: 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/18/smallicon.png',
          rank: { rr: 42, lastChange: 19 },
        },
      },
    },
    minecraftGallerySlot('singleplayer', 'minecraft (live: singleplayer)', 'Singleplayer'),
    minecraftGallerySlot('realm', 'minecraft (live: Realm)', 'Realm: Cozy SMP'),
    minecraftGallerySlot('server', 'minecraft (live: server)', 'Server: play.example.net'),
    {
      label: 'rocket-league (live: menus)',
      slot: {
        id: 'gallery:rocket-league:menus', source: 'rocket-league', kind: 'rocket-league', kicker: 'Playing now',
        title: 'Rocket League', detail: 'for 45m', href: '#/', score: 58,
        render: { type: 'rocket-league-slot', activity: 'In the menus' },
      },
    },
  ];

  assertGalleryCoversEveryRenderType(slots);
  return slots;
}

/**
 * `RENDER_TYPES` exists purely so TypeScript enforces coverage: if `commandCenterRenderSchema`
 * (shared/src/schemas/commandCenter.ts) gains a new `render.type`, this object literal is missing
 * a required key and `npm run typecheck` fails right here — nobody has to remember to update this
 * file by hand. The runtime check below closes the other gap: it catches someone satisfying the
 * key requirement without actually adding a slot for it.
 */
const RENDER_TYPES: Record<CommandCenterSlot['render']['type'], true> = {
  text: true,
  'calendar-event': true,
  'calendar-agenda': true,
  'spotify-now-playing': true,
  'spotify-track': true,
  'spotify-artist': true,
  'spotify-album': true,
  'health-rings': true,
  'github-contributions': true,
  'github-reviews': true,
  'github-open-prs': true,
  'sonar-quality-gate': true,
  'gmail-threads': true,
  'weather-signal': true,
  'ai-usage-tool': true,
  'steam-now-playing': true,
  'steam-achievement': true,
  'roblox-now-playing': true,
  'clash-royale-moment': true,
  'clash-of-clans-moment': true,
  'valorant-slot': true,
  'minecraft-slot': true,
  'rocket-league-slot': true,
};

function assertGalleryCoversEveryRenderType(slots: readonly GallerySlot[]): void {
  const covered = new Set(slots.map(({ slot }) => slot.render.type));
  const missing = (Object.keys(RENDER_TYPES) as CommandCenterSlot['render']['type'][]).filter((type) => !covered.has(type));
  if (missing.length) {
    throw new Error(`Slot gallery is missing an entry for render type(s): ${missing.join(', ')}`);
  }
}
