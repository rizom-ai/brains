import type { JSX } from "preact";
import { Section, renderHighlightedText } from "@brains/site-rizom";
import { z } from "@brains/utils/zod";
import { GrowthDiagram } from "./growth-diagram";
import { defineSection, type AnySectionDef } from "./section-def";
import {
  Band,
  CtaRow,
  AliveLine,
  SectCap,
  ctaLinkSchema,
  delayClass,
  HIGHLIGHT_CLS,
  type CtaLink,
} from "./shared";

/* ============ hero ============ */

export interface HomeHeroContent {
  kicker: string;
  headline: string;
  standfirst: string;
  primaryCta: CtaLink;
  secondaryCta: CtaLink;
}

export function HomeHeroSection({
  kicker,
  headline,
  standfirst,
  primaryCta,
  secondaryCta,
}: HomeHeroContent): JSX.Element {
  return (
    <Section
      id="hero"
      className="relative overflow-hidden pt-[84px] pb-[72px] md:pt-[110px]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-[15%] -inset-y-[35%] bg-[radial-gradient(760px_400px_at_16%_4%,var(--color-wash-a),transparent_64%),radial-gradient(560px_340px_at_92%_90%,var(--color-wash-b),transparent_70%)]"
      />
      <div className="relative">
        <p className="animate-hero-rise font-label text-label-sm uppercase tracking-[0.22em] text-accent opacity-0">
          {kicker}
        </p>
        <h1 className="mt-5 max-w-[10.5em] animate-hero-rise font-display text-[clamp(50px,6.4vw,96px)] font-[435] leading-[0.99] tracking-[-0.022em] text-theme opacity-0 [animation-delay:0.12s] [font-variation-settings:'SOFT'_92,'opsz'_130]">
          {renderHighlightedText(headline, HIGHLIGHT_CLS)}
        </h1>
        <div className="mt-9 flex animate-hero-rise flex-col items-start gap-[22px] opacity-0 [animation-delay:0.26s] lg:flex-row lg:items-baseline lg:gap-[60px]">
          <p className="max-w-[42ch] font-body text-[21px] leading-[1.7] text-theme-muted">
            {renderHighlightedText(
              standfirst,
              "font-medium not-italic text-theme",
            )}
          </p>
          <CtaRow primaryCta={primaryCta} secondaryCta={secondaryCta} />
        </div>
      </div>
    </Section>
  );
}

const homeHero = defineSection({
  name: "home-hero",
  description: "Platform homepage hero",
  schema: z.object({
    kicker: z.string(),
    headline: z.string(),
    standfirst: z.string(),
    primaryCta: ctaLinkSchema,
    secondaryCta: ctaLinkSchema,
  }) satisfies z.ZodType<HomeHeroContent>,
  component: HomeHeroSection,
  fallback: {
    kicker: "Open source · self-hosted · your knowledge",
    headline: "Build the agent that *represents you*",
    standfirst:
      "Your knowledge becomes an AI agent. Your agent joins a network. The network finds the right expert for every problem, *matched by what people actually know*.",
    primaryCta: { label: "Get Your Brain →", href: "#quickstart" },
    secondaryCta: { label: "Talk to this brain", href: "/chat" },
  },
});

/* ============ growth diagram ============ */

export interface HomeGrowthContent {
  cap: string;
  capNote: string;
  note: string;
}

export function HomeGrowthSection({
  cap,
  capNote,
  note,
}: HomeGrowthContent): JSX.Element {
  return (
    <Section id="growth" className="py-14">
      <SectCap lead={cap} trail={capNote} />
      <GrowthDiagram />
      <p className="reveal reveal-delay-2 mt-5 max-w-[52em] font-display text-[17px] font-normal italic text-theme-light [font-variation-settings:'SOFT'_85]">
        {renderHighlightedText(note, "font-medium not-italic text-theme-muted")}
      </p>
    </Section>
  );
}

const homeGrowth = defineSection({
  name: "home-growth",
  description: "You → Team → Network growth diagram",
  schema: z.object({
    cap: z.string(),
    capNote: z.string(),
    note: z.string(),
  }) satisfies z.ZodType<HomeGrowthContent>,
  component: HomeGrowthSection,
  fallback: {
    cap: "One brain, three layers",
    capNote: "— each one makes the others smarter",
    note: "*It starts with you. It scales to everyone.* Capture what you know and your brain publishes in your voice; brains connect into team memory that outlasts any individual; the network matches work to minds by substance, not titles.",
  },
});

/* ============ trios: problem + your-data ============ */

export interface TrioItem {
  marker: string;
  title: string;
  text: string;
}

export interface HomeTrioContent {
  cap: string;
  items: TrioItem[];
}

const homeTrioContentSchema = z.object({
  cap: z.string(),
  items: z.array(
    z.object({ marker: z.string(), title: z.string(), text: z.string() }),
  ),
}) satisfies z.ZodType<HomeTrioContent>;

function Trio({
  items,
  mono,
}: {
  items: TrioItem[];
  mono: boolean;
}): JSX.Element {
  return (
    <div className="mt-[30px] grid max-w-[1040px] gap-11 md:grid-cols-3">
      {items.map((item, i) => (
        <div key={item.title} className={`reveal ${delayClass(i)}`}>
          {mono ? (
            <span className="inline-block pt-3 pb-[15px] font-label text-[14px] font-medium tracking-[0.1em] text-accent">
              {item.marker}
            </span>
          ) : (
            <span className="block font-display text-[44px] font-light leading-none text-theme-light [font-variation-settings:'SOFT'_30,'opsz'_100]">
              {item.marker}
            </span>
          )}
          <b className="mt-2.5 block font-display text-[21px] font-[520] tracking-[-0.006em] text-theme [font-variation-settings:'SOFT'_55]">
            {item.title}
          </b>
          <p className="mt-2 font-body text-[15.5px] text-theme-light">
            {item.text}
          </p>
        </div>
      ))}
    </div>
  );
}

export function HomeProblemSection({
  cap,
  items,
}: HomeTrioContent): JSX.Element {
  return (
    <Section id="problem" className="py-14">
      <SectCap lead={cap} />
      <Trio items={items} mono={false} />
    </Section>
  );
}

const homeProblem = defineSection({
  name: "home-problem",
  description: "Why it has to exist — problem trio",
  schema: homeTrioContentSchema,
  component: HomeProblemSection,
  fallback: {
    cap: "Why it has to exist",
    items: [
      {
        marker: "01",
        title: "Your best thinking never ships",
        text: "Notes, drafts, and ideas scattered everywhere. Turning them into something the world can see takes so long that most of it dies in your head.",
      },
      {
        marker: "02",
        title: "Your team forgets what it knows",
        text: "People leave, context disappears, and hard-won expertise gets buried in chat threads no one will ever search.",
      },
      {
        marker: "03",
        title: "The right people never find each other",
        text: "Collaborators matched by job titles and résumés, not by what they actually know. The perfect expert might be one connection away.",
      },
    ],
  },
});

export function HomeYourDataSection({
  cap,
  items,
}: HomeTrioContent): JSX.Element {
  return (
    <Section id="your-data" className="py-14">
      <SectCap lead={cap} />
      <Trio items={items} mono={true} />
    </Section>
  );
}

const homeYourData = defineSection({
  name: "home-your-data",
  description: "Your data, your rules — ownership trio",
  schema: homeTrioContentSchema,
  component: HomeYourDataSection,
  fallback: {
    cap: "Your data, your rules",
    items: [
      {
        marker: "M",
        title: "Markdown, not databases",
        text: "Every entity lives as a markdown file with frontmatter. Version-controlled with git. Readable without the brain running.",
      },
      {
        marker: "S",
        title: "Self-hosted, open source",
        text: "Deploy to your own server with one command, or run locally. Apache-2.0. No vendor lock-in, no fine print.",
      },
      {
        marker: "A",
        title: "AI model agnostic",
        text: "Not tied to any single provider. Swap models, combine them, or bring your own.",
      },
    ],
  },
});

/* ============ quickstart ============ */

export interface TermLine {
  kind: "comment" | "command" | "ok";
  text: string;
}

export interface HomeQuickstartContent {
  cap: string;
  capNote: string;
  lines: TermLine[];
  checks: string[];
}

function termLineClass(kind: TermLine["kind"]): string {
  switch (kind) {
    case "comment":
      return "text-theme-light opacity-70";
    case "ok":
      return "text-secondary";
    case "command":
      return "text-theme";
  }
}

export function HomeQuickstartSection({
  cap,
  capNote,
  lines,
  checks,
}: HomeQuickstartContent): JSX.Element {
  return (
    <Section id="quickstart" className="py-14">
      <SectCap lead={cap} trail={capNote} />
      <div className="mt-7 grid max-w-[1000px] items-start gap-12 md:grid-cols-[1.15fr_1fr]">
        <div className="reveal reveal-delay-1 border border-theme bg-theme-subtle/60 px-6 py-5 font-label text-[14px] leading-[1.9]">
          {lines.map((line, i) => (
            <div key={i} className={termLineClass(line.kind)}>
              {line.kind === "command" && (
                <span className="select-none text-accent">$ </span>
              )}
              {line.text}
            </div>
          ))}
        </div>
        <ul className="reveal reveal-delay-2 font-body text-[15.5px] text-theme-light">
          {checks.map((check) => (
            <li
              key={check}
              className="flex gap-2.5 border-b border-theme-light py-[7px]"
            >
              <span aria-hidden="true" className="font-label text-secondary">
                ✓
              </span>
              {check}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

const homeQuickstart = defineSection({
  name: "home-quickstart",
  description: "Three-command quickstart with checks",
  schema: z.object({
    cap: z.string(),
    capNote: z.string(),
    lines: z.array(
      z.object({
        kind: z.enum(["comment", "command", "ok"]),
        text: z.string(),
      }),
    ),
    checks: z.array(z.string()),
  }) satisfies z.ZodType<HomeQuickstartContent>,
  component: HomeQuickstartSection,
  fallback: {
    cap: "Quick start",
    capNote: "— one package, three commands",
    lines: [
      { kind: "comment", text: "# install" },
      { kind: "command", text: "bun add -g @rizom/brain" },
      { kind: "comment", text: "# create" },
      { kind: "command", text: "brain init mybrain" },
      { kind: "comment", text: "# run" },
      { kind: "command", text: "cd mybrain && brain start" },
      { kind: "ok", text: "✓ running in under a minute" },
    ],
    checks: [
      "Website and CMS on the shared web host",
      "MCP server for assistants and tools",
      "A2A discovery endpoint for agent-to-agent use",
      "Plain-text content you can inspect and version with git",
    ],
  },
});

/* ============ mission band ============ */

export interface HomeMissionContent {
  quote: string;
  sub: string;
  primaryCta: CtaLink;
  secondaryCta: CtaLink;
}

export function HomeMissionSection({
  quote,
  sub,
  primaryCta,
  secondaryCta,
}: HomeMissionContent): JSX.Element {
  return (
    <Band quote={quote}>
      <p className="reveal reveal-delay-1 mt-[18px] max-w-[52ch] font-body text-[17px] text-theme-light">
        {sub}
      </p>
      <CtaRow
        primaryCta={primaryCta}
        secondaryCta={secondaryCta}
        className="reveal reveal-delay-2 mt-[26px]"
      />
    </Band>
  );
}

const homeMission = defineSection({
  name: "home-mission",
  description: "Mission band — the future of work is play",
  schema: z.object({
    quote: z.string(),
    sub: z.string(),
    primaryCta: ctaLinkSchema,
    secondaryCta: ctaLinkSchema,
  }) satisfies z.ZodType<HomeMissionContent>,
  component: HomeMissionSection,
  fallback: {
    quote:
      "AI is not taking your job. It's exposing how much of your talent you've been wasting. When machines handle the busywork, what remains is the deeply human. *The future of work is play.*",
    sub: "Brains are the foundation. But the vision is bigger: infrastructure for a world where talent flows to opportunity, professionals own what they create, and distributed teams outperform traditional organizations.",
    primaryCta: { label: "Start Building →", href: "#quickstart" },
    secondaryCta: {
      label: "View on GitHub",
      href: "https://github.com/rizom-ai",
    },
  },
});

/* ============ faces ============ */

export interface FaceRow {
  room: "platform" | "work" | "foundation";
  kicker: string;
  title: string;
  go: string;
  href: string;
}

export interface HomeFacesContent {
  cap: string;
  faces: FaceRow[];
}

const FACE_KICKER_COLOR: Record<FaceRow["room"], string> = {
  platform: "text-[color:var(--palette-brass)]",
  work: "text-[color:var(--palette-ruby-soft)]",
  foundation: "text-[color:var(--palette-moss)]",
};

export function HomeFacesSection({
  cap,
  faces,
}: HomeFacesContent): JSX.Element {
  return (
    <Section id="faces" className="py-14">
      <SectCap lead={cap} />
      <div className="mt-2.5">
        {faces.map((face, i) => (
          <a
            key={face.room}
            href={face.href}
            data-room={face.room}
            className={`reveal ${delayClass(i)} group grid items-baseline gap-1.5 border-t border-theme-light py-5 no-underline first:border-t-0 md:grid-cols-[120px_1fr_auto] md:gap-[30px]`}
          >
            <span
              className={`font-label text-label-xs uppercase tracking-[0.16em] ${FACE_KICKER_COLOR[face.room]}`}
            >
              {face.kicker}
            </span>
            <span className="font-display text-[23px] font-[480] tracking-[-0.008em] text-theme [font-variation-settings:'SOFT'_70]">
              {renderHighlightedText(
                face.title,
                "italic transition-colors group-hover:text-accent",
              )}
            </span>
            <span className="font-label text-[12px] text-theme-light">
              {face.go}
            </span>
          </a>
        ))}
      </div>
    </Section>
  );
}

const homeFaces = defineSection({
  name: "home-faces",
  description: "One practice, three faces",
  schema: z.object({
    cap: z.string(),
    faces: z.array(
      z.object({
        room: z.enum(["platform", "work", "foundation"]),
        kicker: z.string(),
        title: z.string(),
        go: z.string(),
        href: z.string(),
      }),
    ),
  }) satisfies z.ZodType<HomeFacesContent>,
  component: HomeFacesSection,
  fallback: {
    cap: "One practice, three faces",
    faces: [
      {
        room: "platform",
        kicker: "The tools",
        title:
          "Open-source AI agents built from your own knowledge — *you are here*",
        go: "rizom.ai",
        href: "/",
      },
      {
        room: "work",
        kicker: "The service",
        title:
          "Workshops and consulting that apply the methodology in live engagements — *one session, one map*",
        go: "/work →",
        href: "/work",
      },
      {
        room: "foundation",
        kicker: "The source",
        title:
          "The non-profit that holds the IP and stewards the methodology independently — *essays & gatherings*",
        go: "/foundation →",
        href: "/foundation",
      },
    ],
  },
});

/* ============ living-proof colophon ============ */

export interface HomeAliveContent {
  claim: string;
  links: CtaLink[];
}

export function HomeAliveSection({
  claim,
  links,
}: HomeAliveContent): JSX.Element {
  return <AliveLine claim={claim} links={links} />;
}

export const aliveContentSchema: z.ZodType<HomeAliveContent> = z.object({
  claim: z.string(),
  links: z.array(ctaLinkSchema),
});

const homeAlive = defineSection({
  name: "home-alive",
  description: "Living-proof colophon line",
  schema: aliveContentSchema,
  component: HomeAliveSection,
  fallback: {
    claim: "*This site is a brain* — running the platform it describes.",
    links: [
      { label: "talk to it", href: "/chat" },
      { label: "/.well-known/agent-card", href: "/.well-known/agent-card" },
      { label: "ai.rizom.brain.* lexicons", href: "/atproto/lexicons" },
    ],
  },
});

/* The home page, in order. */
export const homeSections: AnySectionDef[] = [
  homeHero,
  homeGrowth,
  homeProblem,
  homeYourData,
  homeQuickstart,
  homeMission,
  homeFaces,
  homeAlive,
];
