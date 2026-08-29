import { Suspense } from 'react';
import { motion } from 'motion/react';
import { accentStyle, type SectionDef } from './registry';
import { DETAIL_BODY_ENTER, PAGE_EXIT, SECTION_MORPH_TRANSITION } from './transitions';
import { OVERVIEW_HREF } from '../router';
import { ThemeToggle } from '../components/ThemeToggle';
import { useI18n } from '../i18n/I18nProvider';
import { GameModeButton } from '../gameMode/GameModeButton';

/** Held under the morphing header while the section's Detail chunk loads (see registry.tsx). */
function DetailFallback() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      <div className="h-40 rounded-[1.5rem] bg-track" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-28 rounded-[1.25rem] bg-track" />
        <div className="h-28 rounded-[1.25rem] bg-track" />
      </div>
    </div>
  );
}

/**
 * Expanded full view of one section. The header bar shares layoutIds with the overview's
 * SectionCard, so opening a section morphs the card into this header.
 */
export function SectionView({ section, anchor }: Readonly<{ section: SectionDef; anchor?: string }>) {
  const { t } = useI18n();
  return (
    <motion.div
      className="col-start-1 row-start-1 w-full min-w-0"
      style={accentStyle(section)}
      initial={false}
      animate={{ opacity: 1 }}
      exit={PAGE_EXIT}
    >
      <motion.header
        layoutId={`section-${section.id}`}
        transition={SECTION_MORPH_TRANSITION}
        className="detail-header glass relative z-10 mb-6 flex items-center gap-3 rounded-[1.5rem] p-3 pr-4 sm:mb-8"
      >
        <a
          href={OVERVIEW_HREF}
          aria-label={t('nav.back')}
          className="detail-back grid h-10 w-10 place-items-center rounded-2xl text-xl leading-none text-ink-muted transition hover:text-ink"
        >
          ←
        </a>
        <span className="h-7 w-px bg-card-border" />
        <div>
          <span className="block text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-faint">{t(section.labelKey)}</span>
          <motion.p
            layoutId={`section-title-${section.id}`}
            transition={SECTION_MORPH_TRANSITION}
            className="text-sm font-semibold tracking-tight text-ink"
          >
            {t(section.titleKey)}
          </motion.p>
        </div>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-ink-faint">
          <GameModeButton />
          <ThemeToggle />
        </div>
      </motion.header>
      <motion.div className="w-full min-w-0"
        initial={{ opacity: 0, y: 10 }}
        animate={DETAIL_BODY_ENTER}
        exit={{ opacity: 0, y: 6, transition: { duration: 0.12 } }}
      >
        <Suspense fallback={<DetailFallback />}>
          <section.Detail anchor={anchor} />
        </Suspense>
      </motion.div>
    </motion.div>
  );
}
