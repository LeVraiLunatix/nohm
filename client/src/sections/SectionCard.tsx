import type { KeyboardEvent, MouseEvent } from 'react';
import { motion } from 'motion/react';
import { accentStyle, SectionIcon, type SectionDef, type SectionId } from './registry';
import { SECTION_MORPH_TRANSITION } from './transitions';
import { sectionHref } from '../router';
import { publicAsset } from '../lib/publicAsset';
import { useI18n } from '../i18n/I18nProvider';

export const sectionCardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

/** A couple of sections show a brand wordmark instead of the generic icon + title header. */
const SECTION_WORDMARKS: Partial<Record<SectionId, { markClassName: string; src: string; alt: string; className: string; aspectRatio: string }>> = {
  valorant: {
    markClassName: 'valorant-overview-mark',
    src: publicAsset('valorant/wordmark.png'),
    alt: 'Valorant',
    className: 'valorant-overview-wordmark',
    aspectRatio: '3633 / 533',
  },
  'clash-royale': {
    markClassName: 'clash-royale-overview-mark',
    src: publicAsset('clash-royale/wordmark.png'),
    alt: 'Clash Royale',
    className: 'clash-royale-overview-wordmark',
    aspectRatio: '1500 / 650',
  },
};

function interactiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('a, button, input, select, textarea, [role="button"]'));
}

function openSection(section: SectionDef): void {
  window.location.hash = sectionHref(section.id).slice(1);
}

/** Overview block for one section — the whole card is a link into the section's full view. */
export function SectionCard({ section }: Readonly<{ section: SectionDef }>) {
  const wordmark = SECTION_WORDMARKS[section.id];
  const { t } = useI18n();
  const title = t(section.titleKey);
  const description = t(section.descriptionKey);

  return (
    <motion.div
      role="link"
      tabIndex={0}
      aria-label={t('nav.open', { name: title })}
      onClick={(event: MouseEvent<HTMLElement>) => {
        if (!interactiveTarget(event.target)) openSection(section);
      }}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        if (!interactiveTarget(event.target) && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          openSection(section);
        }
      }}
      layoutId={`section-${section.id}`}
      transition={SECTION_MORPH_TRANSITION}
      variants={sectionCardVariants}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.99 }}
      className={`dashboard-section-card dashboard-section-card--${section.id} glass group relative z-10 block cursor-pointer overflow-hidden rounded-[1.75rem] p-5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--accent) sm:p-6`}
      style={accentStyle(section)}
    >
      <div aria-hidden className="section-card-aura" />
      <header className={`section-card-header section-card-header--${section.id} relative mb-5 flex items-center gap-3`}>
        {wordmark ? (
          <>
            <span className={wordmark.markClassName} aria-hidden>
              <SectionIcon id={section.id} />
            </span>
            <motion.h2
              layoutId={`section-title-${section.id}`}
              transition={SECTION_MORPH_TRANSITION}
              className="sr-only"
            >
              {title}
            </motion.h2>
            <img
              src={wordmark.src}
              alt={wordmark.alt}
              className={wordmark.className}
              style={{ aspectRatio: wordmark.aspectRatio }}
            />
          </>
        ) : (
          <>
            <span className="section-icon grid h-10 w-10 place-items-center rounded-2xl text-(--accent)">
              <SectionIcon id={section.id} />
            </span>
            <motion.h2
              layoutId={`section-title-${section.id}`}
              transition={SECTION_MORPH_TRANSITION}
              className="min-w-0 text-[1.05rem] font-semibold tracking-[-0.02em] text-ink"
            >
              {title}
            </motion.h2>
          </>
        )}
        <span aria-hidden className="section-arrow ml-auto grid h-9 w-9 place-items-center rounded-full text-lg text-ink-muted">
          ↗
        </span>
      </header>
      <div className="relative section-card-content">
        <section.Overview />
      </div>
      {description && (
        <p className="relative mt-5 border-t border-card-border pt-4 text-xs text-ink-faint">
          {description}
        </p>
      )}
    </motion.div>
  );
}
