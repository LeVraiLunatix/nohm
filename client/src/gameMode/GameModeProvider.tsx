import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'nohm.gameMode';
const SHORTCUT_KEY = 'nohm.gameShortcut';
export const GAME_MODE_EVENT = 'nohm:game-mode-change';

export type GameShortcut = 'Alt+Shift+G' | 'Ctrl+Shift+G' | 'Alt+Shift+N';

interface GameModeValue { active: boolean; setActive: (active: boolean) => void; toggle: () => void; shortcut: GameShortcut; setShortcut: (shortcut: GameShortcut) => void }
const GameModeContext = createContext<GameModeValue | null>(null);

export function GameModeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [active, setActiveState] = useState(() => window.localStorage.getItem(STORAGE_KEY) === 'true');
  const [shortcut, setShortcutState] = useState<GameShortcut>(() => {
    const stored = window.localStorage.getItem(SHORTCUT_KEY);
    return stored === 'Ctrl+Shift+G' || stored === 'Alt+Shift+N' ? stored : 'Alt+Shift+G';
  });
  const setShortcut = useCallback((next: GameShortcut) => {
    window.localStorage.setItem(SHORTCUT_KEY, next);
    setShortcutState(next);
  }, []);
  const setActive = useCallback((next: boolean) => {
    window.localStorage.setItem(STORAGE_KEY, String(next));
    document.documentElement.dataset.gameMode = String(next);
    setActiveState(next);
    window.dispatchEvent(new CustomEvent(GAME_MODE_EVENT, { detail: { active: next } }));
    void fetch('/api/game-mode', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ active: next }) }).catch(() => undefined);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.gameMode = String(active);
    const onKey = (event: KeyboardEvent) => {
      const matches = shortcut === 'Alt+Shift+G'
        ? event.altKey && event.shiftKey && event.code === 'KeyG'
        : shortcut === 'Ctrl+Shift+G'
          ? event.ctrlKey && event.shiftKey && event.code === 'KeyG'
          : event.altKey && event.shiftKey && event.code === 'KeyN';
      if (matches) { event.preventDefault(); setActive(!active); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, setActive, shortcut]);
  const value = useMemo(() => ({ active, setActive, toggle: () => setActive(!active), shortcut, setShortcut }), [active, setActive, setShortcut, shortcut]);
  return <GameModeContext.Provider value={value}>{children}</GameModeContext.Provider>;
}

export function useGameMode(): GameModeValue {
  const value = useContext(GameModeContext);
  if (!value) throw new Error('useGameMode must be used inside GameModeProvider');
  return value;
}
