import type { CalendarData, GmailData, HueData, IMessageData, NewsData } from '@nohm/shared';
import { useWidget } from '../../useWidget';
import { isWidgetDisabled, WidgetBody } from '../../components/WidgetCard';
import { relativeTime, formatEventDate } from '../../lib/time';

function eventMoment(event: CalendarData['events'][number]): string {
  const today = new Date().toLocaleDateString('en-CA');
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA');
  const time = event.allDay ? 'All day' : event.startLabel;

  if (event.date === today) return `Today · ${time}`;
  if (event.date === tomorrow) return `Tomorrow · ${time}`;

  return `${formatEventDate(event.date, 'short')} · ${time}`;
}

function unreadMessages(data: IMessageData): number {
  return data.conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);
}

function Panel({
  className,
  eyebrow,
  title,
  children,
}: Readonly<{
  className: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}>) {
  return (
    <section className={`personal-overview-panel ${className}`}>
      <header className="personal-overview-panel-heading">
        <span>{eyebrow}</span>
        <h3>{title}</h3>
      </header>
      {children}
    </section>
  );
}

/** Featured hero panel — was the calendar's "Up next", now leads with Mail so the inbox gets the
 * prominent spot; calendar moved into the CommunicationsPanel row below (see there). */
function MailHeroPanel({ gmail }: Readonly<{ gmail: ReturnType<typeof useWidget<GmailData>> }>) {
  return (
    <Panel className="personal-overview-agenda" eyebrow="Inbox" title="Mail">
      <WidgetBody envelope={gmail.envelope} offline={gmail.offline}>
        {(data) => {
          const [featured, ...rest] = data.threads;
          const following = rest.slice(0, 2);

          return featured ? (
            <div className="personal-overview-agenda-body">
              <div className="personal-overview-featured-event">
                <p className="personal-overview-event-time">{featured.unread ? 'Unread' : 'Read'} · {relativeTime(featured.date)}</p>
                <p className="personal-overview-event-title">{featured.subject}</p>
                <p className="personal-overview-event-location">{featured.from}</p>
              </div>
              {following.length > 0 && (
                <ul className="personal-overview-following-events">
                  {following.map((thread) => (
                    <li key={thread.id}>
                      <span>{relativeTime(thread.date)}</span>
                      <strong>{thread.subject}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="personal-overview-empty-state">
              <span aria-hidden>✦</span>
              <p>No mail right now. Enjoy the quiet.</p>
            </div>
          );
        }}
      </WidgetBody>
    </Panel>
  );
}

function CommunicationsPanel({
  calendar,
  imessage,
}: Readonly<{
  calendar: ReturnType<typeof useWidget<CalendarData>>;
  imessage: ReturnType<typeof useWidget<IMessageData>>;
}>) {
  if (isWidgetDisabled(calendar.envelope) && isWidgetDisabled(imessage.envelope)) return null;
  return (
    <Panel className="personal-overview-communications" eyebrow="Coming up" title="Schedule & messages">
      <div className="personal-overview-communication-list">
        {!isWidgetDisabled(calendar.envelope) && (
          <WidgetBody envelope={calendar.envelope} offline={calendar.offline}>
            {(data) => {
              const next = data.events.find((event) => new Date(event.end).getTime() >= Date.now());
              const upcoming = next ? [next, ...data.events.filter((event) => event.id !== next.id)].slice(0, 2) : data.events.slice(0, 2);
              return (
                <section className="personal-overview-channel">
                  <div className="personal-overview-channel-heading">
                    <span>Schedule</span>
                    <strong>{next ? eventMoment(next) : 'Clear'}</strong>
                  </div>
                  {upcoming.length > 0 ? (
                    <ul>
                      {upcoming.map((event) => (
                        <li key={event.id}>
                          <p className="personal-overview-message">
                            <span className={event.id === next?.id ? 'font-semibold' : undefined}>{event.title}</span>
                            <small>{eventMoment(event)}{event.location ? ` · ${event.location}` : ''}</small>
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="personal-overview-quiet">No commitments ahead.</p>}
                </section>
              );
            }}
          </WidgetBody>
        )}
        {!isWidgetDisabled(imessage.envelope) && (
          <WidgetBody envelope={imessage.envelope} offline={imessage.offline}>
            {(data) => {
              const unread = unreadMessages(data);
              const latest = data.conversations[0];
              return (
                <section className="personal-overview-channel">
                  <div className="personal-overview-channel-heading">
                    <span>Messages</span>
                    <strong>{unread > 0 ? `${unread} unread` : 'Clear'}</strong>
                  </div>
                  {latest ? (
                    <p className="personal-overview-message">
                      <span className={latest.unreadCount > 0 ? 'font-semibold' : undefined}>{latest.label}</span>
                      <small>{latest.isFromMe ? 'You: ' : ''}{latest.lastMessage}</small>
                    </p>
                  ) : <p className="personal-overview-quiet">No recent conversations.</p>}
                </section>
              );
            }}
          </WidgetBody>
        )}
      </div>
    </Panel>
  );
}

function HomePanel({ hue }: Readonly<{ hue: ReturnType<typeof useWidget<HueData>> }>) {
  if (isWidgetDisabled(hue.envelope)) return null;
  return (
    <Panel className="personal-overview-home" eyebrow="At home" title="Lighting">
      <WidgetBody envelope={hue.envelope} offline={hue.offline}>
        {(data) => {
          const litRooms = data.rooms.filter((room) => room.anyOn);
          const lightsOn = data.lights.filter((light) => light.on).length;
          return (
            <div className="personal-overview-home-body">
              <p><strong>{lightsOn}</strong> of {data.lights.length} lights on</p>
              <div className="personal-overview-room-pills">
                {litRooms.length > 0 ? litRooms.slice(0, 3).map((room) => <span key={room.id}>{room.name}</span>) : <span>Everything is off</span>}
              </div>
            </div>
          );
        }}
      </WidgetBody>
    </Panel>
  );
}

function NewsPanel({ news }: Readonly<{ news: ReturnType<typeof useWidget<NewsData>> }>) {
  if (isWidgetDisabled(news.envelope)) return null;
  return (
    <Panel className="personal-overview-news" eyebrow="Worth a read" title="Latest headline">
      <WidgetBody envelope={news.envelope} offline={news.offline}>
        {(data) => {
          const item = data.items[0];
          return item ? (
            <a href={item.url} target="_blank" rel="noreferrer" className="personal-overview-headline">
              <span>{item.source} · {relativeTime(item.publishedAt)}</span>
              <strong>{item.title}</strong>
              <i aria-hidden>↗</i>
            </a>
          ) : <p className="personal-overview-quiet">No headlines right now.</p>;
        }}
      </WidgetBody>
    </Panel>
  );
}

/** The overview complements the command center: it is a live personal workspace, not another daily brief. */
export function PersonalOverview() {
  const calendar = useWidget<CalendarData>('calendar');
  const gmail = useWidget<GmailData>('gmail');
  const news = useWidget<NewsData>('news');
  const hue = useWidget<HueData>('hue');
  const imessage = useWidget<IMessageData>('imessage');

  return (
    <div className="personal-overview">
      {!isWidgetDisabled(gmail.envelope) && <MailHeroPanel gmail={gmail} />}
      <CommunicationsPanel calendar={calendar} imessage={imessage} />
      <HomePanel hue={hue} />
      <NewsPanel news={news} />
    </div>
  );
}
