import type { AiNewsData, GmailData, IMessageData, NewsData } from '@nohm/shared';
import { iso } from '@nohm/shared';

// ── Gmail ────────────────────────────────────────────────────────────────────────────────────

export function gmail(now: Date): GmailData {
  return {
    unreadThreads: 5,
    threads: [
      { id: 't1', from: 'Newsletter', subject: 'This week in open source', date: iso(now, -3), unread: true, url: '#' },
      { id: 't2', from: 'GitHub', subject: '[yourname/nohm] Review requested', date: iso(now, -5), unread: true, url: '#' },
      { id: 't3', from: 'Sam', subject: 'Re: dinner Friday?', date: iso(now, -8), unread: false, url: '#' },
      { id: 't4', from: 'Bank', subject: 'Your monthly statement is ready', date: iso(now, -20), unread: true, url: '#' },
      { id: 't5', from: 'Spotify', subject: 'Your 2026 Wrapped is here', date: iso(now, -30), unread: true, url: '#' },
      { id: 't6', from: 'Team', subject: 'Sprint retro notes', date: iso(now, -44), unread: false, url: '#' },
      { id: 't7', from: 'Landlord', subject: 'Reminder: rent due the 1st', date: iso(now, -50), unread: true, url: '#' },
    ],
  };
}

// ── iMessage ─────────────────────────────────────────────────────────────────────────────────

export function imessage(now: Date): IMessageData {
  return {
    conversations: [
      { id: 'c1', label: 'Sam', lastMessage: 'Sounds good, see you at 7!', isFromMe: false, timestamp: iso(now, -0.3), unreadCount: 1 },
      { id: 'c2', label: 'Family', lastMessage: 'Don’t forget to call grandma', isFromMe: false, timestamp: iso(now, -2), unreadCount: 2 },
      { id: 'c3', label: 'Alex', lastMessage: 'Sent you the photos from the hike', isFromMe: true, timestamp: iso(now, -5), unreadCount: 0 },
      { id: 'c4', label: '+1 555 0142', lastMessage: '[attachment]', isFromMe: false, timestamp: iso(now, -9), unreadCount: 0 },
      { id: 'c5', label: 'Work friends', lastMessage: 'lol did you see the standup notes', isFromMe: false, timestamp: iso(now, -22), unreadCount: 0 },
      { id: 'c6', label: 'Jordan', lastMessage: 'Are we still on for the gym tomorrow?', isFromMe: false, timestamp: iso(now, -27), unreadCount: 1 },
      { id: 'c7', label: 'Casey', lastMessage: 'Thanks for the recommendation, loved it', isFromMe: false, timestamp: iso(now, -35), unreadCount: 0 },
      { id: 'c8', label: 'Landlord', lastMessage: 'Reminder: maintenance visit on Thursday', isFromMe: false, timestamp: iso(now, -48), unreadCount: 0 },
      { id: 'c9', label: 'Mom', lastMessage: 'Call me when you get a chance ❤️', isFromMe: false, timestamp: iso(now, -60), unreadCount: 1 },
    ],
  };
}

// ── News / AI news ───────────────────────────────────────────────────────────────────────────

export function news(now: Date): NewsData {
  return {
    items: [
      { title: 'Show HN: I built a personal dashboard that runs entirely on my own machine', source: 'Hacker News', url: '#', publishedAt: iso(now, -1) },
      { title: 'The quiet return of the RSS reader', source: 'Hacker News', url: '#', publishedAt: iso(now, -4) },
      { title: 'Why local-first software is having a moment', source: 'Hacker News', url: '#', publishedAt: iso(now, -9) },
      { title: 'A deep dive into React 19’s concurrent rendering', source: 'Hacker News', url: '#', publishedAt: iso(now, -14) },
      { title: 'Norway’s power grid in 2026: what changed', source: 'Hacker News', url: '#', publishedAt: iso(now, -20) },
      { title: 'Ask HN: What self-hosted tools have replaced a SaaS subscription for you?', source: 'Hacker News', url: '#', publishedAt: iso(now, -26) },
      { title: 'The case against infinite scroll', source: 'Hacker News', url: '#', publishedAt: iso(now, -33) },
      { title: 'Tailscale raises new funding round to expand mesh networking', source: 'Hacker News', url: '#', publishedAt: iso(now, -40) },
      { title: 'Why we moved off Kubernetes for a three-person team', source: 'Hacker News', url: '#', publishedAt: iso(now, -48) },
      { title: 'A weekend rebuilding my home network from scratch', source: 'Hacker News', url: '#', publishedAt: iso(now, -55) },
      { title: 'SQLite is probably the database you should have started with', source: 'Hacker News', url: '#', publishedAt: iso(now, -63) },
      { title: 'The quiet resurgence of desktop apps', source: 'Hacker News', url: '#', publishedAt: iso(now, -70) },
    ],
  };
}

export function aiNews(now: Date): AiNewsData {
  return {
    items: [
      { title: 'Claude Sonnet 5 released with improved agentic coding', source: 'Anthropic', url: '#', publishedAt: iso(now, -6), provider: 'anthropic' },
      { title: 'New context caching improvements for long-running agents', source: 'Anthropic', url: '#', publishedAt: iso(now, -30), provider: 'anthropic' },
      { title: 'GPT-5.1 Codex update improves tool-use reliability', source: 'OpenAI', url: '#', publishedAt: iso(now, -12), provider: 'openai' },
      { title: 'OpenAI announces expanded rate limits for Plus subscribers', source: 'OpenAI', url: '#', publishedAt: iso(now, -40), provider: 'openai' },
      { title: 'Claude Agent SDK adds durable subagent scheduling', source: 'Anthropic', url: '#', publishedAt: iso(now, -54), provider: 'anthropic' },
      { title: 'OpenAI details new evals for long-horizon agent tasks', source: 'OpenAI', url: '#', publishedAt: iso(now, -18), provider: 'openai' },
      { title: 'Anthropic publishes new interpretability research on agentic planning', source: 'Anthropic', url: '#', publishedAt: iso(now, -66), provider: 'anthropic' },
      { title: 'OpenAI opens up fine-tuning for the latest Codex models', source: 'OpenAI', url: '#', publishedAt: iso(now, -78), provider: 'openai' },
    ],
  };
}

