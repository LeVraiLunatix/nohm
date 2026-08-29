// Fake, fully-anonymized data for the public interactive demo build (see ../api.ts, which serves
// this instead of hitting a real server). One consistent fake persona across every widget — no
// real names, places, accounts, or credentials. Modeled on server/scripts/screenshotFixtures.ts
// (the README screenshot generator), but self-contained: no Node imports, no network calls at
// build time, and timestamped off the real clock instead of a frozen one, since this is a live
// page a visitor actually clicks around in rather than a single captured frame.
//
// One module per source, the same axis as shared/src/schemas/ and the server's providers.
import type { WidgetEnvelope } from '@nohm/shared';
import { aiUsage } from './ai';
import { calendar } from './calendar';
import { clashRoyale } from './clashRoyale';
import { commandCenter } from './commandCenter';
import { github, sonarCloud } from './github';
import { health } from './health';
import { hue, power, system, transit } from './home';
import { aiNews, gmail, imessage, news } from './personal';
import { roblox } from './roblox';
import { envelope } from './shared';
import { spotify } from './spotify';
import { steam } from './steam';
import { valorant } from './valorant';
import { weather } from './weather';

export { spotifyNowPlayingAt } from './spotify';

export function buildDemoEnvelopes(now: Date): Record<string, WidgetEnvelope> {
  const cal = calendar(now);
  const hlth = health(now);
  const { claude, codex } = aiUsage(now);

  return {
    system: envelope('system', system(now), now, 60_000),
    weather: envelope('weather', weather(now), now, 10 * 60_000),
    calendar: envelope('calendar', cal, now, 5 * 60_000),
    gmail: envelope('gmail', gmail(now), now, 5 * 60_000),
    imessage: envelope('imessage', imessage(now), now, 60_000),
    news: envelope('news', news(now), now, 15 * 60_000),
    'ai-news': envelope('ai-news', aiNews(now), now, 15 * 60_000),
    hue: envelope('hue', hue(), now, 30_000),
    transit: envelope('transit', transit(now), now, 30_000),
    power: envelope('power', power(now), now, 15 * 60_000),
    health: envelope('health', hlth, now, 5 * 60_000),
    github: envelope('github', github(now), now, 5 * 60_000),
    'sonar-cloud': envelope('sonar-cloud', sonarCloud(now), now, 15 * 60_000),
    'ai-usage-claude': envelope('ai-usage-claude', claude, now, 15 * 60_000),
    'ai-usage-codex': envelope('ai-usage-codex', codex, now, 30_000),
    spotify: envelope('spotify', spotify(now), now, 30_000),
    steam: envelope('steam', steam(now), now, 5 * 60_000),
    roblox: envelope('roblox', roblox(now), now, 60_000),
    'clash-royale': envelope('clash-royale', clashRoyale(now), now, 5 * 60_000),
    valorant: envelope('valorant', valorant(now), now, 5 * 60_000),
    'command-center': envelope('command-center', commandCenter(now, cal, hlth), now, 60_000),
  };
}
