import { useEffect } from 'react';
import type {
  AiNewsData,
  CalendarData,
  GmailData,
  HueData,
  IMessageData,
  NewsData,
  PowerData,
  TransitData,
  WidgetEnvelope,
} from '@nohm/shared';
import { ArrangeableWidgetGrid, type ArrangeableItem } from '../../components/ArrangeableWidgetGrid';
import { CalendarWidget } from '../../widgets/CalendarWidget';
import { GmailWidget } from '../../widgets/GmailWidget';
import { HueWidget } from '../../widgets/HueWidget';
import { IMessageWidget } from '../../widgets/IMessageWidget';
import { NewsWidget } from '../../widgets/NewsWidget';
import { PowerWidget } from '../../widgets/PowerWidget';
import { TransitWidget } from '../../widgets/TransitWidget';
import { SystemFooter } from '../../components/SystemFooter';
import { isWidgetDisabled } from '../../components/WidgetCard';
import { useWidget } from '../../useWidget';
import { AiNews } from '../ai/AiNews';
import { DetailIntro, DetailSectionHeading } from '../DetailIntro';

const ITEMS: ArrangeableItem[] = [
  { id: 'calendar', label: 'Calendar', render: () => <CalendarWidget /> },
  { id: 'gmail', label: 'Mail', render: () => <GmailWidget /> },
  { id: 'imessage', label: 'Messages', render: () => <IMessageWidget /> },
  // News and AI news sit side by side and need to match length regardless of viewport width — how
  // much a headline wraps at a given column width varies, so item count alone can't guarantee
  // that. Both render every fetched item (up to 12) in a fixed-height, scrollable list instead.
  { id: 'news', label: 'News', render: () => <NewsWidget scrollable /> },
  { id: 'ai-news', label: 'AI news', render: () => <AiNews scrollable /> },
  { id: 'hue', label: 'Lights', render: () => <HueWidget /> },
  { id: 'transit', label: 'Departures', render: () => <TransitWidget /> },
  { id: 'power', label: 'Power', render: () => <PowerWidget /> },
];

/** Excludes items the user turned off in config.json, so ArrangeableWidgetGrid never lays out an empty cell for them. */
function useEnabledItems(): ArrangeableItem[] {
  const calendar = useWidget<CalendarData>('calendar');
  const gmail = useWidget<GmailData>('gmail');
  const imessage = useWidget<IMessageData>('imessage');
  const news = useWidget<NewsData>('news');
  const aiNews = useWidget<AiNewsData>('ai-news');
  const hue = useWidget<HueData>('hue');
  const transit = useWidget<TransitData>('transit');
  const power = useWidget<PowerData>('power');
  const envelopeById: Record<string, WidgetEnvelope<unknown> | null> = {
    calendar: calendar.envelope,
    gmail: gmail.envelope,
    imessage: imessage.envelope,
    news: news.envelope,
    'ai-news': aiNews.envelope,
    hue: hue.envelope,
    transit: transit.envelope,
    power: power.envelope,
  };
  return ITEMS.filter((item) => !isWidgetDisabled(envelopeById[item.id] ?? null));
}

function PersonalSignals() {
  const calendar = useWidget<CalendarData>('calendar').envelope?.data;
  const gmail = useWidget<GmailData>('gmail').envelope?.data;
  const imessage = useWidget<IMessageData>('imessage').envelope?.data;
  const unreadMessages = imessage?.conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const next = calendar?.events.find((event) => new Date(event.end).getTime() >= Date.now());
  let nextEventDetail = 'Nothing scheduled next';
  if (next) {
    nextEventDetail = next.allDay ? 'All day' : next.startLabel;
  }
  // The badge shows the *next event's* date, not always today's — otherwise a future event
  // reads as if it's happening today.
  const badgeDate = next ? new Date(`${next.date}T12:00:00`) : new Date();

  return (
    <div className="detail-signal-panel grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-3">
      <div className="row-span-2 text-center">
        <p className="text-4xl font-semibold tracking-[-0.07em] tabular-nums">{badgeDate.getDate()}</p>
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
          {badgeDate.toLocaleDateString('en-GB', { month: 'short' })}
        </p>
      </div>
      <div className="min-w-0 border-l border-card-border pl-5">
        <p className="truncate text-sm font-medium">{next?.title ?? 'A clear horizon'}</p>
        <p className="mt-0.5 text-[11px] text-ink-faint">{nextEventDetail}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-l border-card-border pl-5 text-xs text-ink-muted">
        <span>{gmail ? `${gmail.unreadThreads} unread` : 'Mail syncing'}</span>
        {unreadMessages != null && <span>{unreadMessages > 0 ? `${unreadMessages} messages` : 'Messages clear'}</span>}
      </div>
    </div>
  );
}

/** Scrolls a command-center tile's target widget into view and briefly highlights it — the card
 *  already exists on mount (ArrangeableWidgetGrid renders its default order synchronously), so
 *  this doesn't need to wait on any widget data to load. */
function useScrollToWidget(anchor: string | undefined): void {
  useEffect(() => {
    if (!anchor) return;
    const el = document.getElementById(`widget-${anchor}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('widget-highlight');
    const timer = window.setTimeout(() => el.classList.remove('widget-highlight'), 1600);
    return () => window.clearTimeout(timer);
  }, [anchor]);
}

export function PersonalDetail({ anchor }: Readonly<{ anchor?: string }>) {
  const items = useEnabledItems();
  useScrollToWidget(anchor);
  return (
    <div>
      <DetailIntro
        title="Today"
        description="Today's events, your inboxes, and the rest of daily life."
        accent="var(--color-accent-personal)"
      >
        <PersonalSignals />
      </DetailIntro>
      <DetailSectionHeading title="The complete picture" detail="Arrange the cards into the order that best matches how you move through the day." />
      <ArrangeableWidgetGrid sectionId="personal" items={items} />
      <SystemFooter />
    </div>
  );
}
