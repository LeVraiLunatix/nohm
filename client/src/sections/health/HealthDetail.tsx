import type { HealthData, HealthDay } from '@nohm/shared';
import { WidgetBody, WidgetShell } from '../../components/WidgetCard';
import { relativeTime } from '../../lib/time';
import { latestActivityDay } from '../../lib/health';
import { useWidget } from '../../useWidget';
import { HealthWidget } from '../../widgets/HealthWidget';
import { DetailIntro, DetailSectionHeading } from '../DetailIntro';
import { HealthTrendCharts } from './HealthTrendCharts';

function value(value: number | undefined, suffix = '', precision = 0) {
  return value == null ? '—' : `${value.toFixed(precision)}${suffix}`;
}

function HistoryTable({ days }: Readonly<{ days: HealthDay[] }>) {
  if (days.length === 0) return <p className="text-sm text-ink-faint">No health days have been synced yet.</p>;
  const rows = days.slice().reverse();
  const headings = [
    { label: 'Date', tone: 'text-ink-faint' },
    { label: 'Steps', tone: 'text-(--color-accent-personal)' },
    { label: 'Move', tone: 'text-rose-400' },
    { label: 'Exercise', tone: 'text-lime-300' },
    { label: 'Stand', tone: 'text-cyan-300' },
    { label: 'Avg bpm', tone: 'text-rose-300' },
    { label: 'Rest bpm', tone: 'text-blue-400' },
    { label: 'Walk bpm', tone: 'text-amber-400' },
    { label: 'Oxygen', tone: 'text-cyan-300' },
  ];
  return (
    <div className="overflow-x-auto pb-1">
      <table className="w-full min-w-[68rem] border-separate border-spacing-0 text-left text-xs">
        <thead className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">
          <tr>
            {headings.map((heading) => (
              <th key={heading.label} className={`border-b border-card-border px-3 py-2.5 font-medium first:pl-0 ${heading.tone}`}>{heading.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums text-ink-muted">
          {rows.map((day) => (
            <tr key={day.date}>
              <td className="border-b border-card-border px-3 py-3 font-medium text-ink first:pl-0">
                {new Date(`${day.date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </td>
              <td className="border-b border-card-border px-3 py-3">{value(day.steps)}</td>
              <td className="border-b border-card-border px-3 py-3">{value(day.activeEnergyKcal, ' kcal')}</td>
              <td className="border-b border-card-border px-3 py-3">{value(day.exerciseMinutes, ' min')}</td>
              <td className="border-b border-card-border px-3 py-3">{value(day.standHours, ' h')}</td>
              <td className="border-b border-card-border px-3 py-3">{value(day.heartRate)}</td>
              <td className="border-b border-card-border px-3 py-3">{value(day.restingHeartRate)}</td>
              <td className="border-b border-card-border px-3 py-3">{value(day.walkingHeartRate)}</td>
              <td className="border-b border-card-border px-3 py-3">{value(day.bloodOxygenPercent, '%')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HealthSignals({ data }: Readonly<{ data: HealthData }>) {
  const today = latestActivityDay(data);
  const isToday = data.today === today;
  return (
    <div className="detail-signal-panel">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-ink-muted">{isToday ? 'Today’s movement' : 'Last synced movement'}</p>
          <p className="mt-1 text-3xl font-semibold tracking-[-0.06em] tabular-nums">{(today?.steps ?? 0).toLocaleString()} <span className="text-base font-medium text-ink-faint">steps</span></p>
        </div>
        {today?.heartRate != null && <p className="text-sm font-semibold text-rose-300">♥ {Math.round(today.heartRate)} bpm</p>}
      </div>
      <p className="mt-4 text-[11px] text-ink-faint">{data.updatedAt ? `Synced ${relativeTime(data.updatedAt)}` : 'Awaiting first health sync'}</p>
    </div>
  );
}

export function HealthDetail() {
  const { envelope, offline } = useWidget<HealthData>('health');
  return (
    <div>
      <DetailIntro
        title="Health & recovery"
        description="Today's activity, heart rate, and recovery — plus the full history synced from your phone."
        accent="var(--color-accent-health)"
      >
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <HealthSignals data={data} />}
        </WidgetBody>
      </DetailIntro>

      <DetailSectionHeading title="Today's numbers" detail="Live values from your Apple Health Shortcut." />
      <HealthWidget />

      <div className="mt-6">
        <DetailSectionHeading title="The last 30 days, charted" detail="Daily activity totals against their goals, plus heart-rate and blood-oxygen trends. Tap a day to read its exact values." />
        <WidgetShell title="Health trends">
          <WidgetBody envelope={envelope} offline={offline}>
            {(data) => <HealthTrendCharts history={data.history} goals={data.goals} />}
          </WidgetBody>
        </WidgetShell>
      </div>

      <div className="mt-6">
        <DetailSectionHeading title="The last 30 days, day by day" detail="Each row is a daily rollup, so activity totals and recovery readings stay in context." />
        <WidgetShell title="Health history">
          <WidgetBody envelope={envelope} offline={offline}>
            {(data) => <HistoryTable days={data.history} />}
          </WidgetBody>
        </WidgetShell>
      </div>
    </div>
  );
}
