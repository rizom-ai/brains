/** @jsxImportSource preact */
import type { JSX } from "preact";
import { Section, renderHighlightedText } from "@rizom/site-rizom";
import {
  Band,
  CtaRow,
  SectCap,
  delayClass,
  ROOM_HIGHLIGHT_CLS,
  type CtaLink,
} from "./shared";

/**
 * The /work room (previously rizom.work) — coordination consulting: a TMS
 * diagnostic head, the coordination-problem statement, the workshop, personas,
 * testimonials, roster, and a closing quiz band. Pure components; copy is
 * content-driven via the "work" namespace in ./site-content.
 */

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

/* ============ statements: problem + workshop ============ */

export interface WorkStatementContent {
  cap: string;
  capNote?: string | undefined;
  headline: string;
  intro: string;
}

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
