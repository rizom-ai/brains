/** @jsxImportSource preact */
import type { JSX } from "preact";
import type { SiteSectionGroup } from "@rizom/site";
import { defineSection, sectionGroup, z } from "@rizom/site-sections";
import { Section, renderHighlightedText } from "@rizom/site-rizom";
import { GrowthDiagram } from "./growth-diagram";
import {
  Band,
  CtaRow,
  AliveLine,
  SectCap,
  Trio,
  trioSchema,
  ctaSchema,
  delayClass,
  HIGHLIGHT_CLS,
} from "./shared";

/**
 * The platform home page — today's rizom.ai tightened (hero → growth diagram
 * → problem → your-data → quickstart → mission band → faces → living-proof
 * colophon). Each section is authored from one zod schema (its component's
 * props are `z.infer` of that schema); copy is content-driven, stored as
 * markdown in site-content/home/<section>.md. Only the assembled section group
 * is exported — the schemas and components are module-local.
 */

/* ============ hero ============ */

const heroSchema = z.object({
  kicker: z.string(),
  headline: z.string(),
  standfirst: z.string(),
  primaryCta: ctaSchema,
  secondaryCta: ctaSchema,
});

function HomeHeroSection({
  kicker,
  headline,
  standfirst,
  primaryCta,
  secondaryCta,
}: z.infer<typeof heroSchema>): JSX.Element {
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

const growthSchema = z.object({
  cap: z.string(),
  capNote: z.string(),
  note: z.string(),
});

function HomeGrowthSection({
  cap,
  capNote,
  note,
}: z.infer<typeof growthSchema>): JSX.Element {
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

/* ============ problem trio ============ */

function HomeProblemSection({
  cap,
  items,
}: z.infer<typeof trioSchema>): JSX.Element {
  return (
    <Section id="problem" className="py-14">
      <SectCap lead={cap} />
      <Trio items={items} mono={false} />
    </Section>
  );
}

/* ============ mission band ============ */

const missionSchema = z.object({
  quote: z.string(),
  sub: z.string(),
  primaryCta: ctaSchema,
  secondaryCta: ctaSchema,
});

function HomeMissionSection({
  quote,
  sub,
  primaryCta,
  secondaryCta,
}: z.infer<typeof missionSchema>): JSX.Element {
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

const faceSchema = z.object({
  room: z.enum(["platform", "work", "foundation"]),
  kicker: z.string(),
  title: z.string(),
  go: z.string(),
  href: z.string(),
});

const facesSchema = z.object({
  cap: z.string(),
  faces: z.array(faceSchema),
});

type FaceRow = z.infer<typeof faceSchema>;

const FACE_KICKER_COLOR: Record<FaceRow["room"], string> = {
  platform: "text-[color:var(--palette-brass)]",
  work: "text-[color:var(--palette-ruby-soft)]",
  foundation: "text-[color:var(--palette-moss)]",
};

function HomeFacesSection({
  cap,
  faces,
}: z.infer<typeof facesSchema>): JSX.Element {
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

// The colophon renders through the shared AliveLine component directly.
const aliveSchema = z.object({
  claim: z.string(),
  links: z.array(ctaSchema),
});

/* ============ the home section group ============ */

/**
 * The platform home page, in order. The namespace ("home") matches the route
 * id, so each section stores as site-content/home/<section>.md and its
 * template resolves as "home:<section>".
 */
export const homeSections: SiteSectionGroup = sectionGroup("home", {
  hero: defineSection(heroSchema, HomeHeroSection, {
    title: "Hero",
    description: "Platform homepage hero: kicker, headline, standfirst, CTAs",
  }),
  growth: defineSection(growthSchema, HomeGrowthSection, {
    title: "Growth",
    description: "You → Team → Network growth diagram with caption and note",
  }),
  problem: defineSection(trioSchema, HomeProblemSection, {
    title: "Problem",
    description: "Why it has to exist — problem trio (large numerals)",
  }),
  mission: defineSection(missionSchema, HomeMissionSection, {
    title: "Mission",
    description: "Mission band — display-italic statement, sub line, CTAs",
  }),
  faces: defineSection(facesSchema, HomeFacesSection, {
    title: "Faces",
    description: "One practice, three faces — platform / work / foundation",
  }),
  alive: defineSection(aliveSchema, AliveLine, {
    title: "Alive",
    description: "Living-proof colophon — italic claim plus proof links",
  }),
});
