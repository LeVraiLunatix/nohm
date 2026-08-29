import type { WeatherData } from '@nohm/shared';
import { WidgetBody, WidgetShell } from '../../components/WidgetCard';
import { SystemFooter } from '../../components/SystemFooter';
import { useWidget } from '../../useWidget';
import { deg, feelsLike, glyph, symbolLabel, weatherLocation } from '../../lib/weather';
import { mapsCoordinatesHref } from '../../lib/maps';
import { DetailIntro, DetailSectionHeading } from '../DetailIntro';
import { MoonPanel, SunArc } from './astro';
import { ConditionTiles } from './ConditionTiles';
import { HourlySection } from './HourlyCharts';
import { WeekAheadSection } from './WeekAhead';
import './weather.css';

/* ── Intro signals ─────────────────────────────────────────────────────────── */

function WeatherSignals({ data }: Readonly<{ data: WeatherData }>) {
  const today = data.days[0];
  const feels = feelsLike(data.current.temperature, data.current.humidity, data.current.windSpeed);
  const showFeelsLike = Math.abs(feels - data.current.temperature) >= 1;
  return (
    <div className="detail-signal-panel lg:w-[22rem]">
      <div className="flex items-center gap-4">
        <span className="text-5xl" aria-hidden>{glyph(data.current.symbol)}</span>
        <div>
          <p className="text-4xl font-semibold tracking-[-0.06em]">{deg(data.current.temperature)}</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {symbolLabel(data.current.symbol)}
            {today && <span className="text-ink-faint"> · {deg(today.minTemperature)} / {deg(today.maxTemperature)}</span>}
          </p>
          {showFeelsLike && <p className="mt-0.5 text-xs text-ink-faint">Feels like {deg(feels)}</p>}
        </div>
      </div>
      <a
        href={mapsCoordinatesHref(data.location)}
        target="_blank"
        rel="noreferrer"
        className="mt-4 flex w-fit items-center gap-1 text-[11px] text-ink-faint underline decoration-card-border underline-offset-2 transition hover:text-ink"
      >
        <span aria-hidden>📍</span>
        {weatherLocation(data.location)}
      </a>
    </div>
  );
}

/* ── Sky: sun arc + moon phase ────────────────────────────────────────────── */

/** Sun and moon, given a section of their own with room to breathe — the hero card is for
 * "what's the weather right now", not a squeezed-in arc diagram. */
function SkySection({ data }: Readonly<{ data: WeatherData }>) {
  if (!data.sun && !data.moon) return null;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-center lg:gap-8">
      <div className="min-w-0">
        {data.sun ? (
          <SunArc sunrise={data.sun.sunrise} sunset={data.sun.sunset} />
        ) : (
          <p className="text-sm text-ink-faint">Sun times are syncing.</p>
        )}
      </div>
      {data.moon && (
        <div className="border-t border-card-border pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <MoonPanel moon={data.moon} />
        </div>
      )}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export function WeatherDetail() {
  const { envelope, offline } = useWidget<WeatherData>('weather');
  return (
    <div>
      <DetailIntro
        title="Weather forecast"
        description="Current conditions, the sun and moon, and the week ahead, straight from MET Norway."
        accent="var(--color-accent-weather)"
      >
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <WeatherSignals data={data} />}
        </WidgetBody>
      </DetailIntro>

      <DetailSectionHeading title="Hour by hour" detail="Switch days to look further ahead, and switch stats to see when rain, UV, wind or humidity peaks." />
      <WidgetShell title="Hour by hour">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <HourlySection data={data} />}
        </WidgetBody>
      </WidgetShell>

      <div className="mt-6">
        <DetailSectionHeading title="The week ahead" detail="Switch stats to compare temperature, rain, UV, wind or humidity across the week." />
        <WidgetShell title="7-day forecast">
          <WidgetBody envelope={envelope} offline={offline}>
            {(data) => <WeekAheadSection data={data} />}
          </WidgetBody>
        </WidgetShell>
      </div>

      <div className="mt-6">
        <DetailSectionHeading title="Current conditions" detail="Wind, humidity, UV and rain, as of the latest forecast." />
        <WidgetShell title="Conditions">
          <WidgetBody envelope={envelope} offline={offline}>
            {(data) => <ConditionTiles data={data} />}
          </WidgetBody>
        </WidgetShell>
      </div>

      <div className="mt-6">
        <DetailSectionHeading title="Sun and moon" detail="Where the sun sits in today's arc, and tonight's moon phase." />
        <WidgetShell title="Sun & moon">
          <WidgetBody envelope={envelope} offline={offline}>
            {(data) => <SkySection data={data} />}
          </WidgetBody>
        </WidgetShell>
      </div>

      <SystemFooter />
    </div>
  );
}
