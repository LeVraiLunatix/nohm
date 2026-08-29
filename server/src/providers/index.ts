import type { AppConfig } from '../config.js';
import type { Database } from '../db/client.js';
import type { ServerEnv } from '../env.js';
import type { Provider } from '../scheduler.js';
import { HealthStore } from '../healthStore.js';
import { GitHubSnapshotStore } from '../githubSnapshot.js';
import { UsageHistoryStore } from '../usageHistory.js';
import { SpotifySnapshotStore } from '../spotifyCache.js';
import { SpotifyHistoryStore } from '../spotifyHistory/index.js';
import { SteamSnapshotStore } from '../steamSnapshot.js';
import { SteamHistoryStore } from '../steamHistory.js';
import { ValorantHistoryStore } from '../valorantHistory.js';
import { ClashOfClansStateStore } from '../clashOfClansState.js';
import { createActivityPushProvider } from './activityPush.js';
import { createAiNewsProvider } from './aiNews.js';
import { createClaudeUsageProvider, createCodexUsageProvider } from './aiUsage/index.js';
import { createCalendarProvider } from './calendar.js';
import { createGitHubProvider } from './github.js';
import { createGmailProvider } from './gmail.js';
import { createHealthProvider } from './health.js';
import { createHueProvider, type HueProvider } from './hue.js';
import { createIMessageProvider } from './imessage.js';
import { createNewsProvider } from './news.js';
import { createPowerProvider, type PowerProvider } from './power.js';
import { createSpotifyProvider } from './spotify.js';
import { createSteamProvider } from './steam.js';
import { createClashRoyaleProvider } from './clashRoyale.js';
import { createClashOfClansProvider } from './clashOfClans.js';
import { createRobloxProvider } from './roblox.js';
import { createValorantProvider } from './valorant.js';
import { createSonarCloudProvider } from './sonarCloud.js';
import { createSystemProvider } from './system.js';
import { createTransitProvider, type TransitProvider } from './transit.js';
import { createWeatherProvider, type WeatherProvider } from './weather.js';
import { createCiderProvider } from './cider.js';
import { createLastFmProvider } from './lastfm.js';

export interface Providers {
  all: Provider[];
  weather: WeatherProvider;
  transit: TransitProvider;
  power: PowerProvider;
  hue: HueProvider;
  health: HealthStore;
}

/** Layers the user's config.json on/off switch over a provider's own credential check —
 * distinct reasons ("you turned it off" vs "you haven't set it up"), same 'disabled' status. */
function withEnabledToggle(provider: Provider, config: AppConfig): Provider {
  return {
    ...provider,
    isConfigured: () => config.widgets[provider.id]?.enabled !== false && provider.isConfigured(),
  };
}

export function createProviders(
  env: ServerEnv,
  config: AppConfig,
  database: Database,
  getClashRoyaleData: () => unknown = () => undefined,
): Providers {
  const weather = createWeatherProvider(env.weather, env.timezone);
  // Transit and power share the weather coordinates: "near the dashboard's location".
  const transit = createTransitProvider(env.weather, config.transit);
  const power = createPowerProvider(config.power.area, env.weather, env.timezone);
  const hue = createHueProvider(env.hue);
  const health = new HealthStore(database);
  const usageHistory = new UsageHistoryStore(database, config.aiUsage.historySampleMs);
  const spotifySnapshot = new SpotifySnapshotStore(database);
  const githubSnapshot = new GitHubSnapshotStore(database);
  const spotifyHistory = new SpotifyHistoryStore(database);
  const steamSnapshot = new SteamSnapshotStore(database);
  const steamHistory = new SteamHistoryStore(database);
  const valorantHistory = new ValorantHistoryStore(database);
  const clashOfClansState = new ClashOfClansStateStore(database);
  return {
    weather,
    transit,
    power,
    hue,
    health,
    all: (
      [
        weather,
        transit,
        power,
        createCalendarProvider(
          env.icloud,
          config.calendar.allowlist,
          env.timezone,
          config.calendar.holidayIcsUrl,
          config.calendar.includeBirthdays,
          env.calendarIcsFeeds,
        ),
        createGmailProvider(env.google),
        createGitHubProvider(env.github, githubSnapshot),
        createClaudeUsageProvider(config.aiUsage.claudeRefreshMs, usageHistory),
        createCodexUsageProvider(config.aiUsage.codexRefreshMs, usageHistory),
        createNewsProvider(config.news.feeds),
        createAiNewsProvider(config.aiNews.feeds),
        createSpotifyProvider(env.spotify, spotifySnapshot, spotifyHistory),
        createCiderProvider(env.cider),
        createLastFmProvider(env.lastfm),
        createHealthProvider(health, env.timezone, {
          steps: config.health.stepGoal,
          activeEnergyKcal: config.health.moveGoalKcal,
          exerciseMinutes: config.health.exerciseGoalMinutes,
          standHours: config.health.standGoalHours,
        }, {
          windowDays: config.health.baselineWindowDays,
          deviationPercent: config.health.baselineDeviationPercent,
        }),
        createSystemProvider(env.timezone),
        hue,
        createIMessageProvider(),
        createSteamProvider(env.steam, steamSnapshot, steamHistory, {
          maxFriends: config.steam.leaderboardMaxFriends,
          ttlMs: config.steam.leaderboardTtlHours * 60 * 60_000,
        }),
        createRobloxProvider(env.roblox),
        createClashRoyaleProvider(env.clashRoyale),
        createClashOfClansProvider(env.clashOfClans),
        createValorantProvider(env.valorant, valorantHistory),
        createSonarCloudProvider(env.sonarCloud),
        createActivityPushProvider(env.dashboardPush, getClashRoyaleData, env.clashOfClans, clashOfClansState),
      ] satisfies Provider[]
    ).map((provider) => withEnabledToggle(provider, config)),
  };
}
