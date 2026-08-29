import type {
  AiUsageToolData,
  CalendarData,
  CommandCenterData,
  GitHubData,
  GmailData,
  HealthData,
  RobloxData,
  SpotifyData,
  SteamData,
  WeatherData,
} from '@nohm/shared';
import { useWidget } from '../../useWidget';

export type AiUsageByTool = Readonly<{
  claude: AiUsageToolData | undefined;
  codex: AiUsageToolData | undefined;
}>;

/**
 * The command center deliberately reads its complete view-model in one place.
 * `useWidget` is backed by a shared cache, so detail pages and repeated cards
 * reuse these envelopes instead of creating parallel polling loops.
 */
export function useCommandCenterData() {
  const commandCenter = useWidget<CommandCenterData>('command-center').envelope?.data;
  const calendar = useWidget<CalendarData>('calendar').envelope?.data;
  const weather = useWidget<WeatherData>('weather').envelope?.data;
  const github = useWidget<GitHubData>('github').envelope?.data;
  const health = useWidget<HealthData>('health').envelope?.data;
  const gmail = useWidget<GmailData>('gmail').envelope?.data;
  const aiUsage: AiUsageByTool = {
    claude: useWidget<AiUsageToolData>('ai-usage-claude').envelope?.data,
    codex: useWidget<AiUsageToolData>('ai-usage-codex').envelope?.data,
  };
  const spotifyEnvelope = useWidget<SpotifyData>('spotify').envelope;
  const steam = useWidget<SteamData>('steam').envelope?.data;
  const roblox = useWidget<RobloxData>('roblox').envelope?.data;

  return {
    commandCenter,
    calendar,
    weather,
    github,
    health,
    gmail,
    aiUsage,
    spotify: spotifyEnvelope?.data,
    spotifyFetchedAt: spotifyEnvelope?.fetchedAt,
    steam,
    roblox,
  };
}
