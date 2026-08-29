// Fake, fully-anonymized data for the README screenshot workflow (see screenshots.ts). One
// consistent fake persona across all 5 pages — no real names, places, or events from the actual
// dashboard owner. Command-center ranking still runs through the real scoring functions in
// ../src/importance/sources/ so that page's output reflects actual behavior, not a hand-picked
// result. Track/album art comes from the iTunes Search API and artist photos from Wikipedia's
// summary API — both free, unauthenticated, and meant for exactly this kind of lookup — so the
// Spotify page shows real cover art instead of generic stock photos.
import type {
  AiUsageToolData,
  CalendarData,
  GitHubData,
  GmailData,
  HealthData,
  SpotifyData,
  SteamData,
  WeatherData,
} from '@nohm/shared';
import {
  buildSpotifyRotation,
  daysFromNowAt,
  dateDaysAgo,
  healthDayFor,
  hhmm,
  iso,
  mulberry32,
  usageHistoryFor,
  MANUAL_ARTIST_IMAGES,
  MANUAL_ALBUM_IMAGES,
  ARTIST_NAMES,
  TRACKS,
  ONE_OFFS,
} from '@nohm/shared';

// ── Real art lookups ─────────────────────────────────────────────────────────────────────────

const artCache = new Map<string, Promise<string | undefined>>();
const fallbackArt = (seed: string) => `https://picsum.photos/seed/${seed}/300/300`;

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'user-agent': 'nohm-screenshot-script' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Real cover art via the iTunes Search API (free, unauthenticated, built for exactly this).
 * Looked up by *album*, not track — searching by track name can return a single's own promo
 * artwork instead of the album cover a real music app would actually show for that track. */
function albumArt(album: string, artist: string): Promise<string | undefined> {
  const key = `album:${album}|${artist}`;
  const searchTerm = encodeURIComponent([album, artist].join(' '));
  if (!artCache.has(key)) {
    artCache.set(key, fetchJson(
      `https://itunes.apple.com/search?term=${searchTerm}&media=music&entity=album&limit=1`,
    ).then((data) => data.results?.[0]?.artworkUrl100?.replace('100x100', '600x600')).catch(() => undefined));
  }
  return artCache.get(key)!;
}

/** Real artist photo via Wikipedia's page-summary API (free, unauthenticated, CC-licensed thumbnails). */
function artistPhoto(name: string): Promise<string | undefined> {
  const key = `artist:${name}`;
  if (!artCache.has(key)) {
    artCache.set(key, fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`)
      .then((data) => data.thumbnail?.source).catch(() => undefined));
  }
  return artCache.get(key)!;
}

async function resolvedAlbumArt(album: string, artist: string, fallbackSeed: string): Promise<string> {
  return (await albumArt(album, artist)) ?? fallbackArt(fallbackSeed);
}

async function resolvedArtistPhoto(name: string, fallbackSeed: string): Promise<string> {
  return (await artistPhoto(name)) ?? fallbackArt(fallbackSeed);
}

// ── Overview page (calendar + weather + a quiet day of tiles) ──────────────────────────────────

export function weather(now: Date): WeatherData {
  const day = (offset: number) => new Date(now.getTime() + offset * 86_400_000);
  const weekday = (offset: number) => day(offset).toLocaleDateString('en-GB', { weekday: 'short' });
  const sunrise = daysFromNowAt(now, 0, 5, 42);
  const sunset = daysFromNowAt(now, 0, 21, 8);
  return {
    location: { lat: 40.71, lon: -74.01, name: 'New York' },
    current: {
      temperature: 18, windSpeed: 2.6, windDirectionDeg: 224, humidity: 58, uvIndex: 8.2,
      precipitationMm: 0, symbol: 'partlycloudy_day',
    },
    hours: [
      { time: iso(now, 1), hourLabel: '14', temperature: 18, precipitationMm: 0, uvIndex: 8.2, symbol: 'partlycloudy_day' },
      { time: iso(now, 2), hourLabel: '15', temperature: 19, precipitationMm: 0, uvIndex: 8.8, symbol: 'clearsky_day' },
      { time: iso(now, 3), hourLabel: '16', temperature: 19, precipitationMm: 0, uvIndex: 8.1, symbol: 'clearsky_day' },
      { time: iso(now, 4), hourLabel: '17', temperature: 17, precipitationMm: 0, uvIndex: 6.4, symbol: 'fair_day' },
      { time: iso(now, 5), hourLabel: '18', temperature: 16, precipitationMm: 0, uvIndex: 4.1, symbol: 'fair_day' },
      { time: iso(now, 6), hourLabel: '19', temperature: 15, precipitationMm: 0, uvIndex: 1.7, symbol: 'fair_day' },
      { time: iso(now, 7), hourLabel: '20', temperature: 14, precipitationMm: 0, uvIndex: 0.2, symbol: 'fair_day' },
      { time: iso(now, 8), hourLabel: '21', temperature: 14, precipitationMm: 0, uvIndex: 0, symbol: 'partlycloudy_night' },
      { time: iso(now, 9), hourLabel: '22', temperature: 13, precipitationMm: 0, uvIndex: 0, symbol: 'fair_night' },
      { time: iso(now, 10), hourLabel: '23', temperature: 13, precipitationMm: 0, uvIndex: 0, symbol: 'clearsky_night' },
      { time: iso(now, 11), hourLabel: '00', temperature: 12, precipitationMm: 0, uvIndex: 0, symbol: 'clearsky_night' },
      { time: iso(now, 12), hourLabel: '01', temperature: 12, precipitationMm: 0, uvIndex: 0, symbol: 'clearsky_night' },
    ].map((hour) => ({ ...hour, date: hour.time.slice(0, 10) })),
    days: [
      { date: dateDaysAgo(now, 0), dayLabel: weekday(0), minTemperature: 14, maxTemperature: 20, precipitationMm: 0, maxUvIndex: 8.8, symbol: 'partlycloudy_day' },
      { date: dateDaysAgo(now, -1), dayLabel: weekday(1), minTemperature: 13, maxTemperature: 22, precipitationMm: 0, symbol: 'clearsky_day' },
      { date: dateDaysAgo(now, -2), dayLabel: weekday(2), minTemperature: 15, maxTemperature: 24, precipitationMm: 0, symbol: 'clearsky_day' },
      { date: dateDaysAgo(now, -3), dayLabel: weekday(3), minTemperature: 16, maxTemperature: 21, precipitationMm: 2.8, symbol: 'rainshowers_day' },
      { date: dateDaysAgo(now, -4), dayLabel: weekday(4), minTemperature: 13, maxTemperature: 17, precipitationMm: 6.1, symbol: 'rain' },
      { date: dateDaysAgo(now, -5), dayLabel: weekday(5), minTemperature: 12, maxTemperature: 18, precipitationMm: 1.2, symbol: 'partlycloudy_day' },
      { date: dateDaysAgo(now, -6), dayLabel: weekday(6), minTemperature: 14, maxTemperature: 20, precipitationMm: 0, symbol: 'fair_day' },
    ],
    sun: { sunrise: sunrise.toISOString(), sunset: sunset.toISOString() },
    moon: { phaseDeg: 132, moonrise: daysFromNowAt(now, 0, 16, 24).toISOString(), moonset: daysFromNowAt(now, 0, 2, 51).toISOString() },
  };
}

export function overviewCalendar(now: Date): CalendarData {
  const odysseyStart = daysFromNowAt(now, 1, 19, 15); // Friday 17 July in the frozen capture
  const ODYSSEY_DURATION_MIN = 2 * 60 + 53;
  const odysseyEnd = new Date(odysseyStart.getTime() + ODYSSEY_DURATION_MIN * 60_000);
  const odysseyDurationLabel = `${Math.floor(ODYSSEY_DURATION_MIN / 60)}h ${ODYSSEY_DURATION_MIN % 60}m`;
  const standupStart = daysFromNowAt(now, 2, 9, 30);
  const standupEnd = new Date(standupStart.getTime() + 30 * 60_000);

  return {
    events: [
      {
        id: 'ev1', title: 'Cinema — The Odyssey', calendar: 'Personal', allDay: false,
        location: 'Northstar Cinema', description: `${odysseyDurationLabel} · with Sam`, start: odysseyStart.toISOString(), end: odysseyEnd.toISOString(),
        date: odysseyStart.toISOString().slice(0, 10), startLabel: hhmm(odysseyStart), endLabel: hhmm(odysseyEnd),
      },
      {
        id: 'ev2', title: 'Team standup', calendar: 'Work', allDay: false, location: 'Video call',
        start: standupStart.toISOString(), end: standupEnd.toISOString(),
        date: standupStart.toISOString().slice(0, 10), startLabel: hhmm(standupStart), endLabel: hhmm(standupEnd),
      },
    ],
  };
}

export function overviewGithub(now: Date): GitHubData {
  return {
    activity: [], issues: [],
    pullRequests: [],
    contributions: {
      total: 512,
      days: [
        { date: dateDaysAgo(now, 6), count: 3 },
        { date: dateDaysAgo(now, 5), count: 5 },
        { date: dateDaysAgo(now, 4), count: 1 },
        { date: dateDaysAgo(now, 3), count: 4 },
        { date: dateDaysAgo(now, 2), count: 0 },
        { date: dateDaysAgo(now, 1), count: 2 },
        { date: dateDaysAgo(now, 0), count: 0 },
      ],
    },
    repoHealth: [],
  };
}

export function overviewSteam(): SteamData {
  const currentGame = {
    appId: 730,
    name: 'Counter-Strike 2',
    headerUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg',
    playtimeForeverMinutes: 48_200,
  };
  return {
    profile: { steamId: '00000000000000000', personaName: 'yourname', profileUrl: '#' },
    currentGame,
    library: null,
    recentlyPlayed: [currentGame],
    achievements: null,
    friendsInGame: [],
    playtimeHistory: [],
    friendsLeaderboard: { status: 'unavailable', entries: [] },
    availability: { library: 'unavailable', achievements: 'unavailable', friends: 'unavailable' },
  };
}

export function overviewGmail(now: Date): GmailData {
  return {
    unreadThreads: 5,
    threads: [{ id: 't1', from: 'Newsletter', subject: 'This week in open source', date: iso(now, -3), unread: true, url: '#' }],
  };
}

export function overviewHealth(now: Date): HealthData {
  return {
    today: {
      date: dateDaysAgo(now, 0), steps: 3247, watchSteps: 3247, activeEnergyKcal: 214, exerciseMinutes: 14,
      standHours: 7, heartRate: 71, restingHeartRate: 59, walkingHeartRate: 89, bloodOxygenPercent: 98,
    },
    history: [], updatedAt: iso(now, 0),
    goals: { steps: 9000, activeEnergyKcal: 500, exerciseMinutes: 30, standHours: 12 },
  };
}

export function overviewAiClaude(now: Date): AiUsageToolData {
  return {
    available: true, fiveHour: { usedPercent: 28, resetsAt: iso(now, 3) }, weekly: { usedPercent: 37, resetsAt: iso(now, 96) },
    fiveHourStatus: 'limited', weeklyStatus: 'limited', history: [],
  };
}
export function overviewAiCodex(now: Date): AiUsageToolData {
  return {
    available: true, fiveHour: { usedPercent: 15, resetsAt: iso(now, 3) }, weekly: { usedPercent: 22, resetsAt: iso(now, 96) },
    fiveHourStatus: 'limited', weeklyStatus: 'limited', history: [],
  };
}

// ── Spotify page — real, broadly-recognizable artists/tracks, not an obscure curated list ──────

// MANUAL_ARTIST_IMAGES/MANUAL_ALBUM_IMAGES (shared/src/fixtureHelpers.ts) are checked before the
// automatic Wikipedia/iTunes lookups below — fill those in when the automatic result is wrong.
async function loadSpotify(now: Date): Promise<{ overview: SpotifyData; detail: SpotifyData }> {
  const artistImages = Object.fromEntries(await Promise.all(
    ARTIST_NAMES.map(async (name) => [name, MANUAL_ARTIST_IMAGES[name] ?? await resolvedArtistPhoto(name, `artist-${name}`)] as const),
  ));
  // Keyed by album, not track — every track on the same album shares its cover, same as a real
  // music app, and searching by album avoids a single's own promo artwork drifting from the
  // actual album cover.
  const albumImages = new Map<string, string>();
  for (const t of [...TRACKS, ...ONE_OFFS]) {
    if (!albumImages.has(t.album)) {
      albumImages.set(t.album, MANUAL_ALBUM_IMAGES[t.album] ?? await resolvedAlbumArt(t.album, t.artist, t.album));
    }
  }

  const overview: SpotifyData = {
    nowPlaying: { track: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours', imageUrl: albumImages.get('After Hours'), isPlaying: true, progressMs: 58_000, durationMs: 200_000 },
    recentlyPlayed: [], topArtists: { shortTerm: [], mediumTerm: [], longTerm: [] }, topTracks: { shortTerm: [], mediumTerm: [], longTerm: [] },
    allTime: { artists: [], tracks: [], albums: [] },
  };

  const detail = buildSpotifyRotation(now, artistImages, albumImages);

  return { overview, detail };
}

// ── Health page ──────────────────────────────────────────────────────────────────────────────

export function healthFixture(now: Date): HealthData {
  const healthRng = mulberry32(20260714);
  return {
    today: { ...healthDayFor(now, 0, healthRng), date: dateDaysAgo(now, 0), exerciseMinutes: 23 },
    history: Array.from({ length: 30 }, (_, i) => healthDayFor(now, 29 - i, healthRng)),
    updatedAt: iso(now, 0),
    goals: { steps: 9000, activeEnergyKcal: 500, exerciseMinutes: 30, standHours: 12 },
  };
}

// ── AI usage page (Claude + Codex, no model-specific window) ───────────────────────────────────

/** Built against an explicit reference time rather than the module's real Date.now(), since the
 * client's chart windows its history against *its own* (possibly faked, see screenshots.ts) clock
 * — generating resetsAt/history off a different "now" than what the browser will use leaves most
 * points outside the chart's visible window, rendering as an oddly short, mostly-empty chart. */
export function buildAiFixtures(now: Date): { claude: AiUsageToolData; codex: AiUsageToolData } {
  const nowMs = now.getTime();
  const isoFrom = (hoursFromNow: number) => new Date(nowMs + hoursFromNow * 3_600_000).toISOString();

  const claudeFiveHour = { usedPercent: 54, resetsAt: isoFrom(2) };
  const claudeWeekly = { usedPercent: 61, resetsAt: isoFrom(90) };
  const claude: AiUsageToolData = {
    available: true,
    fiveHour: claudeFiveHour,
    weekly: claudeWeekly,
    fiveHourStatus: 'limited',
    weeklyStatus: 'limited',
    tokens: { fiveHour: 812_000, weekly: 4_260_000 },
    asOf: isoFrom(0),
    history: usageHistoryFor(claudeFiveHour, claudeWeekly, 1, nowMs),
  };

  const codexFiveHour = { usedPercent: 22, resetsAt: isoFrom(3) };
  const codexWeekly = { usedPercent: 38, resetsAt: isoFrom(90) };
  const codex: AiUsageToolData = {
    available: true,
    fiveHour: codexFiveHour,
    weekly: codexWeekly,
    fiveHourStatus: 'limited',
    weeklyStatus: 'limited',
    tokens: { fiveHour: 305_000, weekly: 1_870_000 },
    asOf: isoFrom(0),
    history: usageHistoryFor(codexFiveHour, codexWeekly, 2, nowMs),
  };

  return { claude, codex };
}

// ── GitHub page ──────────────────────────────────────────────────────────────────────────────

function contributionDays(now: Date, rng: () => number) {
  const days: { date: string; count: number }[] = [];
  for (let i = 364; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 86_400_000);
    // A stable cyclical pattern, not date.getDay() — see healthDayFor's comment on why coupling
    // this to the real weekday reshuffles the whole grid every time "today" rolls to a new day.
    const weekend = i % 7 === 0 || i % 7 === 1;
    const roll = rng();
    let count: number;
    if (weekend) {
      count = roll < 0.3 ? Math.round(rng() * rng() * 6) : 0;
    } else if (roll < 0.1) {
      count = 0; // off day
    } else {
      count = Math.round(1 + rng() * rng() * 13); // skewed toward small counts, occasional bursts
    }
    if (i < 3) count = Math.max(count, 2 + Math.round(rng() * 4)); // matches the activity feed below
    days.push({ date: date.toISOString().slice(0, 10), count });
  }
  return days;
}

export function githubFixture(now: Date): GitHubData {
  const githubRng = mulberry32(42);
  const githubDays = contributionDays(now, githubRng);

  return {
    activity: [
      {
        id: 'ev1', summary: '3 commits', repo: 'yourname/nohm', timestamp: iso(now, -2), branch: 'dev',
        commits: [
          { sha: 'a1b2c3d', title: 'Add importance scoring to the command center' },
          { sha: 'b2c3d4e', title: 'Wire health baseline into the scoring engine' },
          { sha: 'c3d4e5f', title: 'Fix null coalescing on Postgres-backed health store' },
        ],
      },
      { id: 'ev2', summary: '1 commit', repo: 'yourname/weekend-project', timestamp: iso(now, -26), branch: 'main', commits: [{ sha: 'd4e5f6a', title: 'Prototype the offline sync queue' }] },
    ],
    pullRequests: [
      { title: 'Add importance scoring to the command center', repo: 'yourname/nohm', number: 42, url: '#', role: 'author', draft: false, updatedAt: iso(now, -2) },
      { title: 'Bump Vite to 7.x', repo: 'yourname/nohm', number: 40, url: '#', role: 'review-requested', draft: false, updatedAt: iso(now, -20) },
    ],
    issues: [
      { title: 'Contribution grid should scroll on narrow viewports', repo: 'yourname/nohm', number: 38, url: '#', updatedAt: iso(now, -40) },
    ],
    contributions: { total: githubDays.reduce((sum, day) => sum + day.count, 0), days: githubDays },
    repoHealth: [
      { fullName: 'yourname/nohm', stars: 12, ciStatus: 'success', ciUrl: '#', latestRelease: 'v1.4.0', url: '#', lastPushedAt: iso(now, -3) },
      { fullName: 'yourname/weekend-project', stars: 3, ciStatus: 'running', ciUrl: '#', url: '#', lastPushedAt: iso(now, -26) },
      { fullName: 'yourname/dotfiles', stars: 41, ciStatus: 'none', url: '#', lastPushedAt: iso(now, -14 * 24) },
    ],
  };
}

export interface Fixtures {
  spotifyOverview: SpotifyData;
  spotifyDetail: SpotifyData;
}

export async function loadFixtures(now: Date): Promise<Fixtures> {
  const { overview, detail } = await loadSpotify(now);
  return { spotifyOverview: overview, spotifyDetail: detail };
}
