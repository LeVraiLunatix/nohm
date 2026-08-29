import type { WidgetEnvelope } from '@nohm/shared';
import { WEATHER_LOCATION_UPDATED_EVENT } from './useDeviceLocation';
import { GAME_MODE_EVENT } from './gameMode/GameModeProvider';
import { PREFERENCES_EVENT, readRefreshMultiplier } from './sections/settings/preferences';

const MIN_POLL_MS = 15_000;
const MAX_POLL_MS = 300_000;
const GAME_MODE_MAX_POLL_MS = 15 * 60_000;
const FETCH_TIMEOUT_MS = 60_000;

export interface WidgetSnapshot<T> {
  envelope: WidgetEnvelope<T> | null;
  offline: boolean;
  refreshing: boolean;
}

type Listener = () => void;

interface WidgetRecord {
  snapshot: WidgetSnapshot<unknown>;
  listeners: Set<Listener>;
  timer: number | undefined;
  readInFlight: Promise<void> | undefined;
  refreshInFlight: Promise<void> | undefined;
  started: boolean;
}

const records = new Map<string, WidgetRecord>();

function getRecord(id: string): WidgetRecord {
  let record = records.get(id);
  if (!record) {
    record = {
      snapshot: { envelope: null, offline: false, refreshing: false },
      listeners: new Set(),
      timer: undefined,
      readInFlight: undefined,
      refreshInFlight: undefined,
      started: false,
    };
    records.set(id, record);
  }
  return record;
}

function notify(record: WidgetRecord): void {
  record.listeners.forEach((listener) => listener());
}

function setSnapshot(record: WidgetRecord, snapshot: WidgetSnapshot<unknown>): void {
  record.snapshot = snapshot;
  notify(record);
}

function pollDelay(record: WidgetRecord): number {
  const gameMode = document.documentElement.dataset.gameMode === 'true';
  const multiplier = readRefreshMultiplier() * (gameMode ? 4 : 1);
  return Math.min(Math.max(((record.snapshot.envelope?.refreshMs ?? 60_000) / 2) * multiplier, MIN_POLL_MS), gameMode ? GAME_MODE_MAX_POLL_MS : MAX_POLL_MS);
}

function schedulePoll(id: string, record: WidgetRecord): void {
  if (!record.started || record.timer !== undefined) return;
  record.timer = window.setTimeout(() => {
    record.timer = undefined;
    void readWidget(id);
  }, pollDelay(record));
}

async function fetchIntoRecord(id: string, record: WidgetRecord, init?: RequestInit): Promise<void> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`/api/widgets/${id}${init ? '/refresh' : ''}`, {
      ...init,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const envelope = await res.json() as WidgetEnvelope<unknown>;
    setSnapshot(record, { ...record.snapshot, envelope, offline: false });
  } catch {
    setSnapshot(record, { ...record.snapshot, offline: true });
  } finally {
    window.clearTimeout(timeout);
    schedulePoll(id, record);
  }
}

export function readWidget(id: string): Promise<void> {
  const record = getRecord(id);
  record.readInFlight ??= fetchIntoRecord(id, record).finally(() => {
    record.readInFlight = undefined;
  });
  return record.readInFlight;
}

export function refreshWidget(id: string): Promise<void> {
  const record = getRecord(id);
  record.refreshInFlight ??= (() => {
    setSnapshot(record, { ...record.snapshot, refreshing: true });
    return fetchIntoRecord(id, record, { method: 'POST' }).finally(() => {
      record.refreshInFlight = undefined;
      setSnapshot(record, { ...record.snapshot, refreshing: false });
    });
  })();
  return record.refreshInFlight;
}

/**
 * The server pushes "widget X settled" over SSE, which lets a started widget read the moment its
 * data changes rather than up to `pollDelay` later. Polling stays as the fallback: EventSource
 * reconnects on its own, but a stream that never connects (demo build, a proxy that buffers) must
 * not leave the dashboard frozen.
 */
let eventSource: EventSource | undefined;

function connectEvents(): void {
  if (eventSource || import.meta.env.VITE_DEMO === 'true' || typeof EventSource === 'undefined') return;
  eventSource = new EventSource('/api/events');
  eventSource.addEventListener('settled', (event) => {
    let id: string;
    try {
      ({ id } = JSON.parse((event as MessageEvent<string>).data) as { id: string });
    } catch {
      return;
    }
    if (document.documentElement.dataset.gameMode === 'true' && id !== 'music-cider') return;
    const record = records.get(id);
    if (record?.started) void readWidget(id);
  });
}

function start(id: string, record: WidgetRecord): void {
  if (record.started) return;
  record.started = true;
  connectEvents();
  void readWidget(id);
}

function stop(record: WidgetRecord): void {
  if (!record.started || record.listeners.size) return;
  record.started = false;
  if (record.timer !== undefined) window.clearTimeout(record.timer);
  record.timer = undefined;
}

export function subscribeWidget(id: string, listener: Listener): () => void {
  const record = getRecord(id);
  record.listeners.add(listener);
  start(id, record);
  return () => {
    record.listeners.delete(listener);
    stop(record);
  };
}

export function widgetSnapshot<T>(id: string): WidgetSnapshot<T> {
  return getRecord(id).snapshot as WidgetSnapshot<T>;
}

window.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  records.forEach((record, id) => {
    if (record.started) void readWidget(id);
  });
});

window.addEventListener(WEATHER_LOCATION_UPDATED_EVENT, () => {
  const weather = records.get('weather');
  if (weather?.started) void readWidget('weather');
});

window.addEventListener(GAME_MODE_EVENT, () => {
  records.forEach((record, id) => {
    if (record.timer !== undefined) window.clearTimeout(record.timer);
    record.timer = undefined;
    schedulePoll(id, record);
  });
});

window.addEventListener(PREFERENCES_EVENT, () => {
  records.forEach((record, id) => {
    if (record.timer !== undefined) window.clearTimeout(record.timer);
    record.timer = undefined;
    schedulePoll(id, record);
  });
});
