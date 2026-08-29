import { useCallback, useSyncExternalStore } from 'react';
import type { WidgetEnvelope } from '@nohm/shared';
import { readWidget, refreshWidget, subscribeWidget, widgetSnapshot } from './widgetStore';

export interface WidgetState<T> {
  envelope: WidgetEnvelope<T> | null;
  /** True when the dashboard itself can't reach the server. */
  offline: boolean;
  refetch: () => void;
  /** Requests an immediate provider refresh, then replaces the cached widget data. */
  refresh: () => Promise<void>;
  refreshing: boolean;
}

/**
 * Polls one widget endpoint. The server does the heavy caching; the client
 * just re-reads the cache — at half the provider's refresh rate, clamped —
 * and again whenever the tab/PWA becomes visible.
 */
export function useWidget<T>(id: string): WidgetState<T> {
  const refetch = useCallback(() => {
    return readWidget(id);
  }, [id]);

  const refresh = useCallback(async () => {
    await refreshWidget(id);
  }, [id]);

  const snapshot = useSyncExternalStore(
    useCallback((listener) => subscribeWidget(id, listener), [id]),
    useCallback(() => widgetSnapshot<T>(id), [id]),
    useCallback(() => widgetSnapshot<T>(id), [id]),
  );

  return {
    envelope: snapshot.envelope,
    offline: snapshot.offline,
    refreshing: snapshot.refreshing,
    refetch,
    refresh,
  };
}
