import type { JSX } from "preact";
import { Section, renderHighlightedText } from "@brains/site-rizom";
import { z } from "@brains/utils/zod";
import { aliveContentSchema, HomeAliveSection } from "./home";
import { defineSection, type AnySectionDef } from "./section-def";
import {
  Band,
  CtaRow,
  IndexRow,
  SectCap,
  ctaLinkSchema,
  delayClass,
  indexRowSchema,
  ROOM_HIGHLIGHT_CLS,
  type CtaLink,
  type IndexRowData,
} from "./shared";

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

const foundationHero = defineSection({
  name: "foundation-hero",
  description: "Foundation journal masthead",
  schema: z.object({
    volume: z.string(),
    meta: z.string(),
    headline: z.string(),
    standfirst: z.string(),
    primaryCta: ctaLinkSchema,
    secondaryCta: ctaLinkSchema,
  }) satisfies z.ZodType<FoundationHeroContent>,
  component: FoundationHeroSection,
  fallback: {
    volume: "Vol. 01 · 2026",
    meta: "Essays · Events · Public infrastructure · previously rizom.foundation",
    headline:
      "Work is broken* — and the institutions organizing it were built for a different century.*",
    standfirst:
      "A research arm for the social contracts that quietly hold both work and technology together: essays, city-by-city gatherings, and stewardship of the open AI infrastructure this community runs on.",
    primaryCta: { label: "Join our Discord →", href: "/foundation#events" },
    secondaryCta: {
      label: "Find an event near you",
      href: "/foundation#events",
    },
  },
});

/* ============ index sections: research + chapters ============ */

export interface FoundationIndexContent {
  cap: string;
  capNote: string;
  items: IndexRowData[];
}

const foundationIndexContentSchema = z.object({
  cap: z.string(),
  capNote: z.string(),
  items: z.array(indexRowSchema),
}) satisfies z.ZodType<FoundationIndexContent>;

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

const foundationResearch = defineSection({
  name: "foundation-research",
  description: "Essay index rows",
  schema: foundationIndexContentSchema,
  component: FoundationResearchSection,
  fallback: {
    cap: "The research",
    capNote:
      "— a working bibliography; new entries land roughly monthly · all of it at /writing",
    items: [
      {
        no: "01",
        kicker: "Future of Work is Play",
        title: "The future of work is play",
        text: "When machines handle the busywork, what remains is the deeply human.",
        href: "/foundation#research",
      },
      {
        no: "02",
        kicker: "Urging New Institutions",
        title: "Social contracts, not constitutions",
        text: "The documents we venerate aren't what's actually holding institutions together.",
        href: "/foundation#research",
      },
      {
        no: "03",
        kicker: "Urging New Institutions",
        title: "Coordination is the unit of intelligence",
        text: "The smartest thing in any room is rarely a person — it's the pattern by which the people in the room are connected.",
        href: "/foundation#research",
      },
    ],
  },
});

export function FoundationChaptersSection(
  content: FoundationIndexContent,
): JSX.Element {
  return <IndexSection id="events" {...content} />;
}

const foundationChapters = defineSection({
  name: "foundation-chapters",
  description: "City chapter index rows",
  schema: foundationIndexContentSchema,
  component: FoundationChaptersSection,
  fallback: {
    cap: "The series",
    capNote:
      "— twenty to forty people; Jan Hein as intellectual anchor · all dates at /events",
    items: [
      {
        no: "01",
        kicker: "Spring 2026",
        title: "Amsterdam",
        text: "The original chapter. Quarterly gatherings on social contracts, AI, and the institutions that organize knowledge work.",
        meta: "apply →",
        metaSub: "anchor: Jan Hein",
      },
      {
        no: "02",
        kicker: "Summer 2026",
        title: "Rotterdam",
        text: "A working chapter focused on industry, ports, and the practical frictions of building new institutions inside old ones.",
        meta: "apply →",
        metaSub: "local: TBA",
      },
      {
        no: "03",
        kicker: "Autumn 2026",
        title: "Berlin",
        text: "The newest chapter. Civic tech, digital rights, and the public-infrastructure question.",
        meta: "apply →",
        metaSub: "local: TBA",
      },
    ],
  },
});

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

const foundationPullquote = defineSection({
  name: "foundation-pullquote",
  description: "Pull-quote band",
  schema: z.object({
    quote: z.string(),
    attribution: z.string(),
  }) satisfies z.ZodType<FoundationPullquoteContent>,
  component: FoundationPullquoteSection,
  fallback: {
    quote:
      "The smartest thing in any room is rarely a person. It's the *pattern* by which the people in the room are connected.",
    attribution: "— from “Coordination is the unit of intelligence”",
  },
});

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

const foundationSupport = defineSection({
  name: "foundation-support",
  description: "Funding options",
  schema: z.object({
    cap: z.string(),
    capNote: z.string(),
    options: z.array(
      z.object({ kicker: z.string(), amount: z.string(), text: z.string() }),
    ),
  }) satisfies z.ZodType<FoundationSupportContent>,
  component: FoundationSupportSection,
  fallback: {
    cap: "How to support",
    capNote:
      "— two ways the work gets funded · a small group, anchored by writing and stewarded by community",
    options: [
      {
        kicker: "For individuals",
        amount: "€1,000 – €10,000",
        text: "Funds a meaningful slice of the research and event series. Contributors are acknowledged in the essays, invited to closer-circle gatherings, and get early access to new writing.",
      },
      {
        kicker: "Through the practice",
        amount: "Commercial work → research",
        text: "The practice's consulting revenue funds the foundation — a commercial practice with a non-profit research arm. → /work",
      },
    ],
  },
});

/* ============ follow line ============ */

const foundationFollow = defineSection({
  name: "foundation-follow",
  description: "Follow-the-research line",
  schema: aliveContentSchema,
  component: HomeAliveSection,
  fallback: {
    claim: "*Follow the research* —",
    links: [
      {
        label: "newsletter · every essay, nothing else",
        href: "/foundation#support",
      },
      {
        label: "@rizom.ai on atproto · essays as records",
        href: "https://bsky.app/profile/rizom.ai",
      },
      { label: "rss", href: "/feed.xml" },
    ],
  },
});

/* The /foundation room, in order. */
export const foundationSections: AnySectionDef[] = [
  foundationHero,
  foundationResearch,
  foundationPullquote,
  foundationChapters,
  foundationSupport,
  foundationFollow,
];
