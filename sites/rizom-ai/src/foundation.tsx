/** @jsxImportSource preact */
import type { JSX } from "preact";
import { Section, renderHighlightedText } from "@rizom/site-rizom";
import {
  Band,
  CtaRow,
  IndexRow,
  SectCap,
  delayClass,
  ROOM_HIGHLIGHT_CLS,
  type CtaLink,
  type IndexRowData,
} from "./shared";

/**
 * The /foundation room (previously rizom.foundation) — the research journal: a
 * masthead, essay + city-chapter index sections, a pull-quote band, and support
 * options. Pure components; copy is content-driven via the "foundation"
 * namespace. The follow line reuses the home colophon (HomeAliveSection), wired
 * in ./site-content. The essay/event indexes are static rows here — the live
 * entity-backed list lives at /writing.
 */

/* ============ journal masthead ============ */

export interface FoundationHeroContent {
  volume: string;
  meta: string;
  headline: string;
  standfirst: string;
  primaryCta: CtaLink;
  secondaryCta: CtaLink;
}

export function FoundationHeroSection({
  volume,
  meta,
  headline,
  standfirst,
  primaryCta,
  secondaryCta,
}: FoundationHeroContent): JSX.Element {
  return (
    <Section
      id="foundation-hero"
      className="relative overflow-hidden pt-16 pb-[30px] md:pt-20"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-[10%] -inset-y-[30%] bg-[radial-gradient(680px_360px_at_14%_8%,rgb(from_var(--color-accent)_r_g_b_/_0.14),transparent_66%)]"
      />
      <div className="relative">
        <SectCap lead={volume} trail={meta} />
        <h1 className="mt-[18px] max-w-[15.5em] font-display text-[clamp(36px,4.6vw,64px)] font-[448] leading-[1.05] tracking-[-0.018em] text-theme [font-variation-settings:'SOFT'_88,'opsz'_110]">
          {renderHighlightedText(headline, ROOM_HIGHLIGHT_CLS)}
        </h1>
        <p className="mt-4 max-w-[50ch] font-body text-[20px] leading-[1.7] text-theme-muted">
          {standfirst}
        </p>
        <CtaRow
          primaryCta={primaryCta}
          secondaryCta={secondaryCta}
          className="mt-[26px] mb-11"
        />
      </div>
    </Section>
  );
}

/* ============ index sections: research + chapters ============ */

export interface FoundationIndexContent {
  cap: string;
  capNote: string;
  items: IndexRowData[];
}

function IndexSection({
  id,
  cap,
  capNote,
  items,
}: FoundationIndexContent & { id: string }): JSX.Element {
  return (
    <Section id={id} className="py-14">
      <SectCap lead={cap} trail={capNote} />
      <div className="mt-2">
        {items.map((row, i) => (
          <IndexRow key={row.title} row={row} delayClass={delayClass(i)} />
        ))}
      </div>
    </Section>
  );
}

export function FoundationResearchSection(
  content: FoundationIndexContent,
): JSX.Element {
  return <IndexSection id="research" {...content} />;
}

export function FoundationChaptersSection(
  content: FoundationIndexContent,
): JSX.Element {
  return <IndexSection id="events" {...content} />;
}

/* ============ pull-quote band ============ */

export interface FoundationPullquoteContent {
  quote: string;
  attribution: string;
}

export function FoundationPullquoteSection({
  quote,
  attribution,
}: FoundationPullquoteContent): JSX.Element {
  return (
    <Band quote={quote}>
      <p className="reveal reveal-delay-1 mt-[18px] font-label text-[12px] text-theme-light">
        {attribution}
      </p>
    </Band>
  );
}

/* ============ support ============ */

export interface SupportOption {
  kicker: string;
  amount: string;
  text: string;
}

export interface FoundationSupportContent {
  cap: string;
  capNote: string;
  options: SupportOption[];
}

export function FoundationSupportSection({
  cap,
  capNote,
  options,
}: FoundationSupportContent): JSX.Element {
  return (
    <Section id="support" className="py-14">
      <SectCap lead={cap} trail={capNote} />
      <div className="mt-[26px] grid max-w-[900px] gap-13 md:grid-cols-2">
        {options.map((option, i) => (
          <div key={option.kicker} className={`reveal ${delayClass(i + 1)}`}>
            <span className="font-label text-label-xs uppercase tracking-[0.16em] text-accent">
              {option.kicker}
            </span>
            <div className="mt-2 font-display text-[30px] font-[480] text-theme [font-variation-settings:'SOFT'_40]">
              {option.amount}
            </div>
            <p className="mt-2 font-body text-[15.5px] text-theme-light">
              {option.text}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}
