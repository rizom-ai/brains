/** @jsxImportSource preact */
import type { JSX } from "preact";
import { Section, renderHighlightedText } from "@rizom/site-rizom";
import { GrowthDiagram } from "./growth-diagram";
import {
  Band,
  CtaRow,
  AliveLine,
  SectCap,
  delayClass,
  HIGHLIGHT_CLS,
  type CtaLink,
} from "./shared";

/**
 * The platform home page — today's rizom.ai tightened (hero → growth diagram
 * → problem → your-data → quickstart → mission band → faces → living-proof
 * colophon). Each section is a pure component; its copy is content-driven via
 * the "home" namespace in ./site-content and shipped as markdown in
 * site-content/home/<section>.md.
 */

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
