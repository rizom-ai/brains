import type { JSX } from "preact";
import { Section, renderHighlightedText } from "@brains/site-rizom";
import { z } from "@brains/utils/zod";
import { defineSection, type AnySectionDef } from "./section-def";
import {
  Band,
  CtaRow,
  SectCap,
  ctaLinkSchema,
  delayClass,
  ROOM_HIGHLIGHT_CLS,
  type CtaLink,
} from "./shared";

/* ============ room head + TMS diagnostic ============ */

export interface DiagnosticContent {
  typeLabel: string;
  teamType: string;
  actionsLabel: string;
  scoreDimension: string;
  scoreValue: string;
  scoreMax: string;
  actions: string[];
  runLabel: string;
  runHref: string;
}

const diagnosticContentSchema: z.ZodType<DiagnosticContent> = z.object({
  typeLabel: z.string(),
  teamType: z.string(),
  actionsLabel: z.string(),
  scoreDimension: z.string(),
  scoreValue: z.string(),
  scoreMax: z.string(),
  actions: z.array(z.string()),
  runLabel: z.string(),
  runHref: z.string(),
});

/* The TMS radar panel — geometry verbatim from the live rizom.work
   diagnostic; palette adapted via the theme's .diag classes. */
function DiagnosticPanel(diag: DiagnosticContent): JSX.Element {
  return (
    <div className="diag reveal reveal-delay-1 px-[30px] pt-5 pb-[26px]">
      <div className="diag-bar" />
      <svg
        className="radar block w-full pb-2"
        viewBox="0 4 360 248"
        role="img"
        aria-label="Three-axis TMS radar — Specialization, Credibility, Coordination"
      >
        <polygon className="tri-outer" points="180,50 266.60,200 93.40,200" />
        <polygon className="tri-score" points="180,95 233.69,181 150.56,167" />
        <circle className="vertex" cx="180" cy="95" r="4" />
        <circle className="vertex" cx="233.69" cy="181" r="4" />
        <circle className="vertex" cx="150.56" cy="167" r="4" />
        <text x="180" y="34" text-anchor="middle">
          Specialization
        </text>
        <text x="252" y="222" text-anchor="start">
          Credibility
        </text>
        <text x="108" y="222" text-anchor="end">
          Coordination
        </text>
      </svg>
      <div className="flex items-baseline justify-between gap-4 border-t border-theme-light py-4">
        <span className="whitespace-nowrap font-label text-[11px] uppercase tracking-[0.18em] text-theme-light">
          {diag.typeLabel}
        </span>
        <b className="text-right font-display text-[26px] font-medium italic tracking-[-0.015em] text-theme [font-variation-settings:'SOFT'_70,'opsz'_96]">
          {diag.teamType}
        </b>
      </div>
      <div className="border-t border-theme-light pt-4">
        <div className="flex items-baseline justify-between gap-3 font-label text-[10.5px] uppercase tracking-[0.2em] text-theme-light">
          <span>{diag.actionsLabel}</span>
          <span>
            <span className="mr-1.5 opacity-60">→</span>
            <span className="text-accent">{diag.scoreDimension}</span>{" "}
            <span className="text-accent [font-variant-numeric:tabular-nums]">
              {diag.scoreValue}
              <span className="opacity-60">/{diag.scoreMax}</span>
            </span>
          </span>
        </div>
        <ul className="mt-3.5 flex list-none flex-col gap-[11px]">
          {diag.actions.map((action, i) => (
            <li
              key={action}
              className="flex items-baseline gap-3 font-body text-[14px] leading-[1.5] text-theme-muted"
            >
              <span className="min-w-[26px] font-label text-[11px] font-semibold tracking-[0.1em] text-accent-bright">
                [{String(i + 1).padStart(2, "0")}]
              </span>
              <span>{action}</span>
            </li>
          ))}
        </ul>
      </div>
      <a
        href={diag.runHref}
        className="mt-[18px] flex w-full items-center justify-center rounded-[10px] border border-theme px-4 py-3 font-label text-label-xs uppercase tracking-[0.18em] text-theme-muted no-underline transition-colors hover:border-accent hover:text-theme"
      >
        {diag.runLabel}
      </a>
    </div>
  );
}

export interface WorkHeroContent {
  eyebrow: string;
  provenance: string;
  headline: string;
  standfirst: string;
  primaryCta: CtaLink;
  secondaryCta: CtaLink;
  diagnostic: DiagnosticContent;
}

export function WorkHeroSection({
  eyebrow,
  provenance,
  headline,
  standfirst,
  primaryCta,
  secondaryCta,
  diagnostic,
}: WorkHeroContent): JSX.Element {
  return (
    <Section
      id="work-hero"
      className="relative overflow-hidden pt-16 pb-[30px] md:pt-20"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-[10%] -inset-y-[30%] bg-[radial-gradient(680px_360px_at_14%_8%,rgb(from_var(--color-accent)_r_g_b_/_0.14),transparent_66%)]"
      />
      <div className="relative">
        <SectCap lead={eyebrow} trail={provenance} />
        <div className="mt-1 grid items-start gap-14 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <h1 className="mt-[18px] max-w-[15.5em] font-display text-[clamp(36px,4.6vw,64px)] font-[448] leading-[1.05] tracking-[-0.018em] text-theme [font-variation-settings:'SOFT'_88,'opsz'_110]">
              {renderHighlightedText(headline, ROOM_HIGHLIGHT_CLS)}
            </h1>
            <p className="mt-4 max-w-[50ch] font-body text-[20px] leading-[1.7] text-theme-muted">
              {standfirst}
            </p>
            <CtaRow
              primaryCta={primaryCta}
              secondaryCta={secondaryCta}
              className="mt-[26px] mb-10"
            />
          </div>
          <DiagnosticPanel {...diagnostic} />
        </div>
      </div>
    </Section>
  );
}

const workHero = defineSection({
  name: "work-hero",
  description: "Work room head with TMS diagnostic panel",
  schema: z.object({
    eyebrow: z.string(),
    provenance: z.string(),
    headline: z.string(),
    standfirst: z.string(),
    primaryCta: ctaLinkSchema,
    secondaryCta: ctaLinkSchema,
    diagnostic: diagnosticContentSchema,
  }) satisfies z.ZodType<WorkHeroContent>,
  component: WorkHeroSection,
  fallback: {
    eyebrow: "Coordination for the AI era",
    provenance: "previously rizom.work",
    headline: "Your team has a knowledge problem. *AI is making it visible.*",
    standfirst:
      "TMS-based consulting that helps teams coordinate better, so your people and your AI tools can actually do their best work.",
    primaryCta: { label: "Take the Team Type quiz →", href: "/work#quiz" },
    secondaryCta: { label: "Book a discovery call", href: "/work#contact" },
    diagnostic: {
      typeLabel: "Your team type",
      teamType: "Distributed specialists",
      actionsLabel: "Priority actions",
      scoreDimension: "Coordination",
      scoreValue: "34",
      scoreMax: "100",
      actions: [
        "Clarify decision authority in the 4 highest-friction roles",
        "Surface tacit expertise via a weekly ritual",
        "Install coordination layer before further AI pilots",
      ],
      runLabel: "Run the diagnostic →",
      runHref: "/work#quiz",
    },
  },
});

/* ============ statements: problem + workshop ============ */

export interface WorkStatementContent {
  cap: string;
  capNote?: string | undefined;
  headline: string;
  intro: string;
}

const workStatementContentSchema = z.object({
  cap: z.string(),
  capNote: z.string().optional(),
  headline: z.string(),
  intro: z.string(),
}) satisfies z.ZodType<WorkStatementContent>;

/* Shared `.sect` statement: cap → display headline with accent em → intro. */
function Statement({
  cap,
  capNote,
  headline,
  intro,
}: WorkStatementContent): JSX.Element {
  return (
    <>
      <SectCap lead={cap} trail={capNote} />
      <h2 className="reveal reveal-delay-1 mt-3.5 max-w-[21em] font-display text-[clamp(30px,3.2vw,44px)] font-[465] leading-[1.1] tracking-[-0.014em] text-theme [font-variation-settings:'SOFT'_78,'opsz'_84]">
        {renderHighlightedText(headline, ROOM_HIGHLIGHT_CLS)}
      </h2>
      <p className="reveal reveal-delay-2 mt-4 max-w-[62ch] font-body text-[17px] leading-[1.7] text-theme-muted">
        {intro}
      </p>
    </>
  );
}

export function WorkProblemSection(content: WorkStatementContent): JSX.Element {
  return (
    <Section id="work-problem" className="py-14">
      <Statement {...content} />
    </Section>
  );
}

const workProblem = defineSection({
  name: "work-problem",
  description: "The coordination problem statement",
  schema: workStatementContentSchema,
  component: WorkProblemSection,
  fallback: {
    cap: "The problem",
    headline: "Talent isn't the bottleneck. *Coordination* is.",
    intro:
      "Teams don't fail because people are untalented. They fail because nobody has mapped who knows what, who decides what, and how information moves. When you add AI into that, it doesn't help — it just automates the confusion.",
  },
});

export interface WorkshopStep {
  title: string;
  lead: string;
  text: string;
}

export interface WorkWorkshopContent extends WorkStatementContent {
  steps: WorkshopStep[];
}

export function WorkWorkshopSection({
  steps,
  ...statement
}: WorkWorkshopContent): JSX.Element {
  return (
    <Section id="workshop" className="py-14">
      <Statement {...statement} />
      <div className="mt-7 max-w-[880px]">
        {steps.map((step, i) => (
          <div
            key={step.title}
            className={`reveal ${delayClass(i)} grid items-baseline gap-6 border-t border-theme-light py-6 md:grid-cols-[64px_170px_1fr]`}
          >
            <span className="font-display text-[37px] font-light leading-none text-theme-light [font-variation-settings:'SOFT'_30]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <b className="font-display text-[21px] font-[520] text-theme [font-variation-settings:'SOFT'_60]">
              {step.title}
            </b>
            <div>
              <p className="mb-[3px] font-body text-[16.5px] text-theme-muted">
                {step.lead}
              </p>
              <p className="font-body text-[16px] text-theme-light">
                {step.text}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

const workWorkshop = defineSection({
  name: "work-workshop",
  description: "The workshop — survey, workshop, playbook",
  schema: z.object({
    cap: z.string(),
    capNote: z.string().optional(),
    headline: z.string(),
    intro: z.string(),
    steps: z.array(
      z.object({ title: z.string(), lead: z.string(), text: z.string() }),
    ),
  }) satisfies z.ZodType<WorkWorkshopContent>,
  component: WorkWorkshopSection,
  fallback: {
    cap: "The workshop",
    capNote: "— thirty years of research, one consistent finding",
    headline: "One session. A map your whole team *can act on*.",
    intro:
      "We map your team's transactive memory system. Peer-reviewed studies put high-performing teams above 70% on TMS measures; most teams start well below. The gap is structural, not personal.",
    steps: [
      {
        title: "Survey",
        lead: "A short async survey.",
        text: "A questionnaire maps your team's coordination patterns — the workshop starts where the data leaves off.",
      },
      {
        title: "Workshop",
        lead: "A facilitated half-day in the room.",
        text: "Your team builds a shared map of expertise, decision authority, and information flow. Everybody sees the same picture — often for the first time ever.",
      },
      {
        title: "Playbook",
        lead: "A diagnostic report and a thirty-day playbook.",
        text: "Concrete changes to roles, rituals, and tooling — including how AI fits in without making the confusion worse.",
      },
    ],
  },
});

/* ============ personas ============ */

export interface Persona {
  role: string;
  quote: string;
  text: string;
}

export interface WorkPersonasContent {
  cap: string;
  personas: Persona[];
}

export function WorkPersonasSection({
  cap,
  personas,
}: WorkPersonasContent): JSX.Element {
  return (
    <Section id="personas" className="py-14">
      <SectCap lead={cap} />
      <div className="mt-7 grid max-w-[980px] gap-11 md:grid-cols-2">
        {personas.map((persona, i) => (
          <div key={persona.role} className={`reveal ${delayClass(i + 1)}`}>
            <span className="font-label text-label-xs uppercase tracking-[0.16em] text-accent">
              {persona.role}
            </span>
            <blockquote className="mt-2.5 font-display text-[24px] font-[450] italic leading-[1.3] tracking-[-0.008em] text-theme [font-variation-settings:'SOFT'_85]">
              {persona.quote}
            </blockquote>
            <p className="mt-2.5 font-body text-[16px] text-theme-light">
              {persona.text}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

const workPersonas = defineSection({
  name: "work-personas",
  description: "If this sounds like you — personas",
  schema: z.object({
    cap: z.string(),
    personas: z.array(
      z.object({ role: z.string(), quote: z.string(), text: z.string() }),
    ),
  }) satisfies z.ZodType<WorkPersonasContent>,
  component: WorkPersonasSection,
  fallback: {
    cap: "If this sounds like you",
    personas: [
      {
        role: "The scaling founder",
        quote: "“Your team grew faster than your operating model.”",
        text: "You hired smart people, gave them ownership, and now nobody's quite sure who decides what. Stand-ups have gotten longer. Projects keep getting blocked on context. You need a map, not another tool.",
      },
      {
        role: "The digital transformation lead",
        quote: "“You've been told to roll out AI across the org.”",
        text: "The pilots look fine, the dashboards are green, and yet the teams using the tool are quietly more frustrated than before. You suspect the problem isn't AI. It's the coordination underneath it. You'd like proof.",
      },
    ],
  },
});

/* ============ testimonials ============ */

export interface Testimonial {
  text: string;
  by: string;
}

export interface WorkQuotesContent {
  cap: string;
  capNote: string;
  quotes: Testimonial[];
}

export function WorkQuotesSection({
  cap,
  capNote,
  quotes,
}: WorkQuotesContent): JSX.Element {
  return (
    <Section id="proof" className="py-14">
      <SectCap lead={cap} trail={capNote} />
      <div className="mt-7 max-w-[980px]">
        {quotes.map((quote, i) => (
          <div
            key={quote.by}
            className={`reveal ${delayClass(i)} grid grid-cols-[44px_1fr] gap-[18px] border-t border-theme-light py-[26px] first:border-t-0`}
          >
            <span
              aria-hidden="true"
              className="font-display text-[48px] leading-[0.7] text-accent opacity-80"
            >
              “
            </span>
            <div>
              <p className="max-w-[66ch] font-body text-[18.5px] leading-[1.65] text-theme-muted">
                {quote.text}
              </p>
              <div className="mt-2.5 font-label text-[12px] text-theme-light">
                — {quote.by}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

const workQuotes = defineSection({
  name: "work-quotes",
  description: "Client testimonials",
  schema: z.object({
    cap: z.string(),
    capNote: z.string(),
    quotes: z.array(z.object({ text: z.string(), by: z.string() })),
  }) satisfies z.ZodType<WorkQuotesContent>,
  component: WorkQuotesSection,
  fallback: {
    cap: "What teams tell us",
    capNote: "— recent engagements",
    quotes: [
      {
        text: "We thought we had a hiring problem. The workshop showed us we had a coordination problem — three people were quietly doing the same work, and nobody knew it. That's a week of design time back, every week.",
        by: "fast-growing SaaS company · Taipei",
      },
      {
        text: "We'd spent six months rolling out AI tools and couldn't figure out why adoption was stalling. One session made it obvious — people didn't know whose judgment to trust when the AI was wrong. We hadn't given them a map. Now we have one.",
        by: "enterprise cyber security services · Amsterdam",
      },
      {
        text: "I'd watched the same thing happen at three companies in our portfolio — same growth stage, same slowdown, different teams. I couldn't explain it until I had the language for it. Now I send every founder in our portfolio to do the diagnostic before they hit 60 people.",
        by: "future-of-work venture fund · San Francisco",
      },
    ],
  },
});

/* ============ roster ============ */

export interface RosterPerson {
  init: string;
  name: string;
  role: string;
}

export interface WorkRosterContent {
  cap: string;
  capNote: string;
  people: RosterPerson[];
}

export function WorkRosterSection({
  cap,
  capNote,
  people,
}: WorkRosterContent): JSX.Element {
  return (
    <Section id="people" className="py-14">
      <SectCap lead={cap} trail={capNote} />
      <div className="reveal reveal-delay-1 mt-6 flex max-w-[900px] flex-wrap gap-x-[34px] gap-y-2.5">
        {people.map((person) => (
          <span
            key={person.name}
            className="flex items-baseline gap-2.5 py-1.5"
          >
            <span className="font-label text-[11px] tracking-[0.08em] text-accent">
              {person.init}
            </span>
            <b className="font-body text-[16.5px] font-medium text-theme">
              {person.name}
            </b>
            <span className="font-body text-[13.5px] text-theme-light">
              {person.role}
            </span>
          </span>
        ))}
      </div>
    </Section>
  );
}

const workRoster = defineSection({
  name: "work-roster",
  description: "Team roster",
  schema: z.object({
    cap: z.string(),
    capNote: z.string(),
    people: z.array(
      z.object({ init: z.string(), name: z.string(), role: z.string() }),
    ),
  }) satisfies z.ZodType<WorkRosterContent>,
  component: WorkRosterSection,
  fallback: {
    cap: "Who we are",
    capNote:
      "— a commercial practice with a non-profit research arm → /foundation",
    people: [
      { init: "JH", name: "Jan Hein Hoogstad", role: "Founder & CEO" },
      { init: "NW", name: "Natalie Wong", role: "Operations" },
      { init: "SS", name: "Samantha Shao", role: "Communications" },
      { init: "JL", name: "Joanna Lisiak", role: "TMS Specialist" },
      { init: "MS", name: "Max Singer", role: "AI Engineering" },
      {
        init: "＋",
        name: "A network of practitioners",
        role: "facilitation · domain · implementation",
      },
    ],
  },
});

/* ============ closer band ============ */

export interface WorkCloserContent {
  quote: string;
  primaryCta: CtaLink;
  secondaryCta: CtaLink;
}

export function WorkCloserSection({
  quote,
  primaryCta,
  secondaryCta,
}: WorkCloserContent): JSX.Element {
  return (
    <Band quote={quote}>
      <CtaRow
        primaryCta={primaryCta}
        secondaryCta={secondaryCta}
        className="reveal reveal-delay-1 mt-7"
      />
    </Band>
  );
}

const workCloser = defineSection({
  name: "work-closer",
  description: "Closing quiz CTA band",
  schema: z.object({
    quote: z.string(),
    primaryCta: ctaLinkSchema,
    secondaryCta: ctaLinkSchema,
  }) satisfies z.ZodType<WorkCloserContent>,
  component: WorkCloserSection,
  fallback: {
    quote: "Ready to find out what *type of team* you are?",
    primaryCta: { label: "Take the Team Type quiz →", href: "/work#quiz" },
    secondaryCta: { label: "Book a 30-minute call", href: "/work#contact" },
  },
});

/* The /work room, in order. */
export const workSections: AnySectionDef[] = [
  workHero,
  workProblem,
  workWorkshop,
  workPersonas,
  workQuotes,
  workRoster,
  workCloser,
];
