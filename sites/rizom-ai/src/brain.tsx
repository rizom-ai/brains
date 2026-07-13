/** @jsxImportSource preact */
import type { JSX } from "preact";
import type { SiteSectionGroup } from "@rizom/site";
import { defineSection, sectionGroup, z } from "@rizom/site-sections";
import { Section, renderHighlightedText } from "@rizom/site-rizom";
import {
  Band,
  CtaRow,
  SectCap,
  Trio,
  trioSchema,
  ctaSchema,
  ROOM_HIGHLIGHT_CLS,
} from "./shared";
import {
  BrainScreenStyles,
  StudioScreen,
  ChatScreen,
  IntegrationsScreen,
  DashboardScreen,
} from "./brain-screens";

/**
 * The /brain room — the product's own page. The consolidated homepage grew
 * two pages long because it told the umbrella story and the product story at
 * once; the product story lives here, told as the brain's life with its owner
 * in four chapters — capture, ask, see it run, connect — each illustrated by a
 * real interface screen, then the data principles and the quickstart.
 *
 * The namespace ("brain") matches the route id, so each section stores as
 * site-content/brain/<section>.md and resolves as "brain:<section>".
 */

/* ============ chapter heading ============ */

/* The shared chapter head: a numbered cap, a display headline with an accent
   em, and a standfirst. Used by every chapter so the copy stays authored. */
function ChapterHead({
  cap,
  capNote,
  headline,
  intro,
}: {
  cap: string;
  capNote?: string | undefined;
  headline: string;
  intro: string;
}): JSX.Element {
  return (
    <>
      <SectCap lead={cap} trail={capNote} />
      <h2 className="reveal reveal-delay-1 mt-3.5 max-w-[20em] font-display text-[clamp(28px,3vw,40px)] font-[465] leading-[1.1] tracking-[-0.014em] text-theme [font-variation-settings:'SOFT'_78,'opsz'_84]">
        {renderHighlightedText(headline, ROOM_HIGHLIGHT_CLS)}
      </h2>
      <p className="reveal reveal-delay-2 mt-4 max-w-[62ch] font-body text-[17px] leading-[1.7] text-theme-muted">
        {intro}
      </p>
    </>
  );
}

/* ============ hero ============ */

const heroSchema = z.object({
  eyebrow: z.string(),
  provenance: z.string(),
  headline: z.string(),
  standfirst: z.string(),
  primaryCta: ctaSchema,
  secondaryCta: ctaSchema,
  chips: z.array(z.string()),
});

function BrainHeroSection({
  eyebrow,
  provenance,
  headline,
  standfirst,
  primaryCta,
  secondaryCta,
  chips,
}: z.infer<typeof heroSchema>): JSX.Element {
  return (
    <Section
      id="brain-hero"
      className="relative overflow-hidden pt-16 pb-8 md:pt-20"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-[10%] -inset-y-[30%] bg-[radial-gradient(680px_360px_at_14%_8%,rgb(from_var(--color-accent)_r_g_b_/_0.14),transparent_66%)]"
      />
      <div className="relative">
        <SectCap lead={eyebrow} trail={provenance} />
        <h1 className="mt-[18px] max-w-[15.5em] font-display text-[clamp(36px,4.8vw,64px)] font-[448] leading-[1.04] tracking-[-0.02em] text-theme [font-variation-settings:'SOFT'_88,'opsz'_110]">
          {renderHighlightedText(headline, ROOM_HIGHLIGHT_CLS)}
        </h1>
        <p className="mt-4 max-w-[52ch] font-body text-[20px] leading-[1.7] text-theme-muted">
          {standfirst}
        </p>
        <CtaRow
          primaryCta={primaryCta}
          secondaryCta={secondaryCta}
          className="mt-[26px]"
        />
        <div className="mt-9 flex flex-wrap gap-2.5">
          {chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-theme px-[13px] py-1.5 font-label text-[10.5px] tracking-[0.06em] text-theme-light"
            >
              {chip}
            </span>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ============ shared authored checklist ============ */

function Checks({ items }: { items: string[] }): JSX.Element {
  return (
    <ul className="mt-[18px] max-w-[40ch] font-body text-[15.5px] text-theme-light">
      {items.map((item) => (
        <li
          key={item}
          className="flex gap-2.5 border-b border-theme-light py-[7px]"
        >
          <span aria-hidden="true" className="font-label text-secondary">
            ✓
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}

/* ============ 01 · capture — the studio ============ */

const captureSchema = z.object({
  cap: z.string(),
  capNote: z.string().optional(),
  headline: z.string(),
  intro: z.string(),
  checks: z.array(z.string()),
});

function BrainCaptureSection({
  cap,
  capNote,
  headline,
  intro,
  checks,
}: z.infer<typeof captureSchema>): JSX.Element {
  return (
    <Section id="capture" className="py-14">
      {/* Screen styles are global; emitted once here, the first screen chapter. */}
      <BrainScreenStyles />
      <SectCap lead={cap} trail={capNote} />
      <div className="mt-4 grid items-center gap-11 lg:grid-cols-[4fr_8fr]">
        <div>
          <h2 className="reveal reveal-delay-1 font-display text-[clamp(26px,2.6vw,34px)] font-[465] leading-[1.12] tracking-[-0.012em] text-theme [font-variation-settings:'SOFT'_78,'opsz'_84]">
            {renderHighlightedText(headline, ROOM_HIGHLIGHT_CLS)}
          </h2>
          <p className="reveal reveal-delay-2 mt-4 font-body text-[16.5px] leading-[1.7] text-theme-muted">
            {intro}
          </p>
          <Checks items={checks} />
        </div>
        <div className="reveal reveal-delay-2">
          <StudioScreen />
        </div>
      </div>
    </Section>
  );
}

/* ============ 02 · ask — the chat and its integrations ============ */

const askSchema = z.object({
  cap: z.string(),
  capNote: z.string().optional(),
  headline: z.string(),
  intro: z.string(),
});

function BrainAskSection({
  cap,
  capNote,
  headline,
  intro,
}: z.infer<typeof askSchema>): JSX.Element {
  return (
    <Section id="ask" className="py-14">
      <ChapterHead
        cap={cap}
        capNote={capNote}
        headline={headline}
        intro={intro}
      />
      <div className="mt-7 grid items-start gap-6 lg:grid-cols-[1.12fr_1fr]">
        <div className="reveal reveal-delay-1">
          <ChatScreen />
        </div>
        <div className="reveal reveal-delay-2">
          <IntegrationsScreen />
        </div>
      </div>
    </Section>
  );
}

/* ============ 03 · see it run — the dashboard ============ */

const runSchema = z.object({
  cap: z.string(),
  capNote: z.string().optional(),
  headline: z.string(),
  intro: z.string(),
  note: z.string(),
});

function BrainRunSection({
  cap,
  capNote,
  headline,
  intro,
  note,
}: z.infer<typeof runSchema>): JSX.Element {
  return (
    <Section id="run" className="py-14">
      <ChapterHead
        cap={cap}
        capNote={capNote}
        headline={headline}
        intro={intro}
      />
      <div className="reveal reveal-delay-1 mt-7 max-w-[1120px]">
        <DashboardScreen />
      </div>
      <p className="reveal reveal-delay-2 mt-5 max-w-[52em] font-display text-[17px] font-normal italic text-theme-light [font-variation-settings:'SOFT'_85]">
        {renderHighlightedText(note, "font-medium not-italic text-theme-muted")}
      </p>
    </Section>
  );
}

/* ============ 04 · connect — back to the map ============ */

const connectSchema = z.object({
  cap: z.string(),
  capNote: z.string().optional(),
  headline: z.string(),
  intro: z.string(),
  cta: ctaSchema,
});

function BrainConnectSection({
  cap,
  capNote,
  headline,
  intro,
  cta,
}: z.infer<typeof connectSchema>): JSX.Element {
  return (
    <Section id="connect" className="py-14">
      <ChapterHead
        cap={cap}
        capNote={capNote}
        headline={headline}
        intro={intro}
      />
      <div className="reveal reveal-delay-2 mt-6">
        <a
          href={cta.href}
          className="font-body text-[15.5px] text-theme-light no-underline transition-colors hover:text-accent"
        >
          {cta.label}
        </a>
      </div>
    </Section>
  );
}

/* ============ your data, your rules ============ */

function BrainYourDataSection({
  cap,
  items,
}: z.infer<typeof trioSchema>): JSX.Element {
  return (
    <Section id="your-data" className="py-14">
      <SectCap lead={cap} />
      <Trio items={items} mono={true} />
    </Section>
  );
}

/* ============ quickstart ============ */

const termLineSchema = z.object({
  kind: z.enum(["comment", "command", "ok"]),
  text: z.string(),
});

const quickstartSchema = z.object({
  cap: z.string(),
  capNote: z.string(),
  lines: z.array(termLineSchema),
  checks: z.array(z.string()),
});

type TermLine = z.infer<typeof termLineSchema>;

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

function BrainQuickstartSection({
  cap,
  capNote,
  lines,
  checks,
}: z.infer<typeof quickstartSchema>): JSX.Element {
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
        <Checks items={checks} />
      </div>
    </Section>
  );
}

/* ============ closing band ============ */

const closeSchema = z.object({
  quote: z.string(),
  sub: z.string(),
  primaryCta: ctaSchema,
  secondaryCta: ctaSchema,
});

function BrainCloseSection({
  quote,
  sub,
  primaryCta,
  secondaryCta,
}: z.infer<typeof closeSchema>): JSX.Element {
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

/* ============ the brain section group ============ */

export const brainSections: SiteSectionGroup = sectionGroup("brain", {
  hero: defineSection(heroSchema, BrainHeroSection, {
    title: "Hero",
    description: "Product hero — build the agent that represents you",
  }),
  capture: defineSection(captureSchema, BrainCaptureSection, {
    title: "Capture",
    description: "01 · Capture — markdown corpus, illustrated by the studio",
  }),
  ask: defineSection(askSchema, BrainAskSection, {
    title: "Ask",
    description: "02 · Ask — chat + Discord, Claude/MCP, terminal",
  }),
  run: defineSection(runSchema, BrainRunSection, {
    title: "See It Run",
    description: "03 · See it run — the dashboard overview",
  }),
  connect: defineSection(connectSchema, BrainConnectSection, {
    title: "Connect",
    description: "04 · Connect — takes your seat in the network (the map)",
  }),
  "your-data": defineSection(trioSchema, BrainYourDataSection, {
    title: "Your Data",
    description: "Your data, your rules — ownership trio (mono markers)",
  }),
  quickstart: defineSection(quickstartSchema, BrainQuickstartSection, {
    title: "Quickstart",
    description: "Three-command quickstart terminal with a checklist",
  }),
  close: defineSection(closeSchema, BrainCloseSection, {
    title: "Close",
    description: "Closing band — own the intelligence you already have",
  }),
});
