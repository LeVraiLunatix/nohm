// Generates README screenshots against fake, fully-anonymized data (screenshotFixtures.ts): the
// overview (hero + command center) plus the Spotify, Health, AI usage, and GitHub detail pages.
// The overview's command-center ranking runs through the *real* scoring code (importance/
// sources.ts + rank.ts). Boots a throwaway
// mock API on :4823, points a scratch Vite client dev server at it, and drives headless Chromium
// via Playwright to capture each page. Runs both locally (npm run screenshots -w server) and in
// CI (.github/workflows/screenshots.yml) — Playwright handles browser provisioning on both.
//
// Usage: npm run screenshots -w server
import 'dotenv/config';
import { createServer, type Server } from 'node:http';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page as PlaywrightPage } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import type { WidgetEnvelope } from '@nohm/shared';
import { rankCandidates } from '../src/importance/rank.js';
import {
  aiCandidates,
  calendarCandidates,
  fallbackCandidates,
  githubCandidates,
  healthCandidates,
  imessageCandidates,
  spotifyCandidates,
  steamCandidates,
  weatherCandidates,
} from '../src/importance/sources/index.js';
import {
  buildAiFixtures,
  githubFixture,
  healthFixture,
  loadFixtures,
  overviewAiClaude,
  overviewAiCodex,
  overviewCalendar,
  overviewGithub,
  overviewHealth,
  overviewSteam,
  weather,
} from './screenshotFixtures.js';

// Keep the throwaway capture API separate from the normal development server on 4822.
const MOCK_PORT = 4823;
const CLIENT_PORT = 5199;
const GMAIL_FRESH_MS = 30 * 60_000;
const SPOTIFY_RECENT_PLAYED_MAX_AGE_MS = 6 * 60 * 60_000;
const VIEWPORT = { width: 1600, height: 900 };

// A capture only overwrites the committed PNG once more than this many pixels differ beyond the
// per-pixel color threshold — trivial font-rendering/anti-aliasing jitter between runs shouldn't
// produce a commit. Mirrors the Versed screenshot workflow this one is modeled on.
const DIFF_PIXEL_THRESHOLD = 50;
const COLOR_THRESHOLD = 0.1;

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, '../..');
const outDir = path.resolve(repoRoot, 'docs/screenshots');

function envelope<T>(data: T, now: Date = new Date()): WidgetEnvelope<T> {
  const iso = now.toISOString();
  return { id: 'x', status: 'ready', data, fetchedAt: iso, lastAttemptAt: iso, refreshMs: 60_000 };
}

type Daypart = 'night' | 'dawn' | 'morning' | 'day' | 'evening';

// Representative hours for the continuous sky and the matching overview greeting. Freezing an
// exact time keeps screenshots deterministic even though the ambient colors no longer use buckets.
const DAYPART_HOUR: Record<Daypart, [number, number]> = {
  night: [2, 0], dawn: [5, 30], morning: [8, 30], day: [14, 0], evening: [19, 30],
};

/** Mirrors the in-browser FakeDate init script's target time — used so a widget envelope's
 * fetchedAt matches what the page's faked clock will think "now" is. Without this, anything
 * computing elapsed-since-fetch (the Now Playing progress bar, "Synced Xh ago" captions) measures
 * against the real generation time instead and renders nonsense once the browser clock is faked. */
function referenceNow(daypart: Daypart): Date {
  const [hour, minute] = DAYPART_HOUR[daypart];
  // Keep the synthetic calendar anchored to Thursday 16 July 2026 so the cinema fixture is
  // always the following Friday 17 July, regardless of when screenshots are regenerated.
  return new Date(2026, 6, 16, hour, minute, 0, 0);
}

interface Page {
  slug: string;
  file: string;
  hash: string;
  /** Leaf-element text to scroll to the top of the viewport before capturing — lets a long detail
   * page's most interesting section fill the fixed 16:9 frame instead of just whatever's at the
   * very top. Omit to capture from the top (used for the overview, which already opens on the
   * hero + command center). */
  scrollToText?: string;
  /** 'top' scrolls scrollToText's own heading to just below the sticky header (the default).
   * 'bottom' instead scrolls scrollToText's containing `section.glass` card so its *bottom* edge
   * lands at the viewport's bottom — guarantees the full card is visible regardless of its
   * height, instead of guessing a pixel offset that breaks the next time the content changes. */
  scrollAlign?: 'top' | 'bottom';
  /** Extra scroll (px) applied after the alignment above — positive scrolls further down,
   * negative scrolls back up. */
  extraScroll?: number;
  daypart: Daypart;
  frozenAt: number;
  theme: 'light' | 'dark';
  widgets: Record<string, WidgetEnvelope>;
}

async function buildPages(): Promise<Page[]> {
  // Computed up front, then threaded into every fixture builder below instead of letting them
  // read the real Date.now() — keeps each page's data timestamps pinned to the exact same frozen
  // clock the client fakes for that page, so two runs on different days/hours produce byte-
  // identical screenshots (given the fixtures' seeded RNGs) instead of spuriously-drifted ones.
  const overviewNow = referenceNow('evening');
  const spotifyNow = referenceNow('morning');
  const healthNow = referenceNow('day');
  const aiNow = referenceNow('night');
  const githubNow = referenceNow('dawn');

  const fixtures = await loadFixtures(spotifyNow);
  const aiFixtures = buildAiFixtures(aiNow);
  const overviewCalendarFixture = overviewCalendar(overviewNow);
  const overviewGithubFixture = overviewGithub(overviewNow);
  const overviewHealthFixture = overviewHealth(overviewNow);
  const overviewSteamFixture = overviewSteam();
  const overviewAiClaudeFixture = overviewAiClaude(overviewNow);
  const overviewAiCodexFixture = overviewAiCodex(overviewNow);
  const healthPageFixture = healthFixture(healthNow);
  const githubPageFixture = githubFixture(githubNow);
  const overviewWeatherFixture = weather(overviewNow);

  const overviewRanked = rankCandidates([
    ...calendarCandidates(overviewCalendarFixture, overviewNow.getTime()),
    ...githubCandidates(overviewGithubFixture, 14, 50),
    ...healthCandidates(overviewHealthFixture),
    ...weatherCandidates(overviewWeatherFixture, 25, -10, 12, 8),
    ...imessageCandidates(undefined, GMAIL_FRESH_MS),
    ...spotifyCandidates(fixtures.spotifyOverview, {
      trackShort: false, trackMedium: false, trackLong: false,
      artistShort: false, artistMedium: false, artistLong: false,
      trackAllTime: false,
      artistAllTime: false,
      albumAllTime: false,
    }, SPOTIFY_RECENT_PLAYED_MAX_AGE_MS),
    ...steamCandidates(overviewSteamFixture, 24 * 60 * 60_000),
    ...aiCandidates(
      [
        { id: 'claude', label: 'Claude', data: overviewAiClaudeFixture },
        { id: 'codex', label: 'Codex', data: overviewAiCodexFixture },
      ],
      14,
      50,
    ),
    ...fallbackCandidates({ calendar: 'ready' }),
  ]);
  const expectedSecondaryIds = ['spotify:now-playing', 'steam:now-playing:730', 'weather:uv'];
  if (overviewRanked.secondary.map((slot) => slot.id).join(',') !== expectedSecondaryIds.join(',')) {
    throw new Error('Overview screenshot requires Spotify, Steam, and high-UV secondary cards');
  }
  const overviewCommandCenter = overviewRanked;

  return [
    {
      slug: 'overview', file: '01-overview.png', hash: '', daypart: 'evening', frozenAt: overviewNow.getTime(), theme: 'dark',
      widgets: {
        'command-center': envelope(overviewCommandCenter, overviewNow),
        calendar: envelope(overviewCalendarFixture, overviewNow),
        weather: envelope(overviewWeatherFixture, overviewNow),
        steam: envelope(overviewSteamFixture, overviewNow),
        github: envelope(overviewGithubFixture, overviewNow),
        health: envelope(overviewHealthFixture, overviewNow),
        spotify: envelope(fixtures.spotifyOverview, overviewNow),
      },
    },
    {
      slug: 'spotify', file: '02-spotify.png', hash: '#/spotify', scrollToText: 'Your rotation', extraScroll: 60,
      daypart: 'morning', frozenAt: spotifyNow.getTime(), theme: 'dark',
      widgets: { spotify: envelope(fixtures.spotifyDetail, spotifyNow) },
    },
    {
      slug: 'health', file: '03-health.png', hash: '#/health', scrollToText: 'The last 30 days, charted',
      daypart: 'day', frozenAt: healthNow.getTime(), theme: 'light',
      widgets: { health: envelope(healthPageFixture, healthNow) },
    },
    {
      // Bottom-aligning the ai-tool-panel card guarantees both the Claude and Codex cards show
      // in full, which matters more here than the intro headline above them. Anchored on static
      // caption text rather than "As of just now" — that line's wording depends on relative time,
      // which drifts once the page's clock is faked to a fixed daypart. extraScroll nudges a
      // little further down past the alignment default so the card's full bottom margin clears.
      slug: 'ai-usage', file: '04-ai-usage.png', hash: '#/ai', scrollToText: 'Weekly window · last 7 d', scrollAlign: 'bottom', extraScroll: 40,
      daypart: 'night', frozenAt: aiNow.getTime(), theme: 'light',
      widgets: { 'ai-usage-claude': envelope(aiFixtures.claude, aiNow), 'ai-usage-codex': envelope(aiFixtures.codex, aiNow) },
    },
    {
      // Bottom-align the Contributions card, then nudge up past its own bottom caption ("N
      // contributions in the last year") so the crop ends on the grid itself.
      slug: 'github', file: '05-github.png', hash: '#/github', scrollToText: 'Contributions', scrollAlign: 'bottom', extraScroll: -50,
      daypart: 'dawn', frozenAt: githubNow.getTime(), theme: 'dark',
      widgets: { github: envelope(githubPageFixture, githubNow) },
    },
  ];
}

async function freePort(port: number): Promise<void> {
  try {
    const pids = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf8' })
      .split('\n').map((line) => line.trim()).filter(Boolean);
    for (const pid of pids) process.kill(Number(pid), 'SIGTERM');
    if (pids.length) await sleep(500);
  } catch {
    // Nothing listening — fine.
  }
}

function startMockServer(current: () => Page): Server {
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/code/projects') {
      res.end(JSON.stringify({ projects: [] }));
      return;
    }
    if (req.url === '/api/github/repos') {
      res.end(JSON.stringify({ repos: [] }));
      return;
    }
    const page = current();
    const id = req.url?.replace(/^\/api\/widgets\//, '') ?? '';
    if (req.url === '/api/widgets') {
      res.end(JSON.stringify({ widgets: Object.keys(page.widgets).map((wid) => ({ id: wid, status: 'ready', refreshMs: 60_000 })) }));
      return;
    }
    const found = page.widgets[id];
    if (found) {
      res.end(JSON.stringify({ ...found, id }));
      return;
    }
    // Anything not covered by the current page's fixtures — render as still-loading, same as a
    // real cold cache, rather than maintaining stub data for every widget on every page.
    res.end(JSON.stringify({ id, status: 'loading', refreshMs: 60_000 }));
  });
  server.listen(MOCK_PORT);
  return server;
}

function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      fetch(url).then(() => resolve()).catch(() => {
        if (Date.now() > deadline) reject(new Error(`Timed out waiting for ${url}`));
        else setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs before any of the page's own scripts, on every navigation in this browser context. Fakes
 * Date so the ambient sky-wash daypart *and* the overview's "Good evening"/"Good morning" greeting
 * (a separate client-side computation off the same clock) agree, regardless of what time this
 * script actually runs. The fixed timestamp comes from the same per-page reference time used to
 * build the fixtures, so time-dependent UI such as playback progress cannot drift during capture.
 *
 * Deliberately does *not* also inject a blanket `animation-duration:0s!important` freeze: a
 * 0-duration `infinite` CSS animation's "current frame" is implementation-defined, which made the
 * Now Playing equalizer bars render at a different (wrong) height on every run. The context's own
 * `reducedMotion: 'reduce'` option already covers this correctly — the app's CSS has a real
 * `@media (prefers-reduced-motion: reduce)` rule for the equalizer, and Framer Motion's
 * `MotionConfig reducedMotion="user"` (App.tsx) does the same for every motion.* animation. */
function installPageOverrides({ timestamp }: { timestamp: number }): void {
  const RealDate = Date;
  // A Proxy, not a `class ... extends Date`, deliberately — Playwright's addInitScript extracts
  // this function's source via toString() and runs it standalone in the browser, so it can't rely
  // on esbuild's class-transform helpers (e.g. __name) that only exist in this file's own module
  // scope; a class declaration here throws "__name is not defined" the moment it's evaluated.
  const FakeDate = new Proxy(RealDate, {
    construct(ctor, args) {
      return args.length === 0 ? new ctor(timestamp) : new ctor(...(args as []));
    },
    apply() {
      return new RealDate(timestamp).toString();
    },
    get(ctor, prop) {
      if (prop === 'now') return () => timestamp;
      return Reflect.get(ctor, prop);
    },
  });
  window.Date = FakeDate;
}

function scrollToTarget({ text, align, extraScroll }: { text: string; align: 'top' | 'bottom'; extraScroll: number }): boolean {
  const target = [...document.querySelectorAll('h1,h2,h3,p,span')]
    .find((el): el is HTMLElement => el.children.length === 0 && el.textContent?.trim() === text) as HTMLElement | undefined;
  if (!target) return false;
  if (align === 'bottom') {
    // Align the containing card's *bottom* edge to the viewport bottom, so the full card is
    // guaranteed visible regardless of its height — robust to content changes, unlike a
    // hand-tuned pixel offset.
    (target.closest('section') ?? target).scrollIntoView(false);
    window.scrollBy(0, -16 + extraScroll);
  } else {
    // .detail-header is sticky (top: 1rem) — scrolling the target flush to y=0 tucks it right
    // behind the floating header, so back off by the header's height plus its sticky offset to
    // land just below it instead.
    target.scrollIntoView(true);
    const header = document.querySelector('.detail-header');
    const clearance = (header?.getBoundingClientRect().height ?? 0) + 32;
    window.scrollBy(0, -clearance + extraScroll);
  }
  return true;
}

/** Only overwrites the committed PNG when the new capture differs meaningfully from it — keeps
 * PRs quiet (and avoids a churny commit-then-push loop in CI) when the pixels are effectively
 * unchanged. */
function saveIfChanged(buf: Buffer, outFile: string): boolean {
  const next = PNG.sync.read(buf);
  if (existsSync(outFile)) {
    let prev: PNG | null = null;
    try {
      prev = PNG.sync.read(readFileSync(outFile));
    } catch {
      prev = null;
    }
    if (prev && prev.width === next.width && prev.height === next.height) {
      const changed = pixelmatch(prev.data, next.data, undefined, next.width, next.height, {
        threshold: COLOR_THRESHOLD, includeAA: false,
      });
      if (changed <= DIFF_PIXEL_THRESHOLD) {
        console.log(`  ${changed} px changed (<= ${DIFF_PIXEL_THRESHOLD}), keeping the committed image`);
        return false;
      }
      console.log(`  ${changed} px changed, updating`);
    }
  }
  writeFileSync(outFile, buf);
  return true;
}

async function capturePage(pw: PlaywrightPage, page: Page): Promise<void> {
  await pw.goto(`http://localhost:${CLIENT_PORT}/${page.hash}`);
  await sleep(2_500);
  // A fixed sleep isn't enough on its own — pages with multiple independent widgets (e.g. two
  // ai-tool-panel cards each with their own useWidget poll) can still have one card mid-fetch at
  // that point even though the mock server already answered, since each widget's own React state
  // update lands on its own tick. Wait for every WidgetBody loading skeleton to actually clear.
  await pw.waitForFunction(() => !document.querySelector('.animate-pulse'), null, { timeout: 5_000 }).catch(() => {});

  if (page.scrollToText) {
    const found = await pw.evaluate(scrollToTarget, { text: page.scrollToText, align: page.scrollAlign ?? 'top', extraScroll: page.extraScroll ?? 0 });
    if (!found) {
      console.error(`  scroll target "${page.scrollToText}" not found for ${page.slug} — capturing from the top`);
    }
    await sleep(400);
  }

  // The overview intentionally has three carousel positions. Pin the capture to the first,
  // now-playing slide so a slow local bundle or a long fixture fetch cannot catch a transition.
  if (page.slug === 'overview') {
    const carousel = pw.locator('.command-secondary-carousel');
    const firstCarouselDot = pw.locator('.command-secondary-carousel-dots button').first();
    if (await firstCarouselDot.count()) {
      await carousel.evaluate((element) => element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
      await firstCarouselDot.evaluate((button: HTMLButtonElement) => button.click());
      await sleep(500);
    }
  }

  const buf = await pw.screenshot({ type: 'png' });
  const outFile = path.join(outDir, page.file);
  const changed = saveIfChanged(buf, outFile);
  console.log(`  -> ${path.relative(repoRoot, outFile)}${changed ? '' : ' (unchanged)'}`);
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  console.log('Loading fixtures (fetching real cover art / artist photos)...');
  const pages = await buildPages();
  let currentPage = pages[0];
  await freePort(MOCK_PORT);
  const mockServer = startMockServer(() => currentPage);

  console.log(`Starting scratch Vite client on :${CLIENT_PORT}...`);
  await freePort(CLIENT_PORT);
  const viteCli = path.resolve(repoRoot, 'node_modules/vite/bin/vite.js');
  const vite: ChildProcess = spawn(process.execPath, [viteCli, '--port', String(CLIENT_PORT), '--strictPort'], {
    cwd: path.resolve(repoRoot, 'client'),
    env: { ...process.env, VITE_API_PROXY_TARGET: `http://localhost:${MOCK_PORT}` },
    stdio: 'ignore',
  });
  await waitForHttp(`http://localhost:${CLIENT_PORT}`, 20_000);

  console.log('Launching headless Chromium...');
  const browser = await chromium.launch();

  try {
    for (const [index, page] of pages.entries()) {
      currentPage = page;
      console.log(`[${index + 1}/${pages.length}] ${page.slug}`);

      // A fresh context per page — cleaner isolation than one shared page, and guarantees the
      // init script below actually reruns (a plain page.goto to a URL differing only by #hash is
      // a same-document navigation in some engines and won't always rerun page scripts).
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 2,
        colorScheme: page.theme,
        reducedMotion: 'reduce',
      });
      await context.addInitScript(installPageOverrides, { timestamp: page.frozenAt });
      const pw = await context.newPage();
      await capturePage(pw, page);
      await context.close();
    }
  } finally {
    await browser.close();
    vite.kill();
    mockServer.close();
  }

  console.log('Done.');
}

try {
  await main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
