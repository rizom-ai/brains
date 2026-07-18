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
  ROOM_HIGHLIGHT_CLS,
} from "./shared";

/**
 * The umbrella home page. The hero is the live agent proximity map (wired in
 * routes.ts as agent-discovery:proximity-map); the sections here tell the
 * rev-10 story the map opens — the pain (problem, withered), how the parts
 * come together (growth carries the system: brain, practice, network), the
 * mission band (the quote alone), the single ask (one-light), the three
 * faces, and the living-proof colophon.
 * Each section is authored from one zod schema (its component's props are
 * `z.infer` of that schema); copy is content-driven, stored as markdown in
 * site-content/home/<section>.md. Only the assembled section group is
 * exported — the schemas and components are module-local.
 */

/* ============ growth diagram + the three stages ============ */

const growthStageSchema = z.object({
  title: z.string(),
  text: z.string(),
});

const growthSchema = z.object({
  cap: z.string(),
  capNote: z.string().optional(),
  stages: z.array(growthStageSchema),
});

/* Stage columns are keyed to the diagram's zone colors by position:
   You (brass, the brain) → Team (ruby, the practice) → Network (moss). */
const STAGE_TITLE_COLOR = [
  "text-[color:var(--palette-brass)]",
  "text-[color:var(--palette-ruby-soft)]",
  "text-[color:var(--palette-moss)]",
];

function HomeGrowthSection({
  cap,
  capNote,
  stages,
}: z.infer<typeof growthSchema>): JSX.Element {
  return (
    <Section id="growth" className="py-14">
      <SectCap lead={cap} trail={capNote} />
      <GrowthDiagram />
      <div className="reveal reveal-delay-2 mt-6 grid max-w-[1040px] gap-x-11 gap-y-6 md:grid-cols-3">
        {stages.map((stage, i) => (
          <div key={stage.title}>
            <b
              className={`block font-label text-label-xs font-semibold uppercase tracking-[0.18em] ${STAGE_TITLE_COLOR[i] ?? ""}`}
            >
              {stage.title}
            </b>
            <p className="mt-2 font-body text-[15px] text-theme-light">
              {stage.text}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ============ problem trio ============ */

function HomeProblemSection({
  cap,
  capNote,
  items,
}: z.infer<typeof trioSchema>): JSX.Element {
  return (
    <Section id="problem" className="py-14">
      {/* The one section with no warmth: cold cap, hollow numerals. */}
      <SectCap lead={cap} trail={capNote} tone="cold" />
      <Trio items={items} mono={false} withered />
    </Section>
  );
}

/* ============ it starts with one light ============ */

const oneLightSchema = z.object({
  cap: z.string(),
  capNote: z.string().optional(),
  headline: z.string(),
  intro: z.string(),
  pull: z.string().optional(),
  primaryCta: ctaSchema,
  secondaryCta: ctaSchema,
});

function HomeOneLightSection({
  cap,
  capNote,
  headline,
  intro,
  pull,
  primaryCta,
  secondaryCta,
}: z.infer<typeof oneLightSchema>): JSX.Element {
  return (
    <Section id="one-light" className="py-14">
      <SectCap lead={cap} trail={capNote} />
      <h2 className="reveal reveal-delay-1 mt-3.5 max-w-[20em] font-display text-[clamp(28px,3vw,40px)] font-[465] leading-[1.1] tracking-[-0.014em] text-theme [font-variation-settings:'SOFT'_78,'opsz'_84]">
        {renderHighlightedText(headline, ROOM_HIGHLIGHT_CLS)}
      </h2>
      <p className="reveal reveal-delay-1 mt-4 max-w-[62ch] font-body text-[17px] leading-[1.7] text-theme-muted">
        {intro}
      </p>
      {pull && (
        <p className="reveal reveal-delay-2 mt-5 max-w-[21em] font-display text-[clamp(24px,2.8vw,34px)] font-normal italic leading-[1.22] tracking-[-0.012em] text-theme-muted [font-variation-settings:'SOFT'_90,'opsz'_110]">
          {renderHighlightedText(pull, "font-[460] text-accent-bright")}
        </p>
      )}
      <CtaRow
        primaryCta={primaryCta}
        secondaryCta={secondaryCta}
        className="reveal reveal-delay-3 mt-6"
      />
    </Section>
  );
}

/* ============ mission band ============ */

/* Rev 10: the band is pure thesis — the quote carries the mission alone.
   Sub and CTAs stay authorable but optional, so older content parses. */
const missionSchema = z.object({
  quote: z.string(),
  sub: z.string().optional(),
  primaryCta: ctaSchema.optional(),
  secondaryCta: ctaSchema.optional(),
});

function HomeMissionSection({
  quote,
  sub,
  primaryCta,
  secondaryCta,
}: z.infer<typeof missionSchema>): JSX.Element {
  return (
    <Band quote={quote}>
      {sub && (
        <p className="reveal reveal-delay-1 mt-[18px] max-w-[52ch] font-body text-[17px] text-theme-light">
          {sub}
        </p>
      )}
      {primaryCta && secondaryCta && (
        <CtaRow
          primaryCta={primaryCta}
          secondaryCta={secondaryCta}
          className="reveal reveal-delay-2 mt-[26px]"
        />
      )}
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
 * The umbrella home page's authored sections. The namespace ("home") matches
 * the route id, so each stores as site-content/home/<section>.md and resolves
 * as "home:<section>". The hero is not here — it is the live agent proximity
 * map (agent-discovery:proximity-map), whose authored copy lives at
 * site-content/home/network.md and merges over the live data via the content
 * overlay.
 */
export const homeSections: SiteSectionGroup = sectionGroup("home", {
  growth: defineSection(growthSchema, HomeGrowthSection, {
    title: "Growth",
    description:
      "You → Team → Network diagram with the three stage columns — how the parts come together",
  }),
  problem: defineSection(trioSchema, HomeProblemSection, {
    title: "Problem",
    description:
      "Alone, it withers — problem trio (hollow numerals, no warmth)",
  }),
  "one-light": defineSection(oneLightSchema, HomeOneLightSection, {
    title: "One Light",
    description:
      "It starts with you — the single ask, after the mission and before the faces",
  }),
  mission: defineSection(missionSchema, HomeMissionSection, {
    title: "Mission",
    description:
      "Mission band — display-italic statement alone; sub and CTAs optional",
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
