import { useEffect, useState } from 'react';
import type { SectionId } from '../registry';

const SECTIONS_KEY = 'nohm.visibleSections';
export const PREFERENCES_EVENT = 'nohm:preferences-change';

const ALL_SECTIONS: readonly SectionId[] = ['ai', 'github', 'spotify', 'personal', 'weather', 'health', 'steam', 'clash-royale', 'valorant', 'settings'];

export function readVisibleSections(): SectionId[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? 'null') as unknown;
    if (!Array.isArray(parsed)) return [...ALL_SECTIONS];
    const valid = parsed.filter((id): id is SectionId => typeof id === 'string' && ALL_SECTIONS.includes(id as SectionId) && id !== 'settings');
    return [...new Set([...valid, 'settings' as const])];
  } catch {
    return [...ALL_SECTIONS];
  }
}

export function writeVisibleSections(ids: Iterable<SectionId>): void {
  const visible = [...new Set([...ids].filter((id) => id !== 'settings'))];
  localStorage.setItem(SECTIONS_KEY, JSON.stringify(visible));
  window.dispatchEvent(new Event(PREFERENCES_EVENT));
}

export function modulesToSections(modules: Iterable<string>): SectionId[] {
  const selected = new Set(modules);
  const result = new Set<SectionId>();
  if (selected.has('ai')) result.add('ai');
  if (selected.has('github')) result.add('github');
  if (selected.has('weather')) result.add('weather');
  if (selected.has('calendar') || selected.has('gmail')) result.add('personal');
  if (selected.has('cider') || selected.has('spotify') || selected.has('lastfm')) result.add('spotify');
  if (selected.has('steam')) result.add('steam');
  result.add('settings');
  return [...result];
}

export function useVisibleSections(): SectionId[] {
  const [ids, setIds] = useState(readVisibleSections);
  useEffect(() => {
    const update = () => setIds(readVisibleSections());
    window.addEventListener(PREFERENCES_EVENT, update);
    return () => window.removeEventListener(PREFERENCES_EVENT, update);
  }, []);
  return ids;
}

export function readRefreshMultiplier(): number {
  const value = Number(localStorage.getItem('nohm.refreshMultiplier') ?? '1');
  return [0.5, 1, 2, 4].includes(value) ? value : 1;
}

export function writeRefreshMultiplier(value: number): void {
  localStorage.setItem('nohm.refreshMultiplier', String(value));
  window.dispatchEvent(new Event(PREFERENCES_EVENT));
}
