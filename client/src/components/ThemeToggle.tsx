import { useState } from 'react';
import { THEME_MODES, applyThemeMode, loadThemeMode, type ThemeMode } from '../lib/theme';
import { useI18n } from '../i18n/I18nProvider';

const ICONS: Record<ThemeMode, React.JSX.Element> = {
  // Half-filled circle: follow the system.
  auto: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" />
    </>
  ),
  light: (
    <>
      <circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none" />
      <path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7" />
    </>
  ),
  dark: <path d="M19.5 14.2A8 8 0 0 1 9.8 4.5a8 8 0 1 0 9.7 9.7Z" fill="currentColor" stroke="none" />,
};

/** Cycles auto → light → dark. Lives in headers; the choice persists across loads. */
export function ThemeToggle() {
  const { t } = useI18n();
  const [mode, setMode] = useState<ThemeMode>(loadThemeMode);
  const label = t(mode === 'auto' ? 'theme.system' : mode === 'light' ? 'theme.light' : 'theme.dark');
  const cycle = () => {
    const next = THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length];
    applyThemeMode(next);
    setMode(next);
  };
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      title={label}
      className="grid h-8 w-8 place-items-center rounded-xl text-ink-muted transition hover:bg-track hover:text-ink"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
        {ICONS[mode]}
      </svg>
    </button>
  );
}
