import { lazy, Suspense, useEffect, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'motion/react';
import { useHashRoute } from './router';
import { useDeviceLocation } from './useDeviceLocation';
import { SkyTimeContext } from './lib/skyTime';
import { SECTIONS, sectionById, SteamGradientDefs } from './sections/registry';
import { SectionCard } from './sections/SectionCard';
import { SectionView } from './sections/SectionView';
import { PAGE_EXIT, SECTION_GLOW_ENTER, SECTION_GLOW_EXIT, UI_SPRING } from './sections/transitions';
import { SystemFooter } from './components/SystemFooter';
import { DailyCommandCenter } from './components/DailyCommandCenter';

// Dev-only (`?dev=gallery`) and drags the synthetic demo fixtures in with it — kept out of the
// production entry chunk and loaded only when that query param is present.
const SlotGallery = lazy(() =>
  import('./components/command-center/SlotGallery').then((m) => ({ default: m.SlotGallery })),
);
import { ThemeToggle } from './components/ThemeToggle';
import { useI18n } from './i18n/I18nProvider';
import { needsSetup, SetupWizard } from './sections/settings/SetupWizard';
import { GameModeButton } from './gameMode/GameModeButton';
import { useVisibleSections } from './sections/settings/preferences';

/**
 * Dev tools reachable at runtime via `?dev=sky` (tune the continuous sky colors) or `?dev=gallery`
 * (inspect every What's next hero/tile/secondary render variant at once) — a query param rather
 * than a source flag so they work on an already-deployed build (including the public demo)
 * without a rebuild. Neither reveals anything sensitive: the gallery is always synthetic fixture
 * data, and the sky preview only touches decorative color state.
 */
function devToolFromUrl(): 'sky' | 'gallery' | null {
  const value = new URLSearchParams(window.location.search).get('dev');
  return value === 'sky' || value === 'gallery' ? value : null;
}

type SkyStop = {
  minute: number;
  skyA: string;
  skyB: string;
};

/* The extra dawn and dusk stops prevent a direct blue-to-orange blend from going muddy.
   Colors are paired light/dark so the same clock produces an appropriate wash in either mode. */
const SKY_STOPS: readonly SkyStop[] = [
  { minute: 0, skyA: 'light-dark(#bccfff, #1e407a)', skyB: 'light-dark(#80a0ff, #081634)' },
  { minute: 2 * 60 + 30, skyA: 'light-dark(#9ddfdc, #0e6a76)', skyB: 'light-dark(#67b5e9, #07364c)' },
  { minute: 5 * 60, skyA: 'light-dark(#c5b8ee, #4d428c)', skyB: 'light-dark(#8994e7, #1f1c5e)' },
  { minute: 7 * 60 + 30, skyA: 'light-dark(#f4a261, #7a4a2e)', skyB: 'light-dark(#9ac8f5, #1d4a70)' },
  { minute: 10 * 60 + 30, skyA: 'light-dark(#91cdf7, #1f638c)', skyB: 'light-dark(#d6efff, #143455)' },
  { minute: 14 * 60 + 30, skyA: 'light-dark(#9bd8e9, #236e83)', skyB: 'light-dark(#e7edb6, #284460)' },
  { minute: 17 * 60, skyA: 'light-dark(#d8c98b, #66523a)', skyB: 'light-dark(#f3c591, #69414a)' },
  { minute: 19 * 60, skyA: 'light-dark(#f48652, #843647)', skyB: 'light-dark(#ee94bc, #391945)' },
  { minute: 21 * 60 + 30, skyA: 'light-dark(#7d8dd6, #2a416d)', skyB: 'light-dark(#7489d5, #142344)' },
  { minute: 22 * 60, skyA: 'light-dark(#bccfff, #1e407a)', skyB: 'light-dark(#80a0ff, #081634)' },
  { minute: 24 * 60, skyA: 'light-dark(#bccfff, #1e407a)', skyB: 'light-dark(#80a0ff, #081634)' },
];

function skyFor(now: Date): CSSProperties {
  const minute = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const nextIndex = SKY_STOPS.findIndex((stop) => stop.minute > minute);
  const end = SKY_STOPS[nextIndex];
  const start = SKY_STOPS[nextIndex - 1];
  const progress = (minute - start.minute) / (end.minute - start.minute);
  const startWeight = `${Math.round((1 - progress) * 1000) / 10}%`;

  return {
    '--sky-a-start': start.skyA,
    '--sky-a-end': end.skyA,
    '--sky-b-start': start.skyB,
    '--sky-b-end': end.skyB,
    '--sky-start-weight': startWeight,
  } as CSSProperties;
}

function minuteOfDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

function timeAtMinute(now: Date, minute: number): Date {
  const preview = new Date(now);
  preview.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return preview;
}

function timeLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function SkyTimeDebugger({ minute, onMinuteChange }: Readonly<{
  minute: number;
  onMinuteChange: Dispatch<SetStateAction<number>>;
}>) {
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => onMinuteChange((current) => (current + 6) % (24 * 60)), 100);
    return () => window.clearInterval(id);
  }, [isPlaying, onMinuteChange]);

  return (
    <section aria-label="Sky time preview" className="fixed inset-x-4 bottom-4 z-50 mx-auto grid max-w-md gap-2 rounded-2xl glass px-4 py-3 shadow-2xl sm:inset-x-auto sm:right-6 sm:w-96">
      <span className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
        <span>Sky preview</span>
        <span className="flex items-center gap-3">
          <output className="text-ink">{timeLabel(minute)}</output>
          <button
            type="button"
            onClick={() => setIsPlaying((playing) => !playing)}
            aria-pressed={isPlaying}
            className="rounded-lg px-2 py-1 text-[0.65rem] font-semibold tracking-normal text-ink transition hover:bg-track"
          >
            {isPlaying ? 'Pause' : 'Play day'}
          </button>
        </span>
      </span>
      <input
        type="range"
        min="0"
        max="1439"
        value={minute}
        onChange={(event) => onMinuteChange(Number(event.target.value))}
        aria-label="Sky preview time"
        className="w-full accent-(--color-accent-ai)"
      />
      <span className="text-[0.65rem] text-ink-faint">Changes the sky, hero clock, greeting, and daylight arc only.</span>
    </section>
  );
}

/** Fixed decorative layer the glass cards blur against — a sky wash that follows the actual
    time of day. --sky-a/--sky-b live on the app root so the command center and hero share it. */
function BackgroundGlow() {
  return (
    <div aria-hidden className="ambient-canvas pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-canvas">
      <div className="ambient-aurora" />
      <div className="ambient-horizon" />
    </div>
  );
}

/** Section-accent color wash layered on top of the sky wash while a section page is open —
    each section's own accent (AI purple, GitHub blue, Spotify green, ...) on top of whatever
    time of day it is, the same way the Spotify page's green wash worked before this generalized.
    It fades rather than switching on with the route: an instant accent behind a page that is
    still morphing into place reads as a flash, and it outlasts the page swap on the way out. */
function SectionGlow({ accentVar }: Readonly<{ accentVar: string }>) {
  return (
    <motion.div
      aria-hidden
      className="section-page-glow"
      style={{ '--section-accent': `var(${accentVar})` } as CSSProperties}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: SECTION_GLOW_ENTER }}
      exit={{ opacity: 0, transition: SECTION_GLOW_EXIT }}
    >
      <div className="section-page-aurora" />
      <div className="section-page-horizon" />
    </motion.div>
  );
}

const overviewGridVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

/** Staggered card entrance runs once per app load, not again when navigating back from a section. */
let overviewEntranceDone = false;

function useCurrentTime() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  return now;
}

function Overview({ now }: Readonly<{ now: Date }>) {
  const { t, date, locale } = useI18n();
  const hour = now.getHours();
  const greeting = t(hour < 6 || hour >= 22 ? 'greeting.night' : hour < 12 ? 'greeting.morning' : hour < 18 ? 'greeting.afternoon' : 'greeting.evening');
  const runEntrance = !overviewEntranceDone;
  const visibleSectionIds = useVisibleSections();
  useEffect(() => {
    overviewEntranceDone = true;
  }, []);

  return (
    <motion.div
      className="col-start-1 row-start-1 w-full min-w-0"
      initial={false}
      animate={{ opacity: 1 }}
      exit={PAGE_EXIT}
    >
      <motion.header
        className="dashboard-hero"
        initial={runEntrance ? { opacity: 0, y: 10 } : false}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3"><span className="nohm-monogram" aria-hidden>N</span><div><p className="text-sm font-semibold tracking-tight text-ink">Nohm</p><p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">{date(now, { weekday: 'long', day: 'numeric', month: 'long' })}</p></div></div>
          <div className="flex items-center gap-2"><GameModeButton /><ThemeToggle /></div>
        </div>
        <div className="grid items-end gap-5 sm:grid-cols-[1fr_auto]">
          <h1 className="hero-title">{greeting}</h1>
          <div className="hidden text-right sm:block">
            <p className="hero-time tabular-nums">{now.toLocaleTimeString(locale === 'fr' ? 'fr-FR' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        </div>
      </motion.header>
      <motion.div
        initial={runEntrance ? { opacity: 0, y: 12 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <DailyCommandCenter />
      </motion.div>
      <div className="dashboard-section-heading">
        <h2>{t('overview.sections')}</h2>
        <p>{t('overview.sectionsHint')}</p>
      </div>
      <motion.div
        className="dashboard-grid"
        variants={overviewGridVariants}
        initial={runEntrance ? 'hidden' : false}
        animate="visible"
      >
        {SECTIONS.filter((section) => visibleSectionIds.includes(section.id)).map((section) => (
          <SectionCard key={section.id} section={section} />
        ))}
      </motion.div>
      <SystemFooter />
    </motion.div>
  );
}

export default function App() {
  const route = useHashRoute();
  const now = useCurrentTime();
  const [devTool] = useState(devToolFromUrl);
  const [skyDebugMinute, setSkyDebugMinute] = useState(() => minuteOfDay(new Date()));
  const [showSetup, setShowSetup] = useState(needsSetup);
  useDeviceLocation();
  const skyNow = devTool === 'sky' ? timeAtMinute(now, skyDebugMinute) : now;

  if (devTool === 'gallery') {
    return (
      <div className="app-shell min-h-screen text-ink" style={skyFor(skyNow)}>
        <SteamGradientDefs />
        <BackgroundGlow />
        <Suspense fallback={null}>
          <SlotGallery />
        </Suspense>
      </div>
    );
  }

  return (
    <SkyTimeContext.Provider value={skyNow}>
    <div
      className="app-shell min-h-screen text-ink selection:bg-(--color-accent-ai)/25"
      style={skyFor(skyNow)}
    >
      <SteamGradientDefs />
      <BackgroundGlow />
      {showSetup && <SetupWizard onClose={() => setShowSetup(false)} />}
      {devTool === 'sky' && <SkyTimeDebugger minute={skyDebugMinute} onMinuteChange={setSkyDebugMinute} />}
      <AnimatePresence>
        {route.view === 'section' && (
          <SectionGlow key={route.sectionId} accentVar={sectionById(route.sectionId).accentVar} />
        )}
      </AnimatePresence>
      <main className="mx-auto max-w-[78rem] px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-6 sm:px-8 sm:pt-10 lg:px-10">
        <MotionConfig reducedMotion="user" transition={UI_SPRING}>
          <LayoutGroup>
            <div className="relative grid grid-cols-[minmax(0,1fr)]">
              <AnimatePresence mode="popLayout" initial={false}>
                {route.view === 'overview' ? (
                  <Overview key="overview" now={skyNow} />
                ) : (
                  <SectionView key={route.sectionId} section={sectionById(route.sectionId)} anchor={route.anchor} />
                )}
              </AnimatePresence>
            </div>
          </LayoutGroup>
        </MotionConfig>
      </main>
    </div>
    </SkyTimeContext.Provider>
  );
}
