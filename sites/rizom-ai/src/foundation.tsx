/** @jsxImportSource preact */
import type { JSX } from "preact";
import type { SiteSectionGroup } from "@rizom/site";
import { defineSection, sectionGroup, z } from "@rizom/site-sections";
import { Section, renderHighlightedText } from "@rizom/site-rizom";
import {
  AliveLine,
  Band,
  CtaRow,
  IndexRow,
  SectCap,
  ctaSchema,
  delayClass,
  ROOM_HIGHLIGHT_CLS,
} from "./shared";

/**
 * The /foundation room (previously rizom.foundation) — the research journal: a
 * masthead, essay + city-chapter index sections, a pull-quote band, support
 * options, and a follow line (the shared colophon). Each section is authored
 * from one zod schema; copy is content-driven, stored as markdown in
 * site-content/foundation/<section>.md. The essay/event indexes are static rows
 * here — the live entity-backed list lives at /writing.
 */

/* ============ journal masthead ============ */

const heroSchema = z.object({
  volume: z.string(),
  meta: z.string(),
  headline: z.string(),
  standfirst: z.string(),
  primaryCta: ctaSchema,
  secondaryCta: ctaSchema,
});

function FoundationHeroSection({
  volume,
  meta,
  headline,
  standfirst,
  primaryCta,
  secondaryCta,
}: z.infer<typeof heroSchema>): JSX.Element {
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

const indexRowSchema = z.object({
  no: z.string(),
  kicker: z.string(),
  title: z.string(),
  text: z.string(),
  href: z.string().optional(),
  meta: z.string().optional(),
  metaSub: z.string().optional(),
});

const indexSchema = z.object({
  cap: z.string(),
  capNote: z.string(),
  items: z.array(indexRowSchema),
});

function IndexSection({
  id,
  cap,
  capNote,
  items,
}: z.infer<typeof indexSchema> & { id: string }): JSX.Element {
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

function FoundationResearchSection(
  content: z.infer<typeof indexSchema>,
): JSX.Element {
  return <IndexSection id="research" {...content} />;
}

function FoundationChaptersSection(
  content: z.infer<typeof indexSchema>,
): JSX.Element {
  return <IndexSection id="events" {...content} />;
}

/* ============ pull-quote band ============ */

const pullquoteSchema = z.object({
  quote: z.string(),
  attribution: z.string(),
});

function FoundationPullquoteSection({
  quote,
  attribution,
}: z.infer<typeof pullquoteSchema>): JSX.Element {
  return (
    <Band quote={quote}>
      <p className="reveal reveal-delay-1 mt-[18px] font-label text-[12px] text-theme-light">
        {attribution}
      </p>
    </Band>
  );
}

/* ============ support ============ */

const supportSchema = z.object({
  cap: z.string(),
  capNote: z.string(),
  options: z.array(
    z.object({
      kicker: z.string(),
      amount: z.string(),
      text: z.string(),
    }),
  ),
});

function FoundationSupportSection({
  cap,
  capNote,
  options,
}: z.infer<typeof supportSchema>): JSX.Element {
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

/* ============ follow line ============ */

// Reuses the shared colophon (AliveLine) — an italic claim plus proof links.
const followSchema = z.object({
  claim: z.string(),
  links: z.array(ctaSchema),
});

/* ============ the foundation section group ============ */

export const foundationSections: SiteSectionGroup = sectionGroup("foundation", {
  hero: defineSection(heroSchema, FoundationHeroSection, {
    title: "Hero",
    description: "Foundation journal masthead",
  }),
  research: defineSection(indexSchema, FoundationResearchSection, {
    title: "Research",
    description: "Essay index rows",
  }),
  pullquote: defineSection(pullquoteSchema, FoundationPullquoteSection, {
    title: "Pullquote",
    description: "Pull-quote band",
  }),
  chapters: defineSection(indexSchema, FoundationChaptersSection, {
    title: "Chapters",
    description: "City chapter index rows",
  }),
  support: defineSection(supportSchema, FoundationSupportSection, {
    title: "Support",
    description: "Funding options",
  }),
  follow: defineSection(followSchema, AliveLine, {
    title: "Follow",
    description: "Follow-the-research line (shared colophon component)",
  }),
});
