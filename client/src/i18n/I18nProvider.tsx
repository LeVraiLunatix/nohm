import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { translations, type Locale, type TranslationKey } from './translations';

const STORAGE_KEY = 'nohm.locale';

function initialLocale(): Locale {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'fr' || stored === 'en') return stored;
  return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'fr';
}

type Params = Record<string, string | number>;

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: Params) => string;
  date: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const setLocale = useCallback((next: Locale) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setLocaleState(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nValue>(() => ({
    locale,
    setLocale,
    t: (key, params) => {
      let text: string = translations[locale][key] ?? translations.fr[key];
      for (const [name, replacement] of Object.entries(params ?? {})) {
        text = text.replaceAll(`{${name}}`, String(replacement));
      }
      return text;
    },
    date: (input, options) => {
      const value = new Date(input);
      // One malformed timestamp shouldn't take the whole render down with a RangeError.
      if (Number.isNaN(value.getTime())) return '—';
      return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', options).format(value);
    },
    number: (input, options) => new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', options).format(input),
  }), [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
